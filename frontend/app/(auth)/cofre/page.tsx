"use client";
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import styles from "./cofre.module.css";

export default function CofrePage() {
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<any | null>(null);
  const [selectedScript, setSelectedScript] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFolders(); }, []);

  const loadFolders = async () => {
    try { 
      const data = await apiClient.getScripts(); 
      // The new API returns { folders: [...] }
      setFolders(data.folders || []); 
    }
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

  // Close modal with Escape
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
        {selectedFolder ? (
          <button className={styles.backBtn} onClick={() => setSelectedFolder(null)}>
            ← Voltar às Pastas
          </button>
        ) : (
          <span className={styles.sectionLabel}>Scripts</span>
        )}
        <h1 className={styles.sectionTitle}>
          {selectedFolder ? `${selectedFolder.icon || "📁"} ${selectedFolder.name}` : "Scripts prontos para vender"}
        </h1>
        <p className={styles.sectionDescription}>
          {selectedFolder ? "Selecione um script abaixo." : "Copie, adapte e feche seus primeiros clientes."}
        </p>
      </div>

      {loading ? (
        <div className={styles.loadingGrid}>
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : !selectedFolder ? (
        // SHOW FOLDERS
        <div className={styles.grid}>
          {folders.map(folder => (
            <button key={folder.id} className={styles.scriptCard} onClick={() => setSelectedFolder(folder)} style={{ textAlign: "center", padding: "32px 24px" }}>
              <span className={styles.scriptIcon} style={{ fontSize: "2rem", marginBottom: "16px", display: "inline-block" }}>{folder.icon || "📁"}</span>
              <span className={styles.scriptTitle}>{folder.name}</span>
              <span className={styles.scriptPreview} style={{ marginTop: "8px" }}>{folder.scripts?.length || 0} scripts</span>
            </button>
          ))}
        </div>
      ) : (
        // SHOW SCRIPTS IN SELECTED FOLDER
        <div className={styles.categorySection}>
          <div className={styles.grid}>
            {selectedFolder.scripts?.map((script: any) => (
              <button key={script.id} className={styles.scriptCard} onClick={() => setSelectedScript(script)}>
                <span className={styles.scriptIcon}>{script.icon || "📝"}</span>
                <span className={styles.scriptTitle}>{script.title}</span>
                <span className={styles.scriptPreview}>{script.content.slice(0, 80)}...</span>
                <span className={styles.scriptAction}>Abrir →</span>
              </button>
            ))}
            {(!selectedFolder.scripts || selectedFolder.scripts.length === 0) && (
              <p style={{ color: "var(--text-tertiary)" }}>Nenhum script nesta pasta.</p>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {selectedScript && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setSelectedScript(null)} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <span className={styles.modalIcon}>{selectedScript.icon || "📝"}</span>
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
