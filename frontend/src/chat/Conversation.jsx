import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bot, Eye, EyeOff, KeyRound, Loader2, Lock, Microscope, RefreshCw, Send } from 'lucide-react';
import { useChatStore } from '../store/useChatStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { Avatar } from './Sidebar.jsx';
import { Button } from '../components/ui.jsx';
import { cx, timeOf } from '../lib/format.js';

function EmptyState() {
  const { users, selectUser } = useChatStore();
  const bot = users.find((u) => u.isBot);
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink-800 text-alice">
          <KeyRound className="size-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">Pick someone to talk to</h2>
        <p className="mt-2 text-ink-300">
          Opening a chat runs a real X3DH handshake. Nobody else around? <strong>x3dh-bot</strong> is a real client that completes the
          handshake, decrypts what you send and answers encrypted.
        </p>
        {bot && (
          <Button variant="primary" className="mt-6" onClick={() => selectUser(bot)}>
            <Bot className="size-4" /> Say hi to x3dh-bot
          </Button>
        )}
      </div>
    </div>
  );
}

function Bubble({ m, mine, showCiphertext }) {
  const failed = m.decryptStatus !== 'ok';
  return (
    <div className={cx('flex animate-fade-in', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]',
          mine ? 'rounded-br-md bg-alice/90 text-ink-900' : 'rounded-bl-md border border-ink-600 bg-ink-800',
          showCiphertext && 'border border-dashed border-ink-500 bg-ink-900 text-ink-300',
        )}
      >
        {showCiphertext ? (
          <p className="font-mono text-[11px] leading-relaxed break-all">
            <span className="text-ink-500">nonce </span>{m.nonce}
            <br />
            <span className="text-ink-500">ct </span>{m.messageText}
          </p>
        ) : failed ? (
          <p className="flex items-start gap-1.5 text-ink-300 italic">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            {m.decryptStatus === 'no-key'
              ? 'Encrypted with a session key this browser doesn\'t have.'
              : 'Could not decrypt: the auth tag did not verify.'}
          </p>
        ) : (
          <p className="whitespace-pre-wrap break-words">{m.plaintext}</p>
        )}
        <p className={cx('mt-0.5 text-right text-[10px]', mine && !showCiphertext ? 'text-ink-900/60' : 'text-ink-500')}>{timeOf(m.createdAt)}</p>
      </div>
    </div>
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
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  return (
    <section className={cx('flex min-h-0 flex-col', className)} aria-label={`Conversation with ${selectedUser.username}`}>
      <header className="flex items-center gap-3 border-b border-ink-700 px-3 py-3 sm:px-4">
        <button onClick={() => selectUser(null)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="size-4" />
        </button>
        <Avatar user={selectedUser} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium">{selectedUser.username}</p>
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            {sessionStatus === 'handshaking' && <><Loader2 className="size-3 animate-spin" /> running X3DH…</>}
            {sessionStatus === 'ready' && <><Lock className="size-3 text-bob" /> end-to-end encrypted · {dhCount}-DH X3DH session</>}
            {sessionStatus === 'error' && <><AlertTriangle className="size-3 text-eve" /> handshake failed</>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={toggleCiphertext}
            className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors', showCiphertext ? 'bg-ik/15 text-ik' : 'text-ink-300 hover:bg-ink-800')}
            aria-pressed={showCiphertext}
            title="Show messages exactly as the server stores them"
          >
            {showCiphertext ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            <span className="hidden sm:inline">Server's view</span>
          </button>
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors', inspectorOpen ? 'bg-alice/15 text-alice' : 'text-ink-300 hover:bg-ink-800')}
            aria-pressed={inspectorOpen}
            title="How this conversation's key was agreed"
          >
            <Microscope className="size-4" />
            <span className="hidden sm:inline">Inspector</span>
          </button>
        </div>
      </header>

      {showCiphertext && (
        <p className="border-b border-ik/20 bg-ik/5 px-4 py-2 text-xs text-ik">
          This is everything the server has: random-looking bytes, plus who sent them, to whom and when. It holds no key that can decrypt them.
        </p>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
        {sessionStatus === 'error' && (
          <div className="mx-auto max-w-md rounded-xl border border-eve/40 bg-eve/10 p-4 text-sm">
            <p className="font-medium text-eve">The handshake didn't complete</p>
            <p className="mt-1 text-ink-300">{sessionError}</p>
            <Button size="sm" className="mt-3" onClick={() => openSession(selectedUser)}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </div>
        )}
        {messagesLoading && messages.length === 0 && <p className="text-center text-sm text-ink-500">Decrypting history…</p>}
        {!messagesLoading && sessionStatus === 'ready' && messages.length === 0 && (
          <p className="mx-auto max-w-sm text-center text-sm text-ink-400">
            Session established. {selectedUser.isBot ? 'x3dh-bot will say hi in a moment…' : `Say hello. ${selectedUser.username} can read it even if they're offline right now.`}
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m._id} m={m} mine={String(m.senderId) === String(me._id)} showCiphertext={showCiphertext} />
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-ink-700 p-3 sm:p-4">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sessionStatus !== 'ready'}
          maxLength={2000}
          placeholder={sessionStatus === 'ready' ? (selectedUser.isBot ? 'Try /help, /session, /server…' : 'Write an encrypted message…') : 'Waiting for the handshake…'}
          aria-label="Message"
          className="h-11 min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3.5 text-sm focus:border-alice focus:outline-none disabled:opacity-50"
        />
        <Button type="submit" variant="primary" disabled={sessionStatus !== 'ready' || !text.trim()} loading={sending} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </section>
  );
}
