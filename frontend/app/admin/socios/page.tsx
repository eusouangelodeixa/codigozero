"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, useToast } from "@/components/ui";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Partner {
  id: string;
  displayName: string;
  roleLabel: string | null;
  sharePct: number;
  enabled: boolean;
  lifetimeEarnings: number;
  lifetimeSales: number;
  availableBalance: number;
  user: { id: string; name: string; email: string; phone: string };
}

const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export default function AdminPartnersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Partner[]>([]);
  const [shareTotal, setShareTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New partner form
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  const hdr = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
      "Content-Type": "application/json",
    }),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/partners`, { headers: hdr() });
      const data = await res.json();
      setRows(data.partners || []);
      setShareTotal(data.shareTotal || 0);
    } catch {
      toast.error("Erro ao carregar sócios");
    }
    setLoading(false);
  }, [hdr, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const pct = parseFloat(sharePct);
    if (!email.trim() || !Number.isFinite(pct)) {
      toast.error("Informe email e percentual válidos");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/admin/partners`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          userEmail: email.trim(),
          phone: phone.trim() || undefined,
          name: displayName.trim() || undefined,
          sharePct: pct,
          roleLabel: roleLabel.trim() || undefined,
          displayName: displayName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const w = data.welcome;
        if (w?.delivered) {
          toast.success("Sócio adicionado", "Acesso enviado pelo WhatsApp.");
        } else {
          toast.success("Sócio adicionado", `WhatsApp não confirmou o envio (${w?.status ?? "—"}). Use "Reenviar acesso".`);
        }
        setEmail("");
        setPhone("");
        setSharePct("");
        setRoleLabel("");
        setDisplayName("");
        load();
      } else {
        toast.error("Falha ao adicionar", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setCreating(false);
  };

  const resendWelcome = async (p: Partner) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`${API}/api/admin/partners/${p.id}/resend-welcome`, {
        method: "POST",
        headers: hdr(),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Acesso reenviado pelo WhatsApp");
      } else {
        toast.error("Falha ao reenviar", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setBusyId(null);
  };

  const editShare = async (p: Partner) => {
    const input = prompt(`Novo percentual para ${p.displayName} (atual ${p.sharePct}%):`, String(p.sharePct));
    if (input === null) return;
    const pct = parseFloat(input);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Percentual inválido");
      return;
    }
    setBusyId(p.id);
    try {
      const res = await fetch(`${API}/api/admin/partners/${p.id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ sharePct: pct }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Percentual atualizado");
        load();
      } else {
        toast.error("Falha", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setBusyId(null);
  };

  const toggleEnabled = async (p: Partner) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`${API}/api/admin/partners/${p.id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(p.enabled ? "Sócio desativado" : "Sócio ativado");
        load();
      } else {
        toast.error("Falha", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setBusyId(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Sócios — Rateio de Receita</h1>
        <p className={styles.pageDesc}>
          Divisão do líquido de cada venda do produto principal. A soma das participações ativas deve ser 100%.
        </p>
      </div>

      <div className={styles.toolbar}>
        <Badge size="md" variant={shareTotal === 100 ? "success" : "warning"}>
          Soma das participações ativas: {shareTotal}%
        </Badge>
      </div>

      {/* New partner */}
      <div className={styles.tableCard} style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Adicionar sócio</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            className={styles.formInput}
            placeholder="Nome de exibição"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ minWidth: 160 }}
          />
          <input
            className={styles.formInput}
            placeholder="Email do usuário"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <input
            className={styles.formInput}
            placeholder="WhatsApp (ex.: 84 123 4567)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <input
            className={styles.formInput}
            placeholder="% (ex.: 35)"
            type="number"
            value={sharePct}
            onChange={(e) => setSharePct(e.target.value)}
            style={{ width: 110 }}
          />
          <input
            className={styles.formInput}
            placeholder="Papel (ex.: Design)"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            style={{ minWidth: 160 }}
          />
          <button type="button" className={styles.primaryBtn} onClick={create} disabled={creating}>
            {creating ? "Adicionando…" : "Adicionar e enviar acesso"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
          Se o email já tiver conta, ele vira sócio. Se não, criamos a conta com o WhatsApp informado.
          O acesso (email + senha) é enviado pelo WhatsApp. Só superadmin pode adicionar.
        </p>
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.empty}>Carregando…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>Nenhum sócio cadastrado.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Sócio</th>
                <th>Papel</th>
                <th>%</th>
                <th>Disponível</th>
                <th>Total ganho</th>
                <th>Vendas</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong>{p.displayName}</strong>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.user?.email}</span>
                    </div>
                  </td>
                  <td>{p.roleLabel || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{p.sharePct}%</td>
                  <td style={{ color: "var(--accent)", fontWeight: 600 }}>{fmtMzn(p.availableBalance)}</td>
                  <td>{fmtMzn(p.lifetimeEarnings)}</td>
                  <td>{p.lifetimeSales}</td>
                  <td>
                    <Badge size="sm" variant={p.enabled ? "success" : "neutral"}>
                      {p.enabled ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" className={styles.primaryBtn} onClick={() => editShare(p)} disabled={busyId === p.id}>
                        Editar %
                      </button>
                      <button type="button" className={styles.linkBtn} onClick={() => resendWelcome(p)} disabled={busyId === p.id}>
                        Reenviar acesso
                      </button>
                      <button type="button" className={styles.dangerBtn} onClick={() => toggleEnabled(p)} disabled={busyId === p.id}>
                        {p.enabled ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
