/**
 * End-to-end API tests: real Express app, real MongoDB, real X3DH.
 *
 * Needs a MongoDB at TEST_MONGODB_URI (default mongodb://127.0.0.1:27017).
 * Each run uses a fresh throwaway database which is dropped afterwards.
 *   docker run -d --name e2ee-mongo -p 27017:27017 mongo:7
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret!';
process.env.BOT_REPLY_DELAY_MS = '0';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import * as x3dh from '@e2ee/x3dh';

const { createApp } = await import('../src/app.js');
const { ensureBot, getBotId } = await import('../src/bot/bot.js');
const { default: Message } = await import('../src/models/message.model.js');

const base = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const dbName = `e2ee_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
let app;

before(async () => {
  await mongoose.connect(`${base}/${dbName}`, { serverSelectionTimeoutMS: 3000 });
  await ensureBot();
  ({ app } = createApp());
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const b64 = x3dh.toB64;

/** A client that keeps its private keys locally, like the browser does. */
async function makeUser(name, { opks = 5 } = {}) {
  const identity = x3dh.generateIdentityKeyPair();
  const spk = x3dh.generateSignedPreKey(identity);
  const oneTimePreKeys = x3dh.generateOneTimePreKeys(opks);
  const agent = request.agent(app);
  const username = `${name}_${Math.floor(Math.random() * 1e6)}`;
  const res = await agent.post('/api/auth/signup').send({
    username,
    password: 'correct horse battery',
    identityKey: b64(identity.publicKey),
    edIdentityKey: b64(identity.edPublicKey),
    signedPreKeyId: spk.id,
    signedPreKey: b64(spk.publicKey),
    signedPreKeySignature: b64(spk.signature),
    oneTimePreKeys: oneTimePreKeys.map((k) => ({ id: k.id, publicKey: b64(k.publicKey) })),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { agent, username, id: String(res.body.user._id), identity, spk, oneTimePreKeys };
}

async function startSession(sender, receiverId) {
  const bundle = (await sender.agent.get(`/api/session/keys/${receiverId}`)).body;
  const init = await x3dh.x3dhInitiate({ identity: sender.identity, bundle });
  const sessionId = x3dh.randomId(16);
  const first = await x3dh.encrypt(init.sharedKey, 'hello', init.associatedData);
  const res = await sender.agent.post(`/api/session/sendInitial/${receiverId}`).send({
    sessionId,
    encryptedMessage: first.ciphertext,
    nonce: first.nonce,
    ephemeralKeyPublic: b64(init.ephemeralPublicKey),
    otkKeyId: init.oneTimePreKeyId,
    signedPreKeyId: bundle.signedPreKeyId,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { sessionId, key: init.sharedKey, ad: init.associatedData, bundle, response: res.body };
}

const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};

/* ------------------------------------------------------------------------ */

test('health check', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
});

test('signup rejects a bundle whose signed prekey signature does not verify', async () => {
  const id = x3dh.generateIdentityKeyPair();
  const other = x3dh.generateSignedPreKey(x3dh.generateIdentityKeyPair());
  const res = await request(app).post('/api/auth/signup').send({
    username: 'forger',
    password: 'correct horse battery',
    identityKey: b64(id.publicKey),
    edIdentityKey: b64(id.edPublicKey),
    signedPreKeyId: other.id,
    signedPreKey: b64(other.publicKey),
    signedPreKeySignature: b64(other.signature),
    oneTimePreKeys: [{ id: 'a', publicKey: b64(new Uint8Array(32).fill(9)) }],
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /signature/i);
});

test('signup validates input and reserves the bot name', async () => {
  assert.equal((await request(app).post('/api/auth/signup').send({ username: 'x', password: 'p' })).status, 400);
  assert.equal((await request(app).post('/api/auth/signup').send({ username: 'x3dh-bot', password: 'longenough' })).status, 400);
  assert.equal((await request(app).post('/api/auth/signup').set('content-type', 'application/json').send('{bad')).status, 400);
});

test('login, check and logout', async () => {
  const u = await makeUser('carol');
  const login = await request(app).post('/api/auth/login').send({ username: u.username, password: 'correct horse battery' });
  assert.equal(login.status, 200);
  assert.ok(login.headers['set-cookie'][0].includes('HttpOnly'));
  const check = await u.agent.get('/api/auth/check');
  assert.equal(check.body.user.username, u.username);
  assert.equal(check.body.user.password, undefined);
  await u.agent.post('/api/auth/logout');
  assert.equal((await u.agent.get('/api/auth/check')).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ username: u.username, password: 'wrong password' })).status, 400);
});

test('protected routes reject missing or forged tokens', async () => {
  assert.equal((await request(app).get('/api/messages/user')).status, 401);
  assert.equal((await request(app).get('/api/messages/user').set('Cookie', 'jwt=forged')).status, 401);
});

test('fetching a bundle consumes exactly one one-time prekey', async () => {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob', { opks: 2 });
  const a = (await alice.agent.get(`/api/session/keys/${bob.id}`)).body;
  const b = (await alice.agent.get(`/api/session/keys/${bob.id}`)).body;
  const c = (await alice.agent.get(`/api/session/keys/${bob.id}`)).body;
  assert.ok(a.oneTimePreKey && b.oneTimePreKey);
  assert.notEqual(a.oneTimePreKey.id, b.oneTimePreKey.id);
  assert.equal(c.oneTimePreKey, null, 'falls back to 3-DH once OPKs run out');
  assert.equal(c.remainingOneTimePreKeys, 0);
  assert.equal((await alice.agent.get('/api/session/keys/not-an-id')).status, 400);
});

test("you can't replace someone else's signed prekey (was a MITM hole)", async () => {
  const victim = await makeUser('victim');
  const attacker = await makeUser('attacker');
  const evil = x3dh.generateSignedPreKey(attacker.identity);
  // The old API took the username from the body; now it's ignored and the
  // signature must verify against the *caller's* identity key.
  const res = await attacker.agent.put('/api/auth/signedPreKey').send({
    username: victim.username,
    signedPreKeyId: evil.id,
    signedPreKey: b64(evil.publicKey),
    signedPreKeySignature: b64(evil.signature),
  });
  assert.equal(res.status, 200);
  const victimBundle = (await attacker.agent.get(`/api/session/keys/${victim.id}`)).body;
  assert.equal(victimBundle.signedPreKey, b64(victim.spk.publicKey), "victim's SPK unchanged");

  const forged = x3dh.generateSignedPreKey(x3dh.generateIdentityKeyPair());
  const bad = await attacker.agent.put('/api/auth/signedPreKey').send({
    signedPreKeyId: forged.id,
    signedPreKey: b64(forged.publicKey),
    signedPreKeySignature: b64(forged.signature),
  });
  assert.equal(bad.status, 400);
});

test('adding one-time prekeys only affects your own account', async () => {
  const victim = await makeUser('victim2', { opks: 1 });
  const attacker = await makeUser('attacker2');
  const fresh = x3dh.generateOneTimePreKeys(3);
  const res = await attacker.agent.post('/api/auth/otks').send({
    username: victim.username,
    oneTimePreKeys: fresh.map((k) => ({ id: k.id, publicKey: b64(k.publicKey) })),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 8);
  const first = (await attacker.agent.get(`/api/session/keys/${victim.id}`)).body;
  const second = (await attacker.agent.get(`/api/session/keys/${victim.id}`)).body;
  assert.equal(first.oneTimePreKey.id, victim.oneTimePreKeys[0].id);
  assert.equal(second.oneTimePreKey, null);
});

test('two users complete X3DH through the server and chat', async () => {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');

  const s = await startSession(alice, bob.id);

  // Bob fetches the initial message and runs the responder side.
  const { initialMessage } = (await bob.agent.get(`/api/session/initial/${alice.id}`)).body;
  assert.equal(initialMessage.senderIdentityKey, b64(alice.identity.publicKey));
  const opk = bob.oneTimePreKeys.find((k) => k.id === initialMessage.otkKeyId);
  assert.ok(opk, 'initial message names one of Bob\'s OPKs');
  const resp = await x3dh.x3dhRespond({
    identity: bob.identity,
    signedPreKeySecret: bob.spk.secretKey,
    oneTimePreKeySecret: opk.secretKey,
    senderIdentityKey: initialMessage.senderIdentityKey,
    ephemeralKey: initialMessage.ephemeralKeyPublic,
  });
  assert.equal(await x3dh.decrypt(resp.sharedKey, initialMessage.messageText, initialMessage.nonce, resp.associatedData), 'hello');
  assert.equal((await bob.agent.put(`/api/session/updateSessionInfo/${alice.id}`)).status, 200);

  // Regular messages
  const m = await x3dh.encrypt(s.key, 'secret plans', s.ad);
  const sent = await alice.agent.post(`/api/messages/send/${bob.id}`).send({ messageText: m.ciphertext, nonce: m.nonce, sessionId: s.sessionId });
  assert.equal(sent.status, 201);

  const stored = await Message.findById(sent.body._id).lean();
  assert.ok(!JSON.stringify(stored).includes('secret plans'), 'server never sees plaintext');

  const inbox = (await bob.agent.get(`/api/messages/${alice.id}`)).body;
  assert.equal(inbox.length, 1, 'initial message is not listed as a chat message');
  assert.equal(await x3dh.decrypt(resp.sharedKey, inbox[0].messageText, inbox[0].nonce, resp.associatedData), 'secret plans');

  // Closing: record is only deleted once both sides closed and Bob received it.
  assert.equal((await alice.agent.post(`/api/session/endSession/${bob.id}`)).body.deleted, false);
  assert.equal((await bob.agent.post(`/api/session/endSession/${alice.id}`)).body.deleted, true);
  assert.equal((await alice.agent.get(`/api/session/initial/${bob.id}`)).body.initialMessage, null);
});

test('a new initial message replaces the previous one for the pair', async () => {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  await startSession(alice, bob.id);
  const second = await startSession(alice, bob.id);
  const { initialMessage } = (await bob.agent.get(`/api/session/initial/${alice.id}`)).body;
  assert.equal(initialMessage.sessionId, second.sessionId);
  assert.equal(await Message.countDocuments({ isInitialMessage: true, senderId: alice.id }), 1);
});

test('malformed messages are rejected', async () => {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  const bad = await alice.agent.post(`/api/messages/send/${bob.id}`).send({ messageText: 'not base64!', nonce: 'x', sessionId: 's' });
  assert.equal(bad.status, 400);
  const self = await alice.agent.post(`/api/messages/send/${alice.id}`).send({ messageText: 'AAAA', nonce: b64(new Uint8Array(12)), sessionId: 's' });
  assert.equal(self.status, 400);
});

test('sidebar lists the bot first and leaks no prekeys', async () => {
  const alice = await makeUser('alice');
  const { users } = (await alice.agent.get('/api/messages/user')).body;
  assert.equal(users[0].username, 'x3dh-bot');
  assert.equal(users[0].isBot, true);
  for (const u of users) {
    assert.equal(u.oneTimePreKeys, undefined);
    assert.equal(u.password, undefined);
  }
});

test('the bot completes X3DH, decrypts, and replies encrypted', async () => {
  const alice = await makeUser('alice');
  const botId = getBotId();
  const s = await startSession(alice, botId);
  assert.equal(s.response.botAccepted, true);

  // Greeting
  const greeting = await waitFor(async () => {
    const msgs = (await alice.agent.get(`/api/messages/${botId}`)).body;
    return msgs.find((m) => m.senderId === botId);
  });
  const hello = await x3dh.decrypt(s.key, greeting.messageText, greeting.nonce, s.ad);
  assert.match(hello, /x3dh-bot/);

  // Echo
  const m = await x3dh.encrypt(s.key, 'ping 🏓', s.ad);
  await alice.agent.post(`/api/messages/send/${botId}`).send({ messageText: m.ciphertext, nonce: m.nonce, sessionId: s.sessionId });
  const reply = await waitFor(async () => {
    const msgs = (await alice.agent.get(`/api/messages/${botId}`)).body.filter((x) => x.senderId === botId);
    return msgs.length >= 2 && msgs[msgs.length - 1];
  });
  assert.match(await x3dh.decrypt(s.key, reply.messageText, reply.nonce, s.ad), /Decrypted: “ping 🏓”/);

  // A command
  const c = await x3dh.encrypt(s.key, '/session', s.ad);
  await alice.agent.post(`/api/messages/send/${botId}`).send({ messageText: c.ciphertext, nonce: c.nonce, sessionId: s.sessionId });
  const info = await waitFor(async () => {
    const msgs = (await alice.agent.get(`/api/messages/${botId}`)).body.filter((x) => x.senderId === botId);
    return msgs.length >= 3 && msgs[msgs.length - 1];
  });
  assert.match(await x3dh.decrypt(s.key, info.messageText, info.nonce, s.ad), /Safety number/);

  // The bot marked itself as received + closed, so when Alice closes, the
  // handshake record is removed and the next visit runs a fresh X3DH.
  assert.equal((await alice.agent.post(`/api/session/endSession/${botId}`)).body.deleted, true);
});

test('the bot ignores an initial message with a forged one-time prekey id', async () => {
  const alice = await makeUser('alice');
  const botId = getBotId();
  const bundle = (await alice.agent.get(`/api/session/keys/${botId}`)).body;
  const init = await x3dh.x3dhInitiate({ identity: alice.identity, bundle });
  const first = await x3dh.encrypt(init.sharedKey, 'hello', init.associatedData);
  const res = await alice.agent.post(`/api/session/sendInitial/${botId}`).send({
    sessionId: x3dh.randomId(16),
    encryptedMessage: first.ciphertext,
    nonce: first.nonce,
    ephemeralKeyPublic: b64(init.ephemeralPublicKey),
    otkKeyId: 'doesnotexist',
    signedPreKeyId: bundle.signedPreKeyId,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.botAccepted, false);
});
