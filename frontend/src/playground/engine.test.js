import { describe, it, expect } from 'vitest';
import { initialState, advance, canAdvance, sendChat, STEPS, stepIndex } from './engine.js';

async function runTo(id, options) {
  let s = initialState(options);
  while (STEPS[s.step].id !== id) {
    s = await advance(s, { text: 'first!' });
  }
  return s;
}

describe('playground engine', () => {
  it('walks the whole handshake and both sides agree', async () => {
    const s = await runTo('chat');
    expect(s.verify.ok).toBe(true);
    expect(s.handshake.trace.steps).toHaveLength(4);
    expect(s.received.match).toBe(true);
    expect(s.received.plaintext).toBe('first!');
    expect(s.bob.opks.filter((k) => k.deleted)).toHaveLength(1);
    expect(s.alice.ephemeralDeleted).toBe(true);
  });

  it('server only ever sees public keys and ciphertext', async () => {
    const s = await runTo('chat');
    const dump = JSON.stringify(s.packets);
    expect(dump).not.toContain('first!');
  });

  it('a swapped signed prekey fails verification and blocks progress', async () => {
    const s = await runTo('verify', { tamperSpk: true });
    expect(s.delivered.tampered).toBe(true);
    expect(s.verify.ok).toBe(false);
    expect(canAdvance(s)).toBe(false);
  });

  it('falls back to three DHs when the one-time prekeys are exhausted', async () => {
    const s = await runTo('receive', { exhaustOpks: true });
    expect(s.delivered.oneTimePreKey).toBeNull();
    expect(s.handshake.trace.steps).toHaveLength(3);
    expect(s.received.match).toBe(true);
  });

  it('chat works both ways and detects tampering in transit', async () => {
    let s = await runTo('chat');
    s = await sendChat(s, 'alice', 'hello bob');
    s = await sendChat(s, 'bob', 'hey alice');
    expect(s.chat.slice(-2).map((m) => [m.from, m.status, m.plaintext])).toEqual([
      ['alice', 'ok', 'hello bob'],
      ['bob', 'ok', 'hey alice'],
    ]);
    s = await sendChat({ ...s, options: { ...s.options, tamperTransit: true } }, 'alice', 'secret');
    expect(s.chat.at(-1).status).toBe('failed');
    expect(s.packets.at(-1).tampered).toBe(true);
  });

  it('steps are in protocol order', () => {
    expect(stepIndex('fetch')).toBeLessThan(stepIndex('verify'));
    expect(stepIndex('dh')).toBeLessThan(stepIndex('kdf'));
    expect(stepIndex('send')).toBeLessThan(stepIndex('receive'));
  });
});
