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
    return `New key agreed (chat #${previousSessions + 1}, ${dhCount} DH steps). Each new chat gets a fresh key, so the old one can’t read it. Type /help for things to try.`;
  }
  return [
    "Hi, I’m x3dh-bot. I’m a real X3DH client that runs on the server.",
    `We just agreed on a secret key: ${dhCount} DH steps on each side, same result, and neither of us sent it.`,
    "Your messages are encrypted in your browser before they leave. Try:",
    "/session  how our key was made",
    "/server   what the server stored for your message",
    "/explain  what each DH step is for",
    "or type anything, and I’ll show I can read it.",
  ].join("\n");
}

const FACTS = [
  "DH1 uses your identity key, so only you could have started this chat.",
  "The server gave you one of my one-time prekeys, then deleted it. Nobody can reuse it.",
  "Your one-off key (EK) was deleted after the handshake, so this chat stays safe even if your main key leaks later.",
  "Every message is tied to both our identity keys. Swap either one and decryption fails.",
  "Open inspect and compare the safety number with me to check nobody swapped our keys.",
  "This demo stops at X3DH. Signal also changes the key with every message (the Double Ratchet).",
];

async function compose(text, message, session, hadPrevious) {
  const cmd = text.trim().toLowerCase();
  const fact = FACTS[(session.messageCount - 1) % FACTS.length];
  if (cmd === "/help") {
    return "Commands: /session, /server, /explain, /fact. Anything else, I’ll repeat back to show I decrypted it.";
  }
  if (cmd === "/session") {
    const sn = await x3dh.safetyNumber(session.userIdentityKey, state.identity.publicKey);
    return [
      `session  ${session.sessionId}`,
      `dh steps ${session.usedOneTimePreKey ? "4" : "3 (no one-time prekey was left)"}`,
      "key      HKDF-SHA256",
      "cipher   AES-256-GCM",
      `messages ${session.messageCount}`,
      `Safety number: ${sn}`,
    ].join("\n");
  }
  if (cmd === "/server") {
    const ct = x3dh.fromB64(message.messageText);
    return [
      "This is your last message, exactly as the server stored it:",
      `${message.messageText}  (${ct.length} bytes)`,
      "The server can see how long it is and when it came. Not what it says.",
    ].join("\n");
  }
  if (cmd === "/explain") {
    return [
      "DH1  your IK x my SPK: proves it’s you",
      "DH2  your EK x my IK: proves it’s me",
      "DH3  your EK x my SPK: keeps old chats safe if keys leak later",
      "DH4  your EK x my OPK: stops replays, used once",
      "All four go through HKDF to make one shared key.",
    ].join("\n");
  }
  if (cmd === "/fact") return fact;

  const clipped = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const bytes = x3dh.fromB64(message.messageText).length;
  const changed = hadPrevious ? ", and it looks nothing like the last one" : "";
  return `Decrypted: “${clipped}”\nIt reached the server as ${bytes} scrambled bytes${changed}.\n\n${fact}`;
}
