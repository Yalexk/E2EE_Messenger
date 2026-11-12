/**
 * The playground's protocol engine: a step-by-step X3DH run between two
 * simulated parties, using exactly the same shared module as the live chat.
 *
 * Pure-ish: every transition takes a state and returns a new one. React
 * owns the state; this file owns the protocol.
 */
import * as x3dh from '@e2ee/x3dh';

export const OPK_COUNT = 5;

export const STEPS = [
  { id: 'intro', title: 'Meet Alice & Bob', actor: 'both' },
  { id: 'keys', title: 'Generate keys', actor: 'both' },
  { id: 'publish', title: 'Bob publishes a bundle', actor: 'bob' },
  { id: 'fetch', title: 'Alice fetches it', actor: 'alice' },
  { id: 'verify', title: 'Verify the signature', actor: 'alice' },
  { id: 'ephemeral', title: 'Ephemeral key', actor: 'alice' },
  { id: 'dh', title: 'Four Diffie-Hellmans', actor: 'alice' },
  { id: 'kdf', title: 'Derive the secret', actor: 'alice' },
  { id: 'send', title: 'Initial message', actor: 'alice' },
  { id: 'receive', title: 'Bob derives the same key', actor: 'bob' },
  { id: 'chat', title: 'Chat', actor: 'both' },
];

export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

let packetSeq = 0;
const packet = (p) => ({ id: ++packetSeq, at: Date.now(), ...p });

export function initialState(options) {
  return {
    step: 0,
    alice: null,
    bob: null,
    server: { bundle: null, opks: [], initial: null },
    delivered: null, // the bundle as Alice received it
    verify: null, // { ok }
    handshake: null, // Alice's x3dhInitiate result
    received: null, // Bob's x3dhRespond result + decrypted text
    chat: [],
    packets: [],
    options: { tamperSpk: false, exhaustOpks: false, tamperTransit: false, ...options },
    error: null,
  };
}

/* ------------------------------------------------------------------------ */
/* Step transitions. Each returns the state *after* entering that step.     */
/* ------------------------------------------------------------------------ */

