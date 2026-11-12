import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateIdentityKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  x3dhInitiate,
  x3dhRespond,
  encrypt,
  decrypt,
  verifySignedPreKey,
  safetyNumber,
  dh,
  kdf,
  toB64,
  fromB64,
  toHex,
  equalBytes,
  publicKeyFromSecret,
} from '../x3dh.js';

function makeBob({ withOpk = true } = {}) {
  const identity = generateIdentityKeyPair();
  const spk = generateSignedPreKey(identity);
  const [opk] = generateOneTimePreKeys(1);
  const bundle = {
    identityKey: toB64(identity.publicKey),
    edIdentityKey: toB64(identity.edPublicKey),
    signedPreKey: toB64(spk.publicKey),
    signedPreKeySignature: toB64(spk.signature),
    ...(withOpk ? { oneTimePreKey: { id: opk.id, publicKey: toB64(opk.publicKey) } } : {}),
  };
  return { identity, spk, opk, bundle };
}

async function handshake({ withOpk }) {
  const alice = generateIdentityKeyPair();
  const bob = makeBob({ withOpk });
  const init = await x3dhInitiate({ identity: alice, bundle: bob.bundle });
  const resp = await x3dhRespond({
    identity: bob.identity,
    signedPreKeySecret: bob.spk.secretKey,
    oneTimePreKeySecret: init.oneTimePreKeyId ? bob.opk.secretKey : null,
    senderIdentityKey: toB64(alice.publicKey),
    ephemeralKey: toB64(init.ephemeralPublicKey),
  });
  return { alice, bob, init, resp };
}

test('both sides derive the same 32-byte key with a one-time prekey (4 DHs)', async () => {
  const { init, resp } = await handshake({ withOpk: true });
  assert.equal(init.sharedKey.length, 32);
  assert.ok(equalBytes(init.sharedKey, resp.sharedKey));
  assert.ok(equalBytes(init.associatedData, resp.associatedData));
  assert.equal(init.trace.steps.length, 4);
  for (let i = 0; i < 4; i++) {
    assert.ok(equalBytes(init.trace.steps[i].out, resp.trace.steps[i].out), `DH${i + 1} mismatch`);
  }
});

test('both sides agree without a one-time prekey (3 DHs)', async () => {
  const { init, resp } = await handshake({ withOpk: false });
  assert.equal(init.oneTimePreKeyId, null);
  assert.equal(init.trace.steps.length, 3);
  assert.ok(equalBytes(init.sharedKey, resp.sharedKey));
});

test('IKM is F (32 x 0xFF) followed by the DH outputs', async () => {
  const { init } = await handshake({ withOpk: true });
  assert.equal(init.trace.ikm.length, 32 * 5);
  assert.ok(init.trace.ikm.slice(0, 32).every((b) => b === 0xff));
});

test('fresh ephemeral keys give a fresh shared key every session', async () => {
  const alice = generateIdentityKeyPair();
  const bob = makeBob({ withOpk: false });
  const a = await x3dhInitiate({ identity: alice, bundle: bob.bundle });
  const b = await x3dhInitiate({ identity: alice, bundle: bob.bundle });
  assert.ok(!equalBytes(a.sharedKey, b.sharedKey));
});

test('a tampered signed prekey is rejected before any DH happens', async () => {
  const alice = generateIdentityKeyPair();
  const bob = makeBob();
  const mallory = generateSignedPreKey(generateIdentityKeyPair());
  const forged = { ...bob.bundle, signedPreKey: toB64(mallory.publicKey) };
  await assert.rejects(x3dhInitiate({ identity: alice, bundle: forged }), { code: 'BAD_SIGNATURE' });
});

test('a signature from a different identity is rejected', () => {
  const bob = makeBob();
  const eve = generateIdentityKeyPair();
  assert.equal(verifySignedPreKey(bob.bundle.edIdentityKey, bob.bundle.signedPreKey, bob.bundle.signedPreKeySignature), true);
  assert.equal(verifySignedPreKey(toB64(eve.edPublicKey), bob.bundle.signedPreKey, bob.bundle.signedPreKeySignature), false);
  assert.equal(verifySignedPreKey('not base64!', bob.bundle.signedPreKey, bob.bundle.signedPreKeySignature), false);
});

