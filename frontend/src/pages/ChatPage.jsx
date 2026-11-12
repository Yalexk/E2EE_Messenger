import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { AuthPanel, UnlockPanel, NoKeysPanel } from '../chat/AuthPanels.jsx';
import { Sidebar } from '../chat/Sidebar.jsx';
import { Conversation } from '../chat/Conversation.jsx';
import { Inspector } from '../chat/Inspector.jsx';
import { cx } from '../lib/format.js';

function ChatLayout() {
  const selectedUser = useChatStore((s) => s.selectedUser);
  const inspectorOpen = useChatStore((s) => s.inspectorOpen);
  const loadUsers = useChatStore((s) => s.loadUsers);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return (
    <div className="relative flex h-[calc(100dvh-3rem)] min-h-0">
      <Sidebar className={cx('w-full md:w-72 lg:w-80', selectedUser && 'hidden md:flex')} />
      <Conversation className={cx('min-w-0 flex-1', !selectedUser && 'hidden md:flex md:flex-col')} />
      {inspectorOpen && (
        <Inspector className="absolute inset-y-0 right-0 z-(--z-dropdown) w-full max-w-sm xl:static xl:z-auto xl:w-96" />
      )}
    </div>
  );
}

export default function ChatPage() {
  const status = useAuthStore((s) => s.status);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    document.title = 'Live chat · x3dh';
    if (useAuthStore.getState().status === 'checking') checkAuth();
  }, [checkAuth]);

  if (status === 'checking') {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted">
        <Loader2 className="size-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (status === 'anonymous') return <AuthPanel />;
  if (status === 'locked') return <UnlockPanel />;
  if (status === 'no-keys') return <NoKeysPanel />;
  return <ChatLayout />;
}
