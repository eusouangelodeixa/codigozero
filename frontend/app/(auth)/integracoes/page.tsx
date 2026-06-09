"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Card, Button, Input, Select, Badge, useToast } from "@/components/ui";
import styles from "./integracoes.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const RobotIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="3" />
    <path d="M9 14h.01M15 14h.01" />
    <path d="M12 8V4" />
    <circle cx="12" cy="3" r="1" />
  </svg>
);

const InfoIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" />
  </svg>
);

interface Instance { id: string; name: string; status: string; }

export default function IntegracoesPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const setupMode = searchParams.get("setup") === "komunika";
  const komunikaCardRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({ komunikaApiKey: "", komunikaInstanceId: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [instanceError, setInstanceError] = useState("");
  // Embedded Komunika module (paid add-on): provisioned tenant opened via SSO.
  const [komunikaActive, setKomunikaActive] = useState(false);
  const [openingKomunika, setOpeningKomunika] = useState(false);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setForm({
            komunikaApiKey: data.user.komunikaApiKey || "",
            komunikaInstanceId: data.user.komunikaInstanceId || "",
          });
          setKomunikaActive(!!data.user.komunikaActive);
          if (data.user.komunikaApiKey) setTimeout(() => fetchInstances(), 100);
        }
      });
  }, []);

  useEffect(() => {
    if (setupMode) {
      setHighlight(true);
      setTimeout(() => komunikaCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
      setTimeout(() => setHighlight(false), 4000);
    }
  }, [setupMode]);

  const fetchInstances = async () => {
    setLoadingInstances(true);
    setInstanceError("");
    try {
      const res = await fetch(`${API}/api/auth/komunika-instances`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
      });
      const data = await res.json();
      if (res.ok && data.instances) {
        setInstances(data.instances);
        if (data.instances.length === 0) setInstanceError("Nenhuma instância encontrada no Komunika.");
      } else {
        setInstanceError(data.error || "Erro ao buscar instâncias");
        setInstances([]);
      }
    } catch {
      setInstanceError("Não foi possível conectar ao Komunika");
      setInstances([]);
    }
    setLoadingInstances(false);
  };

  const saveIntegration = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/integrations`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) toast.success("Integração salva");
      else toast.error("Falha ao salvar", data.error);
    } catch {
      toast.error("Erro de conexão");
    }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/auth/me`, { headers: hdr() });
      const data = await res.json();
      if (data.user?.komunikaApiKey && data.user?.komunikaInstanceId) {
        setTestResult({ ok: true, msg: "Credenciais salvas. Validação no próximo disparo." });
      } else {
        setTestResult({ ok: false, msg: "Preencha e salve as credenciais antes de testar." });
      }
    } catch {
      setTestResult({ ok: false, msg: "Erro ao verificar conexão." });
    }
    setTesting(false);
  };

  // Open the embedded Komunika via SSO. The backend mints a short-lived
  // magic-link; we never see the JWT secret. Open the tab synchronously on
  // click so popup blockers don't swallow it, then navigate it once we have
  // the URL.
  const openKomunika = async () => {
    const win = window.open("about:blank", "_blank");
    setOpeningKomunika(true);
    try {
      const res = await fetch(`${API}/api/komunika/sso-link`, { headers: hdr() });
      const data = await res.json();
      if (res.ok && data.url) {
        if (win) win.location.href = data.url;
        else window.location.href = data.url; // popup blocked → same tab
      } else {
        if (win) win.close();
        toast.error("Não foi possível abrir o Komunika", data.error);
      }
    } catch {
      if (win) win.close();
      toast.error("Erro de conexão");
    }
    setOpeningKomunika(false);
  };

  const configured = !!form.komunikaApiKey;

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Integrações"
        title="Integrações"
        description="Conecte ferramentas externas. Hoje suportamos Komunika para automação de WhatsApp."
      />

      {komunikaActive && (
        <Card padding="lg">
          <div className={styles.intCard}>
            <div className={styles.intHead}>
              <span className={styles.intLogo}><RobotIcon /></span>
              <div className={styles.intMeta}>
                <span className={styles.intName}>Komunika</span>
                <span className={styles.intDesc}>
                  Seu painel Komunika está ativo. Abra sem precisar fazer login.
                </span>
              </div>
              <Badge variant="success" size="sm">Ativo</Badge>
            </div>
            <div className={styles.actions}>
              <Button variant="accent" onClick={openKomunika} loading={openingKomunika}>
                Abrir Komunika ↗
              </Button>
            </div>
          </div>
        </Card>
      )}

      {setupMode && (
        <div className={styles.setupBanner}>
          <span className={styles.setupBannerIcon}>
            <InfoIcon size={18} />
          </span>
          <div>
            <p className={styles.setupBannerTitle}>Configure o Komunika para disparar mensagens</p>
            <p className={styles.setupBannerHint}>
              Preencha a API Key e a instância abaixo para liberar o disparador.
            </p>
          </div>
        </div>
      )}

      <div ref={komunikaCardRef} className={highlight ? styles.pulse : undefined}>
        <Card padding="lg">
          <div className={styles.intCard}>
            <div className={styles.intHead}>
              <span className={styles.intLogo}><RobotIcon /></span>
              <div className={styles.intMeta}>
                <span className={styles.intName}>Komunika</span>
                <span className={styles.intDesc}>Automação de WhatsApp para prospecção e suporte.</span>
              </div>
              <Badge variant={configured ? "success" : "neutral"} size="sm">
                {configured ? "Configurado" : "Não configurado"}
              </Badge>
            </div>

            <div className={styles.intInfo}>
              Acesse o painel Komunika → <strong>Configurações → API Keys</strong> para obter sua chave.
              O ID da instância está em <strong>Conexões</strong>.
            </div>

            <div className={styles.fields}>
              <Input
                label="API Key"
                type="password"
                placeholder="kmnk_xxxxxxxxxxxxx"
                value={form.komunikaApiKey}
                onChange={(e) => setForm({ ...form, komunikaApiKey: e.target.value })}
              />

              <div>
                <div className={styles.fieldRow}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                    Instância WhatsApp
                  </span>
                  <button
                    type="button"
                    onClick={fetchInstances}
                    disabled={loadingInstances || !form.komunikaApiKey}
                    className={styles.fieldRowAction}
                  >
                    {loadingInstances ? "Carregando…" : "↻ Buscar instâncias"}
                  </button>
                </div>
                {instances.length > 0 ? (
                  <Select
                    value={form.komunikaInstanceId}
                    onChange={(e) => setForm({ ...form, komunikaInstanceId: e.target.value })}
                  >
                    <option value="">Selecione uma instância…</option>
                    {instances.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name} {inst.status === "open" ? "✓" : inst.status === "close" ? "✗" : `(${inst.status})`}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    placeholder={
                      loadingInstances
                        ? "Carregando instâncias…"
                        : "Salve a API Key e clique em 'Buscar instâncias'"
                    }
                    value={form.komunikaInstanceId}
                    onChange={(e) => setForm({ ...form, komunikaInstanceId: e.target.value })}
                    error={instanceError || undefined}
                  />
                )}
              </div>
            </div>

            {testResult && (
              <div className={cx(styles.statusLine, testResult.ok ? styles.statusLineOk : styles.statusLineErr)}>
                {testResult.ok ? "✓" : "✗"} {testResult.msg}
              </div>
            )}

            <div className={styles.actions}>
              <Button variant="accent" onClick={saveIntegration} loading={saving}>
                Salvar integração
              </Button>
              <Button variant="secondary" onClick={testConnection} loading={testing}>
                Testar conexão
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.futureCard}>
        Mais integrações em breve — CRM, e-mail marketing, calendário…
      </div>
    </div>
  );
}
