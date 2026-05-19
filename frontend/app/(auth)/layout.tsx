"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, AppShellLoading, type AppShellUser } from "@/components/layout/AppShell";
import { subscribeToPush } from "@/lib/pushNotifications";

interface User extends AppShellUser {
  subscriptionStatus?: string;
  hasCompletedOnboarding?: boolean;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("cz_token");
    const cached = localStorage.getItem("cz_user");

    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (cached) {
      try { setUser(JSON.parse(cached)); } catch {}
    }
    setReady(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem("cz_token");
          localStorage.removeItem("cz_user");
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem("cz_user", JSON.stringify(data.user));
          subscribeToPush().catch(() => {});
          if (!data.user.hasCompletedOnboarding && !window.location.pathname.startsWith("/onboarding")) {
            router.replace("/onboarding");
          }
        }
      })
      .catch(() => {});
  }, [router]);

  const logout = () => {
    localStorage.removeItem("cz_token");
    localStorage.removeItem("cz_user");
    window.location.href = "/login";
  };

  if (!ready) return <AppShellLoading />;

  return (
    <AppShell user={user} onLogout={logout}>
      {children}
    </AppShell>
  );
}
