"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { DashboardIcon, RadarIcon, CofreIcon, ForjaIcon, QGIcon } from "@/components/Icons";
import styles from "./auth.module.css";

const navItems: { href: string; label: string; icon: (props: { size?: number; className?: string }) => ReactNode }[] = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/radar", label: "O Radar", icon: RadarIcon },
  { href: "/cofre", label: "O Cofre", icon: CofreIcon },
  { href: "/forja", label: "A Forja", icon: ForjaIcon },
  { href: "/qg", label: "O QG", icon: QGIcon },
];

interface User {
  id: string;
  name: string;
  email: string;
  subscriptionStatus: string;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

    // Background verify
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => {
        if (res.status === 401) {
          localStorage.removeItem("cz_token");
          localStorage.removeItem("cz_user");
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem("cz_user", JSON.stringify(data.user));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const logout = () => {
    localStorage.removeItem("cz_token");
    localStorage.removeItem("cz_user");
    window.location.href = "/login";
  };

  if (!ready) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Carregando...</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>
            <Logo size={28} />
            <span className={styles.sidebarBrand}>Código Zero</span>
          </div>
        </div>

        <span className={styles.navSectionLabel}>Módulos</span>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ""}`}
              onClick={(e) => {
                e.preventDefault();
                router.push(item.href);
              }}
            >
              <span className={styles.navIcon}><item.icon size={18} /></span>
              <span className={styles.navLabel}>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {user?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{user?.name || "Membro"}</span>
              <span className={styles.userPlan}>Ativo</span>
            </div>
          </div>
          <button onClick={logout} className={styles.logoutBtn} title="Sair">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Main content */}
      <main className={styles.main}>
        <header className={styles.mobileHeader}>
          <button
            className={styles.hamburger}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
          <span className={styles.mobileTitle}>Código Zero</span>
          <div style={{ width: 44 }} />
        </header>

        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
