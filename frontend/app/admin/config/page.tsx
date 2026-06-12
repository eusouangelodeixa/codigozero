"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, useToast } from "@/components/ui";
import { Section, SecretField } from "@/components/admin";
import adminStyles from "../admin.module.css";
import styles from "./config.module.css";
import { VISITOR_PROMPT, CHECKOUT_PROMPT } from "./prompts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface SystemConfig {
  communityLink?: string;
  mentoriaSchedule?: string | null;
  mentoriaLink?: string;
  komunikaAdminApiKey?: string;
  komunikaInstanceId?: string;
  komunikaVisitorAssistantId?: string;
  komunikaCheckoutAssistantId?: string;
  milestoneAlertPhone?: string;
  milestoneAlertName?: string;
  resendApiKey?: string;
  resendFrom?: string;
}

interface KomunikaInstance { id?: string; instanceId?: string; instanceName?: string; name?: string; status?: string; }
interface KomunikaAssistant { id?: string; assistantId?: string; _id?: string; name?: string; title?: string; mode?: string; }

const IconCommunity = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconMentoria = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M19 11a7 7 0 01-14 0M12 18v3" />
  </svg>
);
const IconKomunika = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="3" />
    <path d="M9 14h.01M15 14h.01" />
    <path d="M12 8V4" />
    <circle cx="12" cy="3" r="1" />
  </svg>
);
const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const IconBeaker = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3v6L4 19a2 2 0 002 2h12a2 2 0 002-2L15 9V3" />
    <path d="M9 3h6" />
    <line x1="7.5" y1="13" x2="16.5" y2="13" />
  </svg>
);
const IconBrain = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V7a3 3 0 00-3-3z" />
    <path d="M9 9H6a3 3 0 000 6h3M15 9h3a3 3 0 010 6h-3" />
  </svg>
);
const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

