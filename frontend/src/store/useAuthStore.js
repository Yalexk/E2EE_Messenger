import {create} from 'zustand';
import { axiosInstance } from '../lib/axios.js';

export const useAuthStore = create((set) => ({
    authUser: null,
    usSigningUp: false,
    isLoggedIn: false,


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
}));