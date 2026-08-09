import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { sendPushToSuperAdmins } from '../routes/auth.routes';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Conciliação com a Lojou — fecha o estado das encomendas em aberto.
 *
 * Contexto de dois detalhes da API deles que definem todo o desenho:
 *
 *  1. A LISTA (`/v1/orders`) devolve apenas `order_number`, `amount`, `status`
 *     e datas — **não devolve o produto**. A conciliação antiga filtrava por
 *     `o.product_pid`, campo que nunca existe nessa resposta, portanto
 *     descartava 100% das encomendas e nunca conciliou nada. Era uma rede de
 *     segurança que parecia montada e estava rasgada.
 *  2. O DETALHE (`/v1/orders/{n}`) devolve `product.product_pid`, o cliente e o
 *     valor real. É o único sítio onde dá para confirmar que a encomenda é do
 *     Código Zero.
 *
 * Isto importa porque a conta da Lojou é PARTILHADA com outros produtos: agir
 * sobre a lista sem confirmar o produto daria acesso a quem comprou outra coisa.
 * Por isso a regra aqui é: **nunca tocar numa encomenda sem confirmar o pid no
 * detalhe**.
 */

const LOJOU_API = `${env.LOJOU_API_URL || 'https://api.lojou.app'}/v1`;

/** Estados da Lojou que significam "esta encomenda morreu". */
const DEAD_STATUSES = new Set(['cancelled', 'canceled', 'expired', 'refused', 'failed']);

type LojouOrderDetail = {
  order_number: string;
  status: string;
  amount: number;
  product?: { product_pid?: string; name?: string };
  customer?: { name?: string; email?: string; mobile_number?: string };
};

async function fetchOrderDetail(orderId: string, key: string): Promise<LojouOrderDetail | null> {
  try {
    const res = await fetch(`${LOJOU_API}/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    return body?.data || null;
  } catch {
    return null;
  }
}

/** É nossa? Só age em encomendas do produto Código Zero. */
function isOurs(detail: LojouOrderDetail | null): boolean {
  const pid = detail?.product?.product_pid;
  return !!pid && pid === env.LOJOU_PRODUCT_PID;
}

export type ReconcileSummary = {
  checked: number;
  settled: number;
  approvedFound: number;
  alerts: number;
};

/**
 * Passa pelas transações locais em `pending` e pergunta à Lojou o que
 * aconteceu de facto.
 *
 * - Morreu (cancelada/expirada) → passa a `cancelled`, para o painel deixar de
 *   a mostrar como um checkout ainda em aberto.
 * - Foi aprovada → o nosso webhook perdeu-se. É alguém que PAGOU: reativamos a
 *   conta se ela existir e avisamos o admin. Não criamos conta nem enviamos
 *   credenciais a partir daqui de propósito — essa decisão fica com uma pessoa,
 *   para nunca haver hipótese de entregar acesso a quem não comprou.
 * - Continua pendente → não se toca (ainda pode ser paga).
 */
export async function reconcilePendingOrders(maxOrders = 40): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, settled: 0, approvedFound: 0, alerts: 0 };
  const key = env.LOJOU_API_KEY;
  if (!key) return summary;

  // Margem de 2h: a Lojou nasce `pending` e só depois actualiza para aprovado.
  // Sem esta folga, fecharíamos como morta uma compra que estava a decorrer.
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const pendings = await prisma.transaction.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    select: { id: true, orderId: true, userEmail: true, userPhone: true, amount: true },
    orderBy: { createdAt: 'desc' },
    take: maxOrders,
  });

  for (const tx of pendings) {
    const detail = await fetchOrderDetail(tx.orderId, key);
    summary.checked++;
    if (!isOurs(detail)) continue;

    const status = String(detail!.status || '').toLowerCase();

    if (DEAD_STATUSES.has(status)) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'cancelled' },
      });
      summary.settled++;
      continue;
    }

    if (status === 'approved') {
      summary.approvedFound++;
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'approved', amount: detail!.amount || tx.amount },
      });

      const email = detail!.customer?.email || tx.userEmail || undefined;
      const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

      if (user && user.subscriptionStatus !== 'active') {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: 'active',
            isActive: true,
            subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            lojouOrderId: tx.orderId,
          },
        });
      }

      // Alerta sempre: uma aprovação que só a conciliação apanhou significa que
      // um webhook se perdeu, e isso merece olhos humanos mesmo quando a conta
      // já foi reactivada aqui.
      summary.alerts++;
      void sendPushToSuperAdmins({
        title: '⚠️ Venda aprovada fora do webhook',
        body: `Pedido ${tx.orderId} (${email || 'sem e-mail'}) estava pendente e a Lojou diz aprovado.${user ? ' Conta reactivada.' : ' SEM conta — conceda acesso manualmente.'}`,
        url: '/admin/finance',
      });
    }
  }

  return summary;
}

/**
 * O sentido inverso: encomendas que a Lojou tem como aprovadas e que não
 * existem de todo no nosso banco (o webhook nunca chegou).
 *
 * Aqui o cuidado com a conta partilhada é ainda maior: a lista não diz o
 * produto, por isso cada candidata passa pelo detalhe antes de qualquer acção.
 * E, tal como acima, esta função NUNCA cria conta nem envia credenciais — só
 * regista a transacção e chama uma pessoa. Entregar acesso automaticamente com
 * base numa lista partilhada seria exactamente o risco a evitar.
 */
export async function reconcileMissingApproved(maxOrders = 60): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { checked: 0, settled: 0, approvedFound: 0, alerts: 0 };
  const key = env.LOJOU_API_KEY;
  if (!key) return summary;

  let list: any[] = [];
  try {
    const res = await fetch(`${LOJOU_API}/orders?per_page=100`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return summary;
    const body: any = await res.json();
    list = body?.orders || body?.data || [];
  } catch {
    return summary;
  }

  const approved = list
    .filter((o) => String(o?.status || '').toLowerCase() === 'approved')
    .slice(0, maxOrders);

  for (const order of approved) {
    const orderId = String(order.order_number || order.id || '');
    if (!orderId) continue;

    const local = await prisma.transaction.findUnique({ where: { orderId } });
    if (local) continue; // já conhecemos (o estado dela é tratado na outra passagem)

    const detail = await fetchOrderDetail(orderId, key);
    summary.checked++;
    if (!isOurs(detail)) continue;

    const email = detail!.customer?.email || null;
    await prisma.transaction.create({
      data: {
        orderId,
        userEmail: email,
        userPhone: detail!.customer?.mobile_number || null,
        userName: detail!.customer?.name || 'Conciliação',
        amount: detail!.amount || 0,
        status: 'approved',
        paymentMethod: 'conciliation',
        metadata: detail as any,
      },
    }).catch(() => {});

    summary.approvedFound++;
    summary.alerts++;
    void sendPushToSuperAdmins({
      title: '🚨 Venda aprovada sem webhook',
      body: `Pedido ${orderId} (${email || 'sem e-mail'}) existe aprovado na Lojou e não estava aqui. Verifique se a pessoa tem acesso.`,
      url: '/admin/finance',
    });
  }

  return summary;
}
