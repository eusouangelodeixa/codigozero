"use client";
import { useState, useEffect } from "react";
import { useRadar } from "@/hooks/useRadar";
import { apiClient } from "@/lib/api";
import styles from "./radar.module.css";

export default function RadarPage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Script Modal state
  const [scriptsFolders, setScriptsFolders] = useState<any[]>([]);
  const [suggestedScript, setSuggestedScript] = useState<any | null>(null);

  const { status, results, error, remaining, startSearch } = useRadar();

  useEffect(() => { 
    loadSavedHistory(); 
    loadScripts();
  }, []);

  useEffect(() => {
    if (status === "completed" && results.length > 0) loadSavedHistory();
  }, [status, results]);

  const loadSavedHistory = async () => {
    try { 
      const data = await apiClient.getSearchHistory(); 
      setSavedJobs(data.jobs || []); 
    } catch {}
  };

  const loadScripts = async () => {
    try {
      const data = await apiClient.getScripts();
      setScriptsFolders(data.folders || []);
    } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !city.trim()) return;
    setShowSaved(false);
    startSearch(query.trim(), city.trim());
  };

  const copyPhone = async (phone: string, id: string) => {
    try { await navigator.clipboard.writeText(phone); } catch {
      const el = document.createElement("textarea"); el.value = phone;
      document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openSuggestedScript = (scriptId: string, leadName: string) => {
    let scriptFound = null;
    for (const folder of scriptsFolders) {
      const s = folder.scripts?.find((script: any) => script.id === scriptId);
      if (s) { scriptFound = s; break; }
    }
    if (scriptFound) {
      // Replace variables automatically!
      const content = scriptFound.content.replace(/\{\{empresa\}\}/g, leadName);
      setSuggestedScript({ ...scriptFound, content });
    } else {
      alert("Script não encontrado no Cofre.");
    }
  };

  const copyScript = async (content: string) => {
    try { await navigator.clipboard.writeText(content); } catch {
      const el = document.createElement("textarea"); el.value = content;
      document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopiedId("script");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allSavedLeads = savedJobs.flatMap(job => job.leads || []);
  const displayLeads = showSaved ? allSavedLeads : results;

  return (
    <div className={styles.page}>
      {/* Section Header */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Radar / Máquina de Prospecção</span>
        <h1 className={styles.sectionTitle}>Encontre seus leads em segundos</h1>
        <p className={styles.sectionDescription}>
          Informe o nicho e a localidade. O sistema irá varrer e aplicar filtros de prospecção.
          {remaining !== undefined && (
            <span className={styles.remaining}>
              <span className={styles.remainingDot} />
              {remaining} buscas restantes
            </span>
          )}
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <div className={styles.inputRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Nicho</label>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Clínicas Odontológicas" className={styles.input} required />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Localidade</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: São Paulo, SP" className={styles.input} required />
          </div>
          <button type="submit" className={styles.searchBtn} disabled={status === "processing"}>
            {status === "processing" ? (
              <span className={styles.btnLoader}><span /><span /><span /></span>
            ) : "Rastrear (Background)"}
          </button>
        </div>
      </form>

      {/* Scraper Loader Indicator */}
      {status === "processing" && (
        <div className={styles.loaderSection}>
          <div className={styles.scraperSpinner} />
          <p className={styles.loaderText}>Robô extraindo dados via Google Maps... ({results.length} leads encontrados)</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.errorBanner}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}

      {/* Tabs */}
      {(results.length > 0 || savedJobs.length > 0) && status !== "processing" && (
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${!showSaved ? styles.tabActive : ""}`}
            onClick={() => setShowSaved(false)}>Resultados da Pesquisa ({results.length})</button>
          <button className={`${styles.tab} ${showSaved ? styles.tabActive : ""}`}
            onClick={() => setShowSaved(true)}>Histórico Completo ({allSavedLeads.length})</button>
        </div>
      )}

      {/* Table */}
      {displayLeads.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome / Negócio</th>
                <th>Contato</th>
                <th>Status do Site</th>
                <th>Instagram</th>
                <th>Ação / Script</th>
              </tr>
            </thead>
            <tbody>
              {displayLeads.map((lead: any, i: number) => {
                const id = lead.id || `lead-${i}`;
                return (
                  <tr key={id} className={styles.tableRowFadeIn}>
                    <td className={styles.nameCell}><span className={styles.leadName}>{lead.name}</span></td>
                    <td>
                      <span className={styles.phoneCell} onClick={() => copyPhone(lead.phone, id)}>
                        {lead.phone}
                        <svg className={styles.copyIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${lead.status === "Sem Website" ? styles.badgeRed : lead.status === "Website Lento/Antigo" ? styles.badgeYellow : styles.badgeGreen}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td>
                      {lead.instagram ? (
                        <a href={lead.instagram} target="_blank" className={styles.igLink}>Ver IG ↗</a>
                      ) : (
                        <span className={styles.noData}>—</span>
                      )}
                    </td>
                    <td>
                      {lead.recommendedScriptId ? (
                        <button className={styles.actionBtn} onClick={() => openSuggestedScript(lead.recommendedScriptId, lead.name)}>
                          ✨ Usar Script
                        </button>
                      ) : (
                        <button className={styles.copyBtn} onClick={() => copyPhone(lead.phone, id)}>
                           Copiar N.º
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {status === "idle" && results.length === 0 && savedJobs.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📡</span>
          <p className={styles.emptyTitle}>Nenhum lead encontrado ainda</p>
          <p className={styles.emptyText}>Faça sua primeira busca para começar a prospectar com inteligência.</p>
        </div>
      )}

      {/* Modal - Suggested Script */}
      {suggestedScript && (
        <>
          <div className={styles.modalBackdrop} onClick={() => setSuggestedScript(null)} />
          <div className={styles.modal} style={{ maxWidth: 600 }}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: "1.5rem" }}>{suggestedScript.icon || "📝"}</span>
                <h2 className={styles.modalTitle}>{suggestedScript.title}</h2>
              </div>
              <button className={styles.modalClose} onClick={() => setSuggestedScript(null)}>✕</button>
            </div>
            <div className={styles.modalBody} style={{ padding: "24px" }}>
              <p style={{ color: "var(--text-tertiary)", marginBottom: 16, fontSize: "0.9rem" }}>
                O sistema já substituiu o nome da empresa automaticamente. Copie e envie no WhatsApp.
              </p>
              <pre style={{ 
                fontFamily: "var(--font-sans)", whiteSpace: "pre-wrap", 
                background: "var(--bg-glass)", padding: 16, borderRadius: 8,
                border: "1px solid var(--border-default)", fontSize: "0.95rem", lineHeight: 1.6
              }}>
                {suggestedScript.content}
              </pre>
            </div>
            <div className={styles.modalFooter} style={{ padding: "0 24px 24px", display: "flex", gap: 12 }}>
              <button className={`${styles.searchBtn} ${copiedId === "script" ? styles.copied : ""}`} 
                style={{ width: "100%" }} onClick={() => copyScript(suggestedScript.content)}>
                {copiedId === "script" ? "✓ Copiado" : "Copiar Script"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
