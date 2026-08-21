'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  email_verified: boolean;
  created_at: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  register: (data: { name: string; email: string; password: string; confirmPassword: string }) => Promise<void>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  resendOtp: (email: string, purpose: 'email_verification' | 'password_reset') => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (data: { email: string; otp: string; password: string; confirmPassword: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  changeEmail: (newEmail: string, password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // The backend stores auth in HttpOnly cookies; validate the session by
  // fetching the current user (the api client transparently refreshes tokens).
  useEffect(() => {
    api
      .get<{ user: User }>('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const register = async (data: { name: string; email: string; password: string; confirmPassword: string }) => {
    await api.post('/api/auth/register', data);
  };

  const verifyEmail = async (email: string, otp: string) => {
    const res = await api.post<{ user: User }>('/api/auth/verify-email', { email, otp });
    setUser(res.user);
  };

  const resendOtp = async (email: string, purpose: 'email_verification' | 'password_reset') => {
    await api.post('/api/auth/resend-otp', { email, purpose });
  };

  const forgotPassword = async (email: string) => {
    await api.post('/api/auth/forgot-password', { email });
  };

  const resetPassword = async (data: { email: string; otp: string; password: string; confirmPassword: string }) => {
    await api.post('/api/auth/reset-password', data);
  };

  const login = async (email: string, password: string) => {
    const data = await api.post<{ user: User }>('/api/auth/login', { email, password });
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // best-effort; always clear the client session state
    }
    setUser(null);
  };

  const updateProfile = async (name: string) => {
    const data = await api.put<{ user: User }>('/api/auth/profile', { name });
    setUser(data.user);
  };

  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    await api.put('/api/auth/password', { currentPassword, newPassword, confirmPassword });
  };

  const changeEmail = async (newEmail: string, password: string) => {
    const data = await api.put<{ user: User }>('/api/auth/email', { newEmail, password });
    setUser(data.user);
  };

  const deleteAccount = async (password: string) => {
    await api.put('/api/auth/delete-account', { password });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user, loading, register, verifyEmail, resendOtp, forgotPassword,
        resetPassword, login, logout, updateProfile, changePassword,
        changeEmail, deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}