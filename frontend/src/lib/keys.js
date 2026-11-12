/**
 * Key generation and session bookkeeping for the live chat, on top of the
 * shared X3DH module. Everything stored is base64 so it can go in the vault.
 */
import * as x3dh from '@e2ee/x3dh';

const b64 = x3dh.toB64;
export const ONE_TIME_PREKEY_BATCH = 100;
const KEEP_SIGNED_PREKEYS = 3;

export function newOneTimePreKeys(count = ONE_TIME_PREKEY_BATCH) {
  const batch = x3dh.generateOneTimePreKeys(count);
  return {
    secrets: Object.fromEntries(batch.map((k) => [k.id, b64(k.secretKey)])),
    publics: batch.map((k) => ({ id: k.id, publicKey: b64(k.publicKey) })),
  };
}

export function newSignedPreKey(identity) {
  const spk = x3dh.generateSignedPreKey(identity);
  return {
    record: { id: spk.id, publicKey: b64(spk.publicKey), secretKey: b64(spk.secretKey), createdAt: Date.now() },
    published: { signedPreKeyId: spk.id, signedPreKey: b64(spk.publicKey), signedPreKeySignature: b64(spk.signature) },
  };
}

/** Everything a brand-new account needs: private keys for the vault, public bundle for the server. */
export function generateAccountKeys() {
  const id = x3dh.generateIdentityKeyPair();
  const identity = {
    edPublicKey: b64(id.edPublicKey),
    edSecretKey: b64(id.edSecretKey),
    publicKey: b64(id.publicKey),
    secretKey: b64(id.secretKey),
  };
  const spk = newSignedPreKey(identity);
  const opks = newOneTimePreKeys();
  return {
    keys: { identity, signedPreKeys: [spk.record], oneTimePreKeys: opks.secrets, sessions: {} },
    bundle: {
      identityKey: identity.publicKey,
      edIdentityKey: identity.edPublicKey,
      ...spk.published,
      oneTimePreKeys: opks.publics,
    },
  };
}

/** Keep the newest few SPKs so initial messages sent to an old one still work. */
export function withSignedPreKey(keys, record) {
  return { ...keys, signedPreKeys: [record, ...keys.signedPreKeys].slice(0, KEEP_SIGNED_PREKEYS) };
}

/** A JSON-safe summary of a handshake for the protocol inspector. */
export function serialiseTrace(trace, extra = {}) {
  return {
    role: trace.role,
    steps: trace.steps.map((s) => ({ label: s.label, mine: s.mine, theirs: s.theirs, purpose: s.purpose, out: b64(s.out) })),
    ikmBytes: trace.ikm.length,
    ...extra,
  };
}

export function newSessionId() {
  return x3dh.randomId(16);
}
