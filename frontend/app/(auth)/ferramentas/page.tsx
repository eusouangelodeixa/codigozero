"use client";
import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Info,
  Loader2,
  Megaphone,
  MessageSquareText,
  QrCode,
  Send,
  Smartphone,
  Sparkles,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import styles from "./ferramentas.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const KOMUNIKA_FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageSquareText,
    title: "Conversas num só lugar",
    text: "Todo mundo que te chama cai numa caixa de entrada só — nenhum cliente esquecido.",
  },
  {
    icon: Megaphone,
    title: "Campanhas em massa",
    text: "Manda a mesma oferta pra centenas de contactos de uma vez, sem copiar e colar.",
  },
  {
    icon: Workflow,
    title: "Funis de conversa",
    text: "Respostas e sequências automáticas rodando 24h, mesmo quando você está offline.",
  },
  {
    icon: Users,
    title: "Contactos organizados",
    text: "Etiquetas, listas e o histórico de cada cliente sempre à mão.",
  },
];

const PLAN_LIMITS: { icon: LucideIcon; label: string }[] = [
  { icon: Smartphone, label: "1 número de WhatsApp" },
  { icon: UsersRound, label: "2 atendentes" },
  { icon: Check, label: "Sem mensalidade extra" },
];

const PRIMEIROS_PASSOS: { n: string; icon: LucideIcon; title: string; text: string }[] = [
  {
    n: "01",
    icon: QrCode,
    title: "Conecte seu número",
    text: "Lá dentro, vá em Conexões e leia o QR code com o WhatsApp do seu negócio. Leva um minuto.",
  },
  {
    n: "02",
    icon: Users,
    title: "Traga seus contactos",
    text: "Importe a lista que você já tem — ou os leads que extraiu no Radar — e organize por etiqueta.",
  },
  {
    n: "03",
    icon: Send,
    title: "Dispare a primeira campanha",
    text: "Escolha a lista, escreva a mensagem e envie. Comece com poucos contactos pra sentir a resposta.",
  },
];

export default function FerramentasPage() {
  const toast = useToast();
  const [komunikaActive, setKomunikaActive] = useState(false);
  // Komunika é provisionado NA HORA da compra (syncKomunikaOnApprovedOrder),
  // e só quando o acesso o inclui (turma/curso pode não incluir). Logo não há
  // um "preparando" que dure minutos: se não está ativo, é porque não faz
  // parte deste acesso. Um único caso, mensagem clara — nada de "tente de novo".
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}` });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) {
          setKomunikaActive(!!d.user.komunikaActive);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Open the embedded Komunika via SSO. The backend mints a short-lived
  // magic-link; the JWT secret never reaches the browser.
  //
  // The hard part is opening it reliably from a MOBILE INSTALLED PWA (most of
  // our users). In standalone display-mode, window.open is unreliable: iOS
  // returns a "live" handle that silently ignores `win.location.href` (so the
  // user just stares at a blank tab that never navigates), and Android often
  // swallows the popup entirely. So branch on the context:
  //   • Standalone PWA → navigate the CURRENT context to the SSO url. Always
  //     works; the OS back gesture returns to the app.
  //   • Regular browser → pre-open a blank tab synchronously inside the click
  //     gesture (so the popup blocker allows it), then point it at the SSO url.
  const openKomunika = async () => {
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true);

    const win = standalone ? null : window.open("about:blank", "_blank");
    setOpening(true);
    try {
      const res = await fetch(`${API}/api/komunika/sso-link`, { headers: hdr() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (win && !win.closed) win.location.href = data.url;
        else window.location.href = data.url; // standalone PWA or popup blocked → same context
      } else {
        if (win && !win.closed) win.close();
        toast.error("Não foi possível abrir o Komunika", data.error);
      }
    } catch {
      if (win && !win.closed) win.close();
      toast.error("Erro de conexão");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Ferramentas"
        title="Ferramentas"
        description="Tudo o que já vem junto com a sua assinatura, num lugar só. Você abre direto daqui, sem criar conta nem digitar senha de novo."
      />

      {/* ── Herói: Komunika ── */}
      <Card as="section" padding="none" accentHover className={styles.heroCard}>
        <div className={styles.heroBody}>
          <div className={styles.heroTop}>
            {/* Marca em tokens do design system: o SVG antigo usava gradiente
                inline (proibido dentro do app), então o "K" ganhou o teal da
                marca — mesma identidade, dentro da paleta. */}
            <span className={styles.mark} aria-hidden>K</span>

            <div className={styles.heroMeta}>
              <span className={styles.eyebrow}>Incluído na assinatura</span>
              <h2 className={styles.heroTitle}>Komunika</h2>
              <p className={styles.heroSubtitle}>A plataforma de WhatsApp do Código Zero</p>
            </div>

            <span className={styles.heroStatus}>
              {loading ? (
                <Badge variant="neutral" size="sm">Verificando…</Badge>
              ) : komunikaActive ? (
                <Badge variant="accent" size="sm" dot>Ativo</Badge>
              ) : (
                <Badge variant="neutral" size="sm">Não incluído</Badge>
              )}
            </span>
          </div>

          <p className={styles.heroDesc}>
            É onde você centraliza o atendimento, dispara campanhas e monta funis de conversa —
            tudo pelo mesmo número, sem precisar do celular na mão. Você não paga nada a mais por
            isso: já está no seu plano.
          </p>

          <ul className={styles.features}>
            {KOMUNIKA_FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className={styles.feature}>
                <span className={styles.featureIcon}>
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <div className={styles.featureCopy}>
                  <span className={styles.featureTitle}>{title}</span>
                  <span className={styles.featureText}>{text}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.plan}>
            <span className={styles.planLabel}>Seu plano inclui</span>
            <div className={styles.planChips}>
              {PLAN_LIMITS.map(({ icon: Icon, label }) => (
                <span key={label} className={styles.chip}>
                  <Icon size={14} strokeWidth={1.8} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.ctaRow}>
            {komunikaActive ? (
              <Button
                variant="primary"
                size="lg"
                onClick={openKomunika}
                disabled={loading || opening}
                iconStart={opening ? <Loader2 size={16} className={styles.spin} /> : undefined}
                iconEnd={opening ? undefined : <ExternalLink size={16} />}
              >
                {opening ? "Abrindo…" : "Abrir Komunika"}
              </Button>
            ) : (
              // Sem direito à ferramenta: em vez de um botão morto, leva ao
              // site do Komunika para conhecer e assinar.
              <Button
                variant="secondary"
                size="lg"
                onClick={() => { window.location.href = "https://komunika.site"; }}
                iconEnd={<ExternalLink size={16} />}
              >
                Conhecer o Komunika
              </Button>
            )}
            <span className={styles.ctaHint}>
              {komunikaActive
                ? "Abre logado com a sua conta do Código Zero — sem login extra."
                : "Incluído para quem assina o Código Zero — não faz parte deste acesso."}
            </span>
          </div>

          {!loading && !komunikaActive && (
            <p className={styles.note}>
              <Info size={15} strokeWidth={1.8} aria-hidden />
              <span>
                O Komunika não faz parte deste acesso. Ele vem incluído na assinatura do Código Zero —
                se você acha que deveria ter, fale com o suporte.
              </span>
            </p>
          )}
        </div>
      </Card>

      {/* ── Primeiros passos ── */}
      <Card as="section" padding="none" className={styles.stepsCard}>
        <div className={styles.stepsBody}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>Primeiros passos</span>
            <h2 className={styles.sectionTitle}>Nunca abriu a Komunika? Comece por aqui</h2>
            <p className={styles.sectionDesc}>
              Três passos e você já está falando com cliente. Dá pra fazer tudo em menos de 10 minutos.
            </p>
          </div>

          <ol className={styles.steps}>
            {PRIMEIROS_PASSOS.map(({ n, icon: Icon, title, text }) => (
              <li key={n} className={styles.step}>
                <div className={styles.stepHead}>
                  <span className={styles.stepIcon}>
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <span className={styles.stepNum}>{n}</span>
                </div>
                <span className={styles.stepTitle}>{title}</span>
                <span className={styles.stepText}>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      {/* ── Próximas ferramentas ── */}
      <EmptyState
        compact
        icon={<Sparkles size={22} strokeWidth={1.6} />}
        title="Mais ferramentas a caminho"
        description="Estamos montando as próximas peças do arsenal. Quando uma ficar pronta, ela aparece aqui — sem custo adicional e sem você precisar fazer nada."
      />
    </div>
  );
}
