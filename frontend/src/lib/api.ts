// Type-safe API client with automatic token management

import type { TokenResponse } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<string> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }

  private getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("refresh_token");
  }

  private setTokens(access: string, refresh: string) {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  }

  clearTokens() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) throw new Error("No refresh token");

    const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      this.clearTokens();
      throw new Error("Token refresh failed");
    }

    const data: TokenResponse = await res.json();
    this.setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getAccessToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    let res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    // Auto-refresh on 401
    if (res.status === 401 && this.getRefreshToken()) {
      try {
        // Queue concurrent refreshes
        if (!this.refreshPromise) {
          this.refreshPromise = this.refreshAccessToken();
        }
        const newToken = await this.refreshPromise;
        this.refreshPromise = null;

        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });
      } catch {
        this.refreshPromise = null;
        this.clearTokens();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw new Error("Authentication expired");
      }
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = params
      ? `${path}?${new URLSearchParams(params)}`
      : path;
    return this.request<T>(url);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  async upload<T>(
    path: string,
    file: File,
    folderId?: string,
    onProgress?: (percent: number) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("file", file);
      if (folderId) formData.append("folder_id", folderId);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || `Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));

      xhr.open("POST", `${this.baseUrl}${path}`);
      const token = this.getAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(formData);
    });
  }
}

export const api = new ApiClient(API_BASE);