const transitions = {
  async keys(s) {
    const aliceId = x3dh.generateIdentityKeyPair();
    const bobId = x3dh.generateIdentityKeyPair();
    const spk = x3dh.generateSignedPreKey(bobId);
    const opks = x3dh.generateOneTimePreKeys(OPK_COUNT).map((k, i) => ({ ...k, label: `OPK_B${i + 1}`, deleted: false }));
    return { ...s, alice: { identity: aliceId }, bob: { identity: bobId, spk, opks, online: true } };
  },

  async publish(s) {
    const { bob } = s;
    const bundle = {
      identityKey: bob.identity.publicKey,
      edIdentityKey: bob.identity.edPublicKey,
      signedPreKey: bob.spk.publicKey,
      signedPreKeySignature: bob.spk.signature,
    };
    const opks = bob.opks.map((k) => ({ id: k.id, label: k.label, publicKey: k.publicKey, taken: false }));
    return {
      ...s,
      bob: { ...bob, online: false },
      server: { ...s.server, bundle, opks },
      packets: [...s.packets, packet({
        from: 'bob', to: 'server', kind: 'Prekey bundle upload',
        fields: [
          ['IK_B', bundle.identityKey],
          ['SPK_B', bundle.signedPreKey],
          ['Sig(IK_B, SPK_B)', bundle.signedPreKeySignature],
          [`OPK_B ×${opks.length}`, opks[0].publicKey],
        ],
      })],
    };
  },

  async fetch(s) {
    const { server, options } = s;
    let opks = server.opks;
    if (options.exhaustOpks) opks = opks.map((k) => ({ ...k, taken: true }));
    const nextOpk = opks.find((k) => !k.taken) ?? null;
    if (nextOpk) opks = opks.map((k) => (k.id === nextOpk.id ? { ...k, taken: true } : k));

    let delivered = { ...server.bundle, oneTimePreKey: nextOpk ? { id: nextOpk.id, publicKey: nextOpk.publicKey, label: nextOpk.label } : null };
    let mallory = null;
    if (options.tamperSpk) {
      // A malicious server swaps in its own prekey so it could read the
      // session. It can't forge Bob's signature over it.
      mallory = x3dh.generateSignedPreKey(x3dh.generateIdentityKeyPair());
      delivered = { ...delivered, signedPreKey: mallory.publicKey };
    }
    return {
      ...s,
      server: { ...server, opks },
      delivered: { ...delivered, tampered: !!mallory },
      packets: [...s.packets, packet({
        from: 'server', to: 'alice', kind: 'Bundle for Bob', tampered: !!mallory,
        fields: [
          ['IK_B', delivered.identityKey],
          [mallory ? 'SPK_B (swapped!)' : 'SPK_B', delivered.signedPreKey],
          ['Sig', delivered.signedPreKeySignature],
          ['OPK_B', delivered.oneTimePreKey ? delivered.oneTimePreKey.publicKey : '(none left)'],
        ],
      })],
    };
  },

  async verify(s) {
    const d = s.delivered;
    const ok = x3dh.verifySignedPreKey(d.edIdentityKey, d.signedPreKey, d.signedPreKeySignature);
    return { ...s, verify: { ok } };
  },

  async ephemeral(s) {
    return { ...s, alice: { ...s.alice, ephemeral: x3dh.generateEphemeralKeyPair() } };
  },

  async dh(s) {
    const handshake = await x3dh.x3dhInitiate({ identity: s.alice.identity, bundle: s.delivered, ephemeral: s.alice.ephemeral });
    return { ...s, handshake };
  },

  async kdf(s) {
    // Alice can now forget her ephemeral secret: forward secrecy.
    return { ...s, alice: { ...s.alice, ephemeralDeleted: true } };
  },

  async send(s, { text }) {
    const { handshake, alice, delivered } = s;
    const plaintext = text?.trim() || 'Hi Bob! This is our first end-to-end encrypted message.';
    const { ciphertext, nonce } = await x3dh.encrypt(handshake.sharedKey, plaintext, handshake.associatedData);
    const initial = {
      senderIdentityKey: alice.identity.publicKey,
      ephemeralKey: handshake.ephemeralPublicKey,
      oneTimePreKeyId: handshake.oneTimePreKeyId,
      oneTimePreKeyLabel: delivered.oneTimePreKey?.label ?? null,
      ciphertext,
      nonce,
      plaintext,
    };
    return {
      ...s,
      server: { ...s.server, initial },
      packets: [...s.packets, packet({
        from: 'alice', to: 'server', kind: 'Initial message (stored for Bob)',
        fields: [
          ['IK_A', x3dh.toB64(initial.senderIdentityKey)],
          ['EK_A', x3dh.toB64(initial.ephemeralKey)],
          ['OPK used', initial.oneTimePreKeyLabel ?? 'none'],
          ['ciphertext', ciphertext],
        ],
      })],
    };
  },

  async receive(s) {
    const { bob, server } = s;
    const initial = server.initial;
    const opk = initial.oneTimePreKeyId ? bob.opks.find((k) => k.id === initial.oneTimePreKeyId) : null;
    const result = await x3dh.x3dhRespond({
      identity: bob.identity,
      signedPreKeySecret: bob.spk.secretKey,
      oneTimePreKeySecret: opk?.secretKey ?? null,
      senderIdentityKey: initial.senderIdentityKey,
      ephemeralKey: initial.ephemeralKey,
    });
    let plaintext = null;
    try {
      plaintext = await x3dh.decrypt(result.sharedKey, initial.ciphertext, initial.nonce, result.associatedData);
    } catch {
      plaintext = null;
    }
    const match = x3dh.equalBytes(result.sharedKey, s.handshake.sharedKey);
    return {
      ...s,
      bob: { ...bob, online: true, opks: bob.opks.map((k) => (opk && k.id === opk.id ? { ...k, deleted: true } : k)) },
      received: { ...result, plaintext, match },
      chat: plaintext ? [{ id: ++packetSeq, from: 'alice', plaintext, status: 'ok', initial: true }] : [],
      packets: [...s.packets, packet({
        from: 'server', to: 'bob', kind: 'Initial message delivered',
        fields: [['ciphertext', initial.ciphertext]],
      })],
    };
  },

  async chat(s) {
    return s;
  },
};

export async function advance(state, input = {}) {
  const next = STEPS[state.step + 1];
  if (!next) return state;
  const after = await transitions[next.id](state, input);
  return { ...after, step: state.step + 1, error: null };
}

/** Can the user move past the current step? */
export function canAdvance(state) {
  const id = STEPS[state.step].id;
  if (id === 'verify') return !!state.verify?.ok;
  if (id === 'receive') return !!state.received?.match;
  return state.step < STEPS.length - 1;
}

/** Send a chat message from one party to the other, through the "server". */
export async function sendChat(state, from, text) {
  const key = from === 'alice' ? state.handshake : state.received;
  const peerKey = from === 'alice' ? state.received : state.handshake;
  const { ciphertext, nonce } = await x3dh.encrypt(key.sharedKey, text, key.associatedData);

  let delivered = ciphertext;
  const tampered = state.options.tamperTransit;
  if (tampered) {
    const bytes = x3dh.fromB64(ciphertext);
    bytes[Math.floor(bytes.length / 2)] ^= 0x01; // flip one bit
    delivered = x3dh.toB64(bytes);
  }

  let plaintext = null;
  let status = 'ok';
  try {
    plaintext = await x3dh.decrypt(peerKey.sharedKey, delivered, nonce, peerKey.associatedData);
  } catch {
    status = 'failed';
  }

  const to = from === 'alice' ? 'bob' : 'alice';
  return {
    ...state,
    chat: [...state.chat, { id: ++packetSeq, from, plaintext: status === 'ok' ? plaintext : null, sent: text, status, ciphertext: delivered }],
    packets: [...state.packets, packet({
      from, to, kind: tampered ? 'Message (modified in transit!)' : 'Message', tampered,
      fields: [['nonce', nonce], ['ciphertext', delivered]],
    })],
  };
}
