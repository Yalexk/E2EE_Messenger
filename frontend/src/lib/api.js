import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
});

/** Human-readable message for an axios error. */
export function errorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.request && !error?.response) return 'Server unreachable';
  return error?.message ?? fallback;
}
