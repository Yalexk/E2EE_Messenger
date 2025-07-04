import React, { useEffect } from 'react';
import { useChatStore } from '../store/useChatStore.js';

const Sidebar = () => {
  const {
    getUsers,
    users,
    selectedUser,
    setSelectedUser,
    isUsersLoading,
    fetchRecipientKeys,
    loadKeysFromStorage,
    createSharedSecret,
    sendInitialMessage,
  } = useChatStore();

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  const handleUserClick = async (user) => {
    setSelectedUser(user);
  
    await loadKeysFromStorage();

    await fetchRecipientKeys(user._id);

    await createSharedSecret();

    await sendInitialMessage();
    
  }

  if (isUsersLoading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <aside className="bg-base-200 text-base-content min-h-full w-80 p-4">
      <div className="overflow-y-auto w-full py-3">
        {users.map((user) => (
          <button
            key={user._id}
            onClick={() => handleUserClick(user)}
            className={`
              w-full p-3 flex items-center gap-3
              hover:bg-base-300 transition-colors
              ${selectedUser?._id === user._id ? "bg-base-300 ring-1 ring-base-300" : ""}
            `}
          >
            <span className="text-lg">{user.username}</span>
          </button>
        ))}
        {users.length === 0 && (
          <div className="text-center text-zinc-500 py-4">No users found</div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
