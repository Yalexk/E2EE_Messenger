import React from 'react';
import { useChatStore } from '../store/useChatStore.js';
import { X } from 'lucide-react';

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();

  return (
    <div className="p-2.5 border-b border-base-300 flex items-center justify-between">
      <span className="font-medium">{selectedUser?.username}</span>
      <button onClick={() => setSelectedUser(null)}>
        <X />
      </button>
    </div>
  );
};

export default ChatHeader;
