"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
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
    const passwordHash = await bcryptjs_1.default.hash('demo1234', 10);
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
    // ── Scripts (Cofre) ──
    const scripts = [
        // Primeira Abordagem
        {
            title: 'Abordagem Direta pelo WhatsApp',
            category: 'primeira_abordagem',
            icon: '💬',
            sortOrder: 1,
            content: `Olá [Nome do Dono], tudo bem?

Eu estava pesquisando [nicho] aqui em [cidade] e encontrei o(a) [nome do negócio]. Achei o trabalho de vocês muito interessante!

Eu trabalho com automações de atendimento por Inteligência Artificial, e percebi que posso ajudar o(a) [nome do negócio] a:

✅ Responder clientes automaticamente 24h/dia
✅ Agendar atendimentos sem precisar de uma recepcionista
✅ Recuperar clientes que sumiram com mensagens inteligentes

O melhor: tudo isso sem vocês precisarem entender nada de tecnologia. Eu configuro tudo para vocês.

Posso mostrar como funciona em 5 minutos? É sem compromisso.`,
        },
        {
            title: 'Abordagem por Valor Imediato',
            category: 'primeira_abordagem',
            icon: '🎯',
            sortOrder: 2,
            content: `Boa tarde, [Nome]! 

Sou [seu nome] e ajudo [nicho] a triplicar o número de agendamentos usando um assistente virtual inteligente.

Notei que o(a) [negócio] tem ótimas avaliações no Google, mas percebi uma oportunidade:

→ Vocês poderiam estar convertendo muito mais visitantes em clientes com uma automação simples no WhatsApp.

Tenho um caso de um(a) [nicho similar] aqui em [cidade] que saiu de 15 para 45 agendamentos/mês gastando ZERO a mais em marketing.

Quer que eu te mostre como? Leva 3 minutos.`,
        },
        {
            title: 'Abordagem Fria Profissional',
            category: 'primeira_abordagem',
            icon: '🏢',
            sortOrder: 3,
            content: `Prezado(a) [Nome],

Meu nome é [seu nome], sou especialista em automações comerciais com IA. Trabalho com [nicho] que buscam otimizar seu atendimento e aumentar o faturamento sem aumentar equipe.

Identifiquei que o(a) [negócio] tem um bom posicionamento na região de [cidade], e gostaria de apresentar uma solução que pode:

1. Reduzir o tempo de resposta a clientes para menos de 30 segundos
2. Automatizar agendamentos e confirmações
3. Reativar clientes inativos automaticamente

Seria possível agendar 10 minutos esta semana para uma demonstração personalizada?

Atenciosamente,
[Seu nome]`,
        },
        // Negociação
        {
            title: 'Quebrando Objeção de Preço',
            category: 'negociacao',
            icon: '💰',
            sortOrder: 1,
            content: `Entendo perfeitamente sua preocupação com o investimento, [Nome].

Deixa eu colocar em perspectiva:

📊 Quanto custa contratar uma pessoa só pra responder WhatsApp? Mínimo 8.000 MT/mês, certo?

O que eu ofereço:
→ Funciona 24h/dia, 7 dias por semana (sem folga, sem atraso)
→ Responde 100 pessoas ao mesmo tempo
→ Nunca esquece de fazer follow-up

E o investimento é apenas [valor] por mês. Menos que o salário de um estagiário.

A pergunta real não é "posso pagar?", mas "posso continuar perdendo clientes por não responder rápido?"

Posso ativar um teste de 7 dias pra você ver funcionando?`,
        },
        {
            title: 'Quebrando Objeção "Preciso Pensar"',
            category: 'negociacao',
            icon: '🤔',
            sortOrder: 2,
            content: `Claro, [Nome], leva o tempo que precisar!

Só quero te fazer uma pergunta rápida antes:

Quantos clientes você acha que entraram em contato e não foram respondidos nos últimos 30 dias? 

Cada um desses é dinheiro que saiu pela porta.

O que eu costumo ver: enquanto o dono "pensa", o concorrente que já automatizou está respondendo os clientes em 10 segundos e fechando a venda.

Mas sem pressão! Se quiser, posso te enviar um mini-relatório gratuito de como IA está transformando [nicho] em [cidade]. Assim você decide com mais informação.

Posso mandar?`,
        },
        // Prompts de Copy
        {
            title: 'Prompt: Criar Bio Instagram para Negócio',
            category: 'prompts_copy',
            icon: '📱',
            sortOrder: 1,
            content: `Prompt para ChatGPT/Claude:

"Crie uma bio de Instagram profissional e atrativa para um negócio de [nicho] localizado em [cidade, Moçambique]. 

A bio deve:
- Ter no máximo 150 caracteres
- Incluir 1-2 emojis estratégicos
- Ter uma proposta de valor clara
- Incluir um CTA (chamada para ação)
- Transmitir autoridade e confiança

Contexto: O negócio se chama [nome] e oferece [serviços principais]. O diferencial é [diferencial].

Gere 5 opções diferentes."`,
        },
        {
            title: 'Prompt: Gerar Script de Atendimento',
            category: 'prompts_copy',
            icon: '🤖',
            sortOrder: 2,
            content: `Prompt para ChatGPT/Claude:

"Crie um fluxo de atendimento automatizado por WhatsApp para um negócio de [nicho]. 

O fluxo deve cobrir:
1. Saudação inicial (boas-vindas + identificação da necessidade)
2. Apresentação dos serviços (máximo 3 opções)
3. Coleta de informações do cliente (nome, preferência de horário)
4. Confirmação do agendamento
5. Mensagem de acompanhamento pós-atendimento

Regras:
- Tom de voz: profissional mas amigável
- Mensagens curtas (máximo 3 linhas cada)
- Incluir emojis com moderação
- Oferecer opção de falar com humano em qualquer etapa
- Contexto: Moçambique, preços em Meticais (MT)

Formate como um fluxograma com as mensagens prontas para copiar."`,
        },
        // Follow-up
        {
            title: 'Follow-up Dia Seguinte',
            category: 'follow_up',
            icon: '📩',
            sortOrder: 1,
            content: `Olá [Nome], bom dia!

Ontem conversamos sobre a automação de atendimento para o(a) [negócio]. 

Fiquei pensando no seu caso e preparei uma simulação rápida de como ficaria o fluxo de atendimento automático do(a) [negócio].

[Enviar print/vídeo da simulação]

O que achou? Posso te explicar melhor qualquer parte.

Se preferir, posso agendar uma ligação rápida de 5 minutos para tirar suas dúvidas. Qual horário fica melhor pra você?`,
        },
        {
            title: 'Follow-up Após Silêncio (5 dias)',
            category: 'follow_up',
            icon: '🔔',
            sortOrder: 2,
            content: `[Nome], tudo certo por aí?

Sei que a rotina é corrida, mas não queria deixar de compartilhar isso:

Um(a) [nicho similar] aqui em [cidade] implementou o atendimento automático semana passada e já:

📈 Aumentou 40% nos agendamentos
⏱️ Reduziu o tempo de resposta de 2h para 15 segundos  
💬 Atendeu 127 clientes em 7 dias sem contratar ninguém

Ainda faz sentido pra você explorar essa possibilidade para o(a) [negócio]?

Se sim, tenho um horário amanhã às [horário]. Se não, sem problemas — fico à disposição para quando precisar! 🙏`,
        },
        // Fechamento
        {
            title: 'Proposta de Fechamento Express',
            category: 'fechamento',
            icon: '🤝',
            sortOrder: 1,
            content: `[Nome], que bom que faz sentido pra você!

Aqui está o resumo da proposta:

📋 O que está incluso:
✅ Chatbot inteligente para WhatsApp (atendimento 24h)
✅ Sistema de agendamento automático
✅ Respostas personalizadas para o(a) [negócio]
✅ Suporte e ajustes nos primeiros 30 dias
✅ Treinamento de 15min para sua equipe

💰 Investimento: [valor] MT/mês
(Menos que o custo de 1 hora de trabalho por dia de um funcionário)

⚡ Prazo de ativação: 48 horas

🔒 Garantia: Se em 30 dias você não ver resultado, devolvemos 100% do valor.

Para começar, preciso apenas:
1. Confirmação por aqui
2. Acesso ao WhatsApp Business do(a) [negócio]

Posso dar início hoje?`,
        },
    ];
    for (const script of scripts) {
        await prisma.script.upsert({
            where: { id: script.title.toLowerCase().replace(/\s+/g, '-').slice(0, 36) },
            update: script,
            create: script,
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
                    tools: lesson.tools ? JSON.parse(lesson.tools) : null,
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
//# sourceMappingURL=seed.js.map