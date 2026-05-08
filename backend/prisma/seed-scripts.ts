import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const scriptFolders = [
  {
    name: "1. Prospecção Fria (Outbound)",
    icon: "🎯",
    sortOrder: 1,
    scripts: [
      {
        title: "Oferta Irresistível (Hormozi Style)",
        content: "Fala {{nome}}, tudo bem?\n\nDei uma olhada na {{negocio}} e vi que vocês têm uma estrutura muito boa, mas percebi que não estão a capturar leads online da forma que podiam.\n\nNós ajudamos empresas como a sua a conseguir +20 clientes por mês com garantia. Se não der resultado, não pagam.\n\nTenho um vídeo de 3 minutos a mostrar como isso funciona. Posso mandar?"
      },
      {
        title: "Elogio + Gancho Rápido",
        content: "Olá {{nome}}, acompanho o trabalho da {{empresa}} no Instagram e gostei muito do último projeto.\n\nEstamos a procurar um parceiro na sua zona para enviar as nossas leads interessadas nos seus serviços.\n\nVocê tem capacidade para atender mais 5 a 10 clientes por mês?"
      },
      {
        title: "Abordagem do Problema Específico",
        content: "{{nome}}, notei que a {{empresa}} não tem um sistema automatizado para agendamentos.\n\nEu criei um modelo exato para negócios como o seu que elimina os 'no-shows' (falta do cliente) e triplica o volume de marcações.\n\nFaz sentido falarmos 5 minutos sobre isto amanhã?"
      }
    ]
  },
  {
    name: "2. Follow-up (Nurture)",
    icon: "🔄",
    sortOrder: 2,
    scripts: [
      {
        title: "O 'Você Desistiu?' (Magic Email/Message)",
        content: "Oi {{nome}}.\n\nVocê desistiu de implementar aquele sistema para escalar as vendas da {{empresa}}?"
      },
      {
        title: "Apenas para não cair no esquecimento",
        content: "Fala {{nome}}, só a passar por aqui para saber se conseguiu ver o material que enviei na terça-feira.\n\nTem alguma dúvida sobre como a estratégia se aplica à sua realidade?"
      },
      {
        title: "Agregação de Valor (Case de Sucesso)",
        content: "Oi {{nome}}, lembrei-me de si. Acabamos de aplicar aquele exato método numa empresa muito parecida com a sua na cidade vizinha, e eles dobraram o faturamento.\n\nPosso partilhar consigo o que fizemos em formato de áudio rápido?"
      }
    ]
  },
  {
    name: "3. Qualificação & Descoberta",
    icon: "🕵️",
    sortOrder: 3,
    scripts: [
      {
        title: "Foco no GAP",
        content: "Entendi, {{nome}}. E qual é o seu objetivo de faturamento para os próximos 6 meses na {{empresa}}? O que você sente que está a travar o seu negócio de chegar lá neste momento?"
      },
      {
        title: "Isolando a Prioridade",
        content: "Se pudesse resolver apenas um problema na {{empresa}} hoje, com um estalar de dedos, qual seria: falta de volume de clientes, ou clientes que desmarcam em cima da hora?"
      }
    ]
  },
  {
    name: "4. Contorno de Objeções",
    icon: "🛡️",
    sortOrder: 4,
    scripts: [
      {
        title: "Objeção: 'Está muito caro'",
        content: "{{nome}}, entendo perfeitamente. Mas me diga: está caro comparado a quê? O preço da inação (continuar com o mesmo volume de vendas atual) não custa muito mais ao longo do ano?"
      },
      {
        title: "Objeção: 'Tenho de falar com o meu sócio'",
        content: "Claro, faz todo o sentido tomarem a decisão juntos. Para facilitar, quer que eu faça uma breve chamada com os dois, apenas para ele não ter de ouvir a explicação pela metade? Que horas ele costuma estar disponível?"
      },
      {
        title: "Objeção: 'Não tenho tempo agora'",
        content: "Exatamente por não ter tempo é que precisa deste sistema. Ele trabalha em piloto automático enquanto você cuida da operação da {{empresa}}. Se levar apenas 30 minutos para configurar, você teria essa janela na sexta-feira?"
      }
    ]
  },
  {
    name: "5. Fechamento (Closing & Urgency)",
    icon: "✍️",
    sortOrder: 5,
    scripts: [
      {
        title: "Criação de Urgência Real",
        content: "{{nome}}, gostei muito do perfil da {{empresa}}. Só posso aceitar mais 2 parceiros com essa garantia de risco zero neste mês para manter a qualidade da minha entrega. Se fecharmos hoje, consigo iniciar a sua implementação amanhã de manhã. Avançamos?"
      },
      {
        title: "Fechamento Presuntivo",
        content: "Perfeito, {{nome}}. Como todas as dúvidas estão esclarecidas, o próximo passo é enviar-lhe o link de configuração para ativarmos o seu painel.\n\nPosso enviar para este WhatsApp agora?"
      }
    ]
  },
  {
    name: "6. Pós-Venda & Indicações",
    icon: "🎁",
    sortOrder: 6,
    scripts: [
      {
        title: "Check-in de Resultado",
        content: "Fala {{nome}}, vi que o seu sistema já está no ar há 7 dias. Como estão a chegar os primeiros leads? Alguma dúvida onde eu possa ajudar?"
      },
      {
        title: "Pedido de Indicação",
        content: "Fico muito feliz que a {{empresa}} tenha alcançado esse resultado! {{nome}}, conhece outro empresário no seu círculo de amizades que precise do mesmo aumento de vendas? Se ele fechar connosco, dou-lhe o próximo mês de graça."
      }
    ]
  }
];

async function main() {
  console.log("🔥 Limpando scripts antigos...");
  // Opcional: deletar os antigos para não duplicar, ou mantê-los se o usuário já tiver editado
  // Vamos manter, e apenas inserir os novos (ou apagar tudo antes se for o caso).
  // Para evitar apagar scripts pessoais do utilizador, apenas não os apagamos.
  
  for (const folderData of scriptFolders) {
    // Verificamos se já existe
    let folder = await prisma.scriptFolder.findFirst({
      where: { name: folderData.name }
    });

    if (!folder) {
      folder = await prisma.scriptFolder.create({
        data: {
          name: folderData.name,
          icon: folderData.icon,
          sortOrder: folderData.sortOrder
        }
      });
    }

    for (const [index, scriptData] of folderData.scripts.entries()) {
      const existing = await prisma.script.findFirst({
        where: { title: scriptData.title, folderId: folder.id }
      });

      if (!existing) {
        await prisma.script.create({
          data: {
            title: scriptData.title,
            content: scriptData.content,
            sortOrder: index,
            folderId: folder.id
          }
        });
        console.log(`✅ Script criado: ${scriptData.title}`);
      }
    }
  }

  console.log("🚀 Todos os scripts injetados com sucesso!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
