import { useEffect, useState } from 'react';
import { safetyNumber } from '@e2ee/x3dh';
import { useAuthStore } from '../store/useAuthStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { KeyChip, KeyName } from '../components/KeyChip.jsx';
import { Label } from '../components/ui.jsx';
import { hex, cx } from '../lib/format.js';

/** How this conversation's key was made. */
export function Inspector({ className }) {
  const { keys } = useAuthStore();
  const { session, sessionStatus, selectedUser, setInspectorOpen } = useChatStore();
  const [sn, setSn] = useState(null);

  useEffect(() => {
    let live = true;
    if (session?.peerIdentityKey) safetyNumber(keys.identity.publicKey, session.peerIdentityKey).then((v) => live && setSn(v));
    else setSn(null);
    return () => {
      live = false;
    };
  }, [session?.peerIdentityKey, keys.identity.publicKey]);

  const t = session?.trace;

  return (
    <aside className={cx('scroll-thin flex min-h-0 flex-col overflow-y-auto border-l border-rule bg-paper', className)} aria-label="Inspector">
      <div className="sticky top-0 z-(--z-raised) flex items-center gap-2 border-b border-rule bg-paper p-4">
        <h2 className="text-base text-ink">inspect</h2>
        <button onClick={() => setInspectorOpen(false)} className="stepped ml-auto px-2 py-1 text-xs text-ink-2 hover:bg-paper-3 hover:text-ink" aria-label="Close">
          close
        </button>
      </div>

      {!selectedUser ? (
        <p className="p-4 text-sm text-muted">Open a chat to see how its key was made.</p>
      ) : sessionStatus !== 'ready' || !t ? (
        <p className="p-4 text-sm text-muted">{sessionStatus === 'handshaking' ? 'running X3DH…' : 'No key yet.'}</p>
      ) : (
        <div className="space-y-7 p-4 text-sm">
          <div className="space-y-1">
            <Label>who started it</Label>
            <p className="text-ink-2">
              {t.role === 'initiator'
                ? `You did. You fetched ${selectedUser.username}’s keys and played Alice.`
                : `${selectedUser.username} did. You played Bob when you opened the chat.`}
            </p>
            <p className="text-xs text-muted">{new Date(session.createdAt).toLocaleString()}</p>
          </div>

          {t.bundle && (
            <div className="space-y-1.5">
              <Label>their public keys</Label>
              <KeyChip kind="IK" owner="B" value={t.bundle.identityKey} />
              <KeyChip kind="SPK" owner="B" value={t.bundle.signedPreKey} />
              <p className="text-xs text-accent">signature checked</p>
              {t.bundle.oneTimePreKey ? (
                <KeyChip kind="OPK" owner="B" value={t.bundle.oneTimePreKey.publicKey} />
              ) : (
                <p className="text-xs text-ink-2">No one-time prekey was left, so this used 3 steps.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>one-off key</Label>
            <KeyChip kind="EK" owner="A" value={t.ephemeralPublicKey} />
          </div>

          <div className="space-y-1">
            <Label>the {t.steps.length} DH steps</Label>
            <ol className="border-t border-rule">
              {t.steps.map((s) => {
                const [mk, mo] = s.mine.split('_');
                const [tk, to] = s.theirs.split('_');
                return (
                  <li key={s.label} className="border-b border-rule py-2">
                    <p>
                      <span className="mr-2 text-muted">{s.label}</span>
                      <KeyName kind={mk} owner={mo} /> <span className="text-muted">x</span> <KeyName kind={tk} owner={to} />
                    </p>
                    <p className="truncate text-xs text-ink-2" title={hex(s.out)}>{hex(s.out, { short: true, head: 16, tail: 8 })}</p>
                    <p className="text-xs text-muted">{s.purpose}</p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="space-y-1.5">
            <Label>shared key</Label>
            <KeyChip kind="SK" value={session.sharedKey} secret />
            <p className="text-xs text-muted">Made with HKDF. Messages use AES-256-GCM.</p>
          </div>

          <div className="space-y-2">
            <Label>safety number</Label>
            {sn ? (
              <p className="grid grid-cols-4 gap-x-3 gap-y-1 border border-rule bg-paper-2 p-3 text-ink">
                {sn.split(' ').map((g, i) => <span key={i}>{g}</span>)}
              </p>
            ) : (
              <p className="text-muted">working…</p>
            )}
            <p className="text-xs text-muted">If {selectedUser.username} sees the same digits, nobody swapped your keys.</p>
          </div>
        </div>
      )}
    </aside>
  );
}
