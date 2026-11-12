import { create } from 'zustand';
import * as x3dh from '@e2ee/x3dh';
import { api, errorMessage } from '../lib/api.js';
import { newSessionId, serialiseTrace } from '../lib/keys.js';
import { useAuthStore } from './useAuthStore.js';

const auth = () => useAuthStore.getState();
const INITIAL_PLAINTEXT = 'X3DH initial message';

/** Decrypt one stored message with whichever session key it belongs to. */
async function decryptMessage(m) {
  const session = auth().keys?.sessions?.[m.sessionId];
  if (!session) return { ...m, plaintext: null, decryptStatus: 'no-key' };
  try {
    const plaintext = await x3dh.decrypt(session.sharedKey, m.messageText, m.nonce, session.associatedData);
    return { ...m, plaintext, decryptStatus: 'ok' };
  } catch {
    return { ...m, plaintext: null, decryptStatus: 'failed' };
  }
}

function saveSession(sessionId, record) {
  return auth().updateKeys((k) => ({ ...k, sessions: { ...k.sessions, [sessionId]: record } }));
}

export const useChatStore = create((set, get) => ({
  users: [],
  usersLoading: false,
  selectedUser: null,
  messages: [],
  messagesLoading: false,
  unread: {},
  session: null, // { sessionId, ...record } for the selected conversation
  sessionStatus: 'idle', // idle | handshaking | ready | error
  sessionError: null,
  showCiphertext: false,
  inspectorOpen: false,
  sending: false,
  _token: 0,

  toggleCiphertext: () => set((s) => ({ showCiphertext: !s.showCiphertext })),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),

  reset: () => set({ users: [], selectedUser: null, messages: [], unread: {}, session: null, sessionStatus: 'idle', sessionError: null }),

  loadUsers: async () => {
    set({ usersLoading: true });
    try {
      const { data } = await api.get('/messages/user');
      set({ users: data.users });
      useAuthStore.setState({ onlineUserIds: data.online });
    } catch (error) {
      console.error(errorMessage(error));
    } finally {
      set({ usersLoading: false });
    }
  },

  selectUser: async (user) => {
    const prev = get().selectedUser;
    if (prev?._id === user?._id) return;
    if (prev && get().sessionStatus === 'ready') {
      api.post(`/session/endSession/${prev._id}`).catch(() => {});
    }
    const token = get()._token + 1;
    set({
      _token: token,
      selectedUser: user,
      messages: [],
      session: null,
      sessionStatus: user ? 'handshaking' : 'idle',
      sessionError: null,
      unread: user ? { ...get().unread, [user._id]: 0 } : get().unread,
    });
    if (!user) return;
    await get().openSession(user, token);
    if (get()._token === token) await get().loadMessages(user._id, token);
  },

  /**
   * Find or establish the X3DH session with `peer`:
   *  1. an existing handshake whose key we already hold → reuse it
   *  2. a handshake *they* started → run the responder side
   *  3. otherwise → fetch their bundle and run the initiator side
   */
  openSession: async (peer, token = get()._token) => {
    const stale = () => get()._token !== token;
    set({ sessionStatus: 'handshaking', sessionError: null });
    try {
      const me = auth().authUser;
      const { data } = await api.get(`/session/initial/${peer._id}`);
      const initial = data.initialMessage;
      const known = initial && auth().keys.sessions[initial.sessionId];
      let sessionId;

      if (known) {
        sessionId = initial.sessionId;
        await api.put(`/session/updateSessionInfo/${peer._id}`);
      } else if (initial && String(initial.receiverId) === String(me._id)) {
        sessionId = await respond(peer, initial);
        await api.put(`/session/updateSessionInfo/${peer._id}`);
      } else {
        sessionId = await initiate(peer);
      }
      if (stale()) return;
      set({ session: { sessionId, ...auth().keys.sessions[sessionId] }, sessionStatus: 'ready' });
    } catch (error) {
      if (stale()) return;
      console.error(error);
      set({ sessionStatus: 'error', sessionError: error.code === 'BAD_SIGNATURE' ? error.message : errorMessage(error) });
    }
  },

  loadMessages: async (peerId, token = get()._token) => {
    set({ messagesLoading: true });
    try {
      const { data } = await api.get(`/messages/${peerId}`);
      const decrypted = await Promise.all(data.map(decryptMessage));
      if (get()._token !== token) return;
      set((s) => ({ messages: mergeMessages(decrypted, s.messages) }));
    } catch (error) {
      console.error(errorMessage(error));
    } finally {
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (text) => {
    const { selectedUser, session } = get();
    if (!selectedUser || !session || !text.trim()) return false;
    set({ sending: true });
    try {
      const { ciphertext, nonce } = await x3dh.encrypt(session.sharedKey, text, session.associatedData);
      const { data } = await api.post(`/messages/send/${selectedUser._id}`, { messageText: ciphertext, nonce, sessionId: session.sessionId });
      set((s) => ({ messages: mergeMessages(s.messages, [{ ...data, plaintext: text, decryptStatus: 'ok' }]) }));
      return true;
    } catch (error) {
      set({ sessionError: errorMessage(error) });
      return false;
    } finally {
      set({ sending: false });
    }
  },

  receiveMessage: async (m) => {
    const { selectedUser } = get();
    const me = auth().authUser?._id;
    const peer = String(m.senderId) === String(me) ? String(m.receiverId) : String(m.senderId);
    if (!selectedUser || String(selectedUser._id) !== peer) {
      set((s) => ({ unread: { ...s.unread, [peer]: (s.unread[peer] ?? 0) + 1 } }));
      if (!get().users.some((u) => String(u._id) === peer)) get().loadUsers();
      return;
    }
    const decrypted = await decryptMessage(m);
    set((s) => ({ messages: mergeMessages(s.messages, [decrypted]) }));
  },

  /** The peer started a new handshake with us while we're looking at them. */
  onSessionStarted: async ({ from }) => {
    const { selectedUser, _token } = get();
    if (selectedUser && String(selectedUser._id) === String(from)) {
      await get().openSession(selectedUser, _token);
    }
    if (!get().users.some((u) => String(u._id) === String(from))) get().loadUsers();
  },

  onReconnect: () => {
    const { selectedUser, _token } = get();
    if (selectedUser) get().loadMessages(selectedUser._id, _token);
  },
}));

function mergeMessages(a, b) {
  const byId = new Map();
  for (const m of [...a, ...b]) byId.set(String(m._id), { ...byId.get(String(m._id)), ...m });
  return [...byId.values()].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
}

/* ------------------------------------------------------------------------ */
/* The two halves of X3DH, as the live client runs them                     */
/* ------------------------------------------------------------------------ */

async function initiate(peer) {
  const { keys } = auth();
  const { data: bundle } = await api.get(`/session/keys/${peer._id}`);
  if (bundle.identityKey !== peer.identityKey) {
    throw Object.assign(new Error("The server returned a different identity key for this user than before"), { code: 'BAD_SIGNATURE' });
  }
  const result = await x3dh.x3dhInitiate({ identity: keys.identity, bundle });
  const sessionId = newSessionId();
  const sharedKey = x3dh.toB64(result.sharedKey);
  const associatedData = x3dh.toB64(result.associatedData);
  const { ciphertext, nonce } = await x3dh.encrypt(sharedKey, INITIAL_PLAINTEXT, associatedData);

  // Persist the session before announcing it, so a crash can't leave a
  // handshake on the server that we hold no key for.
  await saveSession(sessionId, {
    peerId: String(peer._id),
    peerUsername: peer.username,
    peerIdentityKey: bundle.identityKey,
    role: 'initiator',
    sharedKey,
    associatedData,
    createdAt: Date.now(),
    trace: serialiseTrace(result.trace, {
      bundle: {
        identityKey: bundle.identityKey,
        edIdentityKey: bundle.edIdentityKey,
        signedPreKeyId: bundle.signedPreKeyId,
        signedPreKey: bundle.signedPreKey,
        signedPreKeySignature: bundle.signedPreKeySignature,
        oneTimePreKey: bundle.oneTimePreKey,
        remainingOneTimePreKeys: bundle.remainingOneTimePreKeys,
      },
      signatureValid: true,
      ephemeralPublicKey: x3dh.toB64(result.ephemeralPublicKey),
    }),
  });

  await api.post(`/session/sendInitial/${peer._id}`, {
    sessionId,
    encryptedMessage: ciphertext,
    nonce,
    ephemeralKeyPublic: x3dh.toB64(result.ephemeralPublicKey),
    otkKeyId: result.oneTimePreKeyId,
    signedPreKeyId: bundle.signedPreKeyId,
  });
  return sessionId;
}

async function respond(peer, initial) {
  const { keys } = auth();
  if (initial.senderIdentityKey !== peer.identityKey) {
    throw Object.assign(new Error("The initial message's identity key doesn't match this user's"), { code: 'BAD_SIGNATURE' });
  }
  const spk = keys.signedPreKeys.find((k) => k.id === initial.signedPreKeyId) ?? keys.signedPreKeys[0];
  let opkSecret = null;
  if (initial.otkKeyId) {
    opkSecret = keys.oneTimePreKeys[initial.otkKeyId];
    if (!opkSecret) throw new Error('This handshake used a one-time prekey this device no longer has. Ask them to reopen the chat.');
  }

  const result = await x3dh.x3dhRespond({
    identity: keys.identity,
    signedPreKeySecret: spk.secretKey,
    oneTimePreKeySecret: opkSecret,
    senderIdentityKey: initial.senderIdentityKey,
    ephemeralKey: initial.ephemeralKeyPublic,
  });
  const sharedKey = x3dh.toB64(result.sharedKey);
  const associatedData = x3dh.toB64(result.associatedData);
  // Authenticates the whole handshake: only the real initiator could produce
  // a ciphertext that decrypts under this key with this AD.
  await x3dh.decrypt(sharedKey, initial.messageText, initial.nonce, associatedData);

  await auth().updateKeys((k) => {
    const oneTimePreKeys = { ...k.oneTimePreKeys };
    if (initial.otkKeyId) delete oneTimePreKeys[initial.otkKeyId]; // single use
    return {
      ...k,
      oneTimePreKeys,
      sessions: {
        ...k.sessions,
        [initial.sessionId]: {
          peerId: String(peer._id),
          peerUsername: peer.username,
          peerIdentityKey: initial.senderIdentityKey,
          role: 'responder',
          sharedKey,
          associatedData,
          createdAt: Date.now(),
          trace: serialiseTrace(result.trace, {
            ephemeralPublicKey: initial.ephemeralKeyPublic,
            usedSignedPreKeyId: spk.id,
            usedOneTimePreKeyId: initial.otkKeyId ?? null,
          }),
        },
      },
    };
  });
  return initial.sessionId;
}
