import {create} from 'zustand';
import { axiosInstance } from '../lib/axios.js';

export const useAuthStore = create((set) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isCheckingAuth: true,

    checkAuth: async () => {
        try {
            const res = await axiosInstance.get('/auth/check');

            set({ authUser:res.data })
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
            set({ authUser: res.data }) // res.data.user?
            window.alert("Signed up successfully.");
        } catch (error) {
            window.alert(`Error signing up: ${error.response.data.message}`);
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
        } catch (error) {
            window.alert(`Error logging in: ${error.response.data.message}`);
            console.error("Error logging in:", error);
        } finally {
            set({ isLoggingIn: false });
        }
    },

    logout: async () => {
        try {
            await axiosInstance.post("/auth/logout");
            set({ authUser: null });
            window.alert("Logged out successfully.");
        } catch (error) {
            window.alert(`Error logging out: ${error.response.data.message}`);
            console.error("Error logging out:", error);
        }
    },
}));