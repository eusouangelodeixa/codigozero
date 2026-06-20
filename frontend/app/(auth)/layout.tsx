"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, AppShellLoading, type AppShellUser } from "@/components/layout/AppShell";
import { subscribeToPush } from "@/lib/pushNotifications";

interface User extends AppShellUser {
  subscriptionStatus?: string;
  hasCompletedOnboarding?: boolean;
  withdrawOnly?: boolean;
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
      try {
        const parsed = JSON.parse(cached) as User;
        setUser(parsed);
        // Offboarded partner: bounce off any member page immediately, even
        // before /api/auth/me resolves (avoids a flash of restricted UI).
        if (parsed?.withdrawOnly) {
          router.replace("/socios");
        }
      } catch {}
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
          // Source of truth: GET /api/auth/me → user.withdrawOnly. An
          // offboarded partner may only use the withdrawal screen (/socios).
          if (data.user.withdrawOnly) {
            router.replace("/socios");
            return;
          }
          subscribeToPush().catch(() => {});
          // Non-blocking: reveal the "Sócios" link for revenue-share partners.
          fetch(`${API_URL}/api/partner/me`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => {
              if (r.ok) setUser((u) => (u ? { ...u, isPartner: true } : u));
            })
            .catch(() => {});
          if (!data.user.hasCompletedOnboarding && !window.location.pathname.startsWith("/onboarding")) {
            router.replace("/onboarding");
          }
        }
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ user?: User }>;
      const next = ce.detail?.user;
      if (next) setUser((prev) => ({ ...(prev ?? {}), ...next }));
    };
    window.addEventListener("cz-user-updated", handler);
    return () => window.removeEventListener("cz-user-updated", handler);
  }, []);

  // Detect when the app is running as an installed PWA (added to the home
  // screen / standalone display) and record it once. The PWA-install cron
  // uses this to skip nudging users who already installed.
  useEffect(() => {
    const token = localStorage.getItem("cz_token");
    if (!token) return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as any).standalone === true;
    if (!isStandalone) return;
    if (localStorage.getItem("cz_pwa_reported")) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    fetch(`${API_URL}/api/auth/pwa-installed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => localStorage.setItem("cz_pwa_reported", "1"))
      .catch(() => {});
  }, []);

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
