"use client";
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import styles from "./cofre.module.css";

const categoryLabels: Record<string, string> = {
  primeira_abordagem: "Primeira Abordagem",
  negociacao: "Negociação",
  prompts_copy: "Prompts de Copy",
  follow_up: "Follow-up",
  fechamento: "Fechamento",
};

export default function CofrePage() {
  const [scripts, setScripts] = useState<Record<string, any[]>>({});
  const [selectedScript, setSelectedScript] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadScripts(); }, []);

  const loadScripts = async () => {
    try { const data = await apiClient.getScripts(); setScripts(data.scripts); }
    catch (e) { console.error("Failed:", e); }
    finally { setLoading(false); }
  };

  const copyContent = async (content: string) => {
    try { await navigator.clipboard.writeText(content); } catch {
      const el = document.createElement("textarea"); el.value = content;
      document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close modal with Escape (per spec rule)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setSelectedScript(null);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={styles.page}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Scripts</span>
        <h1 className={styles.sectionTitle}>Scripts prontos para vender</h1>
        <p className={styles.sectionDescription}>Copie, adapte e feche seus primeiros clientes.</p>
      </div>

      {loading ? (
        <div className={styles.loadingGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : (
        Object.entries(scripts).map(([category, items]) => (
          <div key={category} className={styles.categorySection}>
            <h2 className={styles.categoryTitle}>{categoryLabels[category] || category}</h2>
            <div className={styles.grid}>
              {items.map((script: any) => (
                <button key={script.id} className={styles.scriptCard} onClick={() => setSelectedScript(script)}>
                  <span className={styles.scriptIcon}>{script.icon || "📄"}</span>
                  <span className={styles.scriptTitle}>{script.title}</span>
                  <span className={styles.scriptPreview}>{script.content.slice(0, 80)}...</span>
                  <span className={styles.scriptAction}>Abrir →</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Modal */}
      {selectedScript && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setSelectedScript(null)} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <span className={styles.modalIcon}>{selectedScript.icon || "📄"}</span>
                <h2 className={styles.modalTitle}>{selectedScript.title}</h2>
              </div>
              <button className={styles.modalClose} onClick={() => setSelectedScript(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              <pre className={styles.scriptContent}>{selectedScript.content}</pre>
            </div>
            <div className={styles.modalFooter}>
              <button className={`${styles.copyAllBtn} ${copied ? styles.copyAllBtnSuccess : ""}`}
                onClick={() => copyContent(selectedScript.content)}>
                {copied ? "✓ Copiado" : "Copiar Tudo"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
