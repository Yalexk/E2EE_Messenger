import { useState } from 'react';
import { Dice5, KeyRound, LockKeyhole, MonitorSmartphone } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { Button, Field } from '../components/ui.jsx';
import { cx } from '../lib/format.js';

const ADJ = ['quiet', 'brave', 'lucky', 'swift', 'mellow', 'cosmic', 'sunny', 'witty'];
const NOUN = ['otter', 'falcon', 'panda', 'koala', 'lynx', 'heron', 'yak', 'quokka'];
const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${NOUN[Math.floor(Math.random() * NOUN.length)]}${Math.floor(Math.random() * 90 + 10)}`;

function Shell({ icon, title, children, aside }) {
  const Icon = icon;
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem] lg:py-16">
      <div className="card p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-xl bg-ink-700 text-alice">
          <Icon className="size-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
      {aside && <aside className="space-y-4 text-sm leading-relaxed text-ink-300">{aside}</aside>}
    </div>
  );
}

export function AuthPanel() {
  const { signup, login, busy, error, clearError } = useAuthStore();
  const [mode, setMode] = useState('signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e) => {
    e.preventDefault();
    (mode === 'signup' ? signup : login)({ username: username.trim(), password });
  };

  const switchMode = (m) => {
    setMode(m);
    clearError();
  };

  return (
    <Shell
      icon={KeyRound}
      title={mode === 'signup' ? 'Create a demo account' : 'Welcome back'}
      aside={
        <>
          <h2 className="font-semibold text-ink-100">What happens when you sign up</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Your browser generates an identity key, a signed prekey and 100 one-time prekeys.</li>
            <li>Only the <strong className="text-ink-100">public</strong> halves go to the server.</li>
            <li>The private halves are encrypted with a key derived from your password (PBKDF2, 600k rounds) and stay in this browser.</li>
            <li>You'll find <strong className="text-ink-100">x3dh-bot</strong> waiting: say hi and watch a real handshake happen.</li>
          </ol>
          <p className="text-ink-400">This is a public demo: don't reuse a real password, and messages are deleted after 7 days.</p>
        </>
      }
    >
      <div className="mb-6 inline-flex rounded-xl bg-ink-900 p-1" role="tablist">
        {['signup', 'login'].map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cx('rounded-lg px-4 py-1.5 text-sm transition-colors', mode === m ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200')}
          >
            {m === 'signup' ? 'Sign up' : 'Log in'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="relative">
          <Field
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            pattern="[a-zA-Z0-9_.\-]{3,24}"
            placeholder="quiet-otter42"
          />
          {mode === 'signup' && (
            <button
              type="button"
              onClick={() => setUsername(randomName())}
              className="absolute top-0 right-0 inline-flex items-center gap-1 text-xs text-ink-400 hover:text-alice"
            >
              <Dice5 className="size-3.5" /> random
            </button>
          )}
        </div>
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={8}
          placeholder="at least 8 characters"
        />
        {error && <p className="text-sm text-eve" role="alert">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {busy ? (mode === 'signup' ? 'Generating keys…' : 'Unlocking keys…') : mode === 'signup' ? 'Generate keys & sign up' : 'Log in'}
        </Button>
      </form>
    </Shell>
  );
}

export function UnlockPanel() {
  const { authUser, unlock, logout, busy, error } = useAuthStore();
  const [password, setPassword] = useState('');
  return (
    <Shell icon={LockKeyhole} title={`Unlock your keys, ${authUser.username}`}>
      <p className="mb-5 text-ink-300">
        You're still logged in, but your private keys are locked. Enter your password to decrypt them in this browser.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          unlock(password);
        }}
        className="space-y-4"
      >
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
        {error && <p className="text-sm text-eve" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={busy}>Unlock</Button>
          <Button type="button" variant="ghost" onClick={logout}>Log out</Button>
        </div>
      </form>
    </Shell>
  );
}

export function NoKeysPanel() {
  const { authUser, logout } = useAuthStore();
  return (
    <Shell icon={MonitorSmartphone} title="Your keys aren't on this device">
      <div className="space-y-4 text-ink-300">
        <p>
          <strong className="text-ink-100">{authUser.username}</strong>'s private keys were generated in a different browser and,
          by design, never left it. The server only has the public halves, so it can't give them back to you.
        </p>
        <p>
          This is exactly the trade-off real E2EE messengers face: Signal solves it with device linking, which this demo doesn't
          implement. Open the browser you signed up in, or create a new account here.
        </p>
        <Button variant="primary" onClick={logout}>Log out</Button>
      </div>
    </Shell>
  );
}
