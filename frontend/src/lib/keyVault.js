/**
 * Local key vault: where a user's private keys live in the browser.
 *
 *  - At rest (localStorage) the keys are always AES-GCM encrypted under a key
 *    derived from the password with PBKDF2-SHA256 (600k iterations).
 *  - While logged in, that derived key is kept in IndexedDB as a
 *    *non-extractable* CryptoKey, so a page reload doesn't need the password
 *    and script on the page can use the key but never read its bytes.
 *  - Logging out deletes the CryptoKey; the vault stays encrypted.
 *
 * The server never sees any of this.
 */
import { toB64, fromB64 } from '@e2ee/x3dh';

const VERSION = 1;
const ITERATIONS = 600_000;
const DB_NAME = 'e2ee';
const STORE = 'unlockKeys';
const vaultKey = (username) => `e2ee:vault:${username.toLowerCase()}`;

/* -------------------------- IndexedDB helpers ---------------------------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const putUnlockKey = (username, key) => idb('readwrite', (s) => s.put(key, username.toLowerCase()));
const getUnlockKey = (username) => idb('readonly', (s) => s.get(username.toLowerCase()));
const deleteUnlockKey = (username) => idb('readwrite', (s) => s.delete(username.toLowerCase()));

/* ------------------------------ Crypto ----------------------------------- */

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, salt, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: VERSION, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)) };
}

async function open(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ciphertext));
  return JSON.parse(new TextDecoder().decode(pt));
}

function readBlob(username) {
  const raw = localStorage.getItem(vaultKey(username));
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw);
    return blob?.v === VERSION && blob.ciphertext ? blob : null;
  } catch {
    return null;
  }
}

/* ------------------------------- API ------------------------------------- */

export function hasVault(username) {
  return readBlob(username) !== null;
}

export async function createVault(username, password, keys) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  localStorage.setItem(vaultKey(username), JSON.stringify(await seal(key, salt, keys)));
  await putUnlockKey(username, key);
}

/** Unlock with the password. Throws if the password is wrong. */
export async function unlockVault(username, password) {
  const blob = readBlob(username);
  if (!blob) throw Object.assign(new Error('No keys for this account on this device'), { code: 'NO_VAULT' });
  const key = await deriveKey(password, fromB64(blob.salt));
  let keys;
  try {
    keys = await open(key, blob);
  } catch {
    throw Object.assign(new Error('Wrong password for the local key vault'), { code: 'BAD_PASSWORD' });
  }
  await putUnlockKey(username, key);
  return keys;
}

/** Re-open after a page reload using the stored unlock key. Null if locked. */
export async function resumeVault(username) {
  const blob = readBlob(username);
  if (!blob) return null;
  const key = await getUnlockKey(username).catch(() => null);
  if (!key) return null;
  try {
    return await open(key, blob);
  } catch {
    return null;
  }
}

let writeChain = Promise.resolve();

/** Persist updated keys. Writes are serialised so concurrent saves can't interleave. */
export function saveVault(username, keys) {
  writeChain = writeChain.then(async () => {
    const blob = readBlob(username);
    const key = await getUnlockKey(username);
    if (!blob || !key) throw new Error('Vault is locked');
    localStorage.setItem(vaultKey(username), JSON.stringify(await seal(key, fromB64(blob.salt), keys)));
  });
  return writeChain;
}

export async function lockVault(username) {
  await writeChain.catch(() => {});
  await deleteUnlockKey(username).catch(() => {});
}

export function deleteVault(username) {
  localStorage.removeItem(vaultKey(username));
  return deleteUnlockKey(username).catch(() => {});
}
