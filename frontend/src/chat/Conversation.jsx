import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/useChatStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Avatar } from './Sidebar.jsx';
import { Button } from '../components/ui.jsx';
import { cx, timeOf } from '../lib/format.js';

function EmptyState() {
  const { users, selectUser } = useChatStore();
  const bot = users.find((u) => u.isBot);
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-md">
        <h2 className="text-(length:--text-title) text-ink">Pick someone to talk to</h2>
        <p className="mt-3 text-ink-2">Opening a chat runs a real X3DH handshake. Nobody else around? x3dh-bot always answers.</p>
        {bot && (
          <Button variant="primary" className="mt-6" onClick={() => selectUser(bot)}>
            Say hi to x3dh-bot
          </Button>
        )}
      </div>
    </div>
  );
}

function Message({ m, mine, showCiphertext, peerName }) {
  const failed = m.decryptStatus !== 'ok';
  return (
    <li className={cx('type-in max-w-[85%] border px-3.5 py-2 text-sm sm:max-w-[70%]', mine ? 'self-end border-rule-2 bg-accent-wash' : 'self-start border-rule bg-paper-2')}>
      <p className="mb-1 text-xs text-muted">{mine ? 'you' : peerName} <span className="ml-2">{timeOf(m.createdAt)}</span></p>
      {showCiphertext ? (
        <p className="text-[11px] leading-relaxed break-all text-ink-2">
          <span className="text-muted">nonce </span>{m.nonce}
          <br />
          <span className="text-muted">data </span>{m.messageText}
        </p>
      ) : failed ? (
        <p className="text-ink-2">
          {m.decryptStatus === 'no-key' ? 'Locked with a key this browser doesn’t have.' : 'Can’t read this: it was changed or the key is wrong.'}
        </p>
      ) : (
        <p className="whitespace-pre-wrap break-words text-ink">{m.plaintext}</p>
      )}
    </li>
  );
}

export function Conversation({ className }) {
  const me = useAuthStore((s) => s.authUser);
  const {
    selectedUser, selectUser, messages, messagesLoading, session, sessionStatus, sessionError,
    sendMessage, sending, showCiphertext, toggleCiphertext, inspectorOpen, setInspectorOpen, openSession,
  } = useChatStore();
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, showCiphertext]);

  useEffect(() => {
    if (sessionStatus === 'ready') inputRef.current?.focus();
  }, [sessionStatus, selectedUser?._id]);

  if (!selectedUser) return <section className={className}><EmptyState /></section>;

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    const ok = await sendMessage(value);
    if (!ok) setText(value);
  };

  const dhCount = session?.trace?.steps?.length;
  const toggleClass = (on) => cx('stepped px-2.5 py-1.5 text-xs active:bg-accent-wash', on ? 'bg-accent-wash text-ink' : 'text-ink-2 hover:bg-paper-3 hover:text-ink');

  return (
    <section className={cx('flex min-h-0 flex-col', className)} aria-label={`Conversation with ${selectedUser.username}`}>
      <header className="flex items-center gap-3 border-b border-rule px-3 py-3 sm:px-4">
        <button onClick={() => selectUser(null)} className="stepped px-2 py-1 text-xs text-ink-2 hover:bg-paper-3 md:hidden" aria-label="Back to conversations">
          back
        </button>
        <Avatar user={selectedUser} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{selectedUser.username}</p>
          <p className="text-xs text-muted">
            {sessionStatus === 'handshaking' && 'running X3DH…'}
            {sessionStatus === 'ready' && <span className="text-accent">encrypted with a {dhCount}-step X3DH key</span>}
            {sessionStatus === 'error' && 'handshake failed'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={toggleCiphertext} className={toggleClass(showCiphertext)} aria-pressed={showCiphertext} title="Show messages the way the server stores them">
            server view
          </button>
          <button onClick={() => setInspectorOpen(!inspectorOpen)} className={toggleClass(inspectorOpen)} aria-pressed={inspectorOpen} title="See how this chat’s key was made">
            inspect
          </button>
        </div>
      </header>

      {showCiphertext && (
        <p className="border-b border-rule bg-paper-2 px-4 py-2 text-xs text-ink-2">
          This is all the server has: scrambled bytes, plus who sent them and when.
        </p>
      )}

      <ol className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-6">
        {sessionStatus === 'error' && (
          <li className="mx-auto max-w-md border border-ink bg-paper-3 p-4 text-sm">
            <p className="text-ink">error: the handshake didn’t finish</p>
            <p className="mt-1 text-ink-2">{sessionError}</p>
            <Button size="sm" className="mt-3" onClick={() => openSession(selectedUser)}>Try again</Button>
          </li>
        )}
        {messagesLoading && messages.length === 0 && <li className="text-center text-sm text-muted">decrypting…</li>}
        {!messagesLoading && sessionStatus === 'ready' && messages.length === 0 && (
          <li className="mx-auto max-w-sm text-center text-sm text-muted">
            {selectedUser.isBot ? 'Keys agreed. x3dh-bot will say hi in a second.' : `Keys agreed. Say hello. ${selectedUser.username} can read it later, even if they’re offline now.`}
          </li>
        )}
        {messages.map((m) => (
          <Message key={m._id} m={m} mine={String(m.senderId) === String(me._id)} showCiphertext={showCiphertext} peerName={selectedUser.username} />
        ))}
        <li ref={endRef} aria-hidden />
      </ol>

      <form onSubmit={submit} className="flex gap-2 border-t border-rule p-3 sm:p-4">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sessionStatus !== 'ready'}
          maxLength={2000}
          placeholder={sessionStatus === 'ready' ? (selectedUser.isBot ? 'try /help' : 'type a message') : 'waiting for the handshake…'}
          aria-label="Message"
          className="stepped h-11 min-w-0 flex-1 border border-rule-2 bg-paper px-3 text-sm hover:border-ink-2 focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <Button type="submit" variant="primary" disabled={sessionStatus !== 'ready' || !text.trim()} loading={sending}>
          send
        </Button>
      </form>
    </section>
  );
}
