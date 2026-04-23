"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  subscriptionStatus: string;
  subscriptionEnd?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const hasChecked = useRef(false);

  const checkAuth = useCallback(async () => {
    // Prevent double-checking during login redirect
    if (hasChecked.current) return;
    hasChecked.current = true;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cz_token') : null;
      if (!token) {
        setLoading(false);
        return;
      }

      // Try cached user first for instant display
      const cached = typeof window !== 'undefined' ? localStorage.getItem('cz_user') : null;
      if (cached) {
        try {
          const cachedUser = JSON.parse(cached);
          setUser(cachedUser);
          setLoading(false);
        } catch {}
      }

      // Validate with server in background
      try {
        const data = await apiClient.me();
        setUser(data.user);
        localStorage.setItem('cz_user', JSON.stringify(data.user));
      } catch {
        // If me() fails, keep cached user if available
        if (!cached) {
          localStorage.removeItem('cz_token');
          localStorage.removeItem('cz_user');
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const data = await apiClient.login(email, password);
    localStorage.setItem('cz_token', data.token);
    localStorage.setItem('cz_user', JSON.stringify(data.user));
    setUser(data.user);
    // Use window.location for a hard redirect to avoid React state issues
    window.location.href = '/dashboard';
    return data;
  };

  const logout = () => {
    localStorage.removeItem('cz_token');
    localStorage.removeItem('cz_user');
    setUser(null);
    window.location.href = '/login';
  };

  return { user, loading, login, logout, checkAuth };
}
