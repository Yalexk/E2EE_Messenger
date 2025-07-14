import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';    
import { useAuthStore } from './useAuthStore.js';
import { useSessionStore } from './useSessionStore.js';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    isUsersLoading: false,
    isMessagesLoading: false,
    selectedUser: null,
    
    getUsers: async () => {
        set({ isUsersLoading: true });
        try {
            const res = await axiosInstance.get('/messages/user');
            set({ users: res.data });
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            set({ isUsersLoading: false });
        }
    },

    getMessages: async (userId) => {
        set({ isMessagesLoading: true});
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
                        
            const encryptedMessages = res.data;
            const decryptedMessages = await Promise.all(
            encryptedMessages.map(async (message) => {
                try {
                    const sharedSecret = useSessionStore.getState().sharedSecret;
                    if (sharedSecret && message.messageText && message.nonce) {
                        const encryptedMessage = naclUtil.decodeBase64(message.messageText);
                        const nonce = naclUtil.decodeBase64(message.nonce);
                        const key = naclUtil.decodeBase64(sharedSecret);
                        
                        const decrypted = nacl.secretbox.open(encryptedMessage, nonce, key);
                        
                        if (decrypted) {
                            return {
                                ...message,
                                messageText: naclUtil.encodeUTF8(decrypted)
                            };
                        }
                    }
                    return {
                        ...message,
                        messageText: "[Failed to decrypt]"
                    };
                } catch (error) {
                    console.error("Error decrypting message:", error);
                    return {
                        ...message,
                        messageText: "[Decryption error]"
                    };
                }
            })
        );
        
        set({ messages: decryptedMessages });
    } catch (error) {
            console.error("Error fetching messages:", error);
        } finally {
            set({ isMessagesLoading: false });
        }
    }, 

    sendMessage: async (messageData) => {
        const { selectedUser, messages } = get();
        try {
            const sharedSecret = useSessionStore.getState().sharedSecret;
            const messageUint8 = naclUtil.decodeUTF8(messageData.messageText);
            const keyUint8 = naclUtil.decodeBase64(sharedSecret);
            const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
            const encrypted = nacl.secretbox(messageUint8, nonce, keyUint8);
            const sessionId = useSessionStore.getState().sessionId;
            
            const payload = {
                messageText: naclUtil.encodeBase64(encrypted),
                nonce: naclUtil.encodeBase64(nonce),
                sessionId,
            }

            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, payload);
            
            const messageForDisplay = {
                ...res.data,
                messageText: messageData.messageText
            };

            set({messages:[...messages, messageForDisplay]});
        } catch (error) {
            console.error("Error sending message:", error);
        }
    },

    listenToMessages: () => {
        const {selectedUser} =  get();
        if (!selectedUser) return;

        const socket = useAuthStore.getState().socket;
        const authUser = useAuthStore.getState().authUser;

        
        socket.off("newMessage");

        socket.on("newMessage", (newMessage) => {            
            const isPartOfConversation = 
            (newMessage.senderId === selectedUser._id && newMessage.receiverId === authUser._id) || 
            (newMessage.senderId === authUser._id && newMessage.receiverId === selectedUser._id);

            if (!isPartOfConversation) return;

            console.log("New message received:", newMessage);

            // Decrypt the message
        try {
            const sharedSecret = useSessionStore.getState().sharedSecret;

            const encryptedMessage = naclUtil.decodeBase64(newMessage.messageText);
            const nonce = naclUtil.decodeBase64(newMessage.nonce);
            const key = naclUtil.decodeBase64(sharedSecret);
            
            const decrypted = nacl.secretbox.open(encryptedMessage, nonce, key);
            
            if (decrypted) {
                newMessage.messageText = naclUtil.encodeUTF8(decrypted);
                console.log("Message decrypted:", newMessage.messageText);
            } else {
                console.error("Failed to decrypt message");
                newMessage.messageText = "[Failed to decrypt]";
            }

        } catch (error) {
            console.error("Error decrypting message:", error);
            newMessage.messageText = "[Decryption error]";
        }
           
            set((state) => ({
                messages: [...state.messages, newMessage]
            }));
        });
        
    },

    deafenMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newMessage");
    },

}));