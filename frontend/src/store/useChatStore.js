import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';    
import { useAuthStore } from './useAuthStore.js';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    isUsersLoading: false,
    isMessagesLoading: false,
    
    // Recipient key bundle containing public keys of the recipient
    // This will be fetched from the server when a user is selected
    recipientKeyBundle: null,
   
    // 
    sessionEstablished: false,

    // Private keys
    identityKeySecret: null,
    oneTimePreKeysSecret: [],
    signedPreKeySecret: null,
    
    sharedSecret: null,

    // to be set after creating shared secret
    ephemeralKeyPublic: null,
    otkKeyId: null,
    // also need to send the public identity key of the sender to verify


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
            set({ messages: res.data });
        } catch (error) {
            console.error("Error fetching messages:", error);
        } finally {
            set({ isMessagesLoading: false });
        }
    }, 

    sendMessage: async (messageData) => {
        const { selectedUser, messages } = get();
        try {
            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
            set({messages:[...messages, res.data]});
        } catch (error) {
            console.error("Error sending message:", error);
        }
    },

    listenToMessages: () => {
        const {selectedUser} =  get();
        if (!selectedUser) return;

        const socket = useAuthStore.getState().socket;
        
        socket.off("newMessage");

        socket.on("newMessage", (newMessage) => {            
            const sentByYou = newMessage.senderId === selectedUser._id;
            if (!sentByYou) return;

            console.log("New message received:", newMessage);
           
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