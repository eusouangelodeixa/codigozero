/* ═══════════════════════════════════════════════════════════
   Root Loading UI
   Shown instantly (via React Suspense) while a route segment
   streams in. Server Component — no props, kept lightweight.
   ═══════════════════════════════════════════════════════════ */

import { Spinner } from "@/components/ui";
import styles from "./fallback.module.css";

export default function Loading() {
  return (
    <div className={styles.loadingPage}>
      <Spinner size="lg" accent label="Carregando" />
      <span className={styles.loadingLabel}>Carregando…</span>
    </div>
  );
}
