// Derive a 256-bit AES-GCM key from password + salt
export async function deriveKey(password, saltB64) {
    const enc = new TextEncoder();
    const pass = await crypto.subtle.importKey(
        "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    const salt   = Uint8Array.from(atob(saltB64), c=>c.charCodeAt(0));
    return crypto.subtle.deriveKey(
        { name:"PBKDF2", salt, iterations:100_000, hash:"SHA-256" },
        pass,
        { name:"AES-GCM", length:256 },
        false,
        ["encrypt","decrypt"]
    );
}

// Encrypt an arbitrary object under the password
export async function encryptWithPassword(obj, password) {
  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, btoa(String.fromCharCode(...salt)));
  const ct   = await crypto.subtle.encrypt(
    { name:"AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(obj))
  );
  return {
    salt:       btoa(String.fromCharCode(...salt)),
    iv:         btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct)))
  };
}

// Decrypt the blob back to your object
export async function decryptWithPassword(blob, password) {
  const dec  = new TextDecoder();
  const iv   = Uint8Array.from(atob(blob.iv),   c=>c.charCodeAt(0));
  const salt = Uint8Array.from(atob(blob.salt), c=>c.charCodeAt(0));
  const key  = await deriveKey(password, blob.salt);
  const ct   = Uint8Array.from(atob(blob.ciphertext), c=>c.charCodeAt(0));
  const pt   = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return JSON.parse(dec.decode(pt));
}