import Message from '../models/message.model.js';
import User from '../models/user.model.js';
import { emitToUser } from '../lib/socket.js';
import * as bot from '../bot/bot.js';
import { isObjectId, isKey, isGcmNonce, isB64, isShortId, MAX_MESSAGE_BYTES } from '../lib/validate.js';

const pairQuery = (a, b) => ({
  isInitialMessage: true,
  $or: [
    { senderId: a, receiverId: b },
    { senderId: b, receiverId: a },
  ],
});

/**
 * One-time prekeys are a finite, shared resource: without a cap, one user
 * could fetch someone's bundle in a loop and burn all of their OPKs, forcing
 * everyone else's handshakes down to 3 DHs. Each requester may consume at most
 * OPK_FETCHES_PER_HOUR of a given user's OPKs; beyond that they still get a
 * valid bundle, just without an OPK.
 */
const OPK_FETCHES_PER_HOUR = 5;
const opkFetches = new Map(); // `${requester}:${target}` -> timestamps
function mayTakeOneTimePreKey(requester, target) {
  const key = `${requester}:${target}`;
  const cutoff = Date.now() - 3600_000;
  const recent = (opkFetches.get(key) ?? []).filter((t) => t > cutoff);
  const allowed = recent.length < OPK_FETCHES_PER_HOUR;
  if (allowed) recent.push(Date.now());
  opkFetches.set(key, recent);
  if (opkFetches.size > 50_000) {
    for (const [k, v] of opkFetches) if (!v.some((t) => t > cutoff)) opkFetches.delete(k);
  }
  return allowed;
}

/**
 * Hand out a prekey bundle. Per the X3DH spec, the one-time prekey is
 * removed from the server the moment it is handed out, so it can never be
 * given to two different initiators.
 */
export const getKeysRoute = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });
    if (id === String(req.user._id)) return res.status(400).json({ message: "You can't start a session with yourself" });

    const takeOpk = mayTakeOneTimePreKey(String(req.user._id), id);
    const before = takeOpk
      ? await User.findOneAndUpdate({ _id: id }, { $pop: { oneTimePreKeys: -1 } }, { new: false, projection: { password: 0 } }).lean()
      : await User.findById(id).select('-password').lean();
    if (!before) return res.status(404).json({ message: 'User not found' });

    const oneTimePreKey = takeOpk ? before.oneTimePreKeys[0] ?? null : null;
    const remaining = Math.max(0, before.oneTimePreKeys.length - (oneTimePreKey ? 1 : 0));

    if (before.isBot) bot.replenishOneTimePreKeys().catch((e) => console.error('[bot] replenish failed', e));
    else if (remaining < 20) emitToUser(id, 'prekeysLow', { remaining });

    res.status(200).json({
      userId: before._id,
      identityKey: before.identityKey,
      edIdentityKey: before.edIdentityKey,
      signedPreKeyId: before.signedPreKeyId,
      signedPreKey: before.signedPreKey,
      signedPreKeySignature: before.signedPreKeySignature,
      oneTimePreKey,
      remainingOneTimePreKeys: remaining,
    });
  } catch (error) {
    next(error);
  }
};

export const sendInitialMessage = async (req, res, next) => {
  try {
    const { id: receiverId } = req.params;
    const { sessionId, encryptedMessage, nonce, ephemeralKeyPublic, otkKeyId, signedPreKeyId } = req.body ?? {};
    if (!isObjectId(receiverId) || receiverId === String(req.user._id)) return res.status(400).json({ message: 'Invalid receiver' });
    if (!isShortId(sessionId, 100) || !isB64(encryptedMessage, MAX_MESSAGE_BYTES) || !isGcmNonce(nonce)
      || !isKey(ephemeralKeyPublic) || !isShortId(signedPreKeyId) || (otkKeyId != null && !isShortId(otkKeyId))) {
      return res.status(400).json({ message: 'Malformed initial message' });
    }
    if (!(await User.exists({ _id: receiverId }))) return res.status(404).json({ message: 'User not found' });

    // A new handshake supersedes any older one between this pair.
    await Message.deleteMany(pairQuery(req.user._id, receiverId));

    const initial = await Message.create({
      senderId: req.user._id,
      receiverId,
      sessionId,
      messageText: encryptedMessage,
      nonce,
      isInitialMessage: true,
      senderIdentityKey: req.user.identityKey,
      ephemeralKeyPublic,
      signedPreKeyId,
      otkKeyId: otkKeyId ?? null,
    });

    let botAccepted = null;
    if (bot.isBot(receiverId)) {
      botAccepted = !!(await bot.handleInitialMessage(initial.toObject()));
    } else {
      emitToUser(receiverId, 'sessionStarted', { from: String(req.user._id), sessionId });
    }

    res.status(201).json({ ...initial.toObject(), botAccepted });
  } catch (error) {
    next(error);
  }
};

export const getInitialMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });
    const initialMessage = await Message.findOne(pairQuery(req.user._id, id)).sort({ createdAt: -1 }).lean();
    res.status(200).json({ initialMessage });
  } catch (error) {
    next(error);
  }
};

export const updateSessionInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });
    const initial = await Message.findOne(pairQuery(req.user._id, id)).sort({ createdAt: -1 });
    if (!initial) return res.status(404).json({ message: 'Session not found' });

    const isSender = initial.senderId.equals(req.user._id);
    const updates = isSender
      ? { 'sessionInfo.senderSessionActive': true }
      : { 'sessionInfo.receiverHasReceived': true, 'sessionInfo.receiverSessionActive': true };
    await Message.updateOne({ _id: initial._id }, { $set: updates });
    res.status(200).json({ message: 'Session updated' });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark your side of the session as closed. Once both sides have closed and
 * the receiver has processed the initial message, the handshake record is
 * deleted, so the next conversation starts a fresh X3DH.
 */
export const endSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ message: 'Invalid user id' });
    const initial = await Message.findOne(pairQuery(req.user._id, id)).sort({ createdAt: -1 });
    if (!initial) return res.status(200).json({ message: 'No active session', deleted: false });

    const field = initial.senderId.equals(req.user._id) ? 'senderSessionActive' : 'receiverSessionActive';
    initial.sessionInfo[field] = false;

    const { senderSessionActive, receiverSessionActive, receiverHasReceived } = initial.sessionInfo;
    if (!senderSessionActive && !receiverSessionActive && receiverHasReceived) {
      await Message.deleteOne({ _id: initial._id });
      return res.status(200).json({ message: 'Session closed by both sides', deleted: true });
    }
    await initial.save();
    res.status(200).json({ message: 'Session closed on your side', deleted: false });
  } catch (error) {
    next(error);
  }
};
