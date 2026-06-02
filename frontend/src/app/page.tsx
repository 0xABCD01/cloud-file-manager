"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-lg" style={{ color: "var(--muted)" }}>
        Loading CloudVault...
      </div>
    </div>
  );
}
