import { describe, it, expect, beforeEach } from 'vitest';
import { createVault, unlockVault, resumeVault, saveVault, lockVault, hasVault, deleteVault } from './keyVault.js';

const keys = { identity: { secretKey: 'c2VjcmV0' }, sessions: {} };

describe('keyVault', () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteVault('alice');
  });

  it('never stores keys in plaintext', async () => {
    await createVault('alice', 'hunter22hunter', keys);
    const raw = localStorage.getItem('e2ee:vault:alice');
    expect(raw).not.toContain('c2VjcmV0');
    expect(JSON.parse(raw)).toMatchObject({ v: 1, salt: expect.any(String), iv: expect.any(String) });
  });

  it('unlocks with the right password and rejects the wrong one', async () => {
    await createVault('alice', 'hunter22hunter', keys);
    await expect(unlockVault('alice', 'nope-nope-nope')).rejects.toMatchObject({ code: 'BAD_PASSWORD' });
    await expect(unlockVault('alice', 'hunter22hunter')).resolves.toEqual(keys);
  });

  it('resumes after reload until locked, and saves updates', async () => {
    await createVault('alice', 'hunter22hunter', keys);
    expect(await resumeVault('alice')).toEqual(keys);

    const updated = { ...keys, sessions: { s1: { sharedKey: 'k' } } };
    await saveVault('alice', updated);
    expect(await resumeVault('alice')).toEqual(updated);

    await lockVault('alice');
    expect(await resumeVault('alice')).toBeNull();
    expect(hasVault('alice')).toBe(true);
    expect(await unlockVault('alice', 'hunter22hunter')).toEqual(updated);
  });

  it('reports a missing vault', async () => {
    expect(hasVault('bob')).toBe(false);
    await expect(unlockVault('bob', 'whatever-123')).rejects.toMatchObject({ code: 'NO_VAULT' });
  });
});
