/**
 * x3dh-bot: a demo conversation partner so a lone visitor can try the live chat.
 *
 * It is a normal X3DH client: it publishes a prekey bundle, completes the
 * handshake as the responder, decrypts with the derived key and replies
 * encrypted. It just happens to run inside the server process.
 */
import bcrypt from 'bcryptjs';
import * as x3dh from '@e2ee/x3dh';
import User from '../models/user.model.js';
import Message from '../models/message.model.js';
import { BotState, BotSession } from '../models/bot.model.js';
import { emitToUser } from '../lib/socket.js';

export const BOT_USERNAME = 'x3dh-bot';
const OPK_LOW_WATER = 20;
const OPK_BATCH = 50;
const REPLY_DELAY_MS = Number(process.env.BOT_REPLY_DELAY_MS ?? 600);

let botUserId = null;
let state = null;

const b64 = x3dh.toB64;

export function getBotId() {
  return botUserId;
}

export function isBot(userId) {
  return botUserId !== null && String(userId) === botUserId;
}

/** Create the bot's keys and user on first boot; top up one-time prekeys. */
export async function ensureBot() {
  state = await BotState.findById('bot').lean();
  if (!state) {
    const identity = x3dh.generateIdentityKeyPair();
    const spk = x3dh.generateSignedPreKey(identity);
    state = {
      _id: 'bot',
      identity: {
        edPublicKey: b64(identity.edPublicKey),
        edSecretKey: b64(identity.edSecretKey),
        publicKey: b64(identity.publicKey),
        secretKey: b64(identity.secretKey),
      },
      signedPreKey: { id: spk.id, publicKey: b64(spk.publicKey), secretKey: b64(spk.secretKey), signature: b64(spk.signature) },
      oneTimePreKeys: [],
    };
    await BotState.create(state);
  }

  const publicFields = {
    identityKey: state.identity.publicKey,
    edIdentityKey: state.identity.edPublicKey,
    signedPreKeyId: state.signedPreKey.id,
    signedPreKey: state.signedPreKey.publicKey,
    signedPreKeySignature: state.signedPreKey.signature,
    isBot: true,
  };

  let user = await User.findOne({ username: BOT_USERNAME });
  if (!user) {
    // Random password nobody knows: the bot can't be logged into.
    const password = await bcrypt.hash(x3dh.randomId(32), 10);
    user = await User.create({ username: BOT_USERNAME, password, ...publicFields });
  } else if (user.identityKey !== publicFields.identityKey || !user.isBot) {
    // Bot state was reset: republish and drop stale public prekeys.
    await User.updateOne({ _id: user._id }, { $set: { ...publicFields, oneTimePreKeys: [] } });
  }
  botUserId = String(user._id);
  await replenishOneTimePreKeys();
  return botUserId;
}

let replenishing = null;
export function replenishOneTimePreKeys() {
  // Serialise: concurrent bundle fetches shouldn't each mint a batch.
  replenishing ??= (async () => {
    try {
      const user = await User.findById(botUserId).select('oneTimePreKeys');
      if (user.oneTimePreKeys.length >= OPK_LOW_WATER) return;
      const fresh = x3dh.generateOneTimePreKeys(OPK_BATCH);
      const secrets = fresh.map((k) => ({ id: k.id, secretKey: b64(k.secretKey) }));
      // Store the secret halves before publishing the public halves.
      await BotState.updateOne({ _id: 'bot' }, { $push: { oneTimePreKeys: { $each: secrets } } });
      state.oneTimePreKeys.push(...secrets);
      await User.updateOne(
        { _id: botUserId },
        { $push: { oneTimePreKeys: { $each: fresh.map((k) => ({ id: k.id, publicKey: b64(k.publicKey) })) } } },
      );
    } finally {
      replenishing = null;
    }
  })();
  return replenishing;
}

/* ------------------------------------------------------------------------ */

