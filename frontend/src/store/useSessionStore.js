import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';    
import { useAuthStore } from './useAuthStore.js';
import { useChatStore } from './useChatStore.js';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import axios from 'axios';

export const useSessionStore = create((set, get) => ({
    selectedUser: null,
    recipientKeyBundle: null,
    sessionEstablished: false,
    sessionId: null,

    // Private keys
    identityKeySecret: null,
    oneTimePreKeysSecret: [],
    signedPreKeySecret: null,
    
    sharedSecret: null, // derived or created shared secret
    ephemeralKeyPublic: null,
    otkKeyId: null,

    setSelectedUser: async (user) => {
        if (get().selectedUser != user) {
            // End the previous session if it exists
            if (get().selectedUser && get().sessionEstablished) {
                await get().endSession();
            }

            set({ selectedUser: user });
            useChatStore.setState({ selectedUser: user });

            // get().listenToSessionEvents();

            await get().fetchInitialMessage();
            
            if (!get().sessionEstablished) {
                await get().sendInitialMessage();
            }
        } else {
            console.log("User already selected:", user.username);
        }
    },

    fetchRecipientKeys: async (userId) => {
        try {
            const res = await axiosInstance.get(`/session/keys/${userId}`);
            const keys = res.data;

            const edIdentityKey = naclUtil.decodeBase64(keys.edIdentityKey);
            const signedPreKey = naclUtil.decodeBase64(keys.signedPreKey);
            const signedPreKeySignature = naclUtil.decodeBase64(keys.signedPreKeySignature);

            const isValid = nacl.sign.detached.verify(
                signedPreKey,
                signedPreKeySignature,
                edIdentityKey
            );

            // console.log("Signature valid:", isValid);

        if (!isValid) {
            console.error("Invalid signedPreKey: Signature verification failed.");
            return null; 
        }

        // console.log("Keys fetched:", keys);


        set({ recipientKeyBundle: keys });
        return keys;

        } catch (error) {
            console.error("Error fetching recipient keys:", error);
            return null;
        }
    },

    loadKeysFromStorage: () => {
        const { identityKeySecret, oneTimePreKeysSecret } = get();
        if (identityKeySecret && oneTimePreKeysSecret) {
            // console.log("Private identity keys already loaded from state.");
            return;
        }

        // Load private identity keys from localStorage
        const authUser = useAuthStore.getState().authUser;
        const privateKeyData = localStorage.getItem(`privateKeys${authUser.username}`);

        try {
            const parsed = JSON.parse(privateKeyData);
            set({
                identityKeySecret: parsed.identityKeySecret,
                oneTimePreKeysSecret: parsed.oneTimePreKeysSecret,
                signedPreKeySecret: parsed.signedPreKeySecret,
            });
            // console.log(" Private identity keys loaded from localStorage:", parsed.identityKeySecret, parsed.oneTimePreKeysSecret, parsed.signedPreKeySecret);
        } catch (error) {
            console.error("Failed to load identity keys from localStorage:", error);
        }
    },

    createSharedSecretForSending: async () => {
        try {
            await get().loadKeysFromStorage();
            await get().fetchRecipientKeys(get().selectedUser._id);

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
                const OPKb = naclUtil.decodeBase64(recipientKeyBundle.oneTimePreKey.publicKey);
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
            // console.log("Shared secret created:", sharedSecretBase64);
            return sharedSecretBase64;
        } catch (error) {
            console.error("Error creating shared secret:", error);
            return null;
        }
    },

    sendInitialMessage: async () => {
        try {
            set({ sessionEstablished: true });
            await get().createSharedSecretForSending();
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

            const sessionId = get().generateSessionId();
            set({ sessionId });

            const payload = {
                sessionId,           // unique session identifier
                encryptedMessage,    // encrypted message using shared secret
                nonce: encodedNonce, // nonce in base64
                ephemeralKeyPublic,  // base64 string
                otkKeyId             // key id for one-time prekey, if used else null
            };

            const res = await axiosInstance.post(`/session/sendInitial/${selectedUser._id}`, payload);

            // Add the session data to local storage
            get().addSessionToLocalStorage(sessionId, sharedSecret);
            
            console.log("Initial message sent:", res.data);
            console.log("Session established:", get().sessionEstablished);            
        } catch (error) {
            console.error("Error sending initial message:", error);
        }
    },

    fetchInitialMessage: async () => {
        try {
            const { selectedUser } = get();
            const res = await axiosInstance.get(`/session/initial/${selectedUser._id}`);

            if (res.data) {
                if (res.data.message === "Initial message not found") {
                    console.log("No initial message found, session not established yet.");
                    return;
                }
                console.log("Initial message received:", res.data);
                const sessionId = res.data.sessionId;
                set({ sessionId, sessionEstablished: true });

                // check to see if the shared secret is alrady in local storage
                const authUser = useAuthStore.getState().authUser;
                let existingSession = null;
                const privateKeyData = localStorage.getItem(`privateKeys${authUser.username}`);
                if (privateKeyData) {
                    const privateKeys = JSON.parse(privateKeyData);
                    if (Array.isArray(privateKeys.sessions)) {
                        existingSession = privateKeys.sessions.find(s => s.sessionId === sessionId);
                    }
                }
                
                if (existingSession) {
                    console.log("Found existing session in localStorage:", existingSession);
                    set({ sharedSecret: existingSession.sharedSecret });
                } else {
                    await get().deriveSharedSecretFromInitialMessage(res.data);
                    get().addSessionToLocalStorage(get().sessionId, get().sharedSecret);
                }

                // update the session info in the database
                await axiosInstance.put(`/session/updateSessionInfo/${selectedUser._id}`, { senderId: res.data.senderId });
                console.log("Session info updated in the database.");
                
            }
        } catch (error) {
            console.error("Error fetching initial message:", error);
        }
    },

    deriveSharedSecretFromInitialMessage: async (initialMessage) => {
        // need to add logic if the sender is receiving the initial message eg. if they log out and back in
        try {
            await get().loadKeysFromStorage();
            const { identityKeySecret, oneTimePreKeysSecret, signedPreKeySecret } = get();
            const { ephemeralKeyPublic, otkKeyId, senderIdentityKey, nonce, messageText } = initialMessage;
            // Decode keys
            const IKa = naclUtil.decodeBase64(senderIdentityKey);
            const SPKb = naclUtil.decodeBase64(signedPreKeySecret);
            const EKa = naclUtil.decodeBase64(ephemeralKeyPublic);
            const IKb = naclUtil.decodeBase64(identityKeySecret);

            // Find the correct OTK by otkKeyId if present
            let OPKb = null;
            let usedOtkIndex = -1;

            if (otkKeyId && otkKeyId !== "null" && otkKeyId !== "undefined") {
                // console.log("Getting the one time prekey from ", oneTimePreKeysSecret);
                // console.log("otkKeyId:", otkKeyId);

                const otkEntry = oneTimePreKeysSecret.find((k, index) => {
                    if (k.id == otkKeyId) {
                        usedOtkIndex = index;
                        return true;
                    }
                    return false;
                });

                if (otkEntry) {
                    OPKb = naclUtil.decodeBase64(otkEntry.privateKey);
                    
                } else {
                    console.error("One-time prekey not found for ID:", otkKeyId);
                    return;
                }
            }

            const dh1 = nacl.scalarMult(SPKb, IKa);
            const dh2 = nacl.scalarMult(IKb, EKa);
            const dh3 = nacl.scalarMult(SPKb, EKa); 

            let dh4 = new Uint8Array();
            if (OPKb) dh4 = nacl.scalarMult(OPKb, EKa);
            

           // Concatenate all secretes
            const concatSecrets = new Uint8Array(
                dh1.length + dh2.length + dh3.length + dh4.length
            );

            concatSecrets.set(dh1, 0);
            concatSecrets.set(dh2, dh1.length);
            concatSecrets.set(dh3, dh1.length + dh2.length);
            concatSecrets.set(dh4, dh1.length + dh2.length + dh3.length);

            // 2.2. Derive shared secret
            const sk = await crypto.subtle.digest('SHA-256', concatSecrets);            
            const sharedSecret = naclUtil.encodeBase64(new Uint8Array(sk));
            set({ sharedSecret });
            // console.log("Receiver's shared secret created from the sender:", sharedSecret);

            // 3. Decrypt the message
            // console.log("Encrypted message base64:", messageText);
            const nonceUint8 = naclUtil.decodeBase64(nonce);
            const encryptedUint8 = naclUtil.decodeBase64(messageText);
            const keyUint8 = naclUtil.decodeBase64(sharedSecret);
            const decrypted = nacl.secretbox.open(encryptedUint8, nonceUint8, keyUint8);

            let message;
            if (decrypted) {
                message = naclUtil.encodeUTF8(decrypted);
                // console.log(`Decrypted message: ${message}`);

                // TODO Delete the used one-time prekey if it was used
                if (usedOtkIndex !== -1) {
                    await get().deleteUsedOneTimePreKey(otkKeyId, usedOtkIndex);
                    // console.log(`Used one-time prekey with ID ${otkKeyId} deleted from state and localStorage`);
                }

            } else {
                message = "[Failed to decrypt]";
                console.log("Decryption failed.");
            }

        } catch (error) {
            console.error("Error deriving shared secret from initial message:", error);
            return null;
        }
    },

    deleteUsedOneTimePreKey: async (otkKeyId, usedIndex) => {
        try {
            const authUser = useAuthStore.getState().authUser;
            const { oneTimePreKeysSecret } = get();
            
            // Remove the used OTK from the array
            const updatedOTKs = oneTimePreKeysSecret.filter((_, index) => index !== usedIndex);
            
            // Update the state
            set({ oneTimePreKeysSecret: updatedOTKs });
            
            // Update localStorage
            const privateKeyData = localStorage.getItem(`privateKeys${authUser.username}`);
            if (privateKeyData) {
                const parsed = JSON.parse(privateKeyData);
                parsed.oneTimePreKeysSecret = updatedOTKs;
                
                localStorage.setItem(`privateKeys${authUser.username}`, JSON.stringify(parsed));
                
                // console.log(`One-time prekey with ID ${otkKeyId} deleted from localStorage`);
                // console.log(`Remaining OTKs: ${updatedOTKs.length}`);
            }

            try {
                await axiosInstance.delete(`/session/otk/${otkKeyId}`);
                // console.log(`Public one-time prekey ${otkKeyId} removed from server`);
            } catch (serverError) {
                console.error(`Failed to delete OTK ${otkKeyId} from server:`, serverError);
            }

        } catch (error) {
            console.error("Error deleting used one-time prekey:", error);
        }
    },

    // this function should set the session state in the database of the current user to ended
    endSession: async () => {
        try {
            const { selectedUser } = get();
            if (!selectedUser) return;

            // set the sessionactive to false
            await axiosInstance.post(`/session/endSession/${selectedUser._id}`);
            
            // Reset local session state
            set({
                sessionId: null,
                sessionEstablished: false,
                sharedSecret: null,
                ephemeralKeyPublic: null,
                otkKeyId: null,
                recipientKeyBundle: null
            });
            
            console.log("Session ended for user:", selectedUser.username);
        } catch (error) {
            console.error("Error ending session:", error);
        }
    },

    resetSession: () => {
        set({
            sessionEstablished: false,
            sessionId: null,
            sharedSecret: null,
            ephemeralKeyPublic: null,
            otkKeyId: null,
            recipientKeyBundle: null
        });
        
        console.log("Session reset");
    },

    listenToSessionEvents: () => {
        const socket = useAuthStore.getState().socket;
        
        socket.off("sessionEnded");
        socket.off("sessionStarted");
        
        socket.on("sessionEnded", (data) => {
            console.log("Session ended by other user:", data);
            get().resetSession();
        });

        socket.on("sessionStarted", async (data) => {
            console.log("Session started by other user:", data);
            
            // Only respond if we're currently chatting with this user
            const { selectedUser } = get();
            if (selectedUser && selectedUser._id === data.startedBy) {
                console.log("Fetching initial message for current chat");
                
                // Fetch the initial message using existing HTTP route
                await get().fetchInitialMessage();
            } else {
                console.log("Session started with different user, ignoring");
            }
        });
    },

    generateSessionId: () => {
        const { selectedUser } = get();
        const authUser = useAuthStore.getState().authUser;
        
        if (!selectedUser || !authUser) return null;
        
        const userIds = [authUser._id, selectedUser._id].sort();
        const timestamp = Date.now();
        
        const sessionId = `session_${userIds.join('_')}_${timestamp}`;
        
        return sessionId;
    },

    addSessionToLocalStorage: (sessionId, sharedSecret) => {
        try {
            const authUser = useAuthStore.getState().authUser;
            if (!authUser) {
                console.error("No authenticated user found");
                return;
            }

            const privateKeyData = localStorage.getItem(`privateKeys${authUser.username}`);
            if (!privateKeyData) {
                console.error("No private keys found in localStorage");
                return;
            }

            const privateKeys = JSON.parse(privateKeyData);

            if (!privateKeys.sessions) {
                privateKeys.sessions = [];
            }

            const sessionData = {
                sessionId,
                sharedSecret,
            };

            privateKeys.sessions.push(sessionData);

            // Store the session data in localStorage
            localStorage.setItem(`privateKeys${authUser.username}`, JSON.stringify(privateKeys));
            // console.log("Session data saved to localStorage:", sessionData);
        } catch (error) {
            console.error("Error adding session to localStorage:", error);
        }
    },
}));