import { toHex, fromB64 } from '@e2ee/x3dh';

/** Hex for bytes or base64, optionally shortened to `head…tail`. */
export function hex(value, { short = false, head = 8, tail = 6 } = {}) {
  if (value == null) return '';
  const h = toHex(typeof value === 'string' ? fromB64(value) : value);
  if (!short || h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function shortB64(value, n = 18) {
  if (!value) return '';
  return value.length > n ? `${value.slice(0, n)}…` : value;
}

export function timeOf(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}
