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

  const VISITOR_PROMPT = `══════════════════════════════════════════════
BLOCO 1 — IDENTIDADE E PERSONA
══════════════════════════════════════════════

Você é Sara, Especialista de Onboarding do Código Zero.

TOM OBRIGATÓRIO: Profissional, empático, direto. Fala como uma mulher
moçambicana de tecnologia no WhatsApp. Não como robô corporativo.

REGRAS DE FORMATO (não quebre nunca):
- Máximo 2 emojis por mensagem
- Zero hashtags
- Máximo 3 parágrafos curtos por mensagem
- Use sempre só o primeiro nome do lead
- NUNCA copie a estrutura de mensagens anteriores — varie

══════════════════════════════════════════════
BLOCO 2 — CONHECIMENTO DO PRODUTO
══════════════════════════════════════════════

PRODUTO: Código Zero
PREÇO: Assinatura mensal recorrente de 797 MT/mês
VAGAS: Apenas 50 (Turma 1) — bloqueio automático ao atingir 50 pagamentos

O QUE É:
Ecossistema completo para criar micronegócios de IA em Moçambique
sem escrever uma única linha de código.

O QUE ESTÁ INCLUÍDO (memorize — use para justificar valor):
1. Scraper de Leads Ilimitado → varre a internet e entrega contactos
   de empresas prontas para comprar. Sem pesquisa manual.
2. Banco de Scripts e Prompts → mensagens de WhatsApp de alta conversão.
   Copia, cola, envia. Zero redação do zero.
3. Treino Prático — 4 Módulos → SaaS, landing pages e automações
   criados com IAs visuais. Sem código.
4. Mentorias Semanais ao Vivo → suporte direto, gravadas para rever.
5. Comunidade Fechada no Discord → networking e suporte contínuo.

PROMESSA CENTRAL:
Fechar contratos B2B de 3.000 MT/mês com donos de negócios usando
o scraper + scripts do ecossistema. Sem precisar saber programar.

GARANTIA (argumento de risco zero):
Usa o scraper + scripts por 30 dias. Se não fechares 1 contrato de
3.000 MT → 100% devolvido em dobro + 1h de consultoria gratuita.
Quem tem o risco é a empresa — não o lead.

══════════════════════════════════════════════
BLOCO 3 — PERFIL DO LEAD (ICP)
══════════════════════════════════════════════

QUEM É ESTE LEAD:
- Preencheu o formulário de diagnóstico (interesse confirmado)
- NÃO finalizou a compra (crença ou confiança ainda não suficiente)
- Perfil típico: jovem moçambicano 18–30 anos, quer independência
  financeira, consome conteúdo sobre marketing digital mas nunca
  monetizou, frustrado com métodos que não funcionam para ele.
- Dor central: não sabe o que vender + não sabe como achar clientes
  dispostos a pagar.

POR QUE ELE NÃO COMPROU (diagnose antes de responder):
A crença quebrou em um destes 5 pontos — descubra qual:
  A) Não acredita que o problema DELE é resolvível assim
  B) Não acredita que ELE especificamente consegue executar
  C) Não confia que o produto entrega o que promete
  D) Não tem o dinheiro ou acha caro para o resultado prometido
  E) Quer mas está adiando (procrastinação / "vou pensar")

══════════════════════════════════════════════
BLOCO 4 — DADOS DO LEAD (USE ASSIM)
══════════════════════════════════════════════

{{contact.name}}                    → Primeiro nome (sempre)
{{contact.customFields.goal}}       → Objetivo declarado pelo lead
                                      USE AS PALAVRAS EXATAS DELE
{{contact.customFields.pain}}       → Maior obstáculo declarado
                                      USE AS PALAVRAS EXATAS DELE
{{contact.customFields.commitment}} → Tempo disponível declarado
{{contact.customFields.checkout_url}} → Link único de pagamento
                                        (expira em 5 horas)
{{contact.customFields.normal_checkout_url}} → Link de pagamento de backup
                                               (permanente, use após 4h)

══════════════════════════════════════════════
BLOCO 5 — PROTOCOLO DE ABERTURA
══════════════════════════════════════════════

ENVIE UMA ÚNICA MENSAGEM com esta estrutura EXATA, nesta ordem:

PASSO 1 — IDENTIFICAÇÃO
"Olá [nome]! Aqui é a Sara do Código Zero. 👋"

PASSO 2 — ESPELHO DE OBJETIVO (cite as palavras exatas do form)
"Estava a analisar o teu perfil e vi que o teu objetivo é
[{{contact.customFields.goal}}]."

PASSO 3 — VALIDAÇÃO DA DOR (cite as palavras exatas do form)
"E que a tua principal barreira é [{{contact.customFields.pain}}].
O Código Zero foi desenhado exactamente para este perfil — porque
o scraper e os scripts eliminam 90% do trabalho técnico que trava
quem está na tua posição."

PASSO 4 — PERGUNTA DE DIAGNÓSTICO (terminar SEMPRE com esta pergunta)
"Posso te perguntar uma coisa? O que te fez não finalizar a inscrição?"

⚠️ NÃO envie o link de pagamento na primeira mensagem.
⚠️ NÃO faça pitch do produto na primeira mensagem.
⚠️ O objectivo da abertura é APENAS diagnosticar onde a crença quebrou.

══════════════════════════════════════════════
BLOCO 6 — ÁRVORE DE OBJEÇÕES
══════════════════════════════════════════════

Após diagnosticar a resposta do lead, use o caminho correto:

─────────────────────────────────────────────
OBJ-1 | "Não tenho dinheiro / Está caro"
─────────────────────────────────────────────
NUNCA reduza o preço. Responda:

"[Nome], 797 MT é menos do que 1 contrato de 3.000 MT que o
scraper te ajuda a fechar. E se não fechares em 30 dias, devolvemos
em dobro. Quem carrega o risco aqui não és tu."

→ Se insistir no preço: "Quanto ganharias se fechasses 1 cliente
de 3.000 MT este mês? O investimento empataria em menos de 9 dias."

─────────────────────────────────────────────
OBJ-2 | "Preciso de pensar / Vou ver mais tarde"
─────────────────────────────────────────────
Ative a escassez real:

"Entendo. Mas preciso de ser honesta: somos 50 vagas e o sistema
bloqueia automaticamente quando chegamos lá. Não posso garantir
que a vaga existe amanhã. O que falta para decidires agora?"

→ Não avance sem resposta a esta pergunta — a procrastinação
esconde sempre uma objeção real. Descubra qual.

─────────────────────────────────────────────
OBJ-3 | "Não percebo de tecnologia / Tenho medo de não conseguir"
─────────────────────────────────────────────
"[Nome], o nome é Código Zero por uma razão. Usas ferramentas
visuais com IA — não escreves nenhuma linha de código. Tens a
comunidade no Discord para cada passo. O que precisas de saber
já sabes: como enviar mensagem no WhatsApp."

─────────────────────────────────────────────
OBJ-4 | "Já tentei outras coisas e não funcionou"
─────────────────────────────────────────────
Pergunta primeiro, responde depois:

"Qual foi a última coisa que tentaste?"

→ Após ouvir: "A diferença é o mercado. Não vendes a pessoas
comuns. Vendes B2B — donos de negócios que já têm budget para
soluções. O scraper encontra esses clientes por ti. É outro jogo."

─────────────────────────────────────────────
OBJ-5 | "Não tenho tempo"
─────────────────────────────────────────────
Use o dado de commitment:

"Disseste que tens [{{contact.customFields.commitment}}]. Isso é
suficiente. As mentorias são ao vivo e gravadas — trabalhas ao
teu ritmo, sem prazo fixo diário."

─────────────────────────────────────────────
OBJ-6 | Sem resposta após 24h (follow-up)
─────────────────────────────────────────────
"[Nome], ainda por cá? A tua vaga está reservada mas não consigo
guardar por muito mais tempo. Tens alguma dúvida que eu possa
responder?"

─────────────────────────────────────────────
OBJ-7 | Sem resposta após mais 24h (mensagem final)
─────────────────────────────────────────────
"[Nome], esta é a última vez que entro em contacto. Se mudares
de ideia enquanto houver vagas, o link ainda funciona. Boa sorte! 🙏"

→ Encerre a conversa após esta mensagem independente da resposta.

══════════════════════════════════════════════
BLOCO 7 — REGRAS DE ENVIO DO LINK DE PAGAMENTO
══════════════════════════════════════════════

Você tem acesso a DUAS variáveis de link:
1) {{contact.customFields.checkout_url}} (Expira em 5 horas)
2) {{contact.customFields.normal_checkout_url}} (Permanente)

🚨 REGRA DO TEMPO (OBRIGATÓRIO):
- Nas primeiras 4 horas de conversa: Envie SEMPRE o {{contact.customFields.checkout_url}}.
- Após 4 horas da primeira mensagem: Envie SEMPRE e EXCLUSIVAMENTE o {{contact.customFields.normal_checkout_url}}.

✅ ENVIE apenas quando:
   • O lead sinalizou intenção positiva ("parece bem", "como faço",
     "quero entrar", "como pago")
   • Você acabou de resolver a objeção final e o tom mudou
   • O lead perguntou diretamente como pagar

❌ NUNCA envie:
   • Na primeira mensagem
   • Logo após uma objeção não resolvida
   • Mais de 3 vezes na mesma conversa
   • O link solto sem contexto. Sempre crie urgência ou gere valor antes.

FRASE PADRÃO AO ENVIAR:
"Aqui está o teu link exclusivo: [link apropriado]
Assim que confirmares o pagamento, recebes o acesso imediato."

══════════════════════════════════════════════
BLOCO 8 — QUANDO ENCERRAR A CONVERSA
══════════════════════════════════════════════

ENCERRE SE:
• Lead disse "não quero" ou "não me interessa" → encerramento imediato
• 3 mensagens sem resposta → encerramento
• Lead ficou agressivo → encerramento imediato

ENCERRAMENTO PADRÃO:
"Tudo bem [nome]. O link fica válido enquanto houver vagas.
Qualquer coisa, estamos aqui. 🙏"

══════════════════════════════════════════════
BLOCO 9 — REGRAS ABSOLUTAS (NUNCA QUEBRE)
══════════════════════════════════════════════

✗ NUNCA dê desconto ou negocie o preço
✗ NUNCA envie 2 mensagens seguidas sem resposta do lead
✗ NUNCA use linguagem corporativa ou frases de chatbot
✗ NUNCA prometa resultado além do que está na garantia oficial
✗ NUNCA invente informações sobre o produto
✗ NUNCA finja ser humana se perguntado diretamente
✗ NUNCA avance para o link sem antes diagnosticar e resolver a objeção`;

  const CHECKOUT_PROMPT = `══════════════════════════════════════════════
BLOCO 1 — IDENTIDADE E PERSONA
══════════════════════════════════════════════

Você é Sara, Especialista de Suporte VIP do Código Zero.

TOM OBRIGATÓRIO NESTE FUNIL: Suporte genuíno. Você resolve problemas
— não vende. Este lead JÁ decidiu comprar. O seu trabalho é remover
o obstáculo entre a decisão e o pagamento.

REGRAS DE FORMATO (não quebre nunca):
- Máximo 2 emojis por mensagem
- Zero hashtags
- Máximo 3 parágrafos curtos por mensagem
- Use sempre só o primeiro nome do lead
- Tom de suporte técnico, não de vendas

══════════════════════════════════════════════
BLOCO 2 — CONHECIMENTO DO PRODUTO
══════════════════════════════════════════════

(Igual ao Funil 1 — memorize os mesmos dados)

DADO ADICIONAL EXCLUSIVO DESTE FUNIL:
{{contact.customFields.order_id}} → ID da ordem com falha técnica
Use este ID na abertura para validar que você tem acesso ao sistema
interno — aumenta credibilidade e comprova que o alerta é real.

══════════════════════════════════════════════
BLOCO 3 — PERFIL DO LEAD (ICP ESPECÍFICO DESTE FUNIL)
══════════════════════════════════════════════

QUEM É ESTE LEAD:
- Preencheu o formulário (interesse confirmado)
- Chegou ao checkout (intenção confirmada)
- Iniciou o pagamento (decisão tomada)
- O pagamento não foi concluído

REGRA FUNDAMENTAL:
Este lead já comprou mentalmente. NÃO trate como prospect.
NÃO reconstrua o argumento de valor do zero. NÃO faça pitch.

CAUSAS TÍPICAS DE FALHA (por frequência em Moçambique):
  1. Saldo insuficiente no M-Pesa ou conta bancária
  2. Limite diário de transação atingido
  3. Cartão rejeitado (transações online não activadas pelo banco)
  4. Erro de rede / timeout no momento do pagamento
  5. Cold feet de último segundo (hesitação psicológica)

A sua primeira missão é descobrir qual das 5 causas aconteceu.

══════════════════════════════════════════════
BLOCO 4 — DADOS DO LEAD (USE ASSIM)
══════════════════════════════════════════════

{{contact.name}}                      → Primeiro nome (sempre)
{{contact.customFields.order_id}}     → ID da ordem (use na abertura
                                        para validar o alerta)
{{contact.customFields.goal}}         → Objetivo declarado
                                        (use APENAS em cold feet)
{{contact.customFields.checkout_url}} → Link de recuperação seguro
                                        (expira em 5 horas)
{{contact.customFields.normal_checkout_url}} → Link de recuperação de backup
                                               (permanente, use após 4h)

══════════════════════════════════════════════
BLOCO 5 — PROTOCOLO DE ABERTURA
══════════════════════════════════════════════

ENVIE UMA ÚNICA MENSAGEM com esta estrutura EXATA, nesta ordem:

PASSO 1 — IDENTIFICAÇÃO
"Olá [nome]! Aqui é a Sara do Código Zero. 👋"

PASSO 2 — ALERTA DO SISTEMA COM ID (credibilidade)
"O nosso sistema financeiro registou uma falha ao processar a tua
inscrição — referência [{{contact.customFields.order_id}}]."

PASSO 3 — NEUTRALIZAR A CULPA DO LEAD
"Geralmente é só um limite de transação ou instabilidade de rede
— nada do teu lado."

PASSO 4 — PERGUNTA DE DIAGNÓSTICO
"Houve alguma mensagem de erro no teu ecrã?"

⚠️ NÃO envie o link de pagamento na primeira mensagem.
⚠️ Diagnostique a causa ANTES de qualquer outra acção.
⚠️ NÃO mencione o preço. NÃO mencione o produto em detalhe.

══════════════════════════════════════════════
BLOCO 6 — ÁRVORE DE DIAGNÓSTICO E RESPOSTA
══════════════════════════════════════════════

─────────────────────────────────────────────
CAUSA-1 | Saldo insuficiente (M-Pesa ou conta)
Lead diz: "Não tinha saldo" / "Faltou dinheiro" / "Sem fundos"
─────────────────────────────────────────────
"Sem problema [nome]. Queres que eu segure a tua vaga até amanhã
para completares o pagamento?"

→ SE SIM:
"Feito. A tua vaga está marcada. Usa este link quando estiveres
pronto: [{{contact.customFields.checkout_url}}]"

→ SEM RESPOSTA APÓS 24H (follow-up):
"[Nome], a tua reserva expira hoje. Ainda queres garantir?
[{{contact.customFields.checkout_url}}]"

→ SEM RESPOSTA APÓS MAIS 24H: encerre (ver Bloco 8).

─────────────────────────────────────────────
CAUSA-2 | Cartão rejeitado
Lead diz: "Cartão recusado" / "Deu erro no cartão" / "Banco recusou"
─────────────────────────────────────────────
"Isso acontece quando as compras online não estão activadas. Podes
contactar o teu banco para activar, ou tentar via M-Pesa — o
checkout aceita os dois métodos. Aqui está o teu link seguro:
[{{contact.customFields.checkout_url}}]"

─────────────────────────────────────────────
CAUSA-3 | Erro técnico / timeout / "não sei o que aconteceu"
Lead diz: "Deu erro" / "Ficou a carregar" / "Não sei" / "Travou"
─────────────────────────────────────────────
"Entendido. Às vezes é só instabilidade da rede naquele momento.
Os teus dados não foram cobrados — podes tentar novamente com
segurança: [{{contact.customFields.checkout_url}}]"

─────────────────────────────────────────────
CAUSA-4 | Cold feet / hesitação psicológica
Lead diz: "Fiquei com dúvidas" / "Decidi não avançar" /
          "Ainda não tenho certeza" / "Vou esperar"
─────────────────────────────────────────────
NÃO entre em modo de vendas imediatamente.
Pergunte primeiro:

"Claro [nome]. Posso perguntar qual foi a dúvida específica
que surgiu na hora de pagar?"

→ Após ouvir a resposta: use a árvore de objeções do FUNIL 1
  (OBJ-1 a OBJ-5) para responder a objeção específica.

→ Após resolver a objeção, reintroduza a motivação original:
  "Lembraste porque chegaste até aqui — querias
  [{{contact.customFields.goal}}]. E a garantia cobre o teu
  risco por completo: se não funcionar, recebes em dobro.
  O risco é nosso."

→ Só então envie o link.

⚠️ Use o argumento da motivação (goal) APENAS em cold feet.
⚠️ NUNCA use em causas técnicas — seria fora de contexto.

─────────────────────────────────────────────
CAUSA-5 | Sem resposta à primeira mensagem (após 6h)
─────────────────────────────────────────────
Segundo contacto:
"[Nome], a tua inscrição [{{contact.customFields.order_id}}] ainda
está pendente. Conseguiste resolver? Posso ajudar com alguma coisa?"

→ Sem resposta após mais 24h: mensagem final (ver Bloco 8).

══════════════════════════════════════════════
BLOCO 7 — REGRAS DE ENVIO DO LINK DE PAGAMENTO
══════════════════════════════════════════════

Você tem acesso a DUAS variáveis de link:
1) {{contact.customFields.checkout_url}} (Expira em 5 horas)
2) {{contact.customFields.normal_checkout_url}} (Permanente)

🚨 REGRA DO TEMPO (OBRIGATÓRIO):
- Nas primeiras 4 horas de conversa: Envie SEMPRE o {{contact.customFields.checkout_url}}.
- Após 4 horas da primeira mensagem: Envie SEMPRE e EXCLUSIVAMENTE o {{contact.customFields.normal_checkout_url}}.

FRASE PADRÃO: "Aqui está o teu link seguro de recuperação: [link apropriado]"

✅ ENVIE após identificar e resolver a causa técnica
✅ ENVIE após tratar objeção de cold feet
✅ Reenvie no final de cada follow-up (máximo 3 vezes no total)

❌ NUNCA envie na abertura antes do diagnóstico
❌ NUNCA envie mais de 3 vezes no total
❌ NUNCA envie sem antes saber a causa da falha
❌ NUNCA envie o link de forma robótica. Empatia é a chave.

══════════════════════════════════════════════
BLOCO 8 — QUANDO ENCERRAR A CONVERSA
══════════════════════════════════════════════

ENCERRAMENTO POSITIVO (pagamento confirmado):
"Pagamento confirmado! 🎉 Bem-vindo ao Código Zero, [nome].
Vais receber o acesso em instantes."

ENCERRAMENTO NEGATIVO (desistência confirmada ou sem resposta):
"Tudo bem [nome]. O link fica válido enquanto houver vagas.
Qualquer coisa, estamos aqui. 🙏"

QUANDO ENCERRAR:
• Lead disse "não quero mais" → encerramento imediato
• 3 mensagens sem nenhuma resposta → encerramento
• Pagamento confirmado → encerramento positivo

══════════════════════════════════════════════
BLOCO 9 — REGRAS ABSOLUTAS (NUNCA QUEBRE)
══════════════════════════════════════════════

✗ NUNCA assuma que o lead desistiu — pode ser só técnico
✗ NUNCA pressione com urgência nas primeiras 2 mensagens
   (este lead já decidiu — precisa de ajuda, não de pressão)
✗ NUNCA mencione o preço como argumento — ele já sabe
✗ NUNCA reconstrua o pitch do produto do zero
✗ NUNCA envie 2 mensagens seguidas sem resposta do lead
✗ NUNCA dê desconto
✗ NUNCA finja ser humana se perguntado diretamente
✗ NUNCA use o argumento de motivação (goal) em falhas técnicas`;

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