export default function AdminConfig() {
  const toast = useToast();
  const [config, setConfig] = useState<SystemConfig>({});
  const [original, setOriginal] = useState<SystemConfig>({});
  const [instances, setInstances] = useState<KomunikaInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [assistants, setAssistants] = useState<KomunikaAssistant[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testType, setTestType] = useState<"visitor" | "checkout">("visitor");
  const [testing, setTesting] = useState(false);
  const [pushTesting, setPushTesting] = useState<"sale" | "bump" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const setField = <K extends keyof SystemConfig>(key: K, value: SystemConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  useEffect(() => {
    fetch(`${API}/api/admin/system`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        const cfg = d.config || {};
        setConfig(cfg);
        setOriginal(cfg);
        if (cfg.komunikaAdminApiKey) {
          fetchInstances();
          fetchAssistants();
        }
      });
  }, []);

  const fetchInstances = async () => {
    setLoadingInstances(true);
    try {
      const res = await fetch(`${API}/api/admin/broadcast/instances`, { headers: hdr() });
      const data = await res.json();
      setInstances(data.instances || []);
      if (data.error) toast.error("Falha ao carregar instâncias", data.error);
    } catch {
      setInstances([]);
      toast.error("Erro de conexão ao carregar instâncias");
    }
    setLoadingInstances(false);
  };

  const fetchAssistants = async () => {
    setLoadingAssistants(true);
    try {
      const res = await fetch(`${API}/api/admin/sdr-assistants`, { headers: hdr() });
      const data = await res.json();
      setAssistants(data.assistants || []);
      if (data.error) toast.error("Falha ao carregar agentes SDR", data.error);
    } catch {
      setAssistants([]);
      toast.error("Erro de conexão ao carregar agentes SDR");
    }
    setLoadingAssistants(false);
  };

  const dirty =
    JSON.stringify(config) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/system`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setOriginal(config);
      toast.success("Configurações salvas");
    } catch (err) {
      toast.error("Não foi possível salvar", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    setConfig(original);
    toast.info("Alterações descartadas");
  };

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Informe um número para o teste");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`${API}/api/admin/komunika-test`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ phone: testPhone, type: testType }),
      });
      const data = await res.json();
      if (res.ok) toast.success("Teste disparado", "Confira o WhatsApp do número informado.");
      else toast.error("Falha no teste", data.error);
    } catch {
      toast.error("Falha de conexão");
    }
    setTesting(false);
  };

  const runPushTest = async (kind: "sale" | "bump") => {
    setPushTesting(kind);
    try {
      const path = kind === "bump" ? "push-test/sale-with-bump" : "push-test/sale";
      const res = await fetch(`${API}/api/admin/${path}`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Falha ao enviar push", data.error);
      } else if (data.delivered === 0) {
        toast.error(
          "Nenhum dispositivo recebeu",
          "Nenhum superadmin tem push ativo. Ative as notificações no seu /perfil primeiro.",
        );
      } else {
        toast.success(
          "Push enviado",
          `${data.delivered}/${data.attempted} dispositivo(s) notificado(s).`,
        );
      }
    } catch {
      toast.error("Falha de conexão");
    }
    setPushTesting(null);
  };

  const copyPrompt = async (kind: "visitor" | "checkout") => {
    const text = kind === "visitor" ? VISITOR_PROMPT : CHECKOUT_PROMPT;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(kind);
    toast.success("Prompt copiado", "Cole no system prompt do agente SDR no Komunika.");
    setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
  };

  // datetime-local works with naive (timezone-less) strings. The DB stores
  // UTC ISO, so we convert UTC -> local for display and local -> UTC on change.
  // Slicing the raw ISO would render the UTC clock time as if it were local,
  // which is why typing "16:00" used to come back as a different value.
  const toLocalDatetime = (iso?: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const offsetMs = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
  };
  const datetimeValue = toLocalDatetime(config.mentoriaSchedule);

  return (
    <div className={styles.page}>
      <div className={adminStyles.pageHeader}>
        <h1 className={adminStyles.pageTitle}>Configurações</h1>
        <p className={adminStyles.pageDesc}>
          Comunidade, mentorias, automações Komunika, alertas de milestones e prompts de IA.
          Chaves sensíveis ficam mascaradas por padrão — clique no olho para revelar.
        </p>
      </div>

      {/* ── Comunidade ── */}
      <Section
        title="Comunidade"
        subtitle="Link do Discord exibido no QG dos membros."
        icon={<IconCommunity />}
        actions={
          <span className={config.communityLink ? styles.statusOk : styles.statusEmpty}>
            {config.communityLink ? "Configurado" : "Vazio"}
          </span>
        }
      >
        <Field label="Link do Discord / Grupo" hint="Aparece no QG. Use o convite permanente.">
          <input
            className={styles.input}
            placeholder="https://discord.gg/..."
            value={config.communityLink || ""}
            onChange={(e) => setField("communityLink", e.target.value)}
          />
        </Field>
      </Section>

      {/* ── Mentoria ── */}
      <Section
        title="Próxima mentoria"
        subtitle="Data e link da sessão semanal — exibidos no QG com countdown."
        icon={<IconMentoria />}
        actions={
          <span className={config.mentoriaSchedule ? styles.statusOk : styles.statusEmpty}>
            {config.mentoriaSchedule ? "Agendada" : "Sem agenda"}
          </span>
        }
      >
        <div className={styles.formGrid}>
          <Field
            label="Data e hora"
            hint={`Fuso do seu dispositivo (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Cada aluno verá o horário convertido para o fuso dele.`}
          >
            <input
              className={styles.input}
              type="datetime-local"
              value={datetimeValue}
              onChange={(e) =>
                setField(
                  "mentoriaSchedule",
                  e.target.value ? new Date(e.target.value).toISOString() : null
                )
              }
            />
          </Field>
          <Field label="Link da reunião">
            <input
              className={styles.input}
              autoComplete="off"
              placeholder="https://meet.google.com/..."
              value={config.mentoriaLink || ""}
              onChange={(e) => setField("mentoriaLink", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* ── Komunika ── */}
      <Section
        title="Automação Komunika"
        subtitle="Chave da API, instância de WhatsApp e agentes SDR (outbound) usados pelo cron e pelo webhook."
        icon={<IconKomunika />}
        actions={
          <span className={config.komunikaAdminApiKey ? styles.statusOk : styles.statusEmpty}>
            {config.komunikaAdminApiKey ? "Ligado" : "Desligado"}
          </span>
        }
      >
        <div className={styles.formStack}>
          <SecretField
            label="API Key (Komunika Admin)"
            value={config.komunikaAdminApiKey || ""}
            onChange={(v) => setField("komunikaAdminApiKey", v)}
            placeholder="kmnk_xxxxxxxxxxxxxxxxxxxx"
            hint={
              <>
                Obtenha em{" "}
                <a href="https://app.komunika.site/dashboard/api-keys" target="_blank" rel="noreferrer">
                  app.komunika.site/dashboard/api-keys
                </a>
                . Usada para iniciar agentes SDR, carregar instâncias e enviar mensagens.
              </>
            }
          />

          <Field
            label="Instância WhatsApp"
            hint="Usada para credenciais, alertas, milestones e cupons via WhatsApp."
          >
            <div className={styles.inlineRow}>
              <select
                className={styles.select}
                value={config.komunikaInstanceId || ""}
                onChange={(e) => setField("komunikaInstanceId", e.target.value)}
              >
                <option value="">— Selecione uma instância —</option>
                {instances.map((inst) => {
                  const id = inst.id || inst.instanceId || "";
                  const name = inst.name || inst.instanceName || id;
                  return (
                    <option key={id} value={id}>
                      {name} {inst.status ? `· ${inst.status}` : ""}
                    </option>
                  );
                })}
                {config.komunikaInstanceId &&
                  !instances.find((i) => (i.id || i.instanceId) === config.komunikaInstanceId) && (
                    <option value={config.komunikaInstanceId}>
                      {config.komunikaInstanceId} (salvo)
                    </option>
                  )}
              </select>
              <button
                type="button"
                className={styles.smallBtn}
                onClick={fetchInstances}
                disabled={loadingInstances || !config.komunikaAdminApiKey}
                title={!config.komunikaAdminApiKey ? "Salve a API Key primeiro" : "Recarregar"}
              >
                <IconRefresh />
                {loadingInstances ? "Carregando…" : "Buscar"}
              </button>
            </div>
          </Field>

          <div className={styles.formGrid}>
            <Field
              label="Agente SDR — Visitantes (abandono da LP)"
              hint="Agente outbound disparado pelo cron para leads que preencheram o quiz e não compraram. Os agentes vêm do seu Komunika."
            >
              <div className={styles.inlineRow}>
                <select
                  className={styles.select}
                  value={config.komunikaVisitorAssistantId || ""}
                  onChange={(e) => setField("komunikaVisitorAssistantId", e.target.value)}
                >
                  <option value="">— Selecione um agente —</option>
                  {assistants.map((a) => {
                    const id = a.id || a.assistantId || a._id || "";
                    const name = a.name || a.title || id;
                    return (
                      <option key={id} value={id}>
                        {name}{a.mode ? ` · ${a.mode}` : ""}
                      </option>
                    );
                  })}
                  {config.komunikaVisitorAssistantId &&
                    !assistants.find((a) => (a.id || a.assistantId || a._id) === config.komunikaVisitorAssistantId) && (
                      <option value={config.komunikaVisitorAssistantId}>
                        {config.komunikaVisitorAssistantId} (salvo)
                      </option>
                    )}
                </select>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={fetchAssistants}
                  disabled={loadingAssistants || !config.komunikaAdminApiKey}
                  title={!config.komunikaAdminApiKey ? "Salve a API Key primeiro" : "Recarregar agentes"}
                >
                  <IconRefresh />
                  {loadingAssistants ? "Carregando…" : "Buscar"}
                </button>
              </div>
            </Field>
            <Field
              label="Agente SDR — Recuperação (abandono de checkout)"
              hint="Agente outbound disparado quando o checkout falha ou é cancelado."
            >
              <select
                className={styles.select}
                value={config.komunikaCheckoutAssistantId || ""}
                onChange={(e) => setField("komunikaCheckoutAssistantId", e.target.value)}
              >
                <option value="">— Selecione um agente —</option>
                {assistants.map((a) => {
                  const id = a.id || a.assistantId || a._id || "";
                  const name = a.name || a.title || id;
                  return (
                    <option key={id} value={id}>
                      {name}{a.mode ? ` · ${a.mode}` : ""}
                    </option>
                  );
                })}
                {config.komunikaCheckoutAssistantId &&
                  !assistants.find((a) => (a.id || a.assistantId || a._id) === config.komunikaCheckoutAssistantId) && (
                    <option value={config.komunikaCheckoutAssistantId}>
                      {config.komunikaCheckoutAssistantId} (salvo)
                    </option>
                  )}
              </select>
            </Field>
          </div>
        </div>
      </Section>

      {/* ── E-mail (Resend) ── */}
      <Section
        title="E-mail (Resend)"
        subtitle="Entrega os dados de acesso (e-mail + senha + link) por e-mail, além do WhatsApp — na compra e na página de resgate."
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 5L2 7" />
          </svg>
        }
        actions={
          <span className={config.resendApiKey ? styles.statusOk : styles.statusEmpty}>
            {config.resendApiKey ? "Ligado" : "Desligado"}
          </span>
        }
      >
        <div className={styles.formStack}>
          <SecretField
            label="API Key (Resend)"
            value={config.resendApiKey || ""}
            onChange={(v) => setField("resendApiKey", v)}
            placeholder="re_xxxxxxxxxxxxxxxx"
            hint={
              <>
                Crie em{" "}
                <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer">
                  resend.com/api-keys
                </a>
                . É preciso verificar o domínio de envio no Resend antes de enviar.
              </>
            }
          />
          <Field
            label="Remetente (From)"
            hint="Use um endereço do seu domínio verificado no Resend. Ex.: Código Zero <acesso@czero.sbs>"
          >
            <input
              className={styles.input}
              placeholder="Código Zero <acesso@czero.sbs>"
              value={config.resendFrom || ""}
              onChange={(e) => setField("resendFrom", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* ── Alertas de milestones ── */}
      <Section
        title="Alertas de milestones"
        subtitle="Notificação automática no WhatsApp quando uma meta da plataforma é batida."
        icon={<IconAlert />}
        defaultOpen={false}
      >
        <div className={styles.formGrid}>
          <Field label="Telefone (WhatsApp do admin)">
            <input
              className={styles.input}
              placeholder="Ex: 841234567"
              value={config.milestoneAlertPhone || ""}
              onChange={(e) => setField("milestoneAlertPhone", e.target.value)}
            />
          </Field>
          <Field label="Nome do admin">
            <input
              className={styles.input}
              placeholder="Ex: Angelo"
              value={config.milestoneAlertName || ""}
              onChange={(e) => setField("milestoneAlertName", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* ── Teste ── */}
      <Section
        title="Disparar teste no Komunika"
        subtitle="Inicia um agente SDR (outbound) de teste para um número, simulando um lead real."
        icon={<IconBeaker />}
        defaultOpen={false}
      >
        <div className={styles.testPanel}>
          <Field label="Número (WhatsApp)">
            <input
              className={styles.input}
              placeholder="Ex: 841234567"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </Field>
          <Field label="Agente a testar">
            <select
              className={styles.select}
              value={testType}
              onChange={(e) => setTestType(e.target.value as "visitor" | "checkout")}
            >
              <option value="visitor">Visitante (abandono LP)</option>
              <option value="checkout">Recuperação (abandono checkout)</option>
            </select>
          </Field>
          <div>
            <Button variant="accent" onClick={runTest} loading={testing}>
              Disparar teste
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Push de teste (notificação de venda) ── */}
      <Section
        title="Notificações push de teste"
        subtitle="Dispara o mesmo push que os superadmins recebem quando uma venda é aprovada. Útil para conferir formato e entrega sem esperar uma compra real."
        icon={<IconBeaker />}
        defaultOpen={false}
      >
        <div className={styles.testPanel}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button
              variant="accent"
              onClick={() => runPushTest("sale")}
              loading={pushTesting === "sale"}
              disabled={pushTesting !== null}
            >
              Compra do produto principal
            </Button>
            <Button
              variant="primary"
              onClick={() => runPushTest("bump")}
              loading={pushTesting === "bump"}
              disabled={pushTesting !== null}
            >
              Compra principal + Close Friends 🥂
            </Button>
          </div>
          <p className={styles.fieldHint} style={{ marginTop: 12 }}>
            Os pushes vão para todos os superadmins com notificações ativas. Se nada chegar, confirme que ativou as notificações em <strong>/perfil</strong> deste dispositivo.
          </p>
        </div>
      </Section>

      {/* ── Prompts ── */}
      <Section
        title="Prompts dos Agentes SDR"
        subtitle="Cole estes system prompts no campo do agente outbound no Komunika (app.komunika.site/dashboard/agentes)."
        icon={<IconBrain />}
        defaultOpen={false}
      >
        <div className={styles.formStack}>
          <div className={styles.promptBlock}>
            <div className={styles.promptHead}>
              <span className={styles.promptTitle}>1. Agente de visitantes</span>
              <button type="button" className={styles.promptCopyBtn} onClick={() => copyPrompt("visitor")}>
                <IconCopy /> {copied === "visitor" ? "Copiado" : "Copiar prompt"}
              </button>
            </div>
            <textarea
              readOnly
              value={VISITOR_PROMPT}
              spellCheck={false}
              className={styles.promptCode}
            />
          </div>

          <div className={styles.promptBlock}>
            <div className={styles.promptHead}>
              <span className={styles.promptTitle}>2. Agente de recuperação</span>
              <button type="button" className={styles.promptCopyBtn} onClick={() => copyPrompt("checkout")}>
                <IconCopy /> {copied === "checkout" ? "Copiado" : "Copiar prompt"}
              </button>
            </div>
            <textarea
              readOnly
              value={CHECKOUT_PROMPT}
              spellCheck={false}
              className={styles.promptCode}
            />
          </div>
        </div>
      </Section>

      {/* ── Sticky save bar ── */}
      <div className={styles.saveBar} role="status">
        <div className={styles.saveBarInfo}>
          <span className={cx(styles.saveBarDot, dirty && styles.saveBarDirty)} />
          {dirty ? "Alterações não salvas" : "Tudo sincronizado"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={revert} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
            Salvar configurações
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Local helper: labelled field ── */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  );
}
