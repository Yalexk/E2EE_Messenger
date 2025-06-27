import React, { useState } from 'react';
import { useChatStore } from '../store/useChatStore.js';

const MessageInput = () => {
  const [text, setText] = useState("");
  const { sendMessage } = useChatStore();

  const handleSend = async (e) => {
    e.preventDefault();
    if (text.trim() === "") return;
    await sendMessage({ text });
    setText("");
  };

  return (
    <form className="flex gap-2 p-2 border-t border-base-300" onSubmit={handleSend}>
      <input
        className="input input-bordered flex-1"
        type="text"
        placeholder="Type a message..."
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <button className="btn btn-primary" type="submit">
        Send
      </button>
    </form>
  );
};

export default MessageInput;
