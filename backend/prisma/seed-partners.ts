/**
 * Seed the 4 revenue-share partners (sócios).
 *
 * Run with:  npx tsx prisma/seed-partners.ts
 *
 * Each partner MUST already have a User account (by email). This script does
 * NOT create users — in a money system we don't want placeholder accounts
 * holding a balance. Create the user first (real signup / admin), then run.
 *
 * Fill in the real emails below. Ângelo's is pre-filled from the project
 * context; the others are placeholders — replace before running.
 *
 * The script is idempotent: re-running updates sharePct/role on existing
 * PartnerAccounts instead of duplicating. It refuses to run if the enabled
 * shares wouldn't sum to 100.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PARTNERS = [
  { email: 'emen@REPLACE-ME.com',          displayName: 'Emen',   roleLabel: 'Proprietário',    sharePct: 35 },
  { email: 'eusouangelodeixa@gmail.com',   displayName: 'Ângelo', roleLabel: 'Especialista',    sharePct: 35 },
  { email: 'rival@REPLACE-ME.com',         displayName: 'Rival',  roleLabel: 'Edição de vídeo', sharePct: 15 },
  { email: 'leonel@REPLACE-ME.com',        displayName: 'Leonel', roleLabel: 'Design gráfico',  sharePct: 15 },
];

async function main() {
  const total = PARTNERS.reduce((s, p) => s + p.sharePct, 0);
  if (total !== 100) {
    throw new Error(`A soma dos percentuais é ${total}%, deveria ser 100%. Corrija antes de continuar.`);
  }

  const unresolved: string[] = [];
  for (const p of PARTNERS) {
    if (p.email.includes('REPLACE-ME')) {
      unresolved.push(p.displayName);
      continue;
    }
    const user = await prisma.user.findUnique({ where: { email: p.email.toLowerCase().trim() } });
    if (!user) {
      console.warn(`⚠️  Usuário não encontrado para ${p.displayName} (${p.email}) — crie a conta primeiro. Pulando.`);
      unresolved.push(p.displayName);
      continue;
    }

    const existing = await prisma.partnerAccount.findUnique({ where: { userId: user.id } });
    if (existing) {
      await prisma.partnerAccount.update({
        where: { id: existing.id },
        data: { sharePct: p.sharePct, roleLabel: p.roleLabel, displayName: p.displayName, enabled: true },
      });
      console.log(`↻  Atualizado: ${p.displayName} — ${p.sharePct}%`);
    } else {
      await prisma.partnerAccount.create({
        data: {
          userId: user.id,
          sharePct: p.sharePct,
          roleLabel: p.roleLabel,
          displayName: p.displayName,
          enabled: true,
        },
      });
      console.log(`✓  Criado: ${p.displayName} — ${p.sharePct}%`);
    }
  }

  if (unresolved.length) {
    console.warn(`\n⚠️  Não configurados (faltou email/usuário): ${unresolved.join(', ')}`);
    console.warn('   Preencha os emails reais no topo do script (ou crie os usuários) e rode de novo.');
  } else {
    console.log('\n✅ Todos os 4 sócios configurados.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
