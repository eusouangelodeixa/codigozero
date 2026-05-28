"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useRadar } from "@/hooks/useRadar";
import { apiClient } from "@/lib/api";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Modal,
  Badge,
  EmptyState,
  Tabs,
  Select,
  useToast,
} from "@/components/ui";
import { RadarIcon, DisparadorIcon } from "@/components/Icons";
import styles from "./radar.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface Lead {
  id?: string;
  name: string;
  phone: string;
  address?: string;
  website?: string;
  instagram?: string;
  status: string;
  recommendedScriptId?: string;
  // Maps enrichment (radar v2)
  mapsUrl?: string | null;
  placeId?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
}

interface Script {
  id: string;
  title: string;
  content: string;
  icon?: string;
}
interface ScriptFolder {
  id: string;
  name: string;
  icon?: string;
  scripts?: Script[];
}

/* ─── Tiny inline icons (kept here to avoid expanding the shared set yet) ─── */
const Icon = {
  Globe: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  ),
  Copy: (p: { size?: number; className?: string }) => (
    <svg className={p.className} width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  ExternalLink: (p: { size?: number }) => (
    <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  Instagram: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  Check: (p: { size?: number }) => (
    <svg width={p.size ?? 10} height={p.size ?? 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Alert: (p: { size?: number }) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Download: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  CloudUpload: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16l-4-4-4 4M12 12v9" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  ),
  Pin: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
  Send: (p: { size?: number }) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
};

const statusVariant = (status?: string): "success" | "warning" | "error" | "neutral" => {
  if (!status) return "neutral";
  if (status === "Sem Website") return "error";
  if (status === "Website Lento/Antigo") return "warning";
  if (status === "Website Bom") return "success";
  return "neutral";
};

export default function RadarPage() {
  const router = useRouter();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [savedJobs, setSavedJobs] = useState<{ leads?: Lead[] }[]>([]);
  const [tab, setTab] = useState<"current" | "history">("current");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Tri-state filters applied server-side by the scraper worker.
  type TriState = "any" | "has" | "none";
  const [filterPhone, setFilterPhone] = useState<TriState>("any");
  const [filterWebsite, setFilterWebsite] = useState<TriState>("any");
  const [filterInstagram, setFilterInstagram] = useState<TriState>("any");

  const addCity = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setCities((prev) => {
      const lower = v.toLowerCase();
      if (prev.some((c) => c.toLowerCase() === lower)) return prev;
      if (prev.length >= 5) {
        toast.warning("Máximo 5 cidades", "Refine antes de adicionar mais.");
        return prev;
      }
      return [...prev, v];
    });
    setCityInput("");
  };
  const removeCity = (c: string) =>
    setCities((prev) => prev.filter((x) => x.toLowerCase() !== c.toLowerCase()));
  const cityInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCity(cityInput);
    }
    if (e.key === "Backspace" && !cityInput && cities.length > 0) {
      removeCity(cities[cities.length - 1]);
    }
  };

  const [scriptsFolders, setScriptsFolders] = useState<ScriptFolder[]>([]);
  const [suggestedScript, setSuggestedScript] = useState<Script | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const { status, results, error, remaining, startSearch } = useRadar();
  const [elapsed, setElapsed] = useState(0);
  const [exportingCrm, setExportingCrm] = useState(false);

  useEffect(() => {
    loadHistory();
    loadScripts();
  }, []);

  useEffect(() => {
    if (status !== "processing") {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === "completed" && results.length > 0) loadHistory();
  }, [status, results.length]);

  const loadHistory = async () => {
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

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    // Allow submitting with a city still in the input that wasn't "Enter"d
    const pendingCity = cityInput.trim();
    const allCities = pendingCity
      ? [...cities.filter((c) => c.toLowerCase() !== pendingCity.toLowerCase()), pendingCity]
      : cities;
    if (allCities.length === 0) {
      toast.error("Adicione ao menos uma cidade", "Pressione Enter ou vírgula para adicionar.");
      return;
    }
    setCityInput("");
    if (pendingCity && !cities.some((c) => c.toLowerCase() === pendingCity.toLowerCase())) {
      setCities(allCities);
    }
    setTab("current");
    startSearch(query.trim(), allCities, {
      phone: filterPhone,
      website: filterWebsite,
      instagram: filterInstagram,
    });
  };

  const copyPhone = async (phone: string, id: string) => {
    try {
      await navigator.clipboard.writeText(phone);
    } catch {
      const el = document.createElement("textarea");
      el.value = phone;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const openSuggestedScript = (scriptId: string | undefined, lead: Lead) => {
    setSelectedLead(lead);
    let found: Script | null = null;

    if (!scriptId && scriptsFolders.length > 0 && scriptsFolders[0].scripts?.length) {
      found = scriptsFolders[0].scripts[0];
    } else {
      for (const folder of scriptsFolders) {
        const s = folder.scripts?.find((x) => x.id === scriptId);
        if (s) { found = s; break; }
      }
    }

    if (!found) {
      if (scriptsFolders.length === 0) {
        toast.warning("Cofre vazio", "Crie scripts no Cofre antes de usá-los aqui.");
      } else {
        toast.error("Script não encontrado", "O script recomendado não está mais no Cofre.");
      }
      return;
    }

    setSuggestedScript({ ...found, content: found.content.replace(/\{\{empresa\}\}/g, lead.name) });
  };

  const copyScript = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Script copiado", "Cole no WhatsApp para enviar.");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const allHistoryLeads: Lead[] = savedJobs.flatMap((j) => j.leads || []);
  // Filters are applied server-side at scrape time. Whatever comes through
  // already respects the user's choices, so the UI just renders it.
  const displayLeads: Lead[] = tab === "current" ? results : allHistoryLeads;

  const exportCsv = () => {
    if (displayLeads.length === 0) return;
    const csvEscape = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      // Quote whenever the cell could break CSV parsing
      if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const headers = [
      "nome",
      "telefone",
      "status",
      "rating",
      "avaliacoes",
      "cidade",
      "endereco",
      "website",
      "instagram",
      "maps_url",
      "place_id",
      "latitude",
      "longitude",
    ];
    const rows = displayLeads.map((l) =>
      [
        csvEscape(l.name),
        csvEscape(l.phone),
        csvEscape(l.status),
        csvEscape(l.rating ?? ""),
        csvEscape(l.reviewsCount ?? ""),
        csvEscape(l.city ?? ""),
        csvEscape(l.address ?? ""),
        csvEscape(l.website ?? ""),
        csvEscape(l.instagram ?? ""),
        csvEscape(l.mapsUrl ?? ""),
        csvEscape(l.placeId ?? ""),
        csvEscape(l.latitude ?? ""),
        csvEscape(l.longitude ?? ""),
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado", `${displayLeads.length} leads no arquivo.`);
  };

  const exportToCRM = async () => {
    if (displayLeads.length === 0) return;
    setExportingCrm(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${API}/api/radar/export-crm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leads: displayLeads, tags: ["CodigoZero_Radar", `Nicho_${query}`] }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("CRM atualizado", `${data.successCount} leads guardados no Komunika.`);
      } else {
        toast.error("Falha ao exportar", data.error || "Tente novamente em instantes.");
      }
    } catch {
      toast.error("Erro de conexão", "Não foi possível alcançar o CRM.");
    }
    setExportingCrm(false);
  };

  const hasAnyResults = results.length > 0 || allHistoryLeads.length > 0;

  return (
    <div className={styles.page}>
      <PageHeader
        label="Operação · Radar"
        title="Encontre seus leads em segundos"
        description="Informe o nicho e a cidade. O sistema varre o Google Maps, qualifica cada negócio e devolve a lista pronta para abordagem."
        meta={
          remaining !== undefined ? (
            <span className={styles.remainingBadge}>
              <span className={styles.remainingDot} />
              {remaining} buscas restantes hoje
            </span>
          ) : undefined
        }
      />

      {/* ── Search ── */}
      <Card padding="lg">
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <div className={styles.searchRow}>
            <Input
              label="Nicho"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Clínicas odontológicas"
              required
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "var(--type-label)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, color: "var(--text-secondary)" }}>
                Cidades · até 5
              </label>
              <div className={styles.cityChips}>
                {cities.map((c) => (
                  <span key={c} className={styles.cityChip}>
                    {c}
                    <button
                      type="button"
                      className={styles.cityChipRemove}
                      onClick={() => removeCity(c)}
                      aria-label={`Remover ${c}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className={styles.cityChipsInput}
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={cityInputKeyDown}
                  onBlur={() => addCity(cityInput)}
                  placeholder={cities.length === 0 ? "Ex: Maputo, Beira" : "+ adicionar"}
                />
              </div>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Pressione Enter ou vírgula para adicionar. Cada cidade conta 1 busca.
              </span>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={status === "processing"}
              iconStart={<RadarIcon size={16} />}
            >
              Rastrear
            </Button>
          </div>

          {/* Tri-state filters — applied server-side by the scraper */}
          <div className={styles.filterRow}>
            <span className={styles.dim} style={{ fontSize: "var(--type-label)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
              Filtros
            </span>

            <TriFilter label="Telefone" value={filterPhone} onChange={setFilterPhone} />
            <TriFilter label="Website" value={filterWebsite} onChange={setFilterWebsite} />
            <TriFilter label="Instagram" value={filterInstagram} onChange={setFilterInstagram} />
          </div>
        </form>
      </Card>

      {/* ── Processing ── */}
      {status === "processing" && (
        <Card padding="lg">
          <div className={styles.processing}>
            <div className={styles.processingScope}>
              <span className={styles.processingPulse} />
            </div>
            <div>
              <div className={styles.processingTitle}>Mapeando e qualificando leads</div>
              <p className={styles.processingHint}>
                Tempo estimado restante: ~{Math.max(10, 120 - elapsed)}s
              </p>
            </div>
            <div className={styles.processingMeter}>
              <div className={styles.processingStat}>
                <span className={styles.processingStatValue}>{results.length}</span>
                <span className={styles.processingStatLabel}>encontrados</span>
              </div>
              <div className={styles.processingStat}>
                <span className={styles.processingStatValue}>{elapsed}s</span>
                <span className={styles.processingStatLabel}>tempo</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Error ── */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <Icon.Alert />
          {error}
        </div>
      )}

      {/* ── Results header ── */}
      {hasAnyResults && status !== "processing" && (
        <div className={styles.resultsHead}>
          <Tabs
            value={tab}
            onChange={(v) => setTab(v)}
            items={[
              { value: "current", label: "Última busca", count: results.length },
              { value: "history", label: "Histórico", count: allHistoryLeads.length },
            ]}
          />
          {displayLeads.length > 0 && (
            <div className={styles.resultsActions}>
              <Button
                variant="accent"
                size="sm"
                onClick={exportToCRM}
                loading={exportingCrm}
                iconStart={<Icon.CloudUpload />}
              >
                Salvar no CRM
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={exportCsv}
                iconStart={<Icon.Download />}
              >
                Exportar CSV
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Results: table (desktop) ── */}
      {displayLeads.length > 0 && (
        <Card padding="none" className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Negócio</th>
                  <th>Avaliação</th>
                  <th>Telefone</th>
                  <th>Website</th>
                  <th>Status</th>
                  <th>Instagram</th>
                  <th style={{ width: 1 }}>Maps</th>
                  <th style={{ width: 1 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {displayLeads.map((lead, i) => {
                  const id = lead.id || `lead-${i}`;
                  const isCopied = copiedId === id;
                  return (
                    <tr key={id}>
                      <td>
                        <div className={styles.leadName}>{lead.name}</div>
                        {lead.address && <div className={styles.leadAddress}>{lead.address}</div>}
                        {lead.city && (
                          <div className={styles.leadAddress} style={{ fontStyle: "italic" }}>
                            {lead.city}
                          </div>
                        )}
                      </td>
                      <td>
                        {lead.rating != null ? (
                          <div className={styles.ratingCell}>
                            <span className={styles.ratingStar}>★</span>
                            <span className={styles.ratingValue}>{lead.rating.toFixed(1)}</span>
                            {lead.reviewsCount != null && (
                              <span className={styles.ratingCount}>({lead.reviewsCount})</span>
                            )}
                          </div>
                        ) : (
                          <span className={styles.dim}>—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.phoneCell}
                          onClick={() => copyPhone(lead.phone, id)}
                          aria-label={`Copiar ${lead.phone}`}
                        >
                          {lead.phone}
                          {isCopied ? (
                            <span className={styles.copiedIndicator}>copiado</span>
                          ) : (
                            <Icon.Copy className={styles.copyIcon} />
                          )}
                        </button>
                      </td>
                      <td>
                        {lead.website ? (
                          <a
                            href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.linkInline}
                          >
                            <Icon.Globe size={12} /> Visitar <Icon.ExternalLink />
                          </a>
                        ) : (
                          <span className={styles.dim}>—</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={statusVariant(lead.status)} size="sm">
                          {lead.status}
                        </Badge>
                      </td>
                      <td>
                        {lead.instagram ? (
                          <a
                            href={lead.instagram}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.linkInline}
                          >
                            <Icon.Instagram size={12} /> Abrir <Icon.ExternalLink />
                          </a>
                        ) : (
                          <span className={styles.dim}>—</span>
                        )}
                      </td>
                      <td>
                        {lead.mapsUrl ? (
                          <a
                            href={lead.mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.mapsBtn}
                            title="Abrir no Google Maps"
                            aria-label="Abrir no Google Maps"
                          >
                            <Icon.Pin size={14} />
                          </a>
                        ) : (
                          <span className={styles.dim}>—</span>
                        )}
                      </td>
                      <td>
                        <Button
                          variant="accent"
                          size="sm"
                          onClick={() => openSuggestedScript(lead.recommendedScriptId, lead)}
                        >
                          Usar script
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Results: mobile cards ── */}
      {displayLeads.length > 0 && (
        <div className={styles.mobileCards}>
          {displayLeads.map((lead, i) => {
            const id = lead.id || `lead-m-${i}`;
            const isCopied = copiedId === id;
            return (
              <div key={id} className={styles.leadCard}>
                <div className={styles.leadCardHead}>
                  <div>
                    <div className={styles.leadName}>{lead.name}</div>
                    {lead.rating != null && (
                      <div className={styles.ratingCell}>
                        <span className={styles.ratingStar}>★</span>
                        <span className={styles.ratingValue}>{lead.rating.toFixed(1)}</span>
                        {lead.reviewsCount != null && (
                          <span className={styles.ratingCount}>({lead.reviewsCount})</span>
                        )}
                        {lead.city && (
                          <span className={styles.ratingCount} style={{ fontStyle: "italic" }}>
                            · {lead.city}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Badge variant={statusVariant(lead.status)} size="sm">
                    {lead.status}
                  </Badge>
                </div>
                <div className={styles.leadCardLinks}>
                  <button
                    type="button"
                    className={styles.phoneCell}
                    onClick={() => copyPhone(lead.phone, id)}
                  >
                    {lead.phone}
                    {isCopied ? (
                      <span className={styles.copiedIndicator}>copiado</span>
                    ) : (
                      <Icon.Copy className={styles.copyIcon} />
                    )}
                  </button>
                  {lead.mapsUrl && (
                    <a href={lead.mapsUrl} target="_blank" rel="noreferrer" className={styles.linkInline}>
                      <Icon.Pin size={12} /> Maps <Icon.ExternalLink />
                    </a>
                  )}
                  {lead.website && (
                    <a
                      href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.linkInline}
                    >
                      <Icon.Globe size={12} /> Website <Icon.ExternalLink />
                    </a>
                  )}
                  {lead.instagram && (
                    <a href={lead.instagram} target="_blank" rel="noreferrer" className={styles.linkInline}>
                      <Icon.Instagram size={12} /> Instagram <Icon.ExternalLink />
                    </a>
                  )}
                </div>
                <Button
                  variant="accent"
                  fullWidth
                  onClick={() => openSuggestedScript(lead.recommendedScriptId, lead)}
                >
                  Usar script
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty ── */}
      {status === "idle" && results.length === 0 && allHistoryLeads.length === 0 && (
        <EmptyState
          icon={<RadarIcon size={26} />}
          title="Nenhum lead ainda"
          description="Faça sua primeira busca para começar a prospectar com inteligência. Em menos de 2 minutos você terá uma lista qualificada e os scripts certos para abordar."
        />
      )}

      {/* ── Modal: script ── */}
      <Modal
        open={!!suggestedScript}
        onClose={() => setSuggestedScript(null)}
        title="Script de abordagem"
        description={selectedLead ? `Personalizado para ${selectedLead.name}` : undefined}
        size="md"
        footer={
          suggestedScript && selectedLead ? (
            <>
              <Button
                variant="secondary"
                onClick={() => copyScript(suggestedScript.content)}
                iconStart={<Icon.Copy />}
              >
                Copiar texto
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  router.push(
                    `/disparador?lead=${encodeURIComponent(selectedLead.phone)}&script=${suggestedScript.id}`
                  );
                }}
                iconStart={<Icon.Send />}
              >
                Enviar pelo Disparador
              </Button>
            </>
          ) : null
        }
      >
        {suggestedScript && selectedLead && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <Select
              label="Trocar script"
              value={suggestedScript.id}
              onChange={(e) => openSuggestedScript(e.target.value, selectedLead)}
            >
              {scriptsFolders.map((folder) => (
                <optgroup key={folder.id} label={folder.name}>
                  {folder.scripts?.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>

            <pre
              style={{
                fontFamily: "var(--font-sans)",
                whiteSpace: "pre-wrap",
                background: "var(--bg-glass)",
                padding: "var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {suggestedScript.content}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Tri-state segmented control used by the radar filter row.
 * Three states map to what the worker expects: 'any' | 'has' | 'none'.
 */
function TriFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "any" | "has" | "none";
  onChange: (v: "any" | "has" | "none") => void;
}) {
  const options: { v: "any" | "has" | "none"; label: string }[] = [
    { v: "any", label: "Tanto faz" },
    { v: "has", label: "Tem" },
    { v: "none", label: "Não tem" },
  ];
  return (
    <div className={styles.triFilter} role="group" aria-label={label}>
      <span className={styles.triFilterLabel}>{label}</span>
      <div className={styles.triFilterSeg}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            className={cx(styles.triFilterOpt, value === o.v && styles.triFilterOptActive)}
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
