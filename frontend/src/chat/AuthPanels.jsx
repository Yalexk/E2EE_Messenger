import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { Button, Field, Label } from '../components/ui.jsx';
import { cx } from '../lib/format.js';

const ADJ = ['quiet', 'brave', 'lucky', 'swift', 'mellow', 'cosmic', 'sunny', 'witty'];
const NOUN = ['otter', 'falcon', 'panda', 'koala', 'lynx', 'heron', 'yak', 'quokka'];
const randomName = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${NOUN[Math.floor(Math.random() * NOUN.length)]}${Math.floor(Math.random() * 90 + 10)}`;

function Shell({ title, children, aside }) {
  return (
    <div className="wrap grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-20">
      <div className="max-w-xl border border-rule p-6 sm:p-8">
        <h1 className="text-(length:--text-title) text-ink">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
      {aside && <aside className="space-y-4 text-sm text-ink-2">{aside}</aside>}
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
      title={mode === 'signup' ? 'Make a demo account' : 'Log in'}
      aside={
        <>
          <Label>what happens when you sign up</Label>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Your browser makes your keys.</li>
            <li>Only the public halves go to the server.</li>
            <li>The private halves are locked with your password and stay in this browser.</li>
            <li>x3dh-bot is waiting. Say hi.</li>
          </ol>
          <p className="text-muted">Public demo: don’t reuse a real password. Messages are deleted after 7 days.</p>
        </>
      }
    >
      <div className="mb-6 flex border border-rule" role="tablist">
        {['signup', 'login'].map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cx('stepped flex-1 px-4 py-2 text-sm', mode === m ? 'bg-accent-wash text-ink' : 'text-muted hover:bg-paper-3 hover:text-ink')}
          >
            {m === 'signup' ? 'sign up' : 'log in'}
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
              className="stepped absolute top-0 right-0 text-xs text-ink-2 underline decoration-dotted hover:text-accent"
            >
              pick one for me
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
          placeholder="8 characters or more"
        />
        {error && <p className="text-sm text-ink" role="alert">error: {error}</p>}
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {busy ? (mode === 'signup' ? 'Making keys…' : 'Opening keys…') : mode === 'signup' ? 'Sign up' : 'Log in'}
        </Button>
      </form>
    </Shell>
  );
}

export function UnlockPanel() {
  const { authUser, unlock, logout, busy, error } = useAuthStore();
  const [password, setPassword] = useState('');
  return (
    <Shell title="Your keys are locked">
      <p className="mb-5 text-ink-2">You’re still logged in as {authUser.username}. Enter your password to open your keys in this browser.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          unlock(password);
        }}
        className="space-y-4"
      >
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
        {error && <p className="text-sm text-ink" role="alert">error: {error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={busy}>Open keys</Button>
          <Button type="button" variant="ghost" onClick={logout}>Log out</Button>
        </div>
      </form>
    </Shell>
  );
}

export function NoKeysPanel() {
  const { authUser, logout } = useAuthStore();
  return (
    <Shell title="Your keys are in another browser">
      <div className="space-y-4 text-ink-2">
        <p>
          {authUser.username}’s keys were made in the browser you signed up in, and they never leave it. The server only has
          the public halves.
        </p>
        <p>Use that browser, or make a new account here.</p>
        <Button variant="primary" onClick={logout}>Log out</Button>
      </div>
    </Shell>
  );
}
