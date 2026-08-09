"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { AdminPage, Section } from "@/components/admin";
import k from "@/components/admin/kit.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("cz_token") : ""}`,
});

type Aluno = { nome: string; email: string; whatsapp: string };
type Coprodutor = { code: string; displayName?: string | null };
type Resultado = {
  total: number;
  created: number;
  reused: number;
  skipped: Array<{ line: number; reason: string; raw: string }>;
};

/** Cabeçalhos aceites por coluna — tolerante a acento, caixa e variações. */
const COLUNAS: Record<keyof Aluno, string[]> = {
  nome: ["nome", "name", "aluno", "nome completo"],
  email: ["email", "e-mail", "mail", "correio"],
  whatsapp: ["whatsapp", "whats", "telefone", "telemovel", "telemóvel", "celular", "phone", "contacto", "contato"],
};

const normalizar = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Descobre qual coluna da planilha corresponde a cada campo. */
function mapearColunas(cabecalho: unknown[]): Partial<Record<keyof Aluno, number>> {
  const mapa: Partial<Record<keyof Aluno, number>> = {};
  cabecalho.forEach((celula, i) => {
    const valor = normalizar(celula);
    (Object.keys(COLUNAS) as Array<keyof Aluno>).forEach((campo) => {
      if (mapa[campo] === undefined && COLUNAS[campo].some((alias) => valor === alias || valor.startsWith(alias))) {
        mapa[campo] = i;
      }
    });
  });
  return mapa;
}

