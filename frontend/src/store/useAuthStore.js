import {create} from 'zustand';
import { axiosInstance } from '../lib/axios.js';
import { io } from 'socket.io-client';

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
            const res = await axiosInstance.post("/auth/signup", data);
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
            query: {
                userId: authUser._id,
            },
        });
        socket.connect();
        set({ socket: socket });
    },

    disconnectSocket: () => {
        if(get().socket?.connected) get().socket.disconnect();
    },
}));