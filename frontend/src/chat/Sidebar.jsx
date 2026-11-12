import { useMemo, useState } from 'react';
import { Bot, LogOut, Search } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { cx } from '../lib/format.js';

export function Avatar({ user, size = 'md' }) {
  const s = size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm';
  if (user.isBot) {
    return (
      <span className={cx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-alice to-bob text-ink-900', s)}>
        <Bot className="size-1/2" />
      </span>
    );
  }
  const hue = [...user.username].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full font-semibold text-ink-900', s)} style={{ background: `oklch(0.78 0.12 ${hue})` }}>
      {user.username.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Sidebar({ className }) {
  const { authUser, logout, onlineUserIds } = useAuthStore();
  const { users, usersLoading, selectedUser, selectUser, unread } = useChatStore();
  const [query, setQuery] = useState('');
  const online = useMemo(() => new Set(onlineUserIds.map(String)), [onlineUserIds]);
  const filtered = users.filter((u) => u.username.toLowerCase().includes(query.toLowerCase()));

  return (
    <aside className={cx('flex min-h-0 flex-col border-r border-ink-700 bg-ink-900/60', className)}>
      <div className="flex items-center gap-3 border-b border-ink-700 p-4">
        <Avatar user={authUser} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{authUser.username}</p>
          <p className="text-xs text-ink-400">keys unlocked on this device</p>
        </div>
        <button onClick={logout} className="ml-auto rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Log out" title="Log out (locks your keys)">
          <LogOut className="size-4" />
        </button>
      </div>
      <div className="p-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 text-sm focus-within:border-ink-500">
          <Search className="size-4 text-ink-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" className="min-w-0 flex-1 bg-transparent focus:outline-none" aria-label="Search people" />
        </label>
      </div>
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        {usersLoading && users.length === 0 && <li className="p-3 text-sm text-ink-400">Loading…</li>}
        {filtered.map((u) => {
          const active = selectedUser?._id === u._id;
          const isOnline = u.isBot || online.has(String(u._id));
          const count = unread[u._id] ?? 0;
          return (
            <li key={u._id}>
              <button
                onClick={() => selectUser(u)}
                className={cx('flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors', active ? 'bg-ink-700' : 'hover:bg-ink-800')}
              >
                <span className="relative">
                  <Avatar user={u} />
                  {isOnline && <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-ink-900 bg-bob" aria-label="online" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{u.username}</span>
                    {u.isBot && <span className="rounded bg-alice/15 px-1.5 text-[10px] font-semibold tracking-wide text-alice uppercase">bot</span>}
                  </span>
                  <span className="block truncate text-xs text-ink-400">{u.isBot ? 'Start here: a real X3DH client' : isOnline ? 'online' : 'offline · X3DH works anyway'}</span>
                </span>
                {count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-alice px-1.5 text-xs font-semibold text-ink-900">{count}</span>}
              </button>
            </li>
          );
        })}
        {!usersLoading && filtered.length === 0 && <li className="p-3 text-sm text-ink-400">No one found.</li>}
      </ul>
    </aside>
  );
}
