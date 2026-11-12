/**
 * X3DH ("Extended Triple Diffie-Hellman") key agreement.
 *
 * Spec: https://signal.org/docs/specifications/x3dh/
 *
 * This module is pure: no network, no storage, no UI state. The browser app,
 * the interactive playground and the server-side demo bot all run exactly this
 * code, so what the visualizer shows is what the real chat does.
 *
 * Curve choices
 *   - Identity keys are Ed25519 (so they can sign the signed prekey) and are
 *     converted to X25519 with ed2curve for the Diffie-Hellman steps.
 *   - Prekeys and ephemeral keys are plain X25519.
 *
 * KDF (spec section 2.2)
 *   SK = HKDF-SHA256(salt = 32 zero bytes,
 *                    ikm  = F || DH1 || DH2 || DH3 [|| DH4],
 *                    info = INFO)
 *   where F is 32 0xFF bytes (domain separation for X25519).
 *
 * AEAD
 *   Messages are encrypted with AES-256-GCM. The associated data is
 *   AD = IK_A || IK_B, which binds every ciphertext to both identities.
 */
import nacl from 'tweetnacl';
import ed2curve from 'ed2curve';

export const PROTOCOL_INFO = 'E2EE-Messenger-X3DH-v1';
const KEY_LEN = 32;
const GCM_NONCE_LEN = 12;

const subtle = globalThis.crypto?.subtle;
if (!subtle) {
  throw new Error('WebCrypto (crypto.subtle) is required: use a modern browser or Node 20+.');
}

/* ------------------------------------------------------------------------ */
/* Encoding helpers                                                          */
/* ------------------------------------------------------------------------ */

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(b64) {
  if (b64 instanceof Uint8Array) return b64;
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const utf8Encode = (s) => new TextEncoder().encode(s);
const utf8Decode = (b) => new TextDecoder().decode(b);

export function randomId(bytes = 9) {
  return toHex(nacl.randomBytes(bytes));
}

/* ------------------------------------------------------------------------ */
/* Key generation                                                            */
/* ------------------------------------------------------------------------ */

/** Long-term identity key: an Ed25519 signing pair plus its X25519 form. */
export function generateIdentityKeyPair() {
  const ed = nacl.sign.keyPair();
  const dh = ed2curve.convertKeyPair(ed);
  return {
    edPublicKey: ed.publicKey,
    edSecretKey: ed.secretKey,
    publicKey: dh.publicKey,
    secretKey: dh.secretKey,
  };
}

/** Medium-term signed prekey, signed by the identity key. */
export function generateSignedPreKey(identity) {
  const kp = nacl.box.keyPair();
  const signature = nacl.sign.detached(kp.publicKey, fromB64(identity.edSecretKey));
  return { id: randomId(), publicKey: kp.publicKey, secretKey: kp.secretKey, signature };
}

/** A batch of single-use prekeys. */
export function generateOneTimePreKeys(count) {
  return Array.from({ length: count }, () => {
    const kp = nacl.box.keyPair();
    return { id: randomId(), publicKey: kp.publicKey, secretKey: kp.secretKey };
  });
}

export function generateEphemeralKeyPair() {
  return nacl.box.keyPair();
}

export function publicKeyFromSecret(secretKey) {
  return nacl.scalarMult.base(fromB64(secretKey));
}

export function verifySignedPreKey(edIdentityKey, signedPreKey, signature) {
  try {
    return nacl.sign.detached.verify(fromB64(signedPreKey), fromB64(signature), fromB64(edIdentityKey));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------------ */
/* Core primitives                                                           */
/* ------------------------------------------------------------------------ */

/**
 * X25519 Diffie-Hellman. Rejects an all-zero output, which happens when the
 * peer supplies a low-order point: such a key would contribute nothing.
 */
export function dh(secretKey, publicKey) {
  const out = nacl.scalarMult(fromB64(secretKey), fromB64(publicKey));
  if (out.every((b) => b === 0)) {
    throw new Error('DH produced an all-zero output: peer public key is invalid');
  }
  return out;
}

/** HKDF-SHA256 as specified in X3DH section 2.2. */
export async function kdf(dhOutputs) {
  const F = new Uint8Array(KEY_LEN).fill(0xff);
  const ikm = concat(F, ...dhOutputs);
  const baseKey = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(KEY_LEN), info: utf8Encode(PROTOCOL_INFO) },
    baseKey,
    KEY_LEN * 8,
  );
  return { ikm, sharedKey: new Uint8Array(bits) };
}

/* ------------------------------------------------------------------------ */
/* The handshake                                                             */
/* ------------------------------------------------------------------------ */

const PURPOSE = {
  DH1: 'Authenticates Alice: only she holds IK_A.',
  DH2: 'Authenticates Bob: only he holds IK_B.',
  DH3: 'Forward secrecy: SPK_B is rotated and EK_A is thrown away.',
  DH4: 'Replay protection: OPK_B is deleted after a single use.',
};

/**
 * Initiator ("Alice") side.
 *
 * @param identity   Alice's identity key pair (from generateIdentityKeyPair)
 * @param bundle     Bob's published prekey bundle. Keys may be base64 strings
 *                   or Uint8Arrays:
 *                   { identityKey, edIdentityKey, signedPreKey,
 *                     signedPreKeySignature, oneTimePreKey?: { id, publicKey } }
 * @param ephemeral  optional ephemeral key pair (the playground injects one so
 *                   it can show it before the computation)
 * @returns { sharedKey, associatedData, ephemeralPublicKey, oneTimePreKeyId, trace }
 */
export async function x3dhInitiate({ identity, bundle, ephemeral }) {
  if (!verifySignedPreKey(bundle.edIdentityKey, bundle.signedPreKey, bundle.signedPreKeySignature)) {
    const err = new Error("Signed prekey signature is invalid: the bundle was tampered with or isn't Bob's");
    err.code = 'BAD_SIGNATURE';
    throw err;
  }

  const IKb = fromB64(bundle.identityKey);
  const SPKb = fromB64(bundle.signedPreKey);
  const OPKb = bundle.oneTimePreKey ? fromB64(bundle.oneTimePreKey.publicKey) : null;
  const EK = ephemeral ?? generateEphemeralKeyPair();

  const steps = [
    { label: 'DH1', mine: 'IK_A', theirs: 'SPK_B', purpose: PURPOSE.DH1, out: dh(identity.secretKey, SPKb) },
    { label: 'DH2', mine: 'EK_A', theirs: 'IK_B', purpose: PURPOSE.DH2, out: dh(EK.secretKey, IKb) },
    { label: 'DH3', mine: 'EK_A', theirs: 'SPK_B', purpose: PURPOSE.DH3, out: dh(EK.secretKey, SPKb) },
  ];
  if (OPKb) {
    steps.push({ label: 'DH4', mine: 'EK_A', theirs: 'OPK_B', purpose: PURPOSE.DH4, out: dh(EK.secretKey, OPKb) });
  }

  const { ikm, sharedKey } = await kdf(steps.map((s) => s.out));
  const myPublic = identity.publicKey ? fromB64(identity.publicKey) : publicKeyFromSecret(identity.secretKey);
  const associatedData = concat(myPublic, IKb);

  return {
    sharedKey,
    associatedData,
    ephemeralPublicKey: EK.publicKey,
    oneTimePreKeyId: bundle.oneTimePreKey?.id ?? null,
    trace: { role: 'initiator', steps, ikm, sharedKey, associatedData },
  };
}

/**
 * Responder ("Bob") side.
 *
 * @param identity              Bob's identity key pair
 * @param signedPreKeySecret    secret half of the SPK Alice used
 * @param oneTimePreKeySecret   secret half of the OPK Alice used, or null
 * @param senderIdentityKey     IK_A (X25519 public, base64 or bytes)
 * @param ephemeralKey          EK_A public (base64 or bytes)
 */
export async function x3dhRespond({ identity, signedPreKeySecret, oneTimePreKeySecret, senderIdentityKey, ephemeralKey }) {
  const IKa = fromB64(senderIdentityKey);
  const EKa = fromB64(ephemeralKey);

  const steps = [
    { label: 'DH1', mine: 'SPK_B', theirs: 'IK_A', purpose: PURPOSE.DH1, out: dh(signedPreKeySecret, IKa) },
    { label: 'DH2', mine: 'IK_B', theirs: 'EK_A', purpose: PURPOSE.DH2, out: dh(identity.secretKey, EKa) },
    { label: 'DH3', mine: 'SPK_B', theirs: 'EK_A', purpose: PURPOSE.DH3, out: dh(signedPreKeySecret, EKa) },
  ];
  if (oneTimePreKeySecret) {
    steps.push({ label: 'DH4', mine: 'OPK_B', theirs: 'EK_A', purpose: PURPOSE.DH4, out: dh(oneTimePreKeySecret, EKa) });
  }

  const { ikm, sharedKey } = await kdf(steps.map((s) => s.out));
  const myPublic = identity.publicKey ? fromB64(identity.publicKey) : publicKeyFromSecret(identity.secretKey);
  const associatedData = concat(IKa, myPublic);

  return {
    sharedKey,
    associatedData,
    trace: { role: 'responder', steps, ikm, sharedKey, associatedData },
  };
}

/* ------------------------------------------------------------------------ */
/* AEAD                                                                      */
/* ------------------------------------------------------------------------ */

async function aesKey(raw, usage) {
  return subtle.importKey('raw', fromB64(raw), 'AES-GCM', false, [usage]);
}

/** Encrypt a UTF-8 string. Returns base64 { ciphertext, nonce }. */
export async function encrypt(sharedKey, plaintext, associatedData) {
  const nonce = nacl.randomBytes(GCM_NONCE_LEN);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: fromB64(associatedData) },
    await aesKey(sharedKey, 'encrypt'),
    utf8Encode(plaintext),
  );
  return { ciphertext: toB64(new Uint8Array(ct)), nonce: toB64(nonce) };
}

/** Decrypt. Throws if the key, nonce, ciphertext or associated data don't match. */
export async function decrypt(sharedKey, ciphertext, nonce, associatedData) {
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(nonce), additionalData: fromB64(associatedData) },
      await aesKey(sharedKey, 'decrypt'),
      fromB64(ciphertext),
    );
    return utf8Decode(new Uint8Array(pt));
  } catch {
    const err = new Error('Decryption failed: wrong key, or the ciphertext / associated data was modified');
    err.code = 'DECRYPT_FAILED';
    throw err;
  }
}

/* ------------------------------------------------------------------------ */
/* Safety numbers                                                            */
/* ------------------------------------------------------------------------ */

/**
 * A short code both parties can compare out-of-band to detect a server that
 * swapped identity keys (a man-in-the-middle). Order-independent.
 */
export async function safetyNumber(identityKeyA, identityKeyB) {
  const [x, y] = [fromB64(identityKeyA), fromB64(identityKeyB)].sort((p, q) => {
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] - q[i];
    return 0;
  });
  const digest = new Uint8Array(await subtle.digest('SHA-256', concat(x, y)));
  const groups = [];
  for (let i = 0; i < 12; i++) {
    const n = ((digest[i * 2] << 8) | digest[i * 2 + 1]) % 100000;
    groups.push(String(n).padStart(5, '0'));
  }
  return groups.join(' ');
}
