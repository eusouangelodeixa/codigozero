import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const COST_CATEGORIES = ['ferramentas', 'ads', 'salario', 'infra', 'impostos', 'outro'] as const;

export interface CreateCostInput {
  description: string;
  amount: number;
  category?: string;
  allocation?: 'company' | 'shared';
  incurredAt?: Date;
  note?: string;
  createdById?: string;
}

/**
 * Record a cost. A `shared` cost is split among the enabled partners pro-rata
 * by sharePct, creating one open PartnerCostShare debit each (so it reduces
 * their withdrawable balance). A `company` cost only affects profit reporting.
 */
export async function createCost(input: CreateCostInput) {
  const allocation = input.allocation === 'shared' ? 'shared' : 'company';
  const amount = round2(Number(input.amount));

  const cost = await prisma.cost.create({
    data: {
      description: input.description.trim().slice(0, 300),
      amount,
      category: COST_CATEGORIES.includes(input.category as any) ? (input.category as string) : 'outro',
      allocation,
      incurredAt: input.incurredAt ?? new Date(),
      note: input.note?.trim().slice(0, 1000) || null,
      createdById: input.createdById ?? null,
    },
  });

  if (allocation === 'shared') {
    const partners = await prisma.partnerAccount.findMany({ where: { enabled: true }, select: { id: true, sharePct: true } });
    if (partners.length > 0) {
      await prisma.partnerCostShare.createMany({
        data: partners.map((p) => ({
          costId: cost.id,
          partnerId: p.id,
          amount: round2((amount * p.sharePct) / 100),
          sharePct: p.sharePct,
          status: 'open',
        })),
      });
    }
  }

  return cost;
}

/**
 * Delete a cost. Open (unsettled) partner shares are removed so they stop
 * deducting; already-settled shares are kept for history (their costId is set
 * to null by the FK rule).
 */
export async function deleteCost(id: string) {
  await prisma.partnerCostShare.deleteMany({ where: { costId: id, status: 'open' } });
  await prisma.cost.delete({ where: { id } });
}

function windowClause(from?: Date, to?: Date): Prisma.CostWhereInput {
  if (!from && !to) return {};
  const incurredAt: Prisma.DateTimeFilter = {};
  if (from) incurredAt.gte = from;
  if (to) incurredAt.lte = to;
  return { incurredAt };
}

export async function listCosts(opts: { from?: Date; to?: Date; category?: string; allocation?: string; limit?: number } = {}) {
  const where: Prisma.CostWhereInput = { ...windowClause(opts.from, opts.to) };
  if (opts.category && opts.category !== 'all') where.category = opts.category;
  if (opts.allocation && opts.allocation !== 'all') where.allocation = opts.allocation;
  return prisma.cost.findMany({
    where,
    orderBy: { incurredAt: 'desc' },
    take: Math.min(opts.limit ?? 200, 500),
    include: { createdBy: { select: { name: true } } },
  });
}

/** Totals for a window: company vs shared vs grand total. */
export async function costTotals(opts: { from?: Date; to?: Date } = {}) {
  const where = windowClause(opts.from, opts.to);
  const [companyAgg, sharedAgg] = await Promise.all([
    prisma.cost.aggregate({ where: { ...where, allocation: 'company' }, _sum: { amount: true }, _count: true }),
    prisma.cost.aggregate({ where: { ...where, allocation: 'shared' }, _sum: { amount: true }, _count: true }),
  ]);
  const company = round2(companyAgg._sum.amount ?? 0);
  const shared = round2(sharedAgg._sum.amount ?? 0);
  return {
    company,
    shared,
    total: round2(company + shared),
    count: companyAgg._count + sharedAgg._count,
  };
}

/** Sum of a partner's OPEN cost-share debits (reduces their withdrawable pool). */
export async function getPartnerOpenCostShareTotal(partnerId: string): Promise<number> {
  const agg = await prisma.partnerCostShare.aggregate({
    where: { partnerId, status: 'open' },
    _sum: { amount: true },
  });
  return round2(agg._sum.amount ?? 0);
}
