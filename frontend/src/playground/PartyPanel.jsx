import { useEffect, useRef, useState } from 'react';
import { KeyChip } from '../components/KeyChip.jsx';
import { Label } from '../components/ui.jsx';
import { cx } from '../lib/format.js';

const PARTY = {
  alice: { name: 'alice', owner: 'A', role: 'starts the chat' },
  bob: { name: 'bob', owner: 'B', role: 'replies later' },
};

export function PartyPanel({ party, state, stepId, onChat, busy }) {
  const p = PARTY[party];
  const me = state[party];
  const online = party === 'alice' ? true : me?.online ?? true;
  const sharedKey = party === 'alice'
    ? (['kdf', 'send', 'receive', 'chat'].includes(stepId) ? state.handshake?.sharedKey : null)
    : state.received?.sharedKey;

  return (
    <section className="flex flex-col gap-4 border border-rule p-4" aria-label={p.name}>
      <header className="flex items-baseline gap-3 border-b border-rule pb-3">
        <h2 className="text-lg text-ink">{p.name}</h2>
        <span className="text-sm text-muted">{p.role}</span>
        <span className={cx('ml-auto text-sm', online ? 'text-accent' : 'text-muted')}>{online ? 'online' : 'offline'}</span>
      </header>

      {!me ? (
        <p className="text-sm text-muted">No keys yet.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>private, never leaves {p.name}</Label>
            <KeyChip kind="IK" owner={p.owner} value={me.identity.secretKey} secret />
            {party === 'bob' && <KeyChip kind="SPK" owner="B" value={me.spk.secretKey} secret />}
            {party === 'bob' && (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {me.opks.map((k) => (
                  <KeyChip
                    key={k.id}
                    kind="OPK"
                    label={<span className="text-sm font-semibold text-ink-2">OPK<sub className="text-[0.7em]">B{k.label.slice(-1)}</sub></span>}
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
              <Label>shared key</Label>
              <KeyChip kind="SK" value={sharedKey} secret highlight={stepId === 'kdf' || stepId === 'receive'} />
              {party === 'bob' && state.received?.match && <p className="text-sm text-accent">same as alice’s</p>}
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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [state.chat.length]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await onChat(party, text.trim());
    setText('');
  };

  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <Label>{p.name}’s screen</Label>
      <ol ref={listRef} className="scroll-thin flex max-h-64 min-h-28 flex-col gap-1.5 overflow-y-auto text-sm">
        {state.chat.map((m) => {
          const mine = m.from === party;
          const failed = !mine && m.status === 'failed';
          return (
            <li key={m.id} className={cx('type-in', failed && 'bg-paper-3 px-2 py-1')}>
              <span className={mine ? 'text-muted' : 'text-accent'}>{m.from}&gt; </span>
              {mine ? (
                <span className="text-ink-2">{m.sent ?? m.plaintext}</span>
              ) : failed ? (
                <span className="text-ink">rejected: this message was changed on the way</span>
              ) : (
                <span className="text-ink">{m.plaintext}</span>
              )}
            </li>
          );
        })}
      </ol>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={`type as ${p.name}`}
          aria-label={`Message as ${p.name}`}
          className="stepped h-10 min-w-0 flex-1 border border-rule-2 bg-paper px-3 text-sm hover:border-ink-2 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="stepped h-10 bg-accent px-3 text-sm font-medium text-accent-ink hover:bg-glyph-6 active:bg-glyph-4 disabled:opacity-40"
        >
          send
        </button>
      </form>
    </div>
  );
}
