import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';
import { io } from 'socket.io-client';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import ed2curve from 'ed2curve';
import { nanoid } from 'nanoid';

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
            for (let i = 0; i < 100; i++) {
                const { publicKey, secretKey } = nacl.box.keyPair();
                oneTimePreKeys.push({
                    id: nanoid(),
                    publicKey: naclUtil.encodeBase64(publicKey),
                    privateKey: naclUtil.encodeBase64(secretKey),
                });
            }

            const publicPrekeys = oneTimePreKeys.map(k => ({
                id: k.id,
                publicKey: k.publicKey
            }));

            const privatePreKeys = oneTimePreKeys.map(k => ({
                id: k.id,
                privateKey: k.privateKey
            }));

            const identityKey = naclUtil.encodeBase64(identityKeyPair.publicKey);
            const edIdentityKey = naclUtil.encodeBase64(edIdentityKeyPair.publicKey);
            const signedPreKey = naclUtil.encodeBase64(signedPreKeyPair.publicKey);
            const signedPreKeySignatureBase64 = naclUtil.encodeBase64(signedPreKeySignature);
            
            const privateKeys = {
                identityKeySecret: naclUtil.encodeBase64(identityKeyPair.secretKey),
                edIdentityKeySecret: naclUtil.encodeBase64(edIdentityKeyPair.secretKey),
                signedPreKeySecret: naclUtil.encodeBase64(signedPreKeyPair.secretKey),
                oneTimePreKeysSecret: privatePreKeys,
                sessions: [],
            };
            
            const privateKeysString = JSON.stringify(privateKeys);
            localStorage.setItem(`privateKeys${data.username}`, privateKeysString); 

            // TODO Encrypt the private key with the password and store it in local storage


            const res = await axiosInstance.post("/auth/signup", {
                ...data,
                identityKey,
                edIdentityKey,
                signedPreKey,
                signedPreKeySignature: signedPreKeySignatureBase64,
                oneTimePreKeys: publicPrekeys,
            });

            set({ authUser: res.data.user })
            console.log("Signed up user:", res.data);
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
            set({ authUser: res.data.user });
            console.log("Logged in user:", res.data.user);
            window.alert("Logged in successfully.");

            // generete new otks if < 10 in db
            if(res.data.generateOtks) {
                console.log("Generating new one-time prekeys...");
                const privateKeys = await get().loadPrivateKeys(data.username);

                const oneTimePreKeys = [];
                for (let i = 0; i < 100; i++) {
                    const { publicKey, secretKey } = nacl.box.keyPair();
                    oneTimePreKeys.push({
                        id: nanoid(),
                        publicKey: naclUtil.encodeBase64(publicKey),
                        privateKey: naclUtil.encodeBase64(secretKey),
                    });
                }

                const publicPrekeys = oneTimePreKeys.map(k => ({
                    id: k.id,
                    publicKey: k.publicKey
                }));

                const privatePreKeys = oneTimePreKeys.map(k => ({
                    id: k.id,
                    privateKey: k.privateKey
                }));

                const newPrivateKeys = {
                    identityKeySecret: privateKeys.identityKeySecret,
                    edIdentityKeySecret: privateKeys.edIdentityKeySecret,
                    signedPreKeySecret: privateKeys.signedPreKeySecret,
                    oneTimePreKeysSecret: [...privateKeys.oneTimePreKeysSecret, ...privatePreKeys],
                    sessions: privateKeys.sessions,
                };
            
                const newPrivateKeysString = JSON.stringify(newPrivateKeys);
                localStorage.setItem(`privateKeys${data.username}`, newPrivateKeysString); 

                // send the public otks to the server
                await axiosInstance.post("/auth/otks", {
                    username: res.data.user.username,
                    oneTimePreKeys: publicPrekeys,
                });
            }

            if (res.data.generateNewPrekeys) {
                console.log("Generating new signed prekey...");
                const privateKeys = await get().loadPrivateKeys(data.username);

                const signedPreKeyPair = nacl.box.keyPair();
                const signedPreKeySignature = nacl.sign.detached(
                    signedPreKeyPair.publicKey,
                    naclUtil.decodeBase64(privateKeys.edIdentityKeySecret)
                );

                // update the local storage with the new signed prekey
                const newPrivateKeys = {
                    identityKeySecret: privateKeys.identityKeySecret,
                    edIdentityKeySecret: privateKeys.edIdentityKeySecret,
                    signedPreKeySecret: naclUtil.encodeBase64(signedPreKeyPair.secretKey),
                    oneTimePreKeysSecret: privateKeys.oneTimePreKeysSecret,
                    sessions: privateKeys.sessions,
                };

                const newPrivateKeysString = JSON.stringify(newPrivateKeys);
                localStorage.setItem(`privateKeys${data.username}`, newPrivateKeysString);

                // update the signed prekey and signature in the database
                await axiosInstance.put("/auth/signedPreKey", {
                    username: res.data.user.username,
                    signedPreKey: naclUtil.encodeBase64(signedPreKeyPair.publicKey),
                    signedPreKeySignature: naclUtil.encodeBase64(signedPreKeySignature),
                });
            }

            get().connectSocket();
        } catch (error) {
            console.error("Error logging in:", error);
        } finally {
            set({ isLoggingIn: false });
        }
    },

    loadPrivateKeys: async (username) => {
        const privateKeysString = localStorage.getItem(`privateKeys${username}`);
        if (!privateKeysString) {
            console.error("Private keys not found in local storage");
            return null;
        }
        return JSON.parse(privateKeysString);
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