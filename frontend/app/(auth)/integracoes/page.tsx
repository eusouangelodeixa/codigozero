"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
};

export default function IntegracoesPage() {
  const searchParams = useSearchParams();
  const setupMode = searchParams.get("setup") === "komunika";
  const komunikaCardRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({ komunikaApiKey: "", komunikaInstanceId: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [instances, setInstances] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [instanceError, setInstanceError] = useState("");

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setForm({
            komunikaApiKey: data.user.komunikaApiKey || "",
            komunikaInstanceId: data.user.komunikaInstanceId || "",
          });
          if (data.user.komunikaApiKey) {
            // Auto-fetch instances after a brief delay for state to settle
            setTimeout(() => fetchInstances(), 100);
          }
        }
      });
  }, []);

  // Setup mode: scroll to card and pulse animation
  useEffect(() => {
    if (setupMode) {
      setHighlight(true);
      setTimeout(() => {
        komunikaCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      // Remove highlight after animation completes
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
        if (data.instances.length === 0) {
          setInstanceError("Nenhuma instância encontrada no Komunika.");
        }
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
        method: "PATCH", headers: hdr(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) showToast("Integração salva com sucesso ✓");
      else showToast(data.error || "Erro", "error");
    } catch {
      showToast("Erro de conexão", "error");
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
        setTestResult({ ok: true, msg: "Credenciais salvas. A conexão será validada no próximo disparo." });
      } else {
        setTestResult({ ok: false, msg: "Preencha e salve as credenciais antes de testar." });
      }
    } catch {
      setTestResult({ ok: false, msg: "Erro ao verificar conexão." });
    }
    setTesting(false);
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px" }}>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes komunika-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); border-color: rgba(245,158,11,0.15); }
          25% { box-shadow: 0 0 20px 4px rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.5); }
          50% { box-shadow: 0 0 0 0 rgba(245,158,11,0); border-color: rgba(245,158,11,0.15); }
          75% { box-shadow: 0 0 20px 4px rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.5); }
        }
        @keyframes arrow-bounce {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50% { transform: translateY(-6px); opacity: 0.6; }
        }
      `}</style>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Integrações</h1>
      <p style={{ fontSize: 14, color: "#888", marginBottom: 32 }}>Conecte suas ferramentas de automação</p>

      {/* Setup banner — only shows when redirected from Radar */}
      {setupMode && (
        <div style={{
          padding: "14px 18px", borderRadius: 10, marginBottom: 20,
          background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20, animation: "arrow-bounce 1s ease infinite" }}>👇</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", margin: "0 0 2px" }}>
              Configure o Komunika para disparar mensagens
            </p>
            <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
              Preencha sua API Key e ID da Instância abaixo para usar o disparo automático no Radar.
            </p>
          </div>
        </div>
      )}

      {/* ══ Komunika ══ */}
      <div
        ref={komunikaCardRef}
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(245,158,11,0.15)",
          borderRadius: 16, padding: 24, marginBottom: 24,
          transition: "box-shadow 0.3s, border-color 0.3s",
          ...(highlight ? { animation: "komunika-pulse 2s ease 2" } : {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            🤖
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f59e0b", margin: 0 }}>Komunika</h2>
            <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Automação de WhatsApp para prospecção</p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: form.komunikaApiKey ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
              color: form.komunikaApiKey ? "#22c55e" : "#888",
            }}>
              {form.komunikaApiKey ? "Configurado" : "Não configurado"}
            </span>
          </div>
        </div>

        <div style={{
          margin: "16px 0", padding: "12px 16px", borderRadius: 8,
          background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)",
          fontSize: 12, color: "#aaa", lineHeight: 1.6,
        }}>
          💡 Para obter suas credenciais, acesse o painel do Komunika → Configurações → API Keys.
          O ID da instância está em Conexões → sua instância WhatsApp.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>API Key</label>
            <input
              type="password"
              placeholder="kmnk_xxxxxxxxxxxxx"
              style={{
                ...inputStyle,
                ...(setupMode && !form.komunikaApiKey ? { borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.03)" } : {}),
              }}
              value={form.komunikaApiKey}
              onChange={e => setForm({ ...form, komunikaApiKey: e.target.value })}
            />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>Instância WhatsApp</label>
              <button
                onClick={fetchInstances}
                disabled={loadingInstances || !form.komunikaApiKey}
                style={{
                  fontSize: 11, color: "#f59e0b", background: "none", border: "none",
                  cursor: form.komunikaApiKey ? "pointer" : "not-allowed",
                  opacity: form.komunikaApiKey ? 1 : 0.4, padding: 0,
                }}
              >
                {loadingInstances ? "Carregando..." : "↻ Buscar instâncias"}
              </button>
            </div>

            {instances.length > 0 ? (
              <select
                value={form.komunikaInstanceId}
                onChange={e => setForm({ ...form, komunikaInstanceId: e.target.value })}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: 32,
                  ...(setupMode && !form.komunikaInstanceId ? { borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.03)" } : {}),
                }}
              >
                <option value="" style={{ background: "#1a1a2e", color: "#888" }}>Selecione uma instância...</option>
                {instances.map(inst => (
                  <option key={inst.id} value={inst.id} style={{ background: "#1a1a2e", color: "#fff" }}>
                    {inst.name} {inst.status === "open" ? "✅" : inst.status === "close" ? "🔴" : `(‼${inst.status})`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder={loadingInstances ? "Carregando instâncias..." : "Salve a API Key e clique em 'Buscar instâncias'"}
                style={{
                  ...inputStyle,
                  ...(setupMode && !form.komunikaInstanceId ? { borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.03)" } : {}),
                }}
                value={form.komunikaInstanceId}
                onChange={e => setForm({ ...form, komunikaInstanceId: e.target.value })}
              />
            )}

            {instanceError && (
              <p style={{ fontSize: 11, color: "#ef4444", marginTop: 4, margin: "4px 0 0" }}>{instanceError}</p>
            )}
          </div>
        </div>

        {testResult && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 16,
            background: testResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
            fontSize: 12, color: testResult.ok ? "#22c55e" : "#ef4444",
          }}>
            {testResult.ok ? "✅" : "❌"} {testResult.msg}
          </div>
        )}

        <div className="btn-row-responsive" style={{ display: "flex", gap: 8 }}>
          <button
            onClick={saveIntegration}
            disabled={saving}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: "rgba(245,158,11,0.12)", color: "#f59e0b",
              fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            {saving ? "Salvando..." : "Salvar Integração"}
          </button>
          <button
            onClick={testConnection}
            disabled={testing}
            style={{
              padding: "10px 24px", borderRadius: 8, fontSize: 13,
              background: "none", border: "1px solid rgba(255,255,255,0.08)",
              color: "#aaa", cursor: "pointer",
            }}
          >
            {testing ? "Testando..." : "Testar Conexão"}
          </button>
        </div>
      </div>

      {/* ══ Future Integrations ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 16, padding: 24, textAlign: "center",
      }}>
        <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
          🔌 Mais integrações em breve — CRM, E-mail Marketing, Calendário...
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          padding: "12px 20px", borderRadius: 8,
          background: toast.type === "success" ? "rgba(45,212,191,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(45,212,191,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#2DD4BF" : "#ef4444",
          fontSize: 13,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
