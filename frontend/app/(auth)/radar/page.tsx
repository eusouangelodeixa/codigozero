"use client";
import { useState, useEffect } from "react";
import { useRadar } from "@/hooks/useRadar";
import { apiClient } from "@/lib/api";
import styles from "./radar.module.css";

export default function RadarPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [savedLeads, setSavedLeads] = useState<any[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { status, progress, results, error, remaining, startSearch } = useRadar();

  useEffect(() => { loadSavedLeads(); }, []);

  useEffect(() => {
    if (status === "completed" && results.length > 0) loadSavedLeads();
  }, [status, results]);

  const loadSavedLeads = async () => {
    try { const data = await apiClient.getLeads(); setSavedLeads(data.leads); } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !location.trim()) return;
    setShowSaved(false);
    startSearch(query.trim(), location.trim());
  };

  const copyPhone = async (phone: string, id: string) => {
    try { await navigator.clipboard.writeText(phone); } catch {
      const el = document.createElement("textarea"); el.value = phone;
      document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const displayLeads = showSaved ? savedLeads : results;

  return (
    <div className={styles.page}>
      {/* Section Header */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>O Radar</span>
        <h1 className={styles.sectionTitle}>Encontre seus leads em segundos</h1>
        <p className={styles.sectionDescription}>
          Informe o nicho e a localização. O sistema faz o resto.
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
              placeholder="Advogados, Dentistas, Restaurantes..." className={styles.input} required />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Localização</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Maputo, Beira, Nampula..." className={styles.input} required />
          </div>
          <button type="submit" className={styles.searchBtn} disabled={status === "processing"}>
            {status === "processing" ? (
              <span className={styles.btnLoader}><span /><span /><span /></span>
            ) : "Rastrear"}
          </button>
        </div>
      </form>

      {/* Scraper Loader */}
      {status === "processing" && (
        <div className={styles.loaderSection}>
          <div className={styles.scraperSpinner} />
          <p className={styles.loaderText}>Rastreando leads</p>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.progressText}>{progress}%</p>
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
      {(results.length > 0 || savedLeads.length > 0) && status !== "processing" && (
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${!showSaved ? styles.tabActive : ""}`}
            onClick={() => setShowSaved(false)}>Resultados ({results.length})</button>
          <button className={`${styles.tab} ${showSaved ? styles.tabActive : ""}`}
            onClick={() => setShowSaved(true)}>Todos os Leads ({savedLeads.length})</button>
        </div>
      )}

      {/* Table */}
      {displayLeads.length > 0 && status !== "processing" && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr><th>Nome</th><th>Telefone</th><th>Avaliação</th><th>Endereço</th><th></th></tr>
            </thead>
            <tbody>
              {displayLeads.map((lead: any, i: number) => {
                const id = lead.id || `lead-${i}`;
                return (
                  <tr key={id}>
                    <td className={styles.nameCell}><span className={styles.leadName}>{lead.name}</span></td>
                    <td>
                      <span className={styles.phoneCell} onClick={() => copyPhone(lead.phone, id)}>
                        {lead.phone}
                        <svg className={styles.copyIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </span>
                    </td>
                    <td>{lead.rating ? <span className={styles.rating}>⭐ {lead.rating}</span> : <span className={styles.noData}>—</span>}</td>
                    <td className={styles.addressCell}><span className={styles.address}>{lead.address || "—"}</span></td>
                    <td>
                      <button className={`${styles.copyBtn} ${copiedId === id ? styles.copied : ""}`}
                        onClick={() => copyPhone(lead.phone, id)}>
                        {copiedId === id ? "✓ Copiado" : "Copiar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty */}
      {status === "idle" && results.length === 0 && savedLeads.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📡</span>
          <p className={styles.emptyTitle}>Nenhum lead encontrado ainda</p>
          <p className={styles.emptyText}>Faça sua primeira busca para começar a prospectar.</p>
        </div>
      )}
    </div>
  );
}
