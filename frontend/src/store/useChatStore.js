import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';    
import { useAuthStore } from './useAuthStore.js';
import { verify } from 'tweetnacl';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export const useChatStore = create((set, get) => ({
    messages: [],
    users: [],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    recipientKeyBundle: null,

    // Private keys
    identityKey: null,
    edIdentityKey: null,
    signedPreKey: null,
    oneTimePreKeys: [],
    
    // to be set after creating shared secret
    ephemeralKeyPublic: null,
    sharedSecret: null,
    otkKeyId: null,
    // also need to send the public key of the 


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

        socket.on("newMessage", (newMessage) => {
            const sentByYou = newMessage.senderId === selectedUser._id;
            if (!sentByYou) return;
           
            set((state) => ({
                messages: [...state.messages, newMessage]
            }));
        });
    },

    deafenMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newMessage");
    },

    setSelectedUser: (user) => {
        set({ selectedUser: user });
    },

    fetchRecipientKeys: async (userId) => {
        try {
            const res = await axiosInstance.get(`/messages/keys/${userId}`);
            const keys = res.data;

            const edIdentityKey = naclUtil.decodeBase64(keys.edIdentityKey);
            const signedPreKey = naclUtil.decodeBase64(keys.signedPreKey);
            const signedPreKeySignature = naclUtil.decodeBase64(keys.signedPreKeySignature);

            const isValid = nacl.sign.detached.verify(
                signedPreKey,
                signedPreKeySignature,
                edIdentityKey
            );

            console.log("Keys fetched:", keys);
            console.log("Signature valid:", isValid);

        if (!isValid) {
            console.error("Invalid signedPreKey: Signature verification failed.");
            return null; 
        }

        set({ recipientKeyBundle: keys });
        return keys;

        } catch (error) {
            console.error("Error fetching recipient keys:", error);
            return null;
        }
    },

    loadKeysFromStorage: () => {
        const privateKeyData = localStorage.getItem('privateKeys');

        try {
            const parsed = JSON.parse(privateKeyData);
            set({
                identityKey: parsed.identityKeySecret,
                edIdentityKey: parsed.edIdentityKeySecret,
                signedPreKey: parsed.signedPreKeySecret,
                oneTimePreKeys: parsed.oneTimePreKeys,
            });
        } catch (error) {
            console.error("Failed to load identity keys from localStorage:", error);
        }
    },

    createSharedSecret: async (recipientKeyBunde, identityKey) => {
        // Generate senders ephemeral key pair
        const ephemeralKeyPair = nacl.box.keyPair();
        const ephemeralKeyPublic = naclUtil.encodeBase64(ephemeralKeyPair.publicKey);
        set({ ephemeralKeyPublic });

        // decode all keys from base64
        const EKa = ephemeralKeyPair.secretKey;
        const IKa = naclUtil.decodeBase64(identityKey)
        const IKb = naclUtil.decodeBase64(recipientKeyBunde.identityKey);
        const SPKb = naclUtil.decodeBase64(recipientKeyBunde.signedPreKey);

        // X3DH calculations
        const dh1 = nacl.scalarMult(IKa, SPKb);
        const dh2 = nacl.scalarMult(EKa, IKb);
        const dh3 = nacl.scalarMult(EKa, SPKb); 

        // Check for one time prekey
        let dh4 = new Uint8Array();
        if (recipientKeyBunde.oneTimePreKey) {
            const OPKb = naclUtil.decodeBase64(recipientKeyBunde.oneTimePreKey);
            dh4 = nacl.scalarMult(EKa, OPKb);
            set ({ otkKeyId: recipientKeyBunde.otkKeyId });
        }

        // Concatenate all secretes
        const concatSecrets = new Uint8Array(
            dh1.length + dh2.length + dh3.length + dh4.length
        );

        concatSecrets.set(dh1, 0);
        concatSecrets.set(dh2, dh1.length);
        concatSecrets.set(dh3, dh1.length + dh2.length);
        concatSecrets.set(dh4, dh1.length + dh2.length + dh3.length);

        // Derive final shared secret using SHA-256 Hashing
        const sk = await crypto.subtle.digest('SHA-256', concatSecrets);
        const sharedSecretBase64 = naclUtil.encodeBase64(new Uint8Array(sk));

        set({ sharedSecret: sharedSecretBase64 })
        console.log("Shared secret created:", sharedSecretBase64);
        return sharedSecretBase64;
    },

    sendInitialMessage: async (messageData) => {},

}));