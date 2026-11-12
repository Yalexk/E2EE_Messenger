import bcrypt from 'bcryptjs';
import { verifySignedPreKey, identityKeysMatch } from '@e2ee/x3dh';
import { generateToken, cookieOptions } from '../lib/utils.js';
import User, { publicUser } from '../models/user.model.js';
import { BOT_USERNAME } from '../bot/bot.js';
import { USERNAME_RE, isKey, isSignature, isShortId, isOneTimePreKeyList } from '../lib/validate.js';

export const MAX_ONE_TIME_PREKEYS = 200;
const OPK_LOW_WATER = 20;
const SPK_MAX_AGE_DAYS = 7;

function bundleError(body) {
  const { identityKey, edIdentityKey, signedPreKeyId, signedPreKey, signedPreKeySignature } = body;
  if (!isKey(identityKey) || !isKey(edIdentityKey)) return 'Invalid identity key';
  if (!identityKeysMatch(edIdentityKey, identityKey)) return 'Identity keys do not match';
  if (!isShortId(signedPreKeyId) || !isKey(signedPreKey) || !isSignature(signedPreKeySignature)) return 'Invalid signed prekey';
  // The server checks the signature too: it refuses to publish a bundle that
  // clients would reject anyway.
  if (!verifySignedPreKey(edIdentityKey, signedPreKey, signedPreKeySignature)) return 'Signed prekey signature does not verify';
  return null;
}

function loginPayload(user) {
  const ageDays = (Date.now() - new Date(user.signedPreKeyUpdatedAt).getTime()) / 86_400_000;
  const remaining = user.oneTimePreKeys?.length ?? 0;
  return {
    user: publicUser(user),
    signedPreKeyId: user.signedPreKeyId,
    oneTimePreKeysRemaining: remaining,
    needsOneTimePreKeys: remaining < OPK_LOW_WATER,
    needsSignedPreKeyRotation: ageDays > SPK_MAX_AGE_DAYS,
  };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const signup = async (req, res, next) => {
  try {
    const { username, password, oneTimePreKeys } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ message: 'Username must be 3-24 characters: letters, numbers, . _ -' });
    }
    if (username.toLowerCase() === BOT_USERNAME) return res.status(400).json({ message: 'That username is reserved' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: 'Password must be 8-128 characters' });
    }
    const err = bundleError(req.body);
    if (err) return res.status(400).json({ message: err });
    if (!isOneTimePreKeyList(oneTimePreKeys, MAX_ONE_TIME_PREKEYS)) {
      return res.status(400).json({ message: 'Invalid one-time prekeys' });
    }

    if (await User.exists({ username: new RegExp(`^${escapeRegex(username)}$`, 'i') })) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const user = await User.create({
      username,
      password: await bcrypt.hash(password, 10),
      identityKey: req.body.identityKey,
      edIdentityKey: req.body.edIdentityKey,
      signedPreKeyId: req.body.signedPreKeyId,
      signedPreKey: req.body.signedPreKey,
      signedPreKeySignature: req.body.signedPreKeySignature,
      oneTimePreKeys: oneTimePreKeys.map(({ id, publicKey }) => ({ id, publicKey })),
    });

    generateToken(user._id, res);
    res.status(201).json(loginPayload(user));
  } catch (error) {
    if (error?.code === 11000) return res.status(400).json({ message: 'Username already taken' });
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    const user = await User.findOne({ username, isBot: { $ne: true } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }
    generateToken(user._id, res);
    res.status(200).json(loginPayload(user));
  } catch (error) {
    next(error);
  }
};

export const logout = (req, res) => {
  res.clearCookie('jwt', cookieOptions());
  res.status(200).json({ message: 'Logged out' });
};

export const checkAuth = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.status(200).json(loginPayload(user));
  } catch (error) {
    next(error);
  }
};

/** Top up *your own* one-time prekeys. */
export const addOneTimePreKeys = async (req, res, next) => {
  try {
    const { oneTimePreKeys } = req.body ?? {};
    if (!isOneTimePreKeyList(oneTimePreKeys, MAX_ONE_TIME_PREKEYS)) {
      return res.status(400).json({ message: 'Invalid one-time prekeys' });
    }
    const user = await User.findById(req.user._id).select('oneTimePreKeys');
    const room = MAX_ONE_TIME_PREKEYS - user.oneTimePreKeys.length;
    const accepted = oneTimePreKeys.slice(0, Math.max(0, room)).map(({ id, publicKey }) => ({ id, publicKey }));
    await User.updateOne({ _id: req.user._id }, { $push: { oneTimePreKeys: { $each: accepted } } });
    res.status(200).json({ accepted: accepted.map((k) => k.id), total: user.oneTimePreKeys.length + accepted.length });
  } catch (error) {
    next(error);
  }
};

/** Rotate *your own* signed prekey. The signature must verify against your identity key. */
export const replaceSignedPrekey = async (req, res, next) => {
  try {
    const { signedPreKeyId, signedPreKey, signedPreKeySignature } = req.body ?? {};
    if (!isShortId(signedPreKeyId) || !isKey(signedPreKey) || !isSignature(signedPreKeySignature)) {
      return res.status(400).json({ message: 'Invalid signed prekey' });
    }
    if (!verifySignedPreKey(req.user.edIdentityKey, signedPreKey, signedPreKeySignature)) {
      return res.status(400).json({ message: 'Signed prekey signature does not verify against your identity key' });
    }
    await User.updateOne(
      { _id: req.user._id },
      { $set: { signedPreKeyId, signedPreKey, signedPreKeySignature, signedPreKeyUpdatedAt: new Date() } },
    );
    res.status(200).json({ message: 'Signed prekey rotated' });
  } catch (error) {
    next(error);
  }
};
