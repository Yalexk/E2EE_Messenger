import {create} from 'zustand';
import { axiosInstance } from '../lib/axios.js';
import { io } from 'socket.io-client';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import ed2curve from 'ed2curve';

const BASE_URL = 'http://localhost:5001';
export const useAuthStore = create((set, get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isCheckingAuth: true,
    socket: null,

    checkAuth: async () => {
        try {
            const res = await axiosInstance.get('/auth/check');
            set({ authUser:res.data })

            get().connectSocket();
        } catch (error) {
            console.error("Error checking authentication:", error);
            set({ authUser:null });
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    signup: async (data) => {
        set({ isSigningUp: true })
        try {
            // Generate identity key pairs
            // Ed25519 keypair for signing, need to convert it to X25519 for encryption using ed2curve
            const edIdentityKeyPair = nacl.sign.keyPair(); 
            const identityKeyPair = ed2curve.convertKeyPair(edIdentityKeyPair);
            const signedPreKeyPair = nacl.box.keyPair(); // X25519 keypair

            // Create the signed prekey signature
            const signedPreKeySignature = nacl.sign.detached(
                signedPreKeyPair.publicKey,
                edIdentityKeyPair.secretKey
            );

            const oneTimePreKeys = [];
            for (let i = 0; i < 10; i++) {
                const keyPair = nacl.box.keyPair();
                oneTimePreKeys.push(naclUtil.encodeBase64(keyPair.publicKey));
            }

            const identityKey = naclUtil.encodeBase64(identityKeyPair.publicKey);
            const edIdentityKey = naclUtil.encodeBase64(edIdentityKeyPair.publicKey);
            const signedPreKey = naclUtil.encodeBase64(signedPreKeyPair.publicKey);
            const signedPreKeySignatureBase64 = naclUtil.encodeBase64(signedPreKeySignature);
            
            const privateKeys = {
                identityKeySecret: naclUtil.encodeBase64(identityKeyPair.secretKey),
                edIdentityKeySecret: naclUtil.encodeBase64(edIdentityKeyPair.secretKey),
                signedPreKeySecret: naclUtil.encodeBase64(signedPreKeyPair.secretKey),
            };
            
            // TODO Encrypt the private key with the password and store it in local storage
            const privateKeysString = JSON.stringify(privateKeys);
            localStorage.setItem('identityPrivateKeys', privateKeysString); 

            const res = await axiosInstance.post("/auth/signup", {
                ...data,
                identityKey,
                edIdentityKey,
                signedPreKey,
                signedPreKeySignature: signedPreKeySignatureBase64,
                oneTimePreKeys,
            });

            set({ authUser: res.data })
            get().connectSocket();
            window.alert("Signed up successfully.");
        } catch (error) {
            console.error("Error signing up:", error);
        } finally {
            set({ isSigningUp: false });
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            set({ authUser: res.data });
            window.alert("Logged in successfully.");

            get().connectSocket();
        } catch (error) {
            console.error("Error logging in:", error);
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        try {
            await axiosInstance.post("/auth/logout");
            set({ authUser: null });
            get().disconnectSocket();
            window.alert("Logged out successfully.");
        } catch (error) {
            console.error("Error logging out:", error);
        }
    },
    

    connectSocket: () => {
        const {authUser} = get();
        if (!authUser || get().socket?.connected) return;
        
        const socket = io(BASE_URL, {
            auth: {
                userId: authUser._id,
            },
        });
        set({ socket: socket });
    },

    disconnectSocket: () => {
        const socket = get().socket;
        if (socket && socket.connected) socket.disconnect();
    },
}));