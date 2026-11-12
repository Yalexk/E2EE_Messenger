import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Send, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { KeyChip } from '../components/KeyChip.jsx';
import { SectionLabel } from '../components/ui.jsx';
import { cx } from '../lib/format.js';

const PARTY = {
  alice: { name: 'Alice', initial: 'A', owner: 'A', text: 'text-alice', bg: 'bg-alice', border: 'border-alice/30', role: 'Initiator' },
  bob: { name: 'Bob', initial: 'B', owner: 'B', text: 'text-bob', bg: 'bg-bob', border: 'border-bob/30', role: 'Responder' },
};

export function PartyPanel({ party, state, stepId, onChat, busy }) {
  const p = PARTY[party];
  const me = state[party];
  const online = party === 'alice' ? true : me?.online ?? true;
  const sharedKey = party === 'alice'
    ? (['kdf', 'send', 'receive', 'chat'].includes(stepId) ? state.handshake?.sharedKey : null)
    : state.received?.sharedKey;

  return (
    <section className={cx('card flex flex-col gap-4 p-4', p.border)} aria-label={p.name}>
      <header className="flex items-center gap-3">
        <span className={cx('grid size-10 place-items-center rounded-full text-lg font-bold text-ink-900', p.bg)}>{p.initial}</span>
        <div>
          <h2 className={cx('font-semibold', p.text)}>{p.name}</h2>
          <p className="text-xs text-ink-400">{p.role}</p>
        </div>
        <span className={cx('ml-auto inline-flex items-center gap-1.5 text-xs', online ? 'text-ink-300' : 'text-ink-500')}>
          {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {online ? 'online' : 'offline'}
        </span>
      </header>

      {!me ? (
        <p className="text-sm text-ink-400">No keys yet.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <SectionLabel>Private, never leaves {p.name}</SectionLabel>
            <KeyChip kind="IK" owner={p.owner} value={me.identity.secretKey} secret />
            {party === 'bob' && <KeyChip kind="SPK" owner="B" value={me.spk.secretKey} secret />}
            {party === 'bob' && (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {me.opks.map((k) => (
                  <KeyChip
                    key={k.id}
                    kind="OPK"
                    label={<span className="font-mono text-sm font-semibold text-opk">OPK<sub className="text-[0.7em]">B{k.label.slice(-1)}</sub></span>}
                    value={k.secretKey}
                    secret
                    deleted={k.deleted}
                    highlight={stepId === 'receive' && k.deleted}
                  />
                ))}
              </div>
            )}
            {party === 'alice' && me.ephemeral && (
              <KeyChip kind="EK" owner="A" value={me.ephemeral.secretKey} secret deleted={me.ephemeralDeleted} highlight={stepId === 'ephemeral'} />
            )}
          </div>

          {sharedKey && (
            <div className="space-y-1.5">
              <SectionLabel>Derived</SectionLabel>
              <KeyChip kind="SK" value={sharedKey} secret highlight={stepId === 'kdf' || stepId === 'receive'} />
              {party === 'bob' && state.received?.match && (
                <p className="flex items-center gap-1.5 text-xs text-bob">
                  <CheckCircle2 className="size-3.5" /> identical to Alice's SK
                </p>
              )}
            </div>
          )}

          {stepId === 'chat' && <ChatBox party={party} state={state} onChat={onChat} busy={busy} />}
        </>
      )}
    </section>
  );
}

function ChatBox({ party, state, onChat, busy }) {
  const p = PARTY[party];
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.chat.length]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await onChat(party, text.trim());
    setText('');
  };

  return (
    <div className="flex flex-col gap-2 border-t border-ink-700 pt-4">
      <SectionLabel>{p.name}'s screen</SectionLabel>
      <div ref={listRef} className="scrollbar-thin flex max-h-64 min-h-28 flex-col gap-2 overflow-y-auto pr-1">
        {state.chat.map((m) => {
          const mine = m.from === party;
          const failed = m.status === 'failed';
          return (
            <div key={m.id} className={cx('max-w-[85%] animate-fade-in rounded-2xl px-3 py-2 text-sm', mine ? 'self-end bg-ink-700' : 'self-start border border-ink-600')}>
              {mine ? (
                m.sent ?? m.plaintext
              ) : failed ? (
                <span className="flex items-center gap-1.5 text-eve">
                  <ShieldAlert className="size-4 shrink-0" /> Rejected: the auth tag didn't verify, so the message was modified.
                </span>
              ) : (
                m.plaintext
              )}
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={`Message as ${p.name}…`}
          aria-label={`Message as ${p.name}`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3 text-sm focus:border-alice focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className={cx('grid size-10 place-items-center rounded-xl text-ink-900 disabled:opacity-40', p.bg)}
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