test('responder using the wrong one-time prekey gets a different key', async () => {
  const alice = generateIdentityKeyPair();
  const bob = makeBob();
  const [wrongOpk] = generateOneTimePreKeys(1);
  const init = await x3dhInitiate({ identity: alice, bundle: bob.bundle });
  const resp = await x3dhRespond({
    identity: bob.identity,
    signedPreKeySecret: bob.spk.secretKey,
    oneTimePreKeySecret: wrongOpk.secretKey,
    senderIdentityKey: alice.publicKey,
    ephemeralKey: init.ephemeralPublicKey,
  });
  assert.ok(!equalBytes(init.sharedKey, resp.sharedKey));
});

test('AEAD round-trips unicode and is bound to the associated data', async () => {
  const { init, resp } = await handshake({ withOpk: true });
  const msg = 'hi Bob 👋 — this is end-to-end encrypted';
  const { ciphertext, nonce } = await encrypt(init.sharedKey, msg, init.associatedData);
  assert.equal(await decrypt(resp.sharedKey, ciphertext, nonce, resp.associatedData), msg);

  const otherAd = new Uint8Array(64);
  await assert.rejects(decrypt(resp.sharedKey, ciphertext, nonce, otherAd), { code: 'DECRYPT_FAILED' });
});

test('flipping a single ciphertext bit makes decryption fail', async () => {
  const { init } = await handshake({ withOpk: false });
  const { ciphertext, nonce } = await encrypt(init.sharedKey, 'integrity', init.associatedData);
  const bytes = fromB64(ciphertext);
  bytes[0] ^= 1;
  await assert.rejects(decrypt(init.sharedKey, toB64(bytes), nonce, init.associatedData), { code: 'DECRYPT_FAILED' });
});

test('encrypting the same plaintext twice gives different ciphertexts', async () => {
  const { init } = await handshake({ withOpk: false });
  const a = await encrypt(init.sharedKey, 'same', init.associatedData);
  const b = await encrypt(init.sharedKey, 'same', init.associatedData);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(a.nonce, b.nonce);
});

test('base64 inputs and byte inputs are interchangeable', async () => {
  const alice = generateIdentityKeyPair();
  const bob = makeBob();
  const asB64 = {
    edPublicKey: toB64(alice.edPublicKey),
    edSecretKey: toB64(alice.edSecretKey),
    publicKey: toB64(alice.publicKey),
    secretKey: toB64(alice.secretKey),
  };
  const init = await x3dhInitiate({ identity: asB64, bundle: bob.bundle });
  const resp = await x3dhRespond({
    identity: { secretKey: toB64(bob.identity.secretKey) },
    signedPreKeySecret: toB64(bob.spk.secretKey),
    oneTimePreKeySecret: toB64(bob.opk.secretKey),
    senderIdentityKey: asB64.publicKey,
    ephemeralKey: toB64(init.ephemeralPublicKey),
  });
  assert.ok(equalBytes(init.sharedKey, resp.sharedKey));
});

test('the identity X25519 public key matches its secret', () => {
  const id = generateIdentityKeyPair();
  assert.ok(equalBytes(publicKeyFromSecret(id.secretKey), id.publicKey));
});

test('low-order public keys are rejected', () => {
  const id = generateIdentityKeyPair();
  assert.throws(() => dh(id.secretKey, new Uint8Array(32)), /all-zero/);
});

test('HKDF is deterministic for the same input', async () => {
  const input = [new Uint8Array(32).fill(7), new Uint8Array(32).fill(9)];
  const a = await kdf(input);
  const b = await kdf(input);
  assert.equal(toHex(a.sharedKey), toHex(b.sharedKey));
});

test('safety numbers are symmetric and differ per pair', async () => {
  const a = generateIdentityKeyPair();
  const b = generateIdentityKeyPair();
  const c = generateIdentityKeyPair();
  const ab = await safetyNumber(a.publicKey, b.publicKey);
  assert.equal(ab, await safetyNumber(b.publicKey, a.publicKey));
  assert.notEqual(ab, await safetyNumber(a.publicKey, c.publicKey));
  assert.match(ab, /^(\d{5} ){11}\d{5}$/);
});
