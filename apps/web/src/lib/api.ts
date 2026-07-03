import axios from 'axios';
import { getSession, signOut } from 'next-auth/react';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
});

let cachedToken: string | null = null;

api.interceptors.request.use(async (config) => {
  if (!cachedToken) {
    const session = await getSession();
    cachedToken = session?.accessToken ?? null;
  }
  if (cachedToken) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      cachedToken = null;
      await signOut({ callbackUrl: '/login' });
    }
    return Promise.reject(error);
  },
);

export function invalidateTokenCache() {
  cachedToken = null;
}
