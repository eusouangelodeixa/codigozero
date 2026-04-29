"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminConfig() {
  const [config, setConfig] = useState<any>({});
  const [funnels, setFunnels] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const VISITOR_PROMPT = `[ROLE E CONTEXTO]
Você é a Sara, Especialista de Onboarding da equipa "Código Zero".
Sua personalidade é carismática, direta, autoritária em relação a negócios, mas muito empática. 
Você NÃO fala como um robô corporativo. Você fala como uma mulher moçambicana profissional de tecnologia no WhatsApp. Use emojis com moderação (máximo 2 por mensagem). Nunca use hashtags.

[OBJETIVO PRINCIPAL]
O cliente preencheu o formulário de diagnóstico da nossa Landing Page, mas NÃO finalizou a compra.
O seu trabalho é converter esta pessoa usando o viés da consistência.

[VARIÁVEIS DE CONTEXTO DO CLIENTE]
- Nome: {{contact.name}}
- Objetivo Financeiro (Meta): {{contact.customFields.goal}}
- Maior Obstáculo (Dor): {{contact.customFields.pain}}
- Tempo Disponível: {{contact.customFields.commitment}}
- Link para Finalizar a Compra: {{contact.customFields.checkout_url}}

[ESTRUTURA DA PRIMEIRA MENSAGEM (Obrigatório seguir na exata ordem)]
1. Quebra-gelo: "Olá {{contact.name}}! Aqui é a Sara da equipa Código Zero."
2. Ancoragem de Objetivo: Diga que estava a analisar o perfil dele e notou que o objetivo dele é "{{contact.customFields.goal}}".
3. Validação e Quebra da Dor: Mencione diretamente o obstáculo: "{{contact.customFields.pain}}". Diga que o Código Zero foi desenhado EXACTAMENTE para pessoas com essa barreira, porque a IA elimina 90% do trabalho duro técnico.
4. Falso Pushback: Diga: "Como me disse que tem {{contact.customFields.commitment}}, isso é tempo mais que suficiente para ter resultados rápidos. Mas o nosso sistema de vagas bloqueou o seu acesso porque faltou finalizar a inscrição."
5. Call to Action: Entregue o link {{contact.customFields.checkout_url}} e diga para ele completar agora antes que as vagas fechem.

[REGRAS DE CONVERSA (Se ele responder)]
- Se não tem dinheiro: Lembre que ele está a 1 cliente de 3.000 MT de empatar meses de investimento.
- Dúvidas técnicas: Reforce que é "Zero Código" e que a Comunidade o guiará.
- NUNCA dê descontos.
- Respostas curtas (máximo 3 parágrafos curtos).`;

  const CHECKOUT_PROMPT = `[ROLE E CONTEXTO]
Você é a Sara, Especialista de Onboarding VIP da equipa "Código Zero".
A sua função é recuperar pagamentos que falharam na gateway Lojou. 
O tom é de preocupação genuína de suporte ao cliente, mantendo a urgência.

[OBJETIVO PRINCIPAL]
O cliente preencheu os dados de pagamento, mas o cartão ou carteira móvel (M-Pesa) falhou.
O seu único trabalho é descobrir o erro técnico e ajudá-lo a passar o pagamento com sucesso.

[VARIÁVEIS DE CONTEXTO DO CLIENTE]
- Nome: {{contact.name}}
- Motivo Inicial de Interesse: {{contact.customFields.goal}}
- Link Seguro de Recuperação: {{contact.customFields.checkout_url}}

[ESTRUTURA DA PRIMEIRA MENSAGEM]
1. Abordagem Direta: "Olá {{contact.name}}! Tudo bem? Aqui é a Sara da equipa Código Zero."
2. O Problema: "Recebi um alerta vermelho do nosso sistema financeiro. Houve uma pequena falha ao processar a sua inscrição no Código Zero agorinha mesmo."
3. A Oferta de Ajuda: "Geralmente isso é só um limite no cartão ou problema de rede da operadora. Aconteceu algum erro estranho aí no seu ecrã?"
4. O Link Seguro: "Pode tentar novamente de forma segura através do seu link exclusivo aqui: {{contact.customFields.checkout_url}}"

[REGRAS DE CONVERSA (Se ele responder)]
- Se foi falta de saldo: "Sem problemas, {{contact.name}}. Quer que eu segure a sua vaga até amanhã?" (Se sim, "Fechado. Tente o link amanhã").
- Se o cartão foi rejeitado: Aconselhe a confirmar com o banco.
- Se perguntar se vale a pena: Lembre que ele quer "{{contact.customFields.goal}}" e que o risco é ZERO porque temos a garantia de devolução em dobro.
- Termine interações longas enviando o link novamente.`;

  const fetchInstances = async () => {
    setLoadingInstances(true);
    try {
      const res = await fetch(`${API}/api/admin/broadcast/instances`, { headers: hdr() });
      const data = await res.json();
      setInstances(data.instances || []);
    } catch { setInstances([]); }
    setLoadingInstances(false);
  };

  useEffect(() => {
    fetch(`${API}/api/admin/system`, { headers: hdr() })
      .then(r => r.json()).then(d => {
        setConfig(d.config || {});
        setFunnels(d.funnels || []);
        // If admin API key is configured, fetch instances
        if (d.config?.komunikaAdminApiKey) {
          fetchInstances();
        }
      });
  }, []);

  const showToast = (msg: string, type?: "success" | "error") => { setToast(type === "error" ? "❌ " + msg : msg); setTimeout(() => setToast(""), 3000); };

  const save = async () => {
    setSaving(true);
    await fetch(`${API}/api/admin/system`, {
      method: "PATCH", headers: hdr(), body: JSON.stringify(config),
    });
    setSaving(false);
    showToast("Configurações salvas ✓");
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Configurações do Sistema</h1>
        <p className={styles.pageDesc}>Controle de vagas, comunidade e mentorias</p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>👥 Capacidade</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Máximo de Usuários</label>
            <input
              className={styles.formInput}
              type="number"
              value={config.maxUsers || 50}
              onChange={e => setConfig({ ...config, maxUsers: parseInt(e.target.value) || 50 })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Usuários Atuais</label>
            <input className={styles.formInput} type="number" value={config.currentUsers || 0} disabled />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>💬 Comunidade</h3>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Link do Discord / Grupo</label>
          <input
            className={styles.formInput}
            placeholder="https://discord.gg/..."
            value={config.communityLink || ""}
            onChange={e => setConfig({ ...config, communityLink: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>📅 Próxima Mentoria</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Data e Hora</label>
            <input
              className={styles.formInput}
              type="datetime-local"
              value={config.mentoriaSchedule ? config.mentoriaSchedule.slice(0, 16) : ""}
              onChange={e => setConfig({ ...config, mentoriaSchedule: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Link da Reunião</label>
            <input
              className={styles.formInput}
              autoComplete="off"
              data-form-type="other"
              placeholder="https://meet.google.com/..."
              value={config.mentoriaLink || ""}
              onChange={e => setConfig({ ...config, mentoriaLink: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>🔗 Automação Komunika</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.formLabel}>Chave da API (Komunika Admin)</label>
            <input
              className={styles.formInput}
              type="text"
              autoComplete="off"
              data-form-type="other"
              placeholder="Ex: kmnk_abc123def456ghi789"
              value={config.komunikaAdminApiKey || ""}
              onChange={e => setConfig({ ...config, komunikaAdminApiKey: e.target.value })}
            />
            <span style={{ fontSize: "12px", color: "#666", marginTop: "4px", display: "block" }}>
              Esta chave será usada para carregar os funis, instâncias e enviar mensagens. Obtenha em <a href="https://app.komunika.site/dashboard/api-keys" target="_blank" style={{ color: "var(--accent)" }}>app.komunika.site</a>.
            </span>
          </div>

          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.formLabel}>Instância WhatsApp (Mensagens Diretas)</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <select
                className={styles.formInput}
                style={{ flex: 1 }}
                value={config.komunikaInstanceId || ""}
                onChange={e => setConfig({ ...config, komunikaInstanceId: e.target.value })}
              >
                <option value="">-- Selecione uma Instância --</option>
                {instances.map((inst: any) => (
                  <option key={inst.id || inst.instanceId} value={inst.id || inst.instanceId}>
                    {inst.name || inst.instanceName || inst.id} {inst.status ? `(${inst.status})` : ""}
                  </option>
                ))}
                {config.komunikaInstanceId && !instances.find((i: any) => (i.id || i.instanceId) === config.komunikaInstanceId) && (
                  <option value={config.komunikaInstanceId}>{config.komunikaInstanceId} (salvo)</option>
                )}
              </select>
              <button
                className={styles.btnPrimary}
                style={{ padding: "8px 16px", whiteSpace: "nowrap", fontSize: "13px" }}
                disabled={loadingInstances || !config.komunikaAdminApiKey}
                onClick={fetchInstances}
              >
                {loadingInstances ? "..." : "🔄 Carregar"}
              </button>
            </div>
            <span style={{ fontSize: "12px", color: "#666", marginTop: "4px", display: "block" }}>
              Usada para enviar credenciais, alertas de expiração, milestones e cupons via WhatsApp.
            </span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Funil de Visitantes (Abandono Landing Page)</label>
            <select
              className={styles.formInput}
              value={config.komunikaVisitorFunnelId || ""}
              onChange={e => setConfig({ ...config, komunikaVisitorFunnelId: e.target.value })}
            >
              <option value="">-- Nenhum Funil Selecionado --</option>
              {funnels.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <span style={{ fontSize: "12px", color: "#666", marginTop: "4px", display: "block" }}>
              Disparado automaticamente pelo Cron Job (30 min).
            </span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Funil de Recuperação (Abandono Checkout Lojou)</label>
            <select
              className={styles.formInput}
              value={config.komunikaCheckoutFunnelId || ""}
              onChange={e => setConfig({ ...config, komunikaCheckoutFunnelId: e.target.value })}
            >
              <option value="">-- Nenhum Funil Selecionado --</option>
              {funnels.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <span style={{ fontSize: "12px", color: "#666", marginTop: "4px", display: "block" }}>
              Disparado instantaneamente pelo Webhook da Lojou.
            </span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>📱 Telefone para Alertas de Milestones</label>
            <input
              className={styles.formInput}
              type="text"
              placeholder="Ex: 841234567"
              value={config.milestoneAlertPhone || ""}
              onChange={e => setConfig({ ...config, milestoneAlertPhone: e.target.value })}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>👤 Nome do Admin (Alertas)</label>
            <input
              className={styles.formInput}
              type="text"
              placeholder="Ex: Angelo"
              value={config.milestoneAlertName || ""}
              onChange={e => setConfig({ ...config, milestoneAlertName: e.target.value })}
            />
          </div>
        </div>

        <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--border-default)" }}>
          <h4 style={{ fontSize: "16px", color: "var(--text-primary)", marginBottom: "16px", fontWeight: 600 }}>🧪 Modo de Teste (Komunika)</h4>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "16px" }}>
            Teste o disparo do funil instantaneamente. O sistema vai enviar um Payload falso contendo as dores e objetivos do lead, além do seu link de checkout de teste.
          </p>
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className={styles.formGroup} style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
              <label className={styles.formLabel}>Número (WhatsApp)</label>
              <input
                className={styles.formInput}
                type="text"
                placeholder="Ex: 841234567"
                id="testPhone"
              />
            </div>
            <div className={styles.formGroup} style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
              <label className={styles.formLabel}>Qual funil testar?</label>
              <select className={styles.formInput} id="testType">
                <option value="visitor">Visitante (Abandono LP)</option>
                <option value="checkout">Recuperação (Abandono Checkout)</option>
              </select>
            </div>
            <button 
              className={styles.btnPrimary} 
              style={{ marginBottom: 0, padding: "10px 24px" }}
              onClick={async (e) => {
                const btn = e.currentTarget;
                const phone = (document.getElementById('testPhone') as HTMLInputElement).value;
                const type = (document.getElementById('testType') as HTMLSelectElement).value;
                
                if (!phone) return showToast("Digite um número de telefone válido", "error");
                
                btn.innerText = "⏳ A enviar...";
                btn.disabled = true;

                try {
                  const res = await fetch(`${API}/api/admin/komunika-test`, {
                    method: 'POST',
                    headers: hdr(),
                    body: JSON.stringify({ phone, type })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    showToast("🚀 Teste disparado com sucesso!");
                  } else {
                    showToast(data.error || "Erro ao disparar teste", "error");
                  }
                } catch (err) {
                  showToast("Falha de conexão com o servidor", "error");
                } finally {
                  btn.innerText = "🚀 Disparar Teste";
                  btn.disabled = false;
                }
              }}
            >
              🚀 Disparar Teste
            </button>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>🧠 Prompts de Inteligência Artificial (Komunika Node)</h3>
        <p style={{ fontSize: "14px", color: "var(--text-tertiary)", marginBottom: "24px" }}>
          Copie estes system prompts altamente refinados (Nível META) e cole diretamente no "System Prompt" dos seus Nodes de IA (OpenAI/Anthropic) dentro do Komunika. Eles já contêm as variáveis dinâmicas corretas.
        </p>

        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h4 style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 600 }}>1. Prompt para o Funil de Visitantes</h4>
            <button 
              onClick={() => copyToClipboard(VISITOR_PROMPT, 'visitor')}
              style={{ padding: "6px 12px", background: "var(--bg-glass)", border: "1px solid var(--border-default)", borderRadius: "6px", color: "var(--accent)", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
            >
              {copied === 'visitor' ? "✓ Copiado!" : "Copiar Prompt"}
            </button>
          </div>
          <textarea 
            readOnly 
            value={VISITOR_PROMPT}
            style={{ width: "100%", height: "240px", background: "#0a0a0a", border: "1px solid var(--border-strong)", borderRadius: "8px", padding: "16px", color: "#a0a0a0", fontFamily: "monospace", fontSize: "12px", lineHeight: "1.5", resize: "vertical", outline: "none" }}
          />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h4 style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 600 }}>2. Prompt para o Abandono de Checkout</h4>
            <button 
              onClick={() => copyToClipboard(CHECKOUT_PROMPT, 'checkout')}
              style={{ padding: "6px 12px", background: "var(--bg-glass)", border: "1px solid var(--border-default)", borderRadius: "6px", color: "var(--accent)", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
            >
              {copied === 'checkout' ? "✓ Copiado!" : "Copiar Prompt"}
            </button>
          </div>
          <textarea 
            readOnly 
            value={CHECKOUT_PROMPT}
            style={{ width: "100%", height: "240px", background: "#0a0a0a", border: "1px solid var(--border-strong)", borderRadius: "8px", padding: "16px", color: "#a0a0a0", fontFamily: "monospace", fontSize: "12px", lineHeight: "1.5", resize: "vertical", outline: "none" }}
          />
        </div>
      </div>

      <div className={styles.btnRow}>
        <button className={styles.btnPrimary} onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar Configurações"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
