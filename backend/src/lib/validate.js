import mongoose from 'mongoose';

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Base64 string that decodes to exactly `bytes` bytes. */
export function isB64Bytes(value, bytes) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !B64_RE.test(value)) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding === bytes;
}

/** Non-empty base64 string no longer than `maxBytes` once decoded. */
export function isB64(value, maxBytes = 64 * 1024) {
  return typeof value === 'string' && value.length > 0 && value.length % 4 === 0
    && value.length <= Math.ceil(maxBytes / 3) * 4 && B64_RE.test(value);
}

export const isKey = (v) => isB64Bytes(v, 32);
export const isSignature = (v) => isB64Bytes(v, 64);
export const isGcmNonce = (v) => isB64Bytes(v, 12);

export function isShortId(value, max = 64) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

export const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v) && mongoose.isValidObjectId(v);

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

/** Max ciphertext size accepted for a single chat message. */
export const MAX_MESSAGE_BYTES = 8 * 1024;

export function isOneTimePreKeyList(list, max) {
  return Array.isArray(list) && list.length > 0 && list.length <= max
    && list.every((k) => k && isShortId(k.id) && isKey(k.publicKey))
    && new Set(list.map((k) => k.id)).size === list.length;
}
