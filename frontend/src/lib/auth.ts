// Auth store using Zustand

import { create } from "zustand";
import { api } from "./api";
import type { User, TokenResponse } from "@/types";

/*
 * SECURITY NOTES:
 * - Access token lives in memory (Zustand store) AND localStorage for persistence
 * - Refresh token in localStorage (acceptable for SPA with strict CSP)
 * - All API calls go through the api client which handles token injection
 * - On 401 from refresh: force logout and redirect to /login
 */

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const data = await api.post<TokenResponse>("/api/v1/auth/login", {
      email,
      password,
    });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    set({ isAuthenticated: true });
    // Fetch profile after login
    const profile = await api.get<User>("/api/v1/users/me");
    set({ user: profile });
  },

  register: async (email, password, displayName) => {
    await api.post("/api/v1/auth/register", {
      email,
      password,
      display_name: displayName,
    });
  },

  logout: async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch {
      // Logout endpoint may fail — clear tokens regardless
    }
    api.clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  fetchProfile: async () => {
    try {
      const user = await api.get<User>("/api/v1/users/me");
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const user = await api.get<User>("/api/v1/users/me");
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
