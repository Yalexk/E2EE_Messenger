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
    
    // Recipient key bundle containing public keys of the recipient
    // This will be fetched from the server when a user is selected
    recipientKeyBundle: null,

    // Private keys
    identityKeySecret: null,
    oneTimePreKeys_secret: [],
    
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

        socket.on("newMessage", (newMessage) => {            
            const sentByYou = newMessage.senderId === selectedUser._id;
            if (!sentByYou) return;
           
            set((state) => ({
                messages: [...state.messages, newMessage]
            }));
        });
        /*
        // Receiving the initial message from A to B
        socket.on("initialMessage", async (msg) => {
            // 2. Reconstruct the shared secret
            const { ephemeralKeyPublic, otkKeyId, edIdentityKey, nonce, encryptedMessage } = msg;

            // Load your own private keys from storage/state
            const identityKeySecret = useChatStore.getState().identityKey; // base64
            const signedPreKeySecret = useChatStore.getState().signedPreKey; // base64
            const oneTimePreKeys_secret = useChatStore.getState().oneTimePreKeys_secret; // array of base64
            // Find the correct OTK by otkKeyId if present

            // Decode keys
            const IKb = naclUtil.decodeBase64(identityKeySecret);
            const SPKb = naclUtil.decodeBase64(signedPreKeySecret);
            const EKa_public = naclUtil.decodeBase64(ephemeralKeyPublic);

            // If OTK is used
            let OPKb;
            if (otkKeyId) {
                const otk = oneTimePreKeys.find(k => k.id === otkKeyId);
                if (otk) OPKb = naclUtil.decodeBase64(otk.secret);
            }

            // 2.1. Perform X3DH DHs (recipient side)
            // DH1: DH(IKb, EKa_public)
            const dh1 = nacl.scalarMult(IKb, EKa_public);
            // DH2: DH(SPKb, EKa_public)
            const dh2 = nacl.scalarMult(SPKb, EKa_public);
            // DH3: DH(IKb, EKa_public) (same as dh1, but keep for clarity)
            // DH4: DH(OPKb, EKa_public) if OTK present
            let concatSecrets;
            if (OPKb) {
                const dh4 = nacl.scalarMult(OPKb, EKa_public);
                concatSecrets = new Uint8Array(dh1.length + dh2.length + dh4.length);
                concatSecrets.set(dh1, 0);
                concatSecrets.set(dh2, dh1.length);
                concatSecrets.set(dh4, dh1.length + dh2.length);
            } else {
                concatSecrets = new Uint8Array(dh1.length + dh2.length);
                concatSecrets.set(dh1, 0);
                concatSecrets.set(dh2, dh1.length);
            }

            // 2.2. Derive shared secret
            const sk = await crypto.subtle.digest('SHA-256', concatSecrets);
            const sharedSecret = new Uint8Array(sk);

            // 3. Decrypt the message
            const nonceUint8 = naclUtil.decodeBase64(nonce);
            const encryptedUint8 = naclUtil.decodeBase64(encryptedMessage);
            const decrypted = nacl.secretbox.open(encryptedUint8, nonceUint8, sharedSecret);

            let text;
            if (decrypted) {
                text = naclUtil.encodeUTF8(decrypted);
            } else {
                text = "[Failed to decrypt]";
            }

            // Add to messages
            set((state) => ({
                messages: [...state.messages, { ...msg, text }]
            }));
        });
        */
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

            console.log("Signature valid:", isValid);

        if (!isValid) {
            console.error("Invalid signedPreKey: Signature verification failed.");
            return null; 
        }

        console.log("Keys fetched:", keys);


        set({ recipientKeyBundle: keys });
        return keys;

        } catch (error) {
            console.error("Error fetching recipient keys:", error);
            return null;
        }
    },

    loadKeysFromStorage: () => {
        const { identityKeySecret, oneTimePreKeys_secret } = get();
        if (identityKeySecret && oneTimePreKeys_secret) {
            console.log("Private identity keys already loaded from state.");
            return;
        }

        // Load private identity keys from localStorage
        const privateKeyData = localStorage.getItem('identityPrivateKeys');

        try {
            const parsed = JSON.parse(privateKeyData);
            set({
                identityKeySecret: parsed.identityKeySecret,
                oneTimePreKeys: parsed.oneTimePreKeys,
            });
            console.log(" Private identity keys loaded from localStorage:", parsed.identityKeySecret);
        } catch (error) {
            console.error("Failed to load identity keys from localStorage:", error);
        }
    },

    createSharedSecret: async () => {
        const { recipientKeyBundle, identityKeySecret } = get();
        // Generate senders ephemeral key pair
        const ephemeralKeyPair = nacl.box.keyPair();
        const ephemeralKeyPublic = naclUtil.encodeBase64(ephemeralKeyPair.publicKey);
        set({ ephemeralKeyPublic });

        // decode all keys from base64
        const EKa = ephemeralKeyPair.secretKey;
        const IKa = naclUtil.decodeBase64(identityKeySecret)
        const IKb = naclUtil.decodeBase64(recipientKeyBundle.identityKey);
        const SPKb = naclUtil.decodeBase64(recipientKeyBundle.signedPreKey);

        // X3DH calculations
        const dh1 = nacl.scalarMult(IKa, SPKb);
        const dh2 = nacl.scalarMult(EKa, IKb);
        const dh3 = nacl.scalarMult(EKa, SPKb); 

        // Check for one time prekey
        let dh4 = new Uint8Array();
        if (recipientKeyBundle.oneTimePreKey) {
            const OPKb = naclUtil.decodeBase64(recipientKeyBundle.oneTimePreKey);
            dh4 = nacl.scalarMult(EKa, OPKb);
            set ({ otkKeyId: recipientKeyBundle.otkKeyId });
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

    getMyIdentityKey: async (userId) => {
        try {
            const res = await axiosInstance.get(`/messages/myIdentityKey/${userId}`);
            const identityKey = res.data.identityKeyPublic;
            console.log("My Identity Key:", identityKey);
            return identityKey;
        } catch (error) {
            console.error("Error fetching my identity key:", error);
            return null;
        }
    },

    sendInitialMessage: async () => {
        try {
            const { selectedUser, sharedSecret, ephemeralKeyPublic, otkKeyId } = get();
            // encrypt the intitial message using the shared secret
            const initialMessage = "Hello, this is a secure message!";
            const messageUint8 = naclUtil.decodeUTF8(initialMessage);
            const keyUint8 = naclUtil.decodeBase64(sharedSecret);
            const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
            const encrypted = nacl.secretbox(messageUint8, nonce, keyUint8);

            // Encode encrypted data and nonce for sending
            const encryptedMessage = naclUtil.encodeBase64(encrypted);
            const encodedNonce = naclUtil.encodeBase64(nonce);

            const payload = {
                encryptedMessage,    // encrypted message using shared secret
                nonce: encodedNonce, // nonce in base64
                ephemeralKeyPublic,  // base64 string
                otkKeyId             // key id for one-time prekey, if used else null
            };

            const res = await axiosInstance.post(`/messages/sendInitial/${selectedUser._id}`, payload);

            console.log("Initial message sent:", res.data);
        } catch (error) {
            console.error("Error sending initial message:", error);
        }
    },

}));