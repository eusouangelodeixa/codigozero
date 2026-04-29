"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./disparador.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Contact { phone: string; name: string; selected?: boolean; source?: string; variables?: Record<string, string>; }
interface DispatchLog { id: string; phone: string; contactName?: string; message: string; status: string; error?: string; createdAt: string; }

export default function DisparadorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Message state
  const [scripts, setScripts] = useState<any[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [message, setMessage] = useState("");

  // Contacts state
  const [contactTab, setContactTab] = useState<"radar" | "manual">("radar");
  const [radarLeads, setRadarLeads] = useState<Contact[]>([]);
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualVars, setManualVars] = useState<Record<string, string>>({});
  const [bulkInput, setBulkInput] = useState("");

  // Detect variables from message
  const detectedVars = Array.from(new Set((message.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ''))));
  const extraVars = detectedVars.filter(v => !['nome', 'telefone'].includes(v));

  // Dispatch state
  const [dispatching, setDispatching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dispatchResult, setDispatchResult] = useState<{ sent: number; failed: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // History
  const [history, setHistory] = useState<DispatchLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load scripts
  useEffect(() => {
    fetch(`${API}/api/cofre/scripts`, { headers: hdr() })
      .then(r => r.json())
      .then(data => {
        const allScripts: any[] = [];
        (data.folders || []).forEach((f: any) => {
          (f.scripts || []).forEach((s: any) => {
            allScripts.push({ ...s, folderName: f.name });
          });
        });
        setScripts(allScripts);
      })
      .catch(() => {});
  }, []);

  // Load radar leads
  useEffect(() => {
    fetch(`${API}/api/radar/leads`, { headers: hdr() })
      .then(r => r.json())
      .then(data => {
        const leads = (data.leads || []).map((l: any) => ({
          phone: l.phone,
          name: l.name,
          selected: false,
          source: "radar",
        }));
        setRadarLeads(leads);
      })
      .catch(() => {});
  }, []);

  // Load history
  const loadHistory = useCallback(() => {
    fetch(`${API}/api/radar/dispatch-history`, { headers: hdr() })
      .then(r => r.json())
      .then(data => setHistory(data.logs || []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Pre-fill from URL params (from Radar redirect)
  useEffect(() => {
    const leadPhone = searchParams.get("lead");
    const scriptId = searchParams.get("script");

    if (scriptId && scripts.length > 0) {
      const script = scripts.find(s => s.id === scriptId);
      if (script) {
        setSelectedScriptId(scriptId);
        setMessage(script.content);
      }
    }

    if (leadPhone && radarLeads.length > 0) {
      setRadarLeads(prev => prev.map(l =>
        l.phone === leadPhone ? { ...l, selected: true } : l
      ));
    }
  }, [searchParams, scripts, radarLeads.length]);

  // Script selection
  const handleScriptChange = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    if (scriptId) {
      const script = scripts.find(s => s.id === scriptId);
      if (script) setMessage(script.content);
    }
  };

  // Contact selection
  const toggleRadarLead = (index: number) => {
    setRadarLeads(prev => prev.map((l, i) => i === index ? { ...l, selected: !l.selected } : l));
  };

  const selectAllRadar = () => setRadarLeads(prev => prev.map(l => ({ ...l, selected: true })));
  const clearRadarSelection = () => setRadarLeads(prev => prev.map(l => ({ ...l, selected: false })));

  const toggleManualContact = (index: number) => {
    setManualContacts(prev => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c));
  };

  const addManualContact = () => {
    if (!manualPhone.trim()) return;
    setManualContacts(prev => [
      ...prev,
      { phone: manualPhone.trim(), name: manualName.trim() || manualPhone.trim(), selected: true, source: "manual", variables: { ...manualVars } }
    ]);
    setManualName("");
    setManualPhone("");
    setManualVars({});
  };

  const addBulkContacts = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.trim().split("\n").filter(l => l.trim());
    const firstLine = lines[0];
    const hasHeader = firstLine.toLowerCase().includes('nome') || firstLine.toLowerCase().includes('phone');
    const headers = hasHeader ? firstLine.split(',').map(h => h.trim().toLowerCase()) : [];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const newContacts: Contact[] = dataLines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      if (headers.length > 0) {
        const vars: Record<string, string> = {};
        headers.forEach((h, idx) => { if (parts[idx]) vars[h] = parts[idx]; });
        return { phone: vars.telefone || vars.phone || parts[1] || parts[0], name: vars.nome || vars.name || parts[0], selected: true, source: 'manual', variables: vars };
      }
      return { phone: parts[1] || parts[0], name: parts[0], selected: true, source: 'manual' };
    });
    setManualContacts(prev => [...prev, ...newContacts]);
    setBulkInput('');
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const newContacts: Contact[] = lines.slice(1).map(line => {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const vars: Record<string, string> = {};
        headers.forEach((h, idx) => { if (parts[idx]) vars[h] = parts[idx]; });
        return { phone: vars.telefone || vars.phone || parts[1] || parts[0], name: vars.nome || vars.name || parts[0], selected: true, source: 'csv', variables: vars };
      });
      setManualContacts(prev => [...prev, ...newContacts]);
      setContactTab('manual');
      showToast(`✅ ${newContacts.length} contato(s) importados do CSV`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Get all selected contacts
  const selectedContacts = [
    ...radarLeads.filter(l => l.selected),
    ...manualContacts.filter(c => c.selected),
  ];

  // Preview message with sample data
  const previewMessage = () => {
    const sample = selectedContacts[0] || { name: "João", phone: "+258 84 123 4567", variables: {} };
    let preview = message
      .replace(/\{\{nome\}\}/gi, sample.name || "")
      .replace(/\{\{telefone\}\}/gi, sample.phone || "");
    // Replace all custom variables
    if (sample.variables) {
      Object.entries(sample.variables).forEach(([key, val]) => {
        preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), val);
      });
    }
    return preview;
  };

  // Insert variable at cursor
  const insertVariable = (variable: string) => {
    setMessage(prev => prev + `{{${variable}}}`);
  };

  // Dispatch
  const handleDispatch = async () => {
    if (selectedContacts.length === 0 || !message.trim()) {
      showToast("Selecione contatos e escreva uma mensagem", "error");
      return;
    }

    // Pre-check Komunika
    try {
      const meRes = await fetch(`${API}/api/auth/me`, { headers: hdr() });
      const meData = await meRes.json();
      if (!meData.user?.komunikaApiKey || !meData.user?.komunikaInstanceId) {
        showToast("⚠️ Configure sua integração Komunika primeiro", "error");
        setTimeout(() => router.push("/integracoes?setup=komunika"), 800);
        return;
      }
    } catch { }

    setDispatching(true);
    setProgress({ current: 0, total: selectedContacts.length });
    setDispatchResult(null);

    try {
      const res = await fetch(`${API}/api/radar/dispatch`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          contacts: selectedContacts.map(c => ({ phone: c.phone, name: c.name, variables: c.variables || {} })),
          message: message,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setDispatchResult({ sent: data.sent, failed: data.failed });
        setProgress({ current: data.total, total: data.total });
        showToast(`✅ ${data.sent} mensagem(ns) enviada(s)!`);
        loadHistory();
      } else {
        if (data.error === "KOMUNIKA_NOT_CONFIGURED") {
          showToast("⚠️ Configure o Komunika primeiro", "error");
          setTimeout(() => router.push("/integracoes?setup=komunika"), 800);
        } else {
          showToast(data.error || "Erro ao disparar", "error");
        }
      }
    } catch {
      showToast("Erro de conexão", "error");
    }
    setDispatching(false);
  };

  return (
    <div className={styles.page}>
      <span className={styles.sectionLabel}>Disparador / Central de Prospecção</span>
      <h1 className={styles.sectionTitle}>Disparador</h1>
      <p className={styles.sectionDescription}>
        Envie mensagens personalizadas via WhatsApp para seus leads
      </p>

      <div className={styles.layout}>
        {/* ══ Left: Message Editor ══ */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>📝 Mensagem</div>

          <select
            className={styles.scriptSelect}
            value={selectedScriptId}
            onChange={e => handleScriptChange(e.target.value)}
          >
            <option value="">Selecione um script ou escreva manualmente...</option>
            {scripts.map(s => (
              <option key={s.id} value={s.id}>
                {s.folderName} → {s.title}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 12, flex: 1, display: "flex", flexDirection: "column" }}>
            <textarea
              className={styles.messageEditor}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={`Escreva sua mensagem aqui...\n\nUse variáveis como {{nome}} e {{telefone}} para personalizar.\n\nExemplo:\nOlá {{nome}}, tudo bem?\nVi que seu negócio pode se beneficiar de...`}
            />

            <div className={styles.variableHint}>
              <span style={{ fontSize: 11, color: "#666", marginRight: 4 }}>Variáveis:</span>
              {["nome", "telefone", "empresa", "cidade", "produto", "negocio"].map(v => (
                <button key={v} className={styles.variableTag} onClick={() => insertVariable(v)}>
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            {extraVars.length > 0 && (
              <div style={{ fontSize: 11, color: "#2DD4BF", marginTop: 4 }}>
                ℹ️ Variáveis detectadas: {detectedVars.join(", ")} — preencha nos contatos
              </div>
            )}

            {message && (
              <div className={styles.charCount}>
                {message.length} caracteres
              </div>
            )}
          </div>

          {/* Preview */}
          {message && selectedContacts.length > 0 && (
            <div style={{
              marginTop: 12, padding: 12, borderRadius: 8,
              background: "rgba(45,212,191,0.04)", border: "1px solid rgba(45,212,191,0.1)",
              fontSize: 12, color: "#aaa", lineHeight: 1.6, whiteSpace: "pre-wrap",
            }}>
              <span style={{ fontSize: 10, color: "#2DD4BF", fontWeight: 600, display: "block", marginBottom: 6 }}>
                PREVIEW (1º contato)
              </span>
              {previewMessage()}
            </div>
          )}
        </div>

        {/* ══ Right: Contacts ══ */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>👥 Contatos</div>

          <div className={styles.tabs}>
            <button className={`${styles.tab} ${contactTab === "radar" ? styles.tabActive : ""}`}
              onClick={() => setContactTab("radar")}>
              Leads do Radar ({radarLeads.length})
            </button>
            <button className={`${styles.tab} ${contactTab === "manual" ? styles.tabActive : ""}`}
              onClick={() => setContactTab("manual")}>
              Manual ({manualContacts.length})
            </button>
          </div>

          {contactTab === "radar" ? (
            <>
              {radarLeads.length > 0 ? (
                <div className={styles.contactList}>
                  {radarLeads.map((lead, i) => (
                    <div key={i}
                      className={`${styles.contactRow} ${lead.selected ? styles.contactRowSelected : ""}`}
                      onClick={() => toggleRadarLead(i)}>
                      <input type="checkbox" checked={lead.selected || false}
                        onChange={() => {}} className={styles.contactCheckbox} />
                      <span className={styles.contactName}>{lead.name}</span>
                      <span className={styles.contactPhone}>{lead.phone}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>🔍</span>
                  <p>Nenhum lead encontrado. Use o Radar para capturar leads.</p>
                </div>
              )}

              {radarLeads.length > 0 && (
                <div className={styles.selectActions}>
                  <div className={styles.selectedCount}>
                    <span className={styles.selectedBadge}>{radarLeads.filter(l => l.selected).length}</span>
                    selecionados
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className={styles.selectBtn} onClick={selectAllRadar}>Selecionar todos</button>
                    <button className={styles.selectBtn} onClick={clearRadarSelection}>Limpar</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Add single */}
              <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Nome</label>
                  <input className={styles.manualInput} placeholder="João Silva"
                    value={manualName} onChange={e => setManualName(e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Telefone</label>
                  <input className={styles.manualInput} placeholder="+258 84 123 4567"
                    value={manualPhone} onChange={e => setManualPhone(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addManualContact()} />
                </div>
              </div>

              {/* Dynamic variable fields */}
              {extraVars.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {extraVars.map(v => (
                    <div key={v} style={{ flex: 1, minWidth: 120 }}>
                      <label style={{ fontSize: 11, color: "#2DD4BF", display: "block", marginBottom: 4 }}>
                        {`{{${v}}}`}
                      </label>
                      <input className={styles.manualInput}
                        placeholder={v.charAt(0).toUpperCase() + v.slice(1)}
                        value={manualVars[v] || ""}
                        onChange={e => setManualVars(prev => ({ ...prev, [v]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}

              <button className={styles.addBtn} onClick={addManualContact}
                style={{ alignSelf: "flex-start" }}>+ Adicionar contato</button>

              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: "#aaa", fontWeight: 500 }}>📁 Importar CSV</label>
                  <label className={styles.addBtn} style={{ cursor: "pointer", fontSize: 11 }}>
                    Escolher arquivo
                    <input type="file" accept=".csv,.txt" onChange={handleCsvUpload}
                      style={{ display: "none" }} />
                  </label>
                </div>
                <p style={{ fontSize: 11, color: "#666", lineHeight: 1.5 }}>
                  Formato: primeira linha com cabeçalhos (nome, telefone, empresa, cidade...), dados abaixo.
                </p>
              </div>

              {/* Bulk paste */}
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>
                  Colar em lote (com cabeçalho: nome,telefone,empresa...)
                </label>
                <textarea className={styles.manualTextarea}
                  placeholder={`nome,telefone,empresa\nJoão,+258841234567,Loja X\nMaria,+258851234567,Café Y`}
                  value={bulkInput} onChange={e => setBulkInput(e.target.value)} />
                {bulkInput.trim() && (
                  <button className={styles.addBtn} style={{ marginTop: 8 }} onClick={addBulkContacts}>
                    Adicionar {bulkInput.trim().split("\n").filter(l => l.trim()).length - 1} contato(s)
                  </button>
                )}
              </div>

              {/* Manual contact list */}
              {manualContacts.length > 0 && (
                <div className={styles.contactList}>
                  {manualContacts.map((c, i) => (
                    <div key={i}
                      className={`${styles.contactRow} ${c.selected ? styles.contactRowSelected : ""}`}
                      onClick={() => toggleManualContact(i)}
                      style={{ flexWrap: "wrap" }}>
                      <input type="checkbox" checked={c.selected || false}
                        onChange={() => {}} className={styles.contactCheckbox} />
                      <span className={styles.contactName}>{c.name}</span>
                      <span className={styles.contactPhone}>{c.phone}</span>
                      {c.variables && Object.keys(c.variables).filter(k => !['nome', 'name', 'telefone', 'phone'].includes(k)).length > 0 && (
                        <div style={{ width: "100%", paddingLeft: 26, display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                          {Object.entries(c.variables).filter(([k]) => !['nome', 'name', 'telefone', 'phone'].includes(k)).map(([k, v]) => (
                            <span key={k} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(45,212,191,0.06)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.12)" }}>
                              {k}: {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ Dispatch Footer ══ */}
      <div className={styles.footer}>
        <button
          className={styles.dispatchBtn}
          disabled={dispatching || selectedContacts.length === 0 || !message.trim()}
          onClick={handleDispatch}
        >
          {dispatching ? (
            <>⏳ Enviando...</>
          ) : (
            <>🚀 Disparar ({selectedContacts.length} contato{selectedContacts.length !== 1 ? "s" : ""})</>
          )}
        </button>

        {dispatching && (
          <>
            <div className={styles.progressBar}>
              <div className={styles.progressFill}
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
            </div>
            <span className={styles.progressText}>{progress.current}/{progress.total}</span>
          </>
        )}

        {dispatchResult && !dispatching && (
          <div className={styles.resultsSummary}>
            <span className={styles.resultSuccess}>✅ {dispatchResult.sent} enviada(s)</span>
            {dispatchResult.failed > 0 && (
              <span className={styles.resultFail}>❌ {dispatchResult.failed} falha(s)</span>
            )}
          </div>
        )}
      </div>

      {/* ══ History ══ */}
      <div className={styles.historySection}>
        <button
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
          style={{
            background: "none", border: "none", color: "#888", fontSize: 13,
            cursor: "pointer", padding: "8px 0", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          📜 Histórico de Envios ({history.length})
          <span style={{ transform: showHistory ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
        </button>

        {showHistory && history.length > 0 && (
          <>
            {/* Desktop Table */}
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Mensagem</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {history.map(log => (
                  <tr key={log.id}>
                    <td>{log.contactName || "—"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{log.phone}</td>
                    <td><span className={styles.msgPreview} title={log.message}>{log.message}</span></td>
                    <td>
                      <span className={log.status === "sent" ? styles.statusSent : styles.statusFailed}>
                        {log.status === "sent" ? "✅ Enviado" : `❌ ${log.error || "Falha"}`}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Cards */}
            <div className={styles.historyCards}>
              {history.map(log => (
                <div key={log.id} className={styles.historyCard}>
                  <div className={styles.historyCardHeader}>
                    <span className={styles.historyCardName}>{log.contactName || log.phone}</span>
                    <span className={log.status === "sent" ? styles.statusSent : styles.statusFailed}>
                      {log.status === "sent" ? "✅" : "❌"}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "#666" }}>
                    {new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className={styles.historyCardMsg}>{log.message}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {showHistory && history.length === 0 && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <p>Nenhum envio registrado ainda.</p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
