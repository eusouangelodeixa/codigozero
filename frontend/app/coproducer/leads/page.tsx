"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../coproducer.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Lead {
  id: string;
  name: string | null;
  email: string;
  phone: string;
  remarketingStage: string;
  createdAt: string;
  checkoutUrl: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  none: "Cadastrado",
  visitor_sent: "Visitante recuperado",
  checkout_pending: "Abandonou checkout",
  checkout_failed_sent: "Remarketing enviado",
};

export default function CoproducerLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (search) params.set("search", search);
    const r = await fetch(`${API}/api/coproducer/leads?${params}`, { headers: hdr() });
    if (r.ok) {
      const d = await r.json();
      setLeads(d.leads || []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Painel do coprodutor</span>
        <h1 className={styles.pageTitle}>Leads</h1>
        <p className={styles.pageDesc}>
          Pessoas que preencheram o formulário no seu link mas ainda não assinaram.
        </p>
      </div>

      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          placeholder="Buscar por nome, email ou telefone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHead}>
          <span className={styles.tableTitle}>Leads</span>
          <span className={styles.tableHint}>{leads.length} no total</span>
        </div>
        {leads.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>WhatsApp</th>
                <th>Estágio</th>
                <th>Capturado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>{l.name || "—"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{l.email}</td>
                  <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: "var(--text-secondary)" }}>{l.phone}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, color: l.remarketingStage === "none" ? "var(--text-tertiary)" : "#f59e0b" }}>
                      {STAGE_LABEL[l.remarketingStage] || l.remarketingStage}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-tertiary)" }}>
                    {new Date(l.createdAt).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.tableEmpty}>{loading ? "Carregando…" : "Nenhum lead capturado ainda."}</div>
        )}
      </div>
    </div>
  );
}
