"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, AppShellLoading } from "@/components/layout/AppShell";
import { apiClient, api } from "@/lib/api";

interface SocioUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

export default function SociosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SocioUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.me();
        if (cancelled) return;
        // Verify the caller actually owns a PartnerAccount. No subscription
        // gate here — sócios are staff, not subscribers.
        try {
          await api("/api/partner/me");
        } catch {
          if (!cancelled) router.replace("/dashboard");
          return;
        }
        setUser(data.user);
      } catch {
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading || !user) return <AppShellLoading />;

  return (
    <AppShell user={{ ...user, isPartner: true }} onLogout={() => { localStorage.clear(); router.replace("/login"); }}>
      {children}
    </AppShell>
  );
}
