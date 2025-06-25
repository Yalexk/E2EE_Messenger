import React from 'react';
import { useChatStore } from '../store/useChatStore';
import Sidebar from '../components/Sidebar';
import ChatContainer from '../components/ChatContainer';
import NoChat from '../components/NoChat';

const HomePage = () => {
  const { selectedUser } = useChatStore();

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <div>
        {!selectedUser ? <NoChat /> : <ChatContainer />}
      </div>
    </div>
  );
};

export default HomePage;
