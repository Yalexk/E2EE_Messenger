import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { safetyNumber, PROTOCOL_INFO } from '@e2ee/x3dh';
import { useAuthStore } from '../store/useAuthStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { KeyChip, KeyName } from '../components/KeyChip.jsx';
import { SectionLabel } from '../components/ui.jsx';
import { hex, cx } from '../lib/format.js';

/** Shows how the current conversation's key was agreed. */
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
  const me = t?.role === 'initiator' ? 'A' : 'B';

  return (
    <aside className={cx('scrollbar-thin flex min-h-0 flex-col overflow-y-auto border-l border-ink-700 bg-ink-900/95', className)} aria-label="Protocol inspector">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-700 bg-ink-900/95 p-4 backdrop-blur">
        <h2 className="font-semibold">Protocol inspector</h2>
        <button onClick={() => setInspectorOpen(false)} className="ml-auto rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Close inspector">
          <X className="size-4" />
        </button>
      </div>

      {!selectedUser ? (
        <p className="p-4 text-sm text-ink-400">Pick a conversation to see its handshake.</p>
      ) : sessionStatus !== 'ready' || !t ? (
        <p className="p-4 text-sm text-ink-400">{sessionStatus === 'handshaking' ? 'Running X3DH…' : 'No session yet.'}</p>
      ) : (
        <div className="space-y-6 p-4 text-sm">
          <div>
            <SectionLabel>Your role</SectionLabel>
            <p className="mt-1.5 text-ink-200">
              {t.role === 'initiator'
                ? `You started this session: you fetched ${selectedUser.username}'s bundle and ran X3DH as "Alice".`
                : `${selectedUser.username} started this session; you ran the responder ("Bob") side when you opened the chat.`}
            </p>
            <p className="mt-1 text-xs text-ink-400">Session started {new Date(session.createdAt).toLocaleString()}</p>
          </div>

          {t.bundle && (
            <div className="space-y-1.5">
              <SectionLabel>Bundle you fetched</SectionLabel>
              <KeyChip kind="IK" owner="B" value={t.bundle.identityKey} />
              <KeyChip kind="SPK" owner="B" value={t.bundle.signedPreKey} />
              <p className="flex items-center gap-1.5 text-xs text-bob">
                <CheckCircle2 className="size-3.5" /> SPK signature verified with IK_B (Ed25519)
              </p>
              {t.bundle.oneTimePreKey ? (
                <KeyChip kind="OPK" owner="B" value={t.bundle.oneTimePreKey.publicKey} />
              ) : (
                <p className="text-xs text-ik">No one-time prekey was available: 3-DH handshake.</p>
              )}
              {t.bundle.remainingOneTimePreKeys != null && (
                <p className="text-xs text-ink-400">{t.bundle.remainingOneTimePreKeys} one-time prekeys left on the server after this fetch.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <SectionLabel>Ephemeral key</SectionLabel>
            <KeyChip kind="EK" owner="A" value={t.ephemeralPublicKey} />
            <p className="text-xs text-ink-400">{t.role === 'initiator' ? 'Its private half was deleted right after the handshake.' : 'Sent by the initiator in the initial message.'}</p>
          </div>

          <div className="space-y-2">
            <SectionLabel>Diffie-Hellman outputs ({t.steps.length})</SectionLabel>
            {t.steps.map((s) => {
              const [mk, mo] = s.mine.split('_');
              const [tk, to] = s.theirs.split('_');
              return (
                <div key={s.label} className="rounded-lg border border-ink-700 bg-ink-850 p-2.5">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-semibold">{s.label}</span>
                    <span className="text-ink-500">=</span>
                    <span className="text-ink-400">DH(</span>
                    <KeyName kind={mk} owner={mo} />
                    <span className="text-ink-400">,</span>
                    <KeyName kind={tk} owner={to} />
                    <span className="text-ink-400">)</span>
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-ink-300" title={hex(s.out)}>{hex(s.out, { short: true, head: 16, tail: 8 })}</p>
                  <p className="mt-1 text-xs text-ink-400">{s.purpose}</p>
                </div>
              );
            })}
            <p className="text-xs text-ink-400">
              On this screen you are {me === 'A' ? 'A (Alice)' : 'B (Bob)'}, and {selectedUser.username} is {me === 'A' ? 'B (Bob)' : 'A (Alice)'}.
            </p>
          </div>

          <div className="space-y-1.5">
            <SectionLabel>Shared secret</SectionLabel>
            <KeyChip kind="SK" value={session.sharedKey} secret />
            <p className="font-mono text-xs text-ink-400">HKDF-SHA256 · {t.ikmBytes} B in · info "{PROTOCOL_INFO}"</p>
            <p className="text-xs text-ink-400">Messages: AES-256-GCM with AD = IK_A ‖ IK_B, fresh 96-bit nonce each.</p>
          </div>

          <div className="space-y-2">
            <SectionLabel>Safety number</SectionLabel>
            {sn ? (
              <div className="grid grid-cols-4 gap-x-3 gap-y-1 rounded-xl border border-ink-700 bg-ink-850 p-3 font-mono text-sm tracking-wider">
                {sn.split(' ').map((g, i) => <span key={i}>{g}</span>)}
              </div>
            ) : (
              <p className="text-ink-400">computing…</p>
            )}
            <p className="text-xs text-ink-400">
              Derived from both identity keys. If {selectedUser.username} sees the same digits on their screen, the server didn't
              swap anyone's identity key. X3DH alone can't detect that: the bundle comes from the server.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