async function send(session, text) {
  const { ciphertext, nonce } = await x3dh.encrypt(session.sharedKey, text, session.associatedData);
  const msg = await Message.create({
    senderId: botUserId,
    receiverId: session.userId,
    sessionId: session.sessionId,
    messageText: ciphertext,
    nonce,
  });
  emitToUser(session.userId, 'newMessage', msg.toObject());
  return msg;
}

const later = (fn) => setTimeout(() => fn().catch((e) => console.error('[bot]', e)), REPLY_DELAY_MS);

/**
 * Responder side of X3DH. Called synchronously from the sendInitial route so
 * the session exists before the user's next message can arrive.
 */
export async function handleInitialMessage(initial) {
  const { otkKeyId, signedPreKeyId } = initial;
  if (signedPreKeyId && signedPreKeyId !== state.signedPreKey.id) {
    console.warn('[bot] initial message used an unknown signed prekey', signedPreKeyId);
    return null;
  }

  let opk = null;
  if (otkKeyId) {
    opk = state.oneTimePreKeys.find((k) => k.id === otkKeyId);
    if (!opk) {
      console.warn('[bot] initial message used an unknown one-time prekey', otkKeyId);
      return null;
    }
  }

  const { sharedKey, associatedData } = await x3dh.x3dhRespond({
    identity: { secretKey: state.identity.secretKey, publicKey: state.identity.publicKey },
    signedPreKeySecret: state.signedPreKey.secretKey,
    oneTimePreKeySecret: opk?.secretKey ?? null,
    senderIdentityKey: initial.senderIdentityKey,
    ephemeralKey: initial.ephemeralKeyPublic,
  });

  // Prove the key works by decrypting the initial ciphertext.
  try {
    await x3dh.decrypt(sharedKey, initial.messageText, initial.nonce, associatedData);
  } catch {
    console.warn('[bot] could not decrypt initial message for session', initial.sessionId);
    return null;
  }

  // One-time prekeys are single-use: delete the secret half now.
  if (opk) {
    state.oneTimePreKeys = state.oneTimePreKeys.filter((k) => k.id !== otkKeyId);
    await BotState.updateOne({ _id: 'bot' }, { $pull: { oneTimePreKeys: { id: otkKeyId } } });
  }

  const previous = await BotSession.countDocuments({ userId: initial.senderId });
  if (await BotSession.exists({ sessionId: initial.sessionId })) return null; // session ids are single-use
  const session = await BotSession.create({
    sessionId: initial.sessionId,
    userId: initial.senderId,
    sharedKey: b64(sharedKey),
    associatedData: b64(associatedData),
    userIdentityKey: initial.senderIdentityKey,
    usedOneTimePreKey: !!opk,
  });

  await Message.updateOne(
    { _id: initial._id },
    { $set: { 'sessionInfo.receiverHasReceived': true, 'sessionInfo.receiverSessionActive': false } },
  );

  later(() => send(session, greeting(session, previous)));
  return session;
}

export async function handleMessage(message) {
  const session = await BotSession.findOne({ sessionId: message.sessionId, userId: message.senderId });
  if (!session) return;
  let text;
  try {
    text = await x3dh.decrypt(session.sharedKey, message.messageText, message.nonce, session.associatedData);
  } catch {
    return; // without the right key there is nothing we can safely say
  }
  const hadPrevious = !!session.lastCiphertext;
  session.messageCount += 1;
  session.lastCiphertext = message.messageText;
  session.lastNonce = message.nonce;
  await session.save();
  const reply = await compose(text, message, session, hadPrevious);
  later(() => send(session, reply));
}

/* ------------------------------------------------------------------------ */
/* What the bot says                                                         */
/* ------------------------------------------------------------------------ */

function greeting(session, previousSessions) {
  const dhCount = session.usedOneTimePreKey ? 4 : 3;
  if (previousSessions > 0) {
    return `🔁 New X3DH session (#${previousSessions + 1}) with ${dhCount} DH operations. `
      + 'A fresh ephemeral key means a brand-new shared key: the previous session\'s key could not decrypt this one. '
      + 'Type /help for things to try.';
  }
  return [
    '👋 Hi! I\'m x3dh-bot, a real X3DH client running on the server.',
    `We just ran the handshake: you fetched my prekey bundle, verified my signed prekey, did ${dhCount} Diffie-Hellman operations and derived a 256-bit key with HKDF. I did the mirror-image DHs and got the same key, and neither of us ever sent it.`,
    'Everything you type is AES-256-GCM encrypted in your browser before it leaves. Try:',
    '• /session: details of our handshake',
    '• /server: what the server actually stored for that message',
    '• /explain: why each of the four DHs matters',
    '• anything else, and I\'ll prove I decrypted it',
  ].join('\n');
}

const FACTS = [
  'DH1 = DH(IK_A, SPK_B) is what proves the message came from you: only your identity key could have produced it.',
  'The server handed you one of my one-time prekeys and then deleted it, so nobody can replay your initial message to me.',
  'Your ephemeral key EK_A was thrown away right after the handshake. That\'s what gives forward secrecy.',
  'The associated data (IK_A ‖ IK_B) is authenticated by AES-GCM but not encrypted: it binds every ciphertext to both of our identities.',
  'Compare safety numbers (the shield in the chat header) out-of-band to be sure the server didn\'t swap my identity key for its own.',
  'This demo stops at X3DH. Signal follows it with the Double Ratchet, which derives a new key for every single message.',
];

async function compose(text, message, session, hadPrevious) {
  const cmd = text.trim().toLowerCase();
  const fact = FACTS[(session.messageCount - 1) % FACTS.length];
  if (cmd === '/help') {
    return 'Commands: /session · /server · /explain · /fact. Anything else gets echoed back to prove I decrypted it.';
  }
  if (cmd === '/session') {
    const sn = await x3dh.safetyNumber(session.userIdentityKey, state.identity.publicKey);
    return [
      `Session ${session.sessionId}`,
      `• DH operations: ${session.usedOneTimePreKey ? '4 (a one-time prekey was available)' : '3 (no one-time prekey left)'}`,
      `• KDF: HKDF-SHA256, info="${x3dh.PROTOCOL_INFO}"`,
      '• Cipher: AES-256-GCM, AD = IK_you ‖ IK_bot',
      `• Started ${session.createdAt.toISOString()}, ${session.messageCount} message(s) so far`,
      `• Safety number: ${sn}`,
    ].join('\n');
  }
  if (cmd === '/server') {
    const ct = x3dh.fromB64(message.messageText);
    return [
      'Here\'s your "/server" message exactly as the server stored it:',
      `ciphertext (${ct.length} bytes): ${message.messageText}`,
      `nonce: ${message.nonce}`,
      '',
      'That\'s a 16-byte GCM auth tag plus one byte per byte of plaintext. The server can see the length and the timing, but not the content.',
    ].join('\n');
  }
  if (cmd === '/explain') {
    return [
      'DH1 = DH(IK_A, SPK_B): mutual authentication, part 1 (proves it\'s you).',
      'DH2 = DH(EK_A, IK_B): mutual authentication, part 2 (only I can compute it).',
      'DH3 = DH(EK_A, SPK_B): forward secrecy. EK_A is gone and SPK_B gets rotated.',
      'DH4 = DH(EK_A, OPK_B): one-time prekey, single use, so no replays.',
      'SK = HKDF(0xFF×32 ‖ DH1 ‖ DH2 ‖ DH3 ‖ DH4)',
    ].join('\n');
  }
  if (cmd === '/fact') return fact;

  const clipped = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const bytes = x3dh.fromB64(message.messageText).length;
  const changed = hadPrevious ? ', and it looks nothing like your previous message\'s ciphertext' : '';
  return `🔓 Decrypted: “${clipped}”\nIt reached the server as ${bytes} bytes of ciphertext${changed}.\n\n💡 ${fact}`;
}
