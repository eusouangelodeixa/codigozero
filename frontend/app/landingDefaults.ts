// Shared landing copy defaults — imported by BOTH the public landing page
// (app/page.tsx) and the /admin/landing editor, so the two never drift.
// **bold** markers render as <strong> via renderBold() on the page.
// DB-stored `sections` override these at runtime.

export const LANDING_DEFAULTS = {
  // ── Hero ─────────────────────────────────────────────────────────────
  heroTitle: "Aprende a criar e vender soluções de IA pra empresas.",
  heroSubtitle: "Sem código. Sem gastar um metical em anúncio. Sem promessa furada.",
  heroDesc: "O ecossistema que te entrega a ferramenta que **acha os clientes**, os **scripts que fecham** e a **comunidade que te ensina a construir** — pra você prestar serviço pra empresas em Moçambique e fechar o seu primeiro contrato.",
  heroCtaText: "Quero entrar no Código Zero (497 MT/mês)",
  heroSubCta: "M-Pesa · e-Mola · Cartão · Acesso na hora, direto no teu WhatsApp.",
  ctaText: "Entrar no Código Zero",

  // ── VSL ──────────────────────────────────────────────────────────────
  vslTitle: "Código Zero — Apresentação",
  vslSubtitle: "Assiste à apresentação completa",
  vslHint: "Clica para ouvir",

  // ── O que isso NÃO é ─────────────────────────────────────────────────
  notLabel: "O que isso não é",
  notTitle: "Esquece tudo. Isto aqui é outra coisa.",
  notLines: [
    "Se você já tentou dropshipping, cash on delivery, venda de ebook (o famoso PLR) ou tráfego direto — esquece tudo. Isto aqui é outra coisa.",
    "**Eu não vou te prometer 50 ou 100 mil meticais em algumas semanas.** Não prometo dinheiro fácil, não prometo atalho, não prometo nada que eu não consiga te entregar.",
    "A proposta é simples e honesta: **te ensinar a prestar serviço pra empresas e a criar micro-SaaS usando inteligência artificial.** Você aprende a desenvolver sistemas, sites, automações e agentes que atendem no WhatsApp — e a vender isso pra quem precisa.",
  ],

  // ── Como isso vira dinheiro de verdade (clinic story) ────────────────
  clinicLabel: "Como isso vira dinheiro de verdade",
  clinicTitle: "Pensa numa clínica.",
  clinicParas: [
    "Ela tem 3 funcionários que atendem tudo pelo WhatsApp: agendar consulta, mandar relatório, tirar dúvida. Só que a clínica tem paciente demais, e os 3 não dão conta. O atendimento fica lento. No fim do mês, faturam pouco — e o motivo é exatamente esse: ninguém consegue responder todo mundo a tempo.",
    "Essa clínica precisa de algo que atenda os pacientes **de forma automática**, sem gastar tempo, e que faça o faturamento subir.",
    "É exatamente o que um agente de WhatsApp faz. Ele atende todos os pacientes, economiza tempo, e libera os 3 funcionários pra focar no que importa. No fim do mês a clínica fatura muito mais, gastando pouco.",
    "Agora multiplica isso: clínicas, restaurantes, agências de viagem, imobiliárias — **todo negócio que atende no WhatsApp precisa dessa solução.** E você vai aprender a construir e vender.",
  ],

  // ── Os números, sem inflar ───────────────────────────────────────────
  numbersLabel: "Os números, sem inflar",
  numbersTitle: "Faz a conta com calma.",
  numbersLine1: "No mercado, esse tipo de solução é cobrado entre **200 e 500 reais por mês** — o equivalente a **2.400 a 6.000 MT/mês** — fora a taxa de implementação.",
  numbersLine2: "Faz a conta com calma: **um único contrato de 3.000 MT/mês paga a tua assinatura do Código Zero por mais de 6 meses.** Não preciso te prometer fortuna. Um cliente já vira o jogo.",

  // ── Quem está falando com você (founder) ─────────────────────────────
  founderLabel: "Quem está falando com você",
  founderIntro: "Eu sou o **Ângelo Deixa.** Moçambicano, 20 anos, morando no Brasil, apaixonado por engenharia da computação. No digital eu já construí coisas que mexeram com o negócio de vários empreendedores moçambicanos:",
  founderCreds: [
    "**CMO e sócio da Lojou** — plataforma de venda de infoprodutos que já processou **mais de 2 milhões de meticais.**",
    "**CEO da Kilax** — plataforma de hospedagem de VSLs (vídeos de vendas).",
    "**COO da Klick Builder** — plataforma de domínio e hospedagem, fundada pelo Gastene Felipe, sócio e amigo, empreendedor que você talvez já conheça.",
    "**Sócio da Mira** — startup que tenho com um sócio brasileiro, onde usamos tecnologia pra resolver problema de empresa. O último contrato que fechamos foi de **R$ 20 mil pra desenvolver um e-commerce** — a primeira parcela paga foi de **3.330 reais, mais de 40 mil meticais.**",
  ],
  founderClosing: "Eu não vou te ensinar nada que eu não faça todo dia.",

  // ── O ecossistema por dentro (Stack → 5 features) ────────────────────
  stackLabel: "O ecossistema por dentro",
  stackTitle: "Tudo está",
  stackTitleHighlight: "conectado.",
  stackDesc: "O Código Zero não é \"mais um curso\". É uma plataforma onde tudo está conectado — a mesma conta, o mesmo histórico de leads, a mesma comunidade.",
  ecoFeatures: [
    { emoji: "🛰️", title: "Radar — acha os clientes pra você", desc: "Scanner que varre o Google Maps por **cidade e nicho** e devolve nome, telefone, Instagram e website das empresas. Sem CSV, sem trabalho manual." },
    { emoji: "📤", title: "Disparador — fala com todos de uma vez", desc: "Selecionou os contatos do Radar? Manda a abordagem pra todos eles de uma vez só, dentro da própria plataforma." },
    { emoji: "📑", title: "Scripts — as abordagens que fecham", desc: "Banco de scripts validados pra você usar na hora de entrar em contato pela primeira vez ou fechar o contrato. Você não escreve do zero — copia o que já funciona." },
    { emoji: "🎓", title: "Aulas e lives — aprende a construir e a vender", desc: "Aulas e lives gravadas onde eu e outros mentores ensinamos a **desenvolver as soluções** e, principalmente, a **vendê-las.**" },
    { emoji: "💬", title: "Chat e suporte", desc: "Canal de chat onde os membros trocam ideia dentro da plataforma. E um canal de suporte onde você tira dúvida direto comigo ou com a minha equipe." },
  ],

  // ── Network / Comunidade ─────────────────────────────────────────────
  networkLabel: "A network",
  networkTitle: "A comunidade privada",
  networkTitleHighlight: "onde tudo acontece.",
  networkMembersCount: "222",
  networkMembersLabel: "membros ativos",
  networkDesc: "A comunidade privada onde tudo acontece. No momento, **222 membros ativos** — pessoas como você, que querem vencer e estão construindo de verdade.",
  networkPillars: [
    { title: "Call ao vivo todo domingo", desc: "revisão da semana, problema real, o que está convertendo agora." },
    { title: "Troca real", desc: "membros publicam o que está funcionando: scripts, automações, contratos fechados." },
    { title: "Construção em conjunto", desc: "projetos coletivos de SaaS: alguém começa, a network ajuda a finalizar, quem participa divide." },
    { title: "Irmandade, não audiência", desc: "não é um Discord de 5 mil pessoas mudas. São 222 que se conhecem pelo nome." },
  ],

  // ── Como o Radar funciona (na prática) ───────────────────────────────
  radarLabel: "Como o Radar funciona (na prática)",
  radarTitle: "Os primeiros clientes sem gastar em anúncio.",
  radarSteps: [
    "Você entra na plataforma e clica em **Radar.**",
    "Seleciona o nicho — por exemplo, **clínicas.**",
    "Seleciona as cidades — **Maputo, Quelimane, Chimoio, Inhambane.**",
    "Marca **telefone como obrigatório** e clica em **buscar.**",
    "O sistema traz o máximo de clientes possível, automaticamente.",
    "Vai no **Disparador**, seleciona os contatos e faz o envio — uma única vez.",
  ],
  radarClosing: "É por isso que você **não precisa de dinheiro pra anúncio** pra achar os primeiros clientes. O Radar já faz esse trabalho por você.",

  // ── A oferta (Pricing) ───────────────────────────────────────────────
  scarcityLabel: "A oferta",
  scarcityTitle: "Acesso a tudo por 497 MT/mês.",
  scarcityDesc: "O Código Zero é uma plataforma de assinatura. **497 MT por mês** te dão acesso a tudo: Radar, Disparador, Scripts, aulas, lives, comunidade e suporte.",
  priceFrom: "",
  priceAmount: "497",
  pricePeriod: "MT/mês",
  priceSub: "É mais ou menos o **preço de um hambúrguer.** E tem um motivo pro preço ser esse: **eu não quero ninguém de fora por falta de dinheiro.** Quem quer construir, constrói.",
  priceCtaText: "Garantir minha vaga (497 MT/mês)",

  // ── Close Friends (upsell exibido na pricing section) ──────────────
  closeFriendsLabel: "Close Friends",
  closeFriendsTitle: "Opcional: Close Friends",
  closeFriendsDesc: "Add-on de **1.297 MT**, pagamento único no checkout. Te dá **3 meses corridos** de acesso (em vez de 1), **badge dourado** na conta e **prioridade nas calls de domingo.**",

  // ── Como funciona — do pagamento à primeira call (Flow) ──────────────
  flowLabel: "Como funciona — do pagamento à primeira call",
  flowTitle: "Do pagamento",
  flowTitleHighlight: "à primeira call.",
  flowSteps: [
    { num: "01", title: "Você paga a assinatura", desc: "M-Pesa, e-Mola ou cartão. A página de pagamento já vem pronta — você escolhe o método e finaliza. Aprovação na hora." },
    { num: "02", title: "Recebe o acesso no WhatsApp", desc: "Assim que o pagamento é confirmado, o sistema envia o seu acesso automaticamente, no número que você cadastrou. Em segundos." },
    { num: "03", title: "Entra na network", desc: "Link direto da comunidade privada. Você se apresenta e começa a interagir." },
    { num: "04", title: "Aparece na call de domingo", desc: "Entra no Zoom no horário marcado e começa a executar o método já na semana seguinte." },
  ],

  // ── Garantia ────────────────────────────────────────────────────────
  guaranteeLabel: "Garantia",
  guaranteeTitle: "Sem garantia mirabolante.",
  guaranteeText1: "Eu não vendo sonho, então também não vou inventar garantia mirabolante.",
  guaranteeText2: "",
  guaranteeHighlight: "O que eu te ofereço é o seguinte: **entra, usa o Radar, manda os scripts validados e aparece nas calls.** Se você fizer a tua parte por 30 dias e sentir que a plataforma não te entregou o que prometi, é só pedir — eu devolvo o teu dinheiro, sem drama e sem letra miúda.",
  guaranteeConclusion: "O único risco real que você corre é continuar de fora, vendo os outros fecharem contrato.",
  guaranteeCtaText: "Entrar no Código Zero",

  // ── FAQ ──────────────────────────────────────────────────────────────
  faqLabel: "Perguntas frequentes",
  faqTitle: "O que costumam perguntar.",
  faqItems: [
    { q: "Preciso saber programar?", a: "Não. O Código Zero foi feito pra quem nunca abriu uma IDE. O Radar é por botão, o Disparador é por botão, as aulas te ensinam a usar IAs visuais. Quando aparece código, é só copiar e colar." },
    { q: "Quanto tempo até o primeiro resultado?", a: "Depende de você executar. Quem entra, usa o Radar, dispara os scripts e aparece nas calls, costuma ter conversa real com cliente nos primeiros dias. Fechar contrato é questão de volume e de seguir o método — eu não prometo prazo mágico, prometo o caminho." },
    { q: "O número de WhatsApp que vou usar bloqueia?", a: "Nas aulas eu te mostro exatamente como disparar com segurança pra reduzir esse risco — aquecimento de número, volume certo e abordagem que não parece spam. Feito do jeito que ensino, o risco é baixo." },
    { q: "Cancelar é fácil?", a: "É. É uma assinatura. Se quiser sair, cancela e pronto — sem fidelidade, sem multa, sem ligação de retenção." },
    { q: "Já tentei vender curso de IA e não funcionou. Aqui é diferente?", a: "Aqui você não está comprando \"curso\". Você está entrando num ecossistema que te dá a **ferramenta que acha o cliente**, os **scripts que fecham** e a **comunidade que destrava** quando você trava. A diferença é que aqui tem execução, não só teoria." },
  ],

  // ── CTA final ────────────────────────────────────────────────────────
  finalCtaTitle: "O acesso é imediato. A próxima call é no domingo.",
  finalCtaDesc: "Foi um prazer ter você até aqui. Agora é clicar e dar o próximo passo — eu te espero do outro lado.",
  finalCtaText: "Garantir minha vaga (497 MT/mês)",

  // ── Footer ───────────────────────────────────────────────────────────
  footerDesc: "Código Zero — o ecossistema de tecnologia pra criar micronegócios de IA em Moçambique. Sem código, sem barreiras.",

  // ── Legacy fields (kept for backwards-compat with stored sections JSON) ──
  trustText: "",
  stat1Value: "", stat1Label: "", stat2Value: "", stat2Label: "", stat3Value: "", stat3Label: "",
  stackTools: [],
  painLabel: "", painTitle: "", painTitleHighlight: "", painDesc: "", painItems: [],
  painConclusion: "", painConclusionSub: "",
  solutionLabel: "", solutionTitle: "", solutionTitleHighlight: "", solutionDesc: "", solutionCards: [],
  valueLabel: "", valueTitle: "", valueTitleHighlight: "", valueDesc: "", valueItems: [],
  valueTotalLabel: "", valueTotalAmount: "", valuePunchline: "",
};
