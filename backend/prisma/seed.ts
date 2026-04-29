import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Código Zero database...\n');

  // ── System Config ──
  await prisma.systemConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      maxUsers: 50,
      currentUsers: 0,
      communityLink: 'https://discord.gg/codigozero',
      mentoriaSchedule: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // next week
      mentoriaLink: 'https://meet.google.com/codigozero-mentoria',
    },
  });
  console.log('✅ SystemConfig created');

  // ── Demo User ──
  const passwordHash = await bcrypt.hash('demo1234', 10);
  await prisma.user.upsert({
    where: { email: 'demo@codigozero.app' },
    update: {},
    create: {
      name: 'Membro Demo',
      email: 'demo@codigozero.app',
      phone: '+258841234567',
      passwordHash,
      subscriptionStatus: 'active',
      subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('✅ Demo user created (demo@codigozero.app / demo1234)');

  // ── Scripts & Folders (Cofre) ──
  console.log('Seeding Script Folders and Scripts...');

  // Create Folders
  const folderAbordagem = await prisma.scriptFolder.upsert({
    where: { id: 'folder-abordagem' },
    update: { name: 'Abordagem Inicial', icon: '👋', sortOrder: 1 },
    create: { id: 'folder-abordagem', name: 'Abordagem Inicial', icon: '👋', sortOrder: 1 },
  });

  const folderSemSite = await prisma.scriptFolder.upsert({
    where: { id: 'folder-semsite' },
    update: { name: 'Empresas Sem Site', icon: '🌐', sortOrder: 2 },
    create: { id: 'folder-semsite', name: 'Empresas Sem Site', icon: '🌐', sortOrder: 2 },
  });

  const folderNegociacao = await prisma.scriptFolder.upsert({
    where: { id: 'folder-negociacao' },
    update: { name: 'Negociação e Objeções', icon: '💼', sortOrder: 3 },
    create: { id: 'folder-negociacao', name: 'Negociação e Objeções', icon: '💼', sortOrder: 3 },
  });

  const folderFechamento = await prisma.scriptFolder.upsert({
    where: { id: 'folder-fechamento' },
    update: { name: 'Fechamento de Vendas', icon: '🤝', sortOrder: 4 },
    create: { id: 'folder-fechamento', name: 'Fechamento de Vendas', icon: '🤝', sortOrder: 4 },
  });

  const scripts = [
    {
      title: 'Primeiro Contato (Frio)',
      folderId: folderAbordagem.id,
      icon: '🧊',
      sortOrder: 1,
      content: `Olá, equipe do(a) {{empresa}}! Tudo bem?\n\nMeu nome é Angelo e eu ajudo empresas no setor de vocês a automatizarem o atendimento no WhatsApp para nunca mais deixarem clientes esperando (e perderem vendas por demora).\n\nNotei que vocês têm um volume legal de buscas, mas não sei se já usam inteligência artificial para responder orçamentos 24h por dia.\n\nFaz sentido batermos um papo super rápido sobre como isso funciona? Prometo ser breve!`,
    },
    {
      title: 'Abordagem para Empresas Sem Site',
      folderId: folderSemSite.id,
      icon: '🎯',
      sortOrder: 1,
      content: `Olá, pessoal do(a) {{empresa}}! Como estão?\n\nEu estava pesquisando sobre serviços na região e encontrei vocês no Google Maps. Vi que o perfil está super bem avaliado, mas notei que vocês ainda não têm um website próprio, o que faz muita gente desistir de entrar em contato.\n\nEu sou especialista em criar estruturas digitais de alta conversão. Em menos de 48h, consigo colocar uma Landing Page no ar para o(a) {{empresa}} que vai dobrar a quantidade de pessoas que clicam para o WhatsApp de vocês.\n\nGostariam de ver um rascunho sem compromisso de como ficaria a vossa página?`,
    },
    {
      title: 'Quebrando a Objeção "Está Caro"',
      folderId: folderNegociacao.id,
      icon: '🛡️',
      sortOrder: 1,
      content: `Entendo perfeitamente, [Nome do Cliente]. O valor pode parecer um investimento considerável num primeiro momento.\n\nMas vamos pensar juntos: quanto custa hoje o(a) {{empresa}} perder 1 ou 2 clientes por semana porque o WhatsApp demorou a responder? \n\nO nosso sistema não é um "custo", é como ter um funcionário de atendimento trabalhando 24 horas por dia, 7 dias por semana, sem férias e sem falhas, por uma fração mínima do salário de uma pessoa.\n\nSe o sistema te trouxer apenas 2 vendas a mais neste mês, ele já não se pagou e gerou lucro?`,
    },
    {
      title: 'Follow-up Após Enviar Proposta',
      folderId: folderNegociacao.id,
      icon: '⏳',
      sortOrder: 2,
      content: `Olá, [Nome do Cliente], bom dia!\n\nTudo certo no(a) {{empresa}}?\n\nConseguiu dar uma olhada na proposta de automação que enviei ontem? Sei que a rotina é corrida!\n\nSe quiser, posso te ligar por 5 minutinhos apenas para tirar dúvidas rápidas. Como está sua agenda para hoje à tarde?`,
    },
    {
      title: 'Fechamento Direto (Link de Pagamento)',
      folderId: folderFechamento.id,
      icon: '⚡',
      sortOrder: 1,
      content: `Perfeito, [Nome do Cliente]! Fico muito feliz que vamos avançar juntos. O(a) {{empresa}} vai dar um salto no atendimento.\n\nPara darmos início imediato ao setup do vosso sistema, vou deixar aqui o link de pagamento da primeira mensalidade/setup.\n\n🔗 [SEU LINK DE PAGAMENTO AQUI]\n\nAssim que o pagamento for confirmado, crio o grupo no WhatsApp com a nossa equipa técnica para iniciarmos a configuração do seu robô hoje mesmo.\n\nQualquer dúvida, estou à disposição!`,
    }
  ];

  for (const script of scripts) {
    const id = script.title.toLowerCase().replace(/\s+/g, '-').slice(0, 36);
    await prisma.script.upsert({
      where: { id },
      update: { ...script },
      create: { id, ...script },
    });
  }
  console.log(`✅ ${scripts.length} scripts created`);

  // ── Modules & Lessons (Forja) ──
  const modulesData = [
    {
      title: 'Módulo 1: Fundamentos do Negócio de IA',
      description: 'Entenda o mercado, o modelo de negócio e como gerar seus primeiros 50.000 MT.',
      icon: '🧠',
      sortOrder: 1,
      lessons: [
        { title: 'O Mercado de IA em Moçambique', description: 'Visão geral das oportunidades', videoUrl: 'https://placeholder.codigozero.app/aula-1-1', duration: 900, sortOrder: 1 },
        { title: 'Seu Modelo de Negócio (SaaS de IA)', description: 'Como estruturar sua oferta', videoUrl: 'https://placeholder.codigozero.app/aula-1-2', duration: 1200, sortOrder: 2 },
        { title: 'Precificação Inteligente', description: 'Como cobrar de 3.000 MT a 15.000 MT por cliente', videoUrl: 'https://placeholder.codigozero.app/aula-1-3', duration: 800, sortOrder: 3 },
      ],
    },
    {
      title: 'Módulo 2: Dominando o Radar (Prospecção)',
      description: 'Aprenda a encontrar e qualificar leads usando o Radar da plataforma.',
      icon: '📡',
      sortOrder: 2,
      lessons: [
        { title: 'Como Usar o Radar', description: 'Tutorial completo da ferramenta', videoUrl: 'https://placeholder.codigozero.app/aula-2-1', duration: 600, sortOrder: 1 },
        { title: 'Escolhendo Nichos Lucrativos', description: 'Os 10 nichos que mais pagam', videoUrl: 'https://placeholder.codigozero.app/aula-2-2', duration: 1000, sortOrder: 2 },
        { title: 'Qualificação de Leads', description: 'Como saber se o lead vale o contato', videoUrl: 'https://placeholder.codigozero.app/aula-2-3', duration: 700, sortOrder: 3 },
      ],
    },
    {
      title: 'Módulo 3: Scripts de Venda (O Cofre)',
      description: 'Domine a arte da abordagem e negociação pelo WhatsApp.',
      icon: '💎',
      sortOrder: 3,
      lessons: [
        { title: 'A Psicologia da Primeira Mensagem', description: 'Como não ser ignorado', videoUrl: 'https://placeholder.codigozero.app/aula-3-1', duration: 900, sortOrder: 1 },
        { title: 'Quebrando Objeções como Profissional', description: 'As 5 objeções mais comuns e como vencer', videoUrl: 'https://placeholder.codigozero.app/aula-3-2', duration: 1100, sortOrder: 2 },
        { title: 'Fechamento: Do Interesse ao Contrato', description: 'Como fazer o cliente dizer sim', videoUrl: 'https://placeholder.codigozero.app/aula-3-3', duration: 1000, sortOrder: 3 },
      ],
    },
    {
      title: 'Módulo 4: Construindo Automações com IA',
      description: 'Ferramentas práticas para criar chatbots e automações sem código.',
      icon: '⚡',
      sortOrder: 4,
      lessons: [
        { title: 'Ferramentas de IA Gratuitas', description: 'ChatGPT, Claude, e alternativas', videoUrl: 'https://placeholder.codigozero.app/aula-4-1', duration: 1200, sortOrder: 1, tools: JSON.stringify([
          { name: 'ChatGPT', url: 'https://chat.openai.com', description: 'IA conversacional gratuita' },
          { name: 'Claude', url: 'https://claude.ai', description: 'IA avançada pela Anthropic' },
          { name: 'ManyChat', url: 'https://manychat.com', description: 'Automação de WhatsApp' },
        ]) },
        { title: 'Criando Seu Primeiro Chatbot', description: 'Passo a passo completo', videoUrl: 'https://placeholder.codigozero.app/aula-4-2', duration: 1500, sortOrder: 2 },
        { title: 'Entregando Valor ao Cliente', description: 'Setup, treinamento e suporte', videoUrl: 'https://placeholder.codigozero.app/aula-4-3', duration: 900, sortOrder: 3 },
      ],
    },
  ];

  for (const moduleData of modulesData) {
    const { lessons, ...moduleFields } = moduleData;

    const module = await prisma.module.create({
      data: moduleFields,
    });

    for (const lesson of lessons) {
      await prisma.lesson.create({
        data: {
          ...lesson,
          moduleId: module.id,
          tools: lesson.tools ? JSON.parse(lesson.tools as string) : null,
        },
      });
    }
  }
  console.log(`✅ ${modulesData.length} modules with ${modulesData.reduce((a, m) => a + m.lessons.length, 0)} lessons created`);

  console.log('\n🎉 Seed complete!\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