export default function ImportarTurma({ params }: { params: Promise<{ id: string }> }) {
  // O curso vem da rota: chegámos aqui de dentro dele, como na Kiwify — não
  // faz sentido voltar a escolhê-lo numa lista.
  const { id: cursoId } = use(params);
  const router = useRouter();
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [colado, setColado] = useState("");

  const [curso, setCurso] = useState<{ name: string } | null>(null);
  const [coprodutores, setCoprodutores] = useState<Coprodutor[]>([]);
  const [dias, setDias] = useState(30);
  const [coprodutor, setCoprodutor] = useState("");
  const [vitalicio, setVitalicio] = useState(true);

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API}/api/admin/members/courses/${cursoId}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => setCurso(d.course ? { name: d.course.name } : null))
      .catch(() => {});
    fetch(`${API}/api/admin/coproducers`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => setCoprodutores(d.coproducers || d.accounts || []))
      .catch(() => {});
  }, [cursoId]);

  /** Lê CSV, XLS ou XLSX pela mesma via — o SheetJS trata os três. */
  const lerArquivo = async (file: File) => {
    setAviso(null);
    setResultado(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const aba = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, blankrows: false });
      if (linhas.length === 0) {
        setAviso("A planilha está vazia.");
        return;
      }

      const mapa = mapearColunas(linhas[0] as unknown[]);
      const temCabecalho = Object.keys(mapa).length > 0;
      if (!temCabecalho) {
        setAviso(
          "Não encontrei as colunas. A primeira linha precisa ter os títulos: nome, email e whatsapp.",
        );
        return;
      }
      if (mapa.email === undefined && mapa.whatsapp === undefined) {
        setAviso("O arquivo precisa ter pelo menos a coluna de email ou a de whatsapp.");
        return;
      }

      const lidos: Aluno[] = [];
      for (const linha of linhas.slice(1)) {
        const l = linha as unknown[];
        const aluno: Aluno = {
          nome: mapa.nome !== undefined ? String(l[mapa.nome] ?? "").trim() : "",
          email: mapa.email !== undefined ? String(l[mapa.email] ?? "").trim() : "",
          whatsapp: mapa.whatsapp !== undefined ? String(l[mapa.whatsapp] ?? "").trim() : "",
        };
        if (aluno.email || aluno.whatsapp) lidos.push(aluno);
      }

      if (lidos.length === 0) {
        setAviso("Nenhuma linha com email ou whatsapp preenchido.");
        return;
      }
      setAlunos(lidos);
      setNomeArquivo(file.name);
    } catch {
      setAviso("Não consegui ler esse arquivo. Salve como CSV ou XLSX e tente de novo.");
    }
  };

  /** Lista colada continua a funcionar — o backend usa o mesmo parser. */
  const usarColado = () => {
    const linhas = colado
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const lidos: Aluno[] = [];
    for (const linha of linhas) {
      const partes = linha.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
      const aluno: Aluno = { nome: "", email: "", whatsapp: "" };
      for (const parte of partes) {
        if (!aluno.email && parte.includes("@")) aluno.email = parte;
        else if (!aluno.whatsapp && /^\+?[\d\s()-]{8,}$/.test(parte)) aluno.whatsapp = parte;
        else if (!aluno.nome) aluno.nome = parte;
      }
      if (aluno.email || aluno.whatsapp) lidos.push(aluno);
    }
    if (lidos.length === 0) {
      setAviso("Não encontrei ninguém com email ou whatsapp nessa lista.");
      return;
    }
    setAviso(null);
    setAlunos(lidos);
    setNomeArquivo(null);
  };

  const semContacto = useMemo(() => alunos.filter((a) => !a.email && !a.whatsapp).length, [alunos]);
  const semEmail = useMemo(() => alunos.filter((a) => !a.email).length, [alunos]);

  const importar = async () => {
    if (alunos.length === 0 || enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const list = alunos.map((a) => [a.nome, a.email, a.whatsapp].filter(Boolean).join(",")).join("\n");
      const res = await fetch(`${API}/api/admin/users/bulk-enroll`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          list,
          platformDays: dias,
          courseId: cursoId,
          courseLifetime: vitalicio,
          coproducerCode: coprodutor || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAviso(data.error || "Falha na importação.");
        return;
      }
      setResultado(data);
      setAlunos([]);
      setNomeArquivo(null);
      setColado("");
      if (inputArquivo.current) inputArquivo.current.value = "";
    } catch {
      setAviso("Erro de conexão.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AdminPage
      eyebrow="Alunos"
      title={curso ? `Importar alunos · ${curso.name}` : "Importar alunos"}
      desc="Sobe a lista de uma vez: acesso ao curso, tempo de plataforma e vínculo com o coprodutor."
      actions={
        <button type="button" className={k.btnSecondary} onClick={() => router.push(`/admin/cursos/${cursoId}/alunos`)}>
          ← Alunos
        </button>
      }
    >
      <Section title="1. O arquivo" subtitle="CSV, XLS ou XLSX. A primeira linha precisa ter os títulos das colunas.">
        <div className={k.cellMuted} style={{ marginBottom: 16, lineHeight: 1.7 }}>
          São três colunas, nesta ordem ou em qualquer outra:
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              marginTop: 10,
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--border-default)",
            }}
          >
            {["nome", "email", "whatsapp"].map((c) => (
              <div key={c} style={{ background: "var(--bg-elevated)", padding: "10px 12px", fontWeight: 600 }}>
                {c}
              </div>
            ))}
            {["Maria Santos", "maria@email.com", "848123456"].map((c) => (
              <div key={c} style={{ background: "var(--bg-surface)", padding: "10px 12px", fontFamily: "var(--font-mono)" }}>
                {c}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12 }}>
            Aceito variações nos títulos (&quot;e-mail&quot;, &quot;telefone&quot;, &quot;celular&quot;, com ou sem acento).
            Basta ter <strong>email ou whatsapp</strong> — quem não tiver nenhum dos dois é recusado e aparece na lista de
            ignorados, em vez de sumir em silêncio.
          </p>
        </div>

        <input
          ref={inputArquivo}
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lerArquivo(f);
          }}
        />

        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>
            Ou colar a lista à mão
          </summary>
          <textarea
            rows={6}
            placeholder={"Maria Santos, maria@email.com, 848123456\nJoão Silva, joao@email.com, 872425267"}
            value={colado}
            onChange={(e) => setColado(e.target.value)}
            style={{
              width: "100%", marginTop: 10, padding: 12, borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)", color: "var(--text-primary)",
              border: "1px solid var(--border-default)", fontFamily: "var(--font-mono)", fontSize: 13,
            }}
          />
          <button type="button" className={k.btnSecondary} onClick={usarColado} style={{ marginTop: 8 }}>
            Usar esta lista
          </button>
        </details>

        {aviso && (
          <p style={{ marginTop: 14, color: "var(--color-warning)" }}>{aviso}</p>
        )}
      </Section>

      {alunos.length > 0 && (
        <Section
          title={`2. Conferência — ${alunos.length} aluno(s)`}
          subtitle={nomeArquivo ? `Lido de ${nomeArquivo}` : "Lista colada"}
        >
          {semEmail > 0 && (
            <p style={{ color: "var(--color-warning)", marginBottom: 12 }}>
              {semEmail} sem e-mail: esses vão receber por WhatsApp, o que é bem mais lento (uma mensagem a cada 15–20
              minutos).
            </p>
          )}
          {semContacto > 0 && (
            <p style={{ color: "var(--color-error)", marginBottom: 12 }}>
              {semContacto} sem contacto nenhum — serão recusados.
            </p>
          )}
          <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  {["Nome", "E-mail", "WhatsApp"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alunos.slice(0, 100).map((a, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "8px 12px" }}>{a.nome || <span className={k.cellMuted}>—</span>}</td>
                    <td style={{ padding: "8px 12px" }}>{a.email || <span className={k.cellMuted}>—</span>}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)" }}>
                      {a.whatsapp || <span className={k.cellMuted}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alunos.length > 100 && (
            <p className={k.cellMuted} style={{ marginTop: 8 }}>Mostrando os primeiros 100 de {alunos.length}.</p>
          )}
        </Section>
      )}

      <Section title="3. O que eles recebem" subtitle="O curso pode ser vitalício mesmo que a plataforma expire.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>

          <label style={{ display: "block" }}>
            <span className={k.cellMuted}>Dias de plataforma</span>
            <input
              type="number"
              min={0}
              max={3650}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
            />
          </label>

          <label style={{ display: "block" }}>
            <span className={k.cellMuted}>Coprodutor</span>
            <select
              value={coprodutor}
              onChange={(e) => setCoprodutor(e.target.value)}
              style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
            >
              <option value="">Nenhum</option>
              {coprodutores.map((c) => (
                <option key={c.code} value={c.code}>{c.displayName || c.code}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={vitalicio} onChange={(e) => setVitalicio(e.target.checked)} />
          <span>Acesso ao curso é vitalício (continua depois de a plataforma expirar)</span>
        </label>

        <p className={k.cellMuted} style={{ marginTop: 14, lineHeight: 1.7 }}>
          As credenciais saem <strong>por e-mail primeiro</strong>. Só quando o limite diário de e-mail acabar é que o
          resto passa para o WhatsApp, com 15 a 20 minutos entre cada mensagem — o número é o mesmo do suporte e da
          recuperação de senha, e uma rajada colocaria tudo isso em risco. A fila continua sozinha, inclusive depois de
          um deploy.
          {coprodutor && " O coprodutor escolhido passa a receber as comissões de quem assinar depois, e os avisos de renovação usam o link dele."}
        </p>

        <button
          type="button"
          className={k.btnPrimary}
          onClick={importar}
          disabled={alunos.length === 0 || enviando}
          style={{ marginTop: 18 }}
        >
          {enviando ? "Importando…" : `Importar ${alunos.length || ""} aluno(s)`}
        </button>
      </Section>

      {resultado && (
        <Section title="Resultado" subtitle="As mensagens saem em segundo plano.">
          <p style={{ lineHeight: 1.8 }}>
            <strong>{resultado.created}</strong> conta(s) criada(s) · <strong>{resultado.reused}</strong> já
            existia(m) e foi(ram) actualizada(s) · <strong>{resultado.skipped.length}</strong> ignorada(s).
          </p>
          {resultado.skipped.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className={k.cellMuted}>Ignorados:</p>
              <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.7 }}>
                {resultado.skipped.slice(0, 20).map((s, i) => (
                  <li key={i}>
                    linha {s.line}: {s.reason} {s.raw && <code>({s.raw})</code>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}
    </AdminPage>
  );
}
