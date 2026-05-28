"use client";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import styles from "./coproducer.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Snapshot {
  metrics: {
    revenue: number;
    count: number;
    newCount: number;
    renewalCount: number;
    yourShareRevenue: number;
    sharePct: number;
    activePaidUsers: number;
    renewalRate: number | null;
  };
  transactions: { items: { id: string; userName: string | null; amount: number; createdAt: string; isRenewal: boolean }[] };
}

interface Me {
  code: string;
  productPid: string;
  bumpProductPid: string | null;
  bumpPrice: number | null;
  sharePct: number;
  landingUrl: string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);

export default function CoproducerOverview() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/coproducer/finance?period=30d&limit=5`, { headers: hdr() }).then((r) => r.json()).catch(() => null),
      fetch(`${API}/api/coproducer/me`, { headers: hdr() }).then((r) => r.json()).catch(() => null),
    ]).then(([fin, meData]) => {
      if (fin) setData(fin);
      if (meData) setMe(meData);
      setLoading(false);
    });
  }, []);

  const copyLink = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.landingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div>
      <div className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Painel do coprodutor</span>
        <h1 className={styles.pageTitle}>Visão geral</h1>
        <p className={styles.pageDesc}>
          Resumo das suas vendas, leads e assinantes vindos do seu link exclusivo de coprodução.
        </p>
      </div>

      {/* ── Hero card: link de coprodução ── */}
      {me && (
        <div className={styles.linkHero}>
          <div className={styles.linkHeroMeta}>
            <span className={styles.linkHeroEyebrow}>Seu link de coprodução</span>
            <code className={styles.linkHeroValue}>{me.landingUrl}</code>
            <div className={styles.linkHeroChips}>
              <span className={styles.linkHeroChip}>PID principal: <strong>{me.productPid}</strong></span>
              {me.bumpProductPid ? (
                <span className={`${styles.linkHeroChip} ${styles.linkHeroChipBump}`}>
                  Bump: <strong>{me.bumpProductPid}</strong>
                  {me.bumpPrice != null ? ` · ${fmtMoney(me.bumpPrice)}` : ""}
                </span>
              ) : (
                <span className={styles.linkHeroChipMuted}>Sem bump próprio</span>
              )}
              <span className={styles.linkHeroChip}>Sua parte: <strong>{me.sharePct}%</strong></span>
            </div>
          </div>
          <div className={styles.linkHeroActions}>
            <button onClick={copyLink} className={styles.linkHeroBtnPrimary}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copiado" : "Copiar link"}
            </button>
            <a href={me.landingUrl} target="_blank" rel="noopener noreferrer" className={styles.linkHeroBtn}>
              <ExternalLink size={14} /> Abrir landing
            </a>
          </div>
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Faturamento (30d)</div>
          <div className={styles.statValue}>{data ? fmtMoney(data.metrics.revenue) : loading ? "…" : "—"}</div>
          <div className={styles.statSub}>{data ? `${data.metrics.count} vendas` : ""}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Sua parte estimada ({data?.metrics.sharePct ?? "—"}%)</div>
          <div className={styles.statValue}>{data ? fmtMoney(data.metrics.yourShareRevenue) : "—"}</div>
          <div className={styles.statSub}>Documentação · Lojou faz o split</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Assinantes ativos</div>
          <div className={styles.statValue}>{data?.metrics.activePaidUsers ?? "—"}</div>
          <div className={styles.statSub}>via seu link</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Novas vs renovações</div>
          <div className={styles.statValue}>{data ? `${data.metrics.newCount} / ${data.metrics.renewalCount}` : "—"}</div>
          <div className={styles.statSub}>30 dias</div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHead}>
          <span className={styles.tableTitle}>Vendas recentes</span>
          <a href="/coproducer/finance" className={styles.tableHint}>Ver todas →</a>
        </div>
        {data?.transactions.items.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Data</th>
                <th style={{ textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.items.map((t) => (
                <tr key={t.id}>
                  <td>{t.userName || "—"}</td>
                  <td style={{ fontSize: 11, color: t.isRenewal ? "#3b82f6" : "#22c55e", fontWeight: 600 }}>
                    {t.isRenewal ? "Renovação" : "Nova"}
                  </td>
                  <td style={{ color: "var(--text-tertiary)" }}>
                    {new Date(t.createdAt).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short" })}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {fmtMoney(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.tableEmpty}>
            {loading ? "Carregando…" : "Ainda sem vendas. Divulgue seu link de coprodução."}
          </div>
        )}
      </div>
    </div>
  );
}
