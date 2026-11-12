import { create } from 'zustand';
import { io } from 'socket.io-client';
import { api, errorMessage } from '../lib/api.js';
import * as vault from '../lib/keyVault.js';
import { generateAccountKeys, newOneTimePreKeys, newSignedPreKey, withSignedPreKey } from '../lib/keys.js';
import { useChatStore } from './useChatStore.js';

/**
 * status:
 *   checking   - asking the server whether we have a session cookie
 *   anonymous  - not logged in
 *   locked     - logged in on the server, but the local key vault is locked
 *   no-keys    - logged in, but this browser has no keys for the account
 *   ready      - logged in with keys unlocked
 */
export const useAuthStore = create((set, get) => ({
  status: 'checking',
  authUser: null,
  keys: null,
  socket: null,
  onlineUserIds: [],
  busy: false,
  error: null,

  clearError: () => set({ error: null }),

  checkAuth: async () => {
    try {
      const { data } = await api.get('/auth/check');
      const username = data.user.username;
      if (!vault.hasVault(username)) return set({ status: 'no-keys', authUser: data.user });
      const keys = await vault.resumeVault(username);
      if (!keys) return set({ status: 'locked', authUser: data.user });
      set({ status: 'ready', authUser: data.user, keys });
      get().afterUnlock(data);
    } catch {
      set({ status: 'anonymous', authUser: null, keys: null });
    }
  },

  signup: async ({ username, password }) => {
    set({ busy: true, error: null });
    try {
      // Keys are generated here, in the browser. Only the public half is sent.
      const { keys, bundle } = generateAccountKeys();
      const { data } = await api.post('/auth/signup', { username, password, ...bundle });
      await vault.createVault(data.user.username, password, keys);
      set({ status: 'ready', authUser: data.user, keys });
      get().connectSocket();
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  login: async ({ username, password }) => {
    set({ busy: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { username, password });
      const name = data.user.username;
      if (!vault.hasVault(name)) {
        set({ status: 'no-keys', authUser: data.user });
        return true;
      }
      const keys = await vault.unlockVault(name, password);
      set({ status: 'ready', authUser: data.user, keys });
      get().afterUnlock(data);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  unlock: async (password) => {
    const { authUser } = get();
    set({ busy: true, error: null });
    try {
      const keys = await vault.unlockVault(authUser.username, password);
      set({ status: 'ready', keys });
      const { data } = await api.get('/auth/check');
      get().afterUnlock(data);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  /** Top up one-time prekeys / rotate the signed prekey if the server says so. */
  afterUnlock: (status) => {
    get().connectSocket();
    if (status?.needsOneTimePreKeys) get().replenishOneTimePreKeys().catch(console.error);
    if (status?.needsSignedPreKeyRotation) get().rotateSignedPreKey().catch(console.error);
  },

  updateKeys: async (mutate) => {
    const { authUser } = get();
    const next = mutate(get().keys);
    set({ keys: next });
    await vault.saveVault(authUser.username, next);
    return next;
  },

  replenishOneTimePreKeys: async () => {
    const { secrets, publics } = newOneTimePreKeys();
    // Store the secret halves *before* publishing the public halves.
    await get().updateKeys((k) => ({ ...k, oneTimePreKeys: { ...k.oneTimePreKeys, ...secrets } }));
    const { data } = await api.post('/auth/otks', { oneTimePreKeys: publics });
    const rejected = publics.filter((p) => !data.accepted.includes(p.id)).map((p) => p.id);
    if (rejected.length) {
      await get().updateKeys((k) => {
        const oneTimePreKeys = { ...k.oneTimePreKeys };
        for (const id of rejected) delete oneTimePreKeys[id];
        return { ...k, oneTimePreKeys };
      });
    }
  },

  rotateSignedPreKey: async () => {
    const { record, published } = newSignedPreKey(get().keys.identity);
    await get().updateKeys((k) => withSignedPreKey(k, record));
    await api.put('/auth/signedPreKey', published);
  },

  logout: async () => {
    const { authUser } = get();
    get().disconnectSocket();
    useChatStore.getState().reset();
    if (authUser) await vault.lockVault(authUser.username);
    await api.post('/auth/logout').catch(() => {});
    set({ status: 'anonymous', authUser: null, keys: null, onlineUserIds: [], error: null });
  },

  /** Forget this account's keys on this device (the only way out of "no-keys"). */
  forgetDevice: async () => {
    const { authUser } = get();
    if (authUser) await vault.deleteVault(authUser.username);
    await get().logout();
  },

  connectSocket: () => {
    if (get().socket) return;
    const socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    const chat = () => useChatStore.getState();
    socket.on('onlineUsers', (ids) => set({ onlineUserIds: ids }));
    socket.on('newMessage', (m) => chat().receiveMessage(m));
    socket.on('sessionStarted', (p) => chat().onSessionStarted(p));
    socket.on('prekeysLow', () => get().replenishOneTimePreKeys().catch(console.error));
    socket.on('connect', () => chat().onReconnect?.());
    set({ socket });
  },

  disconnectSocket: () => {
    get().socket?.disconnect();
    set({ socket: null });
  },
}));
