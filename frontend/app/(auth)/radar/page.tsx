"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRadar } from "@/hooks/useRadar";
import { apiClient } from "@/lib/api";
import styles from "./radar.module.css";

export default function RadarPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dispatchToast, setDispatchToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Script Modal state
  const [scriptsFolders, setScriptsFolders] = useState<any[]>([]);
  const [suggestedScript, setSuggestedScript] = useState<any | null>(null);
  const [selectedLead, setSelectedLead] = useState<any>(null);

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

  const openSuggestedScript = (scriptId: string, lead: any) => {
    setSelectedLead(lead);
    let scriptFound = null;
    
    // Se não tivermos um scriptId recomendado (ou o script não existir mais), tentar usar o primeiro disponível
    if (!scriptId && scriptsFolders.length > 0 && scriptsFolders[0].scripts?.length > 0) {
      scriptFound = scriptsFolders[0].scripts[0];
    } else {
      for (const folder of scriptsFolders) {
        const s = folder.scripts?.find((script: any) => script.id === scriptId);
        if (s) { scriptFound = s; break; }
      }
    }

    if (scriptFound) {
      const content = scriptFound.content.replace(/\{\{empresa\}\}/g, lead.name);
      setSuggestedScript({ ...scriptFound, content });
    } else {
      // Se ainda não achou nada (talvez Cofre vazio), mostra erro
      if (scriptsFolders.length === 0) {
        alert("O seu Cofre de scripts está vazio. Crie scripts primeiro.");
      } else {
        alert("Script não encontrado no Cofre.");
      }
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

  const exportCsv = () => {
    if (displayLeads.length === 0) return;
    const headers = ['nome', 'telefone', 'status', 'endereco', 'website', 'instagram'];
    const rows = displayLeads.map((l: any) => [
      (l.name || '').replace(/,/g, ' '),
      l.phone || '',
      (l.status || '').replace(/,/g, ' '),
      (l.address || '').replace(/,/g, ' '),
      l.website || '',
      l.instagram || '',
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${!showSaved ? styles.tabActive : ""}`}
              onClick={() => setShowSaved(false)}>Resultados da Pesquisa ({results.length})</button>
            <button className={`${styles.tab} ${showSaved ? styles.tabActive : ""}`}
              onClick={() => setShowSaved(true)}>Histórico Completo ({allSavedLeads.length})</button>
          </div>
          {displayLeads.length > 0 && (
            <button onClick={exportCsv} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.15)",
              color: "#2DD4BF", cursor: "pointer", transition: "opacity 0.15s",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              📥 Exportar CSV
            </button>
          )}
        </div>
      )}

      {/* Table (Desktop) + Cards (Mobile) */}
      {displayLeads.length > 0 && (
        <>
          {/* Desktop Table */}
          <div className={styles.tableWrapper} style={{ display: "var(--radar-desktop, block)" }}>
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
                        <button className={styles.actionBtn} onClick={() => openSuggestedScript(lead.recommendedScriptId, lead)}>
                           ✨ Usar Script
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className={styles.mobileCards}>
            {displayLeads.map((lead: any, i: number) => {
              const id = lead.id || `lead-${i}`;
              return (
                <div key={id} className={styles.leadCard}>
                  <div className={styles.leadCardHeader}>
                    <span className={styles.leadName}>{lead.name}</span>
                    <span className={`${styles.badge} ${lead.status === "Sem Website" ? styles.badgeRed : lead.status === "Website Lento/Antigo" ? styles.badgeYellow : styles.badgeGreen}`}>
                      {lead.status}
                    </span>
                  </div>
                  <div className={styles.leadCardBody}>
                    <span className={styles.phoneCell} onClick={() => copyPhone(lead.phone, id)}>
                      📞 {lead.phone}
                      {copiedId === id && <span style={{ color: "var(--color-success)", fontSize: 11, marginLeft: 4 }}>✓</span>}
                    </span>
                    {lead.instagram && (
                      <a href={lead.instagram} target="_blank" className={styles.igLink}>📷 Instagram ↗</a>
                    )}
                  </div>
                  <button className={styles.actionBtn} style={{ width: "100%", justifyContent: "center" }}
                    onClick={() => openSuggestedScript(lead.recommendedScriptId, lead)}>
                    ✨ Usar Script
                  </button>
                </div>
              );
            })}
          </div>
        </>
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
            <div className={styles.modalHeader} style={{ flexWrap: "wrap", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "1.5rem" }}>{suggestedScript.icon || "📝"}</span>
                  <h2 className={styles.modalTitle}>Script de Abordagem</h2>
                </div>
                <button className={styles.modalClose} onClick={() => setSuggestedScript(null)}>✕</button>
              </div>

              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
                 <label style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", fontWeight: 500 }}>Selecione o Script a utilizar</label>
                 <select 
                    value={suggestedScript.id}
                    onChange={(e) => openSuggestedScript(e.target.value, selectedLead)}
                    style={{ 
                      background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', 
                      border: '1px solid var(--border-default)', padding: '10px 12px', 
                      borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', outline: 'none' 
                    }}
                 >
                    {scriptsFolders.map(folder => (
                       <optgroup key={folder.id} label={folder.icon + " " + folder.name}>
                         {folder.scripts?.map((script: any) => (
                            <option key={script.id} value={script.id}>{script.title}</option>
                         ))}
                       </optgroup>
                    ))}
                 </select>
              </div>
            </div>

            <div className={styles.modalBody} style={{ padding: "24px", paddingTop: "16px" }}>
              <p style={{ color: "var(--text-tertiary)", marginBottom: 16, fontSize: "0.9rem" }}>
                O sistema já substituiu as variáveis como <strong>{`{{empresa}}`}</strong> automaticamente. Copie e envie no WhatsApp.
              </p>
              <pre style={{ 
                fontFamily: "var(--font-sans)", whiteSpace: "pre-wrap", 
                background: "var(--bg-glass)", padding: 16, borderRadius: 8,
                border: "1px solid var(--border-default)", fontSize: "0.95rem", lineHeight: 1.6
              }}>
                {suggestedScript.content}
              </pre>
            </div>
            <div className={styles.modalFooter} style={{ padding: "0 24px 24px", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className={`${styles.searchBtn} ${copiedId === "script" ? styles.copied : ""}`} 
                style={{ flex: 1, justifyContent: "center", minWidth: 140 }} onClick={() => copyScript(suggestedScript.content)}>
                {copiedId === "script" ? "✓ Copiado" : "Copiar Texto"}
              </button>
              
              <button 
                className={styles.searchBtn} 
                style={{ flex: 1, justifyContent: "center", minWidth: 140, background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff" }} 
                onClick={() => {
                  router.push(`/disparador?lead=${encodeURIComponent(selectedLead.phone)}&script=${suggestedScript.id}`);
                }}
              >
                🚀 Enviar pelo Disparador
              </button>
            </div>
          </div>
        </>
      )}
      {/* Dispatch Toast */}
      {dispatchToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: dispatchToast.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${dispatchToast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: dispatchToast.type === "success" ? "#22c55e" : "#ef4444",
          fontSize: 13, fontWeight: 500, backdropFilter: "blur(10px)",
          animation: "slideUp 0.3s ease-out",
        }}>
          {dispatchToast.msg}
        </div>
      )}
    </div>
  );
}
