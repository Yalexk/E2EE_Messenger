import { useMemo, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { cx } from '../lib/format.js';

export function Avatar({ user, size = 'md' }) {
  const s = size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm';
  return (
    <span className={cx('grid shrink-0 place-items-center border font-semibold', s, user.isBot ? 'border-accent bg-accent text-accent-ink' : 'border-rule-2 text-ink-2')}>
      {user.isBot ? 'bot' : user.username.slice(0, 2).toLowerCase()}
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
    <aside className={cx('flex min-h-0 flex-col border-r border-rule', className)}>
      <div className="flex items-center gap-3 border-b border-rule p-4">
        <Avatar user={authUser} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{authUser.username}</p>
          <p className="text-xs text-muted">keys open</p>
        </div>
        <button onClick={logout} className="stepped ml-auto shrink-0 px-2 py-1 text-xs whitespace-nowrap text-ink-2 hover:bg-paper-3 hover:text-ink active:bg-accent-wash" title="Log out and lock your keys">
          log out
        </button>
      </div>
      <div className="p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search people"
          aria-label="Search people"
          className="stepped h-9 w-full border border-rule-2 bg-paper px-2.5 text-sm hover:border-ink-2 focus:border-accent focus:outline-none"
        />
      </div>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto" aria-label="Conversations">
        {usersLoading && users.length === 0 && <li className="p-4 text-sm text-muted">loading…</li>}
        {filtered.map((u) => {
          const active = selectedUser?._id === u._id;
          const isOnline = u.isBot || online.has(String(u._id));
          const count = unread[u._id] ?? 0;
          return (
            <li key={u._id} className="border-b border-rule">
              <button
                onClick={() => selectUser(u)}
                className={cx('stepped flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent-wash', active ? 'bg-accent-wash' : 'hover:bg-paper-3')}
              >
                <Avatar user={u} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{u.username}</span>
                  <span className={cx('block truncate text-xs', isOnline ? 'text-accent' : 'text-muted')}>
                    {u.isBot ? 'start here: always answers' : isOnline ? 'online' : 'offline'}
                  </span>
                </span>
                {count > 0 && <span className="bg-accent px-1.5 text-xs font-semibold text-accent-ink">{count}</span>}
              </button>
            </li>
          );
        })}
        {!usersLoading && filtered.length === 0 && <li className="p-4 text-sm text-muted">nobody found</li>}
      </ul>
    </aside>
  );
}
