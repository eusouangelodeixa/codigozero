"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Textarea,
  Select,
  Tabs,
  EmptyState,
  Badge,
  useToast,
} from "@/components/ui";
import { DisparadorIcon } from "@/components/Icons";
import styles from "./disparador.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface Contact {
  phone: string;
  name: string;
  selected?: boolean;
  source?: string;
  variables?: Record<string, string>;
}

interface Script {
  id: string;
  title: string;
  content: string;
  folderName?: string;
}

interface DispatchLog {
  id: string;
  phone: string;
  contactName?: string;
  message: string;
  status: string;
  error?: string;
  createdAt: string;
}

interface KomunikaFunnel { id: string; name: string; }
interface KomunikaInfo {
  configured: boolean;
  instanceStatus?: { status?: string; phone?: string };
  funnels?: KomunikaFunnel[];
}

const ChevronDown = (p: { size?: number; className?: string }) => (
  <svg className={p.className} width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XCircle = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const PaperclipIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.48" />
  </svg>
);

const SendIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const HistoryIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const DEFAULT_VAR_FIELDS = ["empresa", "cidade", "produto", "negocio"];
const QUICK_VARS = ["nome", "telefone", "empresa", "cidade", "produto"];

export default function DisparadorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [message, setMessage] = useState("");

  const [contactTab, setContactTab] = useState<"radar" | "manual">("radar");
  const [radarLeads, setRadarLeads] = useState<Contact[]>([]);
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualVars, setManualVars] = useState<Record<string, string>>({});
  const [bulkInput, setBulkInput] = useState("");

  const detectedVars = useMemo(
    () => Array.from(new Set((message.match(/\{\{(\w+)\}\}/g) || []).map((v) => v.replace(/[{}]/g, "")))),
    [message]
  );
  const extraVars = detectedVars.filter((v) => !["nome", "telefone"].includes(v));

  const [dispatching, setDispatching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [dispatchResult, setDispatchResult] = useState<{ sent: number; failed: number } | null>(null);

  const [komunikaInfo, setKomunikaInfo] = useState<KomunikaInfo | null>(null);
  const [dispatchMode, setDispatchMode] = useState<"message" | "funnel">("message");
  const [msgType, setMsgType] = useState<"text" | "document">("text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedFunnel, setSelectedFunnel] = useState("");

  const [history, setHistory] = useState<DispatchLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const hdr = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
      "Content-Type": "application/json",
    }),
    []
  );

  useEffect(() => {
    fetch(`${API}/api/cofre/scripts`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        const all: Script[] = [];
        (data.folders || []).forEach((f: { name: string; scripts?: Script[] }) => {
          (f.scripts || []).forEach((s) => all.push({ ...s, folderName: f.name }));
        });
        setScripts(all);
      })
      .catch(() => {});
  }, [hdr]);

  useEffect(() => {
    fetch(`${API}/api/radar/leads`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        const leads: Contact[] = (data.leads || []).map((l: { phone: string; name: string }) => ({
          phone: l.phone,
          name: l.name,
          selected: false,
          source: "radar",
        }));
        setRadarLeads(leads);
      })
      .catch(() => {});
  }, [hdr]);

  useEffect(() => {
    fetch(`${API}/api/radar/komunika-info`, { headers: hdr() })
      .then((r) => r.json())
      .then((data: KomunikaInfo) => {
        setKomunikaInfo(data);
        if (data.funnels && data.funnels.length > 0) setSelectedFunnel(data.funnels[0].id);
      })
      .catch(() => {});
  }, [hdr]);

  const loadHistory = useCallback(() => {
    fetch(`${API}/api/radar/dispatch-history`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => setHistory(data.logs || []))
      .catch(() => {});
  }, [hdr]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const leadPhone = searchParams.get("lead");
    const scriptId = searchParams.get("script");
    if (scriptId && scripts.length > 0) {
      const script = scripts.find((s) => s.id === scriptId);
      if (script) {
        setSelectedScriptId(scriptId);
        setMessage(script.content);
      }
    }
    if (leadPhone && radarLeads.length > 0) {
      setRadarLeads((prev) =>
        prev.map((l) => (l.phone === leadPhone ? { ...l, selected: true } : l))
      );
    }
  }, [searchParams, scripts, radarLeads.length]);

  const handleScriptChange = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    if (scriptId) {
      const script = scripts.find((s) => s.id === scriptId);
      if (script) setMessage(script.content);
    }
  };

  const toggleRadarLead = (index: number) => {
    setRadarLeads((prev) => prev.map((l, i) => (i === index ? { ...l, selected: !l.selected } : l)));
  };
  const selectAllRadar = () => setRadarLeads((prev) => prev.map((l) => ({ ...l, selected: true })));
  const clearRadarSelection = () => setRadarLeads((prev) => prev.map((l) => ({ ...l, selected: false })));
  const toggleManualContact = (index: number) => {
    setManualContacts((prev) => prev.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c)));
  };

  const addManualContact = () => {
    if (!manualPhone.trim()) return;
    setManualContacts((prev) => [
      ...prev,
      {
        phone: manualPhone.trim(),
        name: manualName.trim() || manualPhone.trim(),
        selected: true,
        source: "manual",
        variables: { ...manualVars },
      },
    ]);
    setManualName("");
    setManualPhone("");
    setManualVars({});
  };

  const addBulkContacts = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.trim().split("\n").filter((l) => l.trim());
    const firstLine = lines[0];
    const hasHeader = firstLine.toLowerCase().includes("nome") || firstLine.toLowerCase().includes("phone");
    const headers = hasHeader ? firstLine.split(",").map((h) => h.trim().toLowerCase()) : [];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const newContacts: Contact[] = dataLines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      if (headers.length > 0) {
        const vars: Record<string, string> = {};
        headers.forEach((h, idx) => {
          if (parts[idx]) vars[h] = parts[idx];
        });
        return {
          phone: vars.telefone || vars.phone || parts[1] || parts[0],
          name: vars.nome || vars.name || parts[0],
          selected: true,
          source: "manual",
          variables: vars,
        };
      }
      return { phone: parts[1] || parts[0], name: parts[0], selected: true, source: "manual" };
    });
    setManualContacts((prev) => [...prev, ...newContacts]);
    setBulkInput("");
  };

  const handleCsvUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const newContacts: Contact[] = lines.slice(1).map((line) => {
        const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
        const vars: Record<string, string> = {};
        headers.forEach((h, idx) => {
          if (parts[idx]) vars[h] = parts[idx];
        });
        return {
          phone: vars.telefone || vars.phone || parts[1] || parts[0],
          name: vars.nome || vars.name || parts[0],
          selected: true,
          source: "csv",
          variables: vars,
        };
      });
      setManualContacts((prev) => [...prev, ...newContacts]);
      setContactTab("manual");
      toast.success(`${newContacts.length} contato(s) importados do CSV`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const selectedContacts = [
    ...radarLeads.filter((l) => l.selected),
    ...manualContacts.filter((c) => c.selected),
  ];

  const previewMessage = () => {
    const sample =
      selectedContacts[0] || { name: "João", phone: "+258 84 123 4567", variables: {} as Record<string, string> };
    let preview = message
      .replace(/\{\{nome\}\}/gi, sample.name || "")
      .replace(/\{\{telefone\}\}/gi, sample.phone || "");
    if (sample.variables) {
      Object.entries(sample.variables).forEach(([key, val]) => {
        preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), val);
      });
    }
    return preview;
  };

  const insertVariable = (variable: string) =>
    setMessage((prev) => prev + `{{${variable}}}`);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    toast.info("Enviando ficheiro…");
    try {
      const res = await fetch(`${API}/api/radar/upload-media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setMediaUrl(data.url);
        toast.success("Ficheiro pronto para envio");
      } else {
        toast.error("Falha no upload", data.error || "Tente novamente");
      }
    } catch {
      toast.error("Erro de conexão", "Não foi possível enviar o ficheiro");
    }
    e.target.value = "";
  };

  const handleDispatch = async () => {
    if (selectedContacts.length === 0) {
      toast.error("Selecione pelo menos um contato");
      return;
    }
    if (dispatchMode === "message" && msgType === "text" && !message.trim()) {
      toast.error("Preencha a mensagem");
      return;
    }
    if (dispatchMode === "message" && msgType !== "text" && !mediaUrl) {
      toast.error("Aguarde o upload do ficheiro");
      return;
    }
    if (dispatchMode === "funnel" && !selectedFunnel) {
      toast.error("Selecione um funil de destino");
      return;
    }

    try {
      const meRes = await fetch(`${API}/api/auth/me`, { headers: hdr() });
      const meData = await meRes.json();
      if (!meData.user?.komunikaApiKey || !meData.user?.komunikaInstanceId) {
        toast.warning("Configure o Komunika primeiro");
        setTimeout(() => router.push("/integracoes?setup=komunika"), 800);
        return;
      }
    } catch {}

    setDispatching(true);
    setProgress({ current: 0, total: selectedContacts.length });
    setDispatchResult(null);

    try {
      const res = await fetch(`${API}/api/radar/dispatch`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          contacts: selectedContacts.map((c) => ({
            phone: c.phone,
            name: c.name,
            variables: c.variables || {},
          })),
          message: dispatchMode === "message" ? message : undefined,
          dispatchMode,
          type: msgType,
          mediaUrl: msgType !== "text" ? mediaUrl : undefined,
          funnelId: dispatchMode === "funnel" ? selectedFunnel : undefined,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setDispatchResult({ sent: data.sent, failed: data.failed });
        setProgress({ current: data.total, total: data.total });
        toast.success(`${data.sent} mensagem(ns) enviada(s)`);
        loadHistory();
      } else if (data.error === "KOMUNIKA_NOT_CONFIGURED") {
        toast.warning("Configure o Komunika primeiro");
        setTimeout(() => router.push("/integracoes?setup=komunika"), 800);
      } else {
        toast.error("Falha no disparo", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setDispatching(false);
  };

  const isConnected = komunikaInfo?.instanceStatus?.status === "connected";

  return (
    <div className={styles.page}>
      <PageHeader
        label="Operação · Disparador"
        title="Disparador"
        description="Envie mensagens personalizadas ou injete contatos em funis automáticos do Komunika."
        actions={
          komunikaInfo?.configured ? (
            <span
              className={cx(
                styles.statusBadge,
                isConnected ? styles.statusBadgeConnected : styles.statusBadgeDisconnected
              )}
            >
              <span className={styles.statusDot} />
              WhatsApp {isConnected ? "conectado" : "desconectado"}
              {isConnected && komunikaInfo?.instanceStatus?.phone && (
                <span style={{ opacity: 0.7 }}>
                  · {komunikaInfo.instanceStatus.phone.replace("@s.whatsapp.net", "")}
                </span>
              )}
            </span>
          ) : undefined
        }
      />

      <div className={styles.layout}>
        {/* ══ LEFT: Message ══ */}
        <Card padding="lg">
          <div className={styles.col}>
            <span className={styles.cardTitle}>Mensagem</span>

            <div className={styles.segment}>
              <button
                type="button"
                className={cx(styles.segmentItem, dispatchMode === "message" && styles.segmentItemActive)}
                onClick={() => setDispatchMode("message")}
              >
                Mensagem
              </button>
              <button
                type="button"
                className={cx(styles.segmentItem, dispatchMode === "funnel" && styles.segmentItemActive)}
                onClick={() => setDispatchMode("funnel")}
              >
                Injetar no funil
              </button>
            </div>

            {dispatchMode === "message" ? (
              <>
                <div className={styles.segment}>
                  <button
                    type="button"
                    className={cx(styles.segmentItem, msgType === "text" && styles.segmentItemActive)}
                    onClick={() => setMsgType("text")}
                  >
                    Texto
                  </button>
                  <button
                    type="button"
                    className={cx(styles.segmentItem, msgType === "document" && styles.segmentItemActive)}
                    onClick={() => setMsgType("document")}
                  >
                    Documento (PDF)
                  </button>
                </div>

                {msgType === "document" && (
                  <div className={styles.docUpload}>
                    <div style={{ alignSelf: "flex-start" }}>
                      <Button
                        variant="accent"
                        size="sm"
                        iconStart={<PaperclipIcon />}
                        onClick={() => docInputRef.current?.click()}
                      >
                        Carregar PDF
                      </Button>
                      <input
                        ref={docInputRef}
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileUpload}
                        style={{ display: "none" }}
                      />
                    </div>
                    {mediaUrl && (
                      <span className={styles.docReady}>
                        ✓ Anexo: {mediaUrl.split("/").pop()}
                      </span>
                    )}
                    <span className={styles.docHint}>
                      Ficheiros temporários — removidos automaticamente após o envio.
                    </span>
                  </div>
                )}

                <Select
                  label="Script do Cofre"
                  value={selectedScriptId}
                  onChange={(e) => handleScriptChange(e.target.value)}
                >
                  <option value="">Selecione um script…</option>
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.folderName ? `${s.folderName} → ` : ""}{s.title}
                    </option>
                  ))}
                </Select>

                <textarea
                  className={styles.editor}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Escreva sua mensagem${msgType !== "text" ? " (legenda)" : ""}…\n\nUse {{nome}} e {{telefone}} para personalizar.`}
                />

                <div className={styles.variableChips}>
                  <span className={styles.variableChipsLabel}>Variáveis</span>
                  {QUICK_VARS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={styles.variableChip}
                      onClick={() => insertVariable(v)}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                  {extraVars.length > 0 && (
                    <span className={styles.detectedVars}>
                      detectadas: {extraVars.join(", ")}
                    </span>
                  )}
                </div>

                {message && selectedContacts.length > 0 && (
                  <div className={styles.preview}>
                    <span className={styles.previewLabel}>Preview (1º contato)</span>
                    <span className={styles.previewText}>{previewMessage()}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: "var(--type-small)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  Escolha um funil automático configurado no seu Komunika. Os contatos selecionados entrarão neste fluxo imediatamente.
                </p>
                {komunikaInfo?.funnels?.length ? (
                  <Select
                    label="Funil de destino"
                    value={selectedFunnel}
                    onChange={(e) => setSelectedFunnel(e.target.value)}
                  >
                    {komunikaInfo.funnels.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </Select>
                ) : (
                  <div className={styles.funnelNotice}>
                    Nenhum funil encontrado no seu Komunika. Crie um lá primeiro.
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* ══ RIGHT: Contacts ══ */}
        <Card padding="lg">
          <div className={styles.col}>
            <span className={styles.cardTitle}>Contatos</span>

            <Tabs
              value={contactTab}
              onChange={(v) => setContactTab(v)}
              items={[
                { value: "radar",  label: "Leads do Radar", count: radarLeads.length },
                { value: "manual", label: "Manual",         count: manualContacts.length },
              ]}
              className={styles.contactsTabs}
            />

            {contactTab === "radar" ? (
              radarLeads.length === 0 ? (
                <EmptyState
                  compact
                  icon={<DisparadorIcon size={20} />}
                  title="Nenhum lead disponível"
                  description="Capture leads no Radar para selecioná-los aqui."
                  actions={<Button variant="secondary" onClick={() => router.push("/radar")}>Ir para o Radar</Button>}
                />
              ) : (
                <>
                  <div className={styles.contactList}>
                    {radarLeads.map((lead, i) => (
                      <div
                        key={i}
                        className={cx(styles.contactRow, lead.selected && styles.contactRowSelected)}
                        onClick={() => toggleRadarLead(i)}
                      >
                        <input
                          type="checkbox"
                          checked={lead.selected || false}
                          onChange={() => {}}
                          className={styles.contactCheckbox}
                        />
                        <span className={styles.contactName}>{lead.name}</span>
                        <span className={styles.contactPhone}>{lead.phone}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.selectActions}>
                    <span className={styles.selectedCount}>
                      <span className={styles.selectedBadge}>
                        {radarLeads.filter((l) => l.selected).length}
                      </span>
                      selecionados
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="ghost" size="sm" onClick={selectAllRadar}>Selecionar todos</Button>
                      <Button variant="ghost" size="sm" onClick={clearRadarSelection}>Limpar</Button>
                    </div>
                  </div>
                </>
              )
            ) : (
              <div className={styles.manualGroup}>
                <div className={styles.manualRow}>
                  <Input
                    label="Nome"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="João Silva"
                  />
                  <Input
                    label="Telefone"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="+258 84 123 4567"
                    onKeyDown={(e) => e.key === "Enter" && addManualContact()}
                  />
                </div>

                <div className={styles.varRow}>
                  {Array.from(new Set([...DEFAULT_VAR_FIELDS, ...extraVars])).map((v) => (
                    <Input
                      key={v}
                      label={extraVars.includes(v) ? `{{${v}}}` : v.charAt(0).toUpperCase() + v.slice(1)}
                      value={manualVars[v] || ""}
                      onChange={(e) =>
                        setManualVars((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                      placeholder="Opcional"
                      onKeyDown={(e) => e.key === "Enter" && addManualContact()}
                    />
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="accent" size="sm" onClick={addManualContact}>
                    Adicionar contato
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconStart={<PaperclipIcon />}
                    onClick={() => csvInputRef.current?.click()}
                  >
                    Importar CSV
                  </Button>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvUpload}
                    style={{ display: "none" }}
                  />
                </div>

                <div className={styles.divider} />

                <Textarea
                  label="Colar em lote (cabeçalho: nome,telefone,empresa…)"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={"nome,telefone,empresa\nJoão,+258841234567,Loja X\nMaria,+258851234567,Café Y"}
                  rows={4}
                />
                {bulkInput.trim() && (
                  <div>
                    <Button variant="accent" size="sm" onClick={addBulkContacts}>
                      Adicionar {bulkInput.trim().split("\n").filter((l) => l.trim()).length - 1} contato(s)
                    </Button>
                  </div>
                )}

                {manualContacts.length > 0 && (
                  <>
                    <div className={styles.divider} />
                    <div className={styles.contactList}>
                      {manualContacts.map((c, i) => (
                        <div
                          key={i}
                          className={cx(styles.contactRow, c.selected && styles.contactRowSelected)}
                          onClick={() => toggleManualContact(i)}
                        >
                          <input
                            type="checkbox"
                            checked={c.selected || false}
                            onChange={() => {}}
                            className={styles.contactCheckbox}
                          />
                          <span className={styles.contactName}>{c.name}</span>
                          <span className={styles.contactPhone}>{c.phone}</span>
                          {c.variables &&
                            Object.keys(c.variables).filter(
                              (k) => !["nome", "name", "telefone", "phone"].includes(k)
                            ).length > 0 && (
                              <div className={styles.contactVarChips}>
                                {Object.entries(c.variables)
                                  .filter(([k]) => !["nome", "name", "telefone", "phone"].includes(k))
                                  .map(([k, v]) => (
                                    <span key={k} className={styles.contactVarChip}>
                                      {k}: {v}
                                    </span>
                                  ))}
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ══ Dispatch footer ══ */}
      <div className={styles.dispatchFooter}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleDispatch}
          loading={dispatching}
          iconStart={<SendIcon />}
          disabled={
            selectedContacts.length === 0 ||
            (dispatchMode === "message" && msgType === "text" && !message.trim()) ||
            (dispatchMode === "message" && msgType !== "text" && !mediaUrl) ||
            (dispatchMode === "funnel" && !selectedFunnel)
          }
        >
          Disparar ({selectedContacts.length} contato{selectedContacts.length !== 1 ? "s" : ""})
        </Button>

        {dispatching && (
          <div className={styles.progressGroup}>
            <span className={styles.progressTrack}>
              <span
                className={styles.progressFill}
                style={{
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </span>
            <span className={styles.progressText}>
              {progress.current}/{progress.total}
            </span>
          </div>
        )}

        {dispatchResult && !dispatching && (
          <div className={styles.resultsSummary}>
            <Badge variant="success" size="sm"><CheckIcon /> {dispatchResult.sent} enviadas</Badge>
            {dispatchResult.failed > 0 && (
              <Badge variant="error" size="sm"><XCircle /> {dispatchResult.failed} falhas</Badge>
            )}
          </div>
        )}
      </div>

      {/* ══ History ══ */}
      <div>
        <div className={styles.historyHeader}>
          <h2 className={styles.historyTitle}>Histórico de envios</h2>
          <button
            type="button"
            className={styles.historyToggle}
            onClick={() => {
              setShowHistory((v) => !v);
              if (!showHistory) loadHistory();
            }}
          >
            <HistoryIcon />
            {showHistory ? "Ocultar" : "Mostrar"} ({history.length})
            <ChevronDown
              className={cx(styles.historyChevron, showHistory && styles.historyChevronOpen)}
            />
          </button>
        </div>

        {showHistory &&
          (history.length === 0 ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <EmptyState
                compact
                icon={<HistoryIcon size={20} />}
                title="Nenhum envio registrado"
                description="Os envios passarão a aparecer aqui após o primeiro disparo."
              />
            </div>
          ) : (
            <>
              <div className={styles.historyTableWrap} style={{ marginTop: "var(--space-3)" }}>
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
                    {history.map((log) => (
                      <tr key={log.id}>
                        <td>{log.contactName || "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{log.phone}</td>
                        <td><span className={styles.msgPreview} title={log.message}>{log.message}</span></td>
                        <td>
                          {log.status === "sent" ? (
                            <span className={styles.statusSent}><CheckIcon /> Enviado</span>
                          ) : (
                            <span className={styles.statusFailed}><XCircle /> {log.error || "Falha"}</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {new Date(log.createdAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.historyCards} style={{ marginTop: "var(--space-3)" }}>
                {history.map((log) => (
                  <div key={log.id} className={styles.historyCard}>
                    <div className={styles.historyCardHead}>
                      <span className={styles.historyCardName}>{log.contactName || log.phone}</span>
                      {log.status === "sent" ? (
                        <span className={styles.statusSent}><CheckIcon /></span>
                      ) : (
                        <span className={styles.statusFailed}><XCircle /></span>
                      )}
                    </div>
                    <span className={styles.historyCardDate}>
                      {new Date(log.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className={styles.historyCardMsg}>{log.message}</div>
                  </div>
                ))}
              </div>
            </>
          ))}
      </div>
    </div>
  );
}
