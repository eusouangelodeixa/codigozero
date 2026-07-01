import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendPushToSuperAdmins, sendPushToUser, sendPushToUsers } from '../routes/auth.routes';
import { env } from '../config/env';
import { processDueDispatches, processDispatch } from '../services/dispatch.service';
import { transitionDuePending } from '../services/affiliate.service';
import { transitionDuePartnerPending } from '../services/partner.service';
import { getActivePrice } from '../lib/pricing';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { deprovisionKomunika } from '../services/komunika.service';
import { initiateSdrOutbound } from '../services/sdr.service';
import { buildSurveyContext } from '../services/lifecycle.service';
import { processOnboardingNudges } from '../services/onboarding.service';

const prisma = new PrismaClient();

/**
 * Start all CRON jobs for the Código Zero platform.
 */
export function startCronJobs() {
  // ── Daily Subscription Check (00:00 every day) ──
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] 🔄 Running daily subscription check...');

    try {
      const now = new Date();

      // Find users with expired subscriptions that are still active
      const expiredActive = await prisma.user.findMany({
        where: {
          subscriptionStatus: 'active',
          subscriptionEnd: { lt: now },
        },
      });

      for (const user of expiredActive) {
        const expiryDate = user.subscriptionEnd!;
        const hoursSinceExpiry = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60);

        if (hoursSinceExpiry <= 72) {
          // Grace period (0-72h after expiry)
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: 'grace_period' },
          });
          console.log(`[CRON] ⚠️ User ${user.email} moved to grace_period`);
        } else {
          // Overdue (>72h after expiry)
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: 'overdue', isActive: false },
          });
          // Expired without renewal → revoke Komunika (no-op if none).
          deprovisionKomunika(user.id, 'expired').catch((e) =>
            console.error('[CRON] Komunika deprovision failed (non-blocking):', e?.message || e),
          );
          console.log(`[CRON] 🔒 User ${user.email} blocked (overdue)`);
        }
      }

      // Check grace_period users that exceeded 72h
      const graceExpired = await prisma.user.findMany({
        where: {
          subscriptionStatus: 'grace_period',
          subscriptionEnd: {
            lt: new Date(now.getTime() - 72 * 60 * 60 * 1000),
          },
        },
      });

      for (const user of graceExpired) {
        await prisma.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'overdue', isActive: false },
        });
        // Grace period exhausted → revoke Komunika (no-op if none).
        deprovisionKomunika(user.id, 'expired').catch((e) =>
          console.error('[CRON] Komunika deprovision failed (non-blocking):', e?.message || e),
        );
        console.log(`[CRON] 🔒 User ${user.email} grace period expired → overdue`);
      }

      // Reset daily search counters
      await prisma.user.updateMany({
        where: { dailySearchCount: { gt: 0 } },
        data: { dailySearchCount: 0 },
      });

      console.log(`[CRON] ✅ Subscription check complete. Processed ${expiredActive.length + graceExpired.length} users.`);

      // 🔔 Push to superadmin if users were blocked
      if (graceExpired.length > 0) {
        sendPushToSuperAdmins({
          title: '🔒 Utilizadores bloqueados',
          body: `${graceExpired.length} utilizador(es) bloqueado(s) por assinatura expirada`,
          url: '/admin/users',
        }).catch(() => {});
      }
      if (expiredActive.length > 0) {
        sendPushToSuperAdmins({
          title: '⚠️ Assinaturas em risco',
          body: `${expiredActive.length} utilizador(es) entrou em período de graça`,
          url: '/admin/users',
        }).catch(() => {});
      }

    } catch (error) {
      console.error('[CRON] ❌ Subscription check failed:', error);
    }
  });

  // ── Expiration Alerts via WhatsApp (twice a day, DAYTIME in Mozambique) ──
  // Server runs in UTC; Moçambique is UTC+2 (CAT). 06:00 e 14:00 UTC = 08:00 e
  // 16:00 CAT — evita disparar renovação de madrugada (o antigo '0 */6 * * *'
  // mandava às 02:00 CAT). O dedup de 20h (lastExpirationAlert) garante no
  // máximo 1 alerta/dia por usuário mesmo com duas rodadas.
  cron.schedule('0 6,14 * * *', async () => {
    console.log('[CRON] 🔔 Running expiration alert check...');
    try {
      const now = new Date();
      const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Find active users whose subscription ends within 3 days
      const expiringUsers = await prisma.user.findMany({
        where: {
          subscriptionStatus: { in: ['active', 'grace_period'] },
          subscriptionEnd: { lte: threeDays },
          phone: { not: '' },
        },
      });

      const systemConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
      const apiKey = systemConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
      const instanceId = systemConfig?.komunikaInstanceId;
      const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

      if (!apiKey || !instanceId || expiringUsers.length === 0) {
        console.log(`[CRON] 🔔 No expiration alerts to send (${expiringUsers.length} users, configured: ${!!(apiKey && instanceId)})`);
        return;
      }

      let alertsSent = 0;
      for (const user of expiringUsers) {
        if (!user.subscriptionEnd) continue;

        const hoursLeft = (user.subscriptionEnd.getTime() - now.getTime()) / (1000 * 60 * 60);
        const daysLeft = Math.ceil(hoursLeft / 24);

        // Determine alert tier and check if already sent for this tier
        let alertTier: string;
        if (hoursLeft <= 0) alertTier = 'expired';
        else if (daysLeft <= 1) alertTier = '1day';
        else alertTier = '3days';

        // Skip if alert was already sent within the last 20 hours (prevents duplicates)
        if (user.lastExpirationAlert) {
          const hoursSinceAlert = (now.getTime() - user.lastExpirationAlert.getTime()) / (1000 * 60 * 60);
          if (hoursSinceAlert < 20) continue;
        }

        // Build personalized message based on urgency
        let message = '';
        const name = user.name.split(' ')[0];

        // Renewal link = the STANDARD public checkout (/p/{pid}). When the
        // member was referred by a coproducer, use that coproducer's public
        // checkout so the renewal stays attributed (and paid out) to them.
        //
        // We deliberately do NOT mint a per-order Lojou token link here
        // (lojouService.createOrder → pay.lojou.app/token/…): those expire in
        // ~4h, so a "expira em 3 dias" reminder would point at a dead link by
        // the time the member taps it. The public product checkout never
        // expires and still attributes by pid. (Same reason we ignore any
        // previously-stored user.renewalUrl / checkoutUrl, which are tokens.)
        let finalLink = `https://pay.lojou.app/p/${env.LOJOU_PRODUCT_PID}`;
        if (user.referredByCoproducer) {
          const cop = await prisma.coproducerAccount.findUnique({
            where: { code: user.referredByCoproducer },
            select: { productPid: true, publicCheckoutUrl: true, enabled: true },
          });
          if (cop && cop.enabled) {
            finalLink = cop.publicCheckoutUrl || `https://pay.lojou.app/p/${cop.productPid}`;
          }
        }

        if (alertTier === '3days') {
          message = `Olá ${name}! 👋\n\nSua assinatura do *Código Zero* expira em *${daysLeft} dia${daysLeft > 1 ? 's' : ''}*.\n\nRenove agora para não perder acesso às aulas, scripts e ferramentas:\n🔗 ${finalLink}\n\nQualquer dúvida, estamos aqui! 💪`;
        } else if (alertTier === '1day') {
          message = `⚠️ *Atenção, ${name}!*\n\nSua assinatura do Código Zero expira *amanhã*!\n\nSe não renovar, você perderá acesso a:\n• Todas as aulas e materiais\n• Scripts de prospecção\n• Radar de leads\n• Chat da comunidade\n\n👉 Renove agora: ${finalLink}\n\nNão deixe para última hora! 🚀`;
        } else {
          message = `🔴 ${name}, sua assinatura do Código Zero *expirou*.\n\nSeu acesso será bloqueado em breve.\n\nRenove agora e continue sua jornada:\n👉 ${finalLink}\n\nSe precisar de ajuda, fale com o mentor pelo suporte. 🤝`;
        }

        let cleanPhone = user.phone.replace(/\D/g, '');
        if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
          cleanPhone = `258${cleanPhone}`;
        }

        try {
          const res = await fetch(`${apiUrl}/api/v1/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ instanceId, to: cleanPhone, type: 'text', content: message }),
          });

          if (res.ok) {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastExpirationAlert: now },
            });
            alertsSent++;
            console.log(`[CRON] 🔔 Expiration alert (${alertTier}) sent to ${user.email}`);

            // 🔔 Push to student: subscription expiring
            const pushTitle = alertTier === 'expired'
              ? '🔴 Assinatura expirada'
              : alertTier === '1day'
                ? '⚠️ Assinatura expira amanhã!'
                : '📅 Assinatura expira em breve';
            const pushBody = alertTier === 'expired'
              ? 'Renove agora para não perder acesso às aulas e ferramentas.'
              : alertTier === '1day'
                ? 'Sua assinatura expira amanhã! Renove para continuar aprendendo.'
                : `Sua assinatura expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}. Renove para continuar!`;
            sendPushToUser(user.id, {
              title: pushTitle,
              body: pushBody,
              url: '/assinatura',
            }, 'expiration').catch(() => {});
          }
        } catch (e) {
          console.error(`[CRON] Failed to send alert to ${user.email}:`, e);
        }

        // Randomized HUMAN-LIKE gap between sends (≈90–210s) to avoid a robotic
        // burst pattern that risks a WhatsApp ban on the shared Komunika number.
        // The old 20–50s gap meant ~5 members got messaged inside ~2 min — a
        // clear automated-burst signal. Volume here is small (only users within
        // the 3-day expiry window), so even a few minutes apart stays prompt.
        await new Promise((r) => setTimeout(r, 90_000 + Math.floor(Math.random() * 120_000)));
      }

      console.log(`[CRON] 🔔 Expiration alerts complete: ${alertsSent} sent.`);
    } catch (error) {
      console.error('[CRON] ❌ Expiration alert check failed:', error);
    }
  });

  // ── Newsletter welcome for content-page leads (delayed, low-rate, daytime) ──
  // Tick every 3 min but send AT MOST ONE welcome per tick, and only during
  // daytime CAT. That guarantees distant, one-at-a-time sends (anti-ban on the
  // shared Komunika number — see [[cron-whatsapp-send-safety]]). The 10–20 min
  // delay itself is set at capture time (newsletterWelcomeDueAt); night signups
  // naturally wait for the morning window.
  cron.schedule('*/3 * * * *', async () => {
    try {
      const now = new Date();
      const hourUtc = now.getUTCHours();
      // Moçambique = UTC+2: 08:00–20:00 CAT = 06:00–18:00 UTC.
      if (hourUtc < 6 || hourUtc >= 18) return;

      // Respect the admin on/off toggle. Disabled → skip (the queue just holds;
      // the 1-per-tick pacing keeps it ban-safe even if re-enabled later).
      const sysCfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
      if (sysCfg?.newsletterWelcomeEnabled === false) return;

      const lead = await prisma.user.findFirst({
        where: { newsletterWelcomeDueAt: { lte: now }, newsletterWelcomeSentAt: null },
        orderBy: { newsletterWelcomeDueAt: 'asc' },
      });
      if (!lead) return;
      if (!lead.phone) {
        // No phone to message — stamp as done so it doesn't block the queue.
        await prisma.user.update({ where: { id: lead.id }, data: { newsletterWelcomeSentAt: now } });
        return;
      }

      const firstName = lead.name?.split(' ')[0] || 'tudo bem';
      // Custom message from /admin/config ({nome} → first name), else default.
      const tpl = sysCfg?.newsletterWelcomeMessage?.trim();
      const message = tpl
        ? tpl.replace(/\{nome\}/gi, firstName)
        : [
            `Olá ${firstName}! 👋 Aqui é do *Código Zero*.`,
            ``,
            `Obrigado por pegar o conteúdo! 🎉 Você entrou na nossa lista — de vez`,
            `em quando mando dicas práticas de como ganhar dinheiro com IA, mesmo`,
            `começando do zero.`,
            ``,
            `Fica de olho aqui no WhatsApp. 💪`,
          ].join('\n');

      const r = await sendWhatsAppMessage({ phone: lead.phone, content: message });
      if (r.ok) {
        await prisma.user.update({ where: { id: lead.id }, data: { newsletterWelcomeSentAt: now } });
        console.log(`[CRON] 📬 Newsletter welcome sent to ${lead.email}`);
      } else {
        // Komunika down/misconfigured → defer 30 min instead of dropping it,
        // and don't hot-loop a failing send.
        await prisma.user.update({
          where: { id: lead.id },
          data: { newsletterWelcomeDueAt: new Date(now.getTime() + 30 * 60 * 1000) },
        });
        console.warn(`[CRON] 📬 Newsletter welcome deferred for ${lead.email} (komunika ${r.status})`);
      }
    } catch (error) {
      console.error('[CRON] ❌ Newsletter welcome failed:', error);
    }
  });

  // ── Landing Page Visitor Remarketing (Every 15 minutes) ──
  cron.schedule('*/15 * * * *', async () => {
    console.log('[CRON] 🔄 Running Landing Page Remarketing Check...');
    try {
      const now = new Date();
      // Encontrar quem se cadastrou há mais de 30 minutos, ainda é 'lead', e não recebeu remarketing
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
      
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      
      const abandonedLeads = await prisma.user.findMany({
        where: {
          subscriptionStatus: { not: 'active' },
          updatedAt: { lt: thirtyMinsAgo, gt: twoDaysAgo },
          remarketingStage: 'none'
        }
      });

      const systemConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
      const apiKey = systemConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
      const instanceId = systemConfig?.komunikaInstanceId || undefined;
      const visitorAssistantId = systemConfig?.komunikaVisitorAssistantId || process.env.KOMUNIKA_SDR_VISITOR_ASSISTANT_ID;

      if (abandonedLeads.length > 0 && apiKey && visitorAssistantId) {
        console.log(`[CRON] Encontrados ${abandonedLeads.length} leads abandonados.`);

        for (const lead of abandonedLeads) {
          // Fallback checkout link for the SDR agent — prefer the persisted
          // checkout URL, else build a personalized normal-checkout link.
          let checkoutUrl = lead.checkoutUrl || '';
          if (!checkoutUrl) {
            let cleanPhone = lead.phone.replace(/\D/g, '');
            if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
              cleanPhone = `258${cleanPhone}`;
            }
            const normalUrl = new URL('https://pay.lojou.app/p/uoEHz');
            if (lead.name) normalUrl.searchParams.append('name', lead.name);
            if (lead.email) normalUrl.searchParams.append('email', lead.email);
            normalUrl.searchParams.append('phone', cleanPhone);
            checkoutUrl = normalUrl.toString();
          }

          const context = buildSurveyContext(lead, { scenario: 'visitor', checkoutUrl });
          const result = await initiateSdrOutbound({
            assistantId: visitorAssistantId,
            apiKey,
            phone: lead.phone,
            name: lead.name,
            context,
            source: 'landing-abandon',
            instanceId,
          });

          if (result.ok) {
            await prisma.user.update({
              where: { id: lead.id },
              data: { remarketingStage: 'visitor_sent' },
            });
            console.log(`[CRON] 🎯 SDR (Visitante) iniciado para o lead ${lead.phone} (${result.status})`);
          } else {
            console.error(`[CRON] Falha ao iniciar SDR (Visitante) para ${lead.phone}: ${result.error}`);
          }
        }
      }

      // --- Checkout Abandonment Remarketing (15 min delay) ---
      const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
      const abandonedCheckouts = await prisma.user.findMany({
        where: {
          subscriptionStatus: { not: 'active' },
          updatedAt: { lt: fifteenMinsAgo, gt: twoDaysAgo },
          remarketingStage: 'checkout_pending'
        }
      });

      const checkoutAssistantId = systemConfig?.komunikaCheckoutAssistantId || process.env.KOMUNIKA_SDR_CHECKOUT_ASSISTANT_ID;

      if (abandonedCheckouts.length > 0 && apiKey && checkoutAssistantId) {
        console.log(`[CRON] Encontrados ${abandonedCheckouts.length} checkouts pendentes.`);

        for (const lead of abandonedCheckouts) {
          let checkoutUrl = lead.checkoutUrl || '';
          if (!checkoutUrl) {
            let cleanPhone = lead.phone.replace(/\D/g, '');
            if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
              cleanPhone = `258${cleanPhone}`;
            }
            const normalUrl = new URL('https://pay.lojou.app/p/uoEHz');
            if (lead.name) normalUrl.searchParams.append('name', lead.name);
            if (lead.email) normalUrl.searchParams.append('email', lead.email);
            normalUrl.searchParams.append('phone', cleanPhone);
            checkoutUrl = normalUrl.toString();
          }

          const context = buildSurveyContext(lead, {
            scenario: 'checkout',
            checkoutUrl,
            orderId: lead.lojouOrderId || undefined,
          });
          const result = await initiateSdrOutbound({
            assistantId: checkoutAssistantId,
            apiKey,
            phone: lead.phone,
            name: lead.name,
            context,
            source: 'checkout-abandon',
            instanceId,
          });

          if (result.ok) {
            await prisma.user.update({
              where: { id: lead.id },
              data: { remarketingStage: 'checkout_failed_sent' },
            });
            console.log(`[CRON] 🛒 SDR (Checkout) iniciado para o lead ${lead.phone} (${result.status})`);
          } else {
            console.error(`[CRON] Falha ao iniciar SDR (Checkout) para ${lead.phone}: ${result.error}`);
          }
        }
      }

    } catch (error) {
      console.error('[CRON] ❌ Remarketing check failed:', error);
    }
  });

  // ── Lojou Conciliation (01:00 daily) ──
  cron.schedule('0 1 * * *', async () => {
    console.log('[CRON] 🔄 Running Lojou conciliation...');

    const LOJOU_API = `${process.env.LOJOU_API_URL || 'https://api.lojou.app'}/v1`;
    const LOJOU_KEY = process.env.LOJOU_API_KEY;
    const LOJOU_PRODUCT_PID = process.env.LOJOU_PRODUCT_PID;

    if (!LOJOU_KEY) {
      console.log('[CRON] ⚠️ No Lojou API key — skipping conciliation');
      return;
    }

    try {
      // Fetch approved orders from Lojou
      const res = await fetch(`${LOJOU_API}/orders?status=approved&per_page=100`, {
        headers: { 'Authorization': `Bearer ${LOJOU_KEY}` },
      });

      if (!res.ok) {
        console.warn(`[CRON] Lojou orders fetch failed: ${res.status}`);
        return;
      }

      const data = await res.json();
      const allOrders = data.data || data.orders || [];

      // Filter to only include orders from THIS product (Código Zero)
      const lojouOrders = LOJOU_PRODUCT_PID
        ? allOrders.filter((o: any) => {
            const pid = o.product_pid || o.product?.pid || o.productPid || '';
            return pid === LOJOU_PRODUCT_PID;
          })
        : allOrders;

      console.log(`[CRON] Lojou: ${allOrders.length} total orders, ${lojouOrders.length} for product ${LOJOU_PRODUCT_PID || 'ALL'}`);

      let fixed = 0;
      let mismatches = 0;

      for (const order of lojouOrders) {
        const orderId = String(order.id || order.order_number);
        const email = order.customer?.email;
        const phone = order.customer?.phone || order.customer?.cellphone;

        // Check if we have this transaction
        const localTx = await prisma.transaction.findUnique({ where: { orderId } });

        if (!localTx) {
          // Missing transaction — webhook was lost
          console.log(`[CRON] 🔧 Missing order ${orderId} (${email}) — creating...`);

          // Find or create user
          let user = null;
          if (email) user = await prisma.user.findUnique({ where: { email } });
          if (!user && phone) user = await prisma.user.findFirst({ where: { phone } });

          if (user && user.subscriptionStatus !== 'active') {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                subscriptionStatus: 'active',
                isActive: true,
                subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                lojouOrderId: orderId,
              },
            });
            console.log(`[CRON] ✅ Reactivated ${email} from conciliation`);
            fixed++;
          }

          // Record the transaction
          await prisma.transaction.create({
            data: {
              orderId,
              userEmail: email,
              userPhone: phone,
              userName: order.customer?.name || 'Conciliation',
              amount: order.amount || (await getActivePrice()),
              status: 'approved',
              paymentMethod: 'conciliation',
              metadata: order,
            },
          }).catch(() => {}); // ignore duplicate
        } else if (localTx.status !== 'approved') {
          // Status mismatch
          console.warn(`[CRON] ⚠️ Mismatch: order ${orderId} is approved at Lojou but ${localTx.status} locally`);
          mismatches++;
        }
      }

      console.log(`[CRON] ✅ Conciliation done — ${fixed} fixed, ${mismatches} mismatches, ${lojouOrders.length} total orders checked`);
    } catch (error) {
      console.error('[CRON] ❌ Lojou conciliation failed:', error);
    }
  });

  // ── Hourly Milestone Check ──
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Checking platform milestones...');
    try {
      const approvedTx = await prisma.transaction.findMany({ where: { status: 'approved' } });
      const totalRevenue = approvedTx.reduce((s, t) => s + t.amount, 0);
      const uniquePayers = new Set(approvedTx.map(t => t.userEmail).filter(Boolean));
      const totalSubscribers = uniquePayers.size;

      const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
      const unreached = await prisma.platformMilestone.findMany({ where: { reached: false } });

      for (const m of unreached) {
        const current = m.category === 'revenue' ? totalRevenue : totalSubscribers;
        if (current >= m.targetValue) {
          await prisma.platformMilestone.update({ where: { id: m.id }, data: { reached: true, reachedAt: new Date() } });

          const label = m.category === 'revenue'
            ? `${m.targetValue.toLocaleString('pt-BR')} MT em faturamento`
            : `${m.targetValue} assinante(s)`;

          // WhatsApp alert — uses the shared sender (SystemConfig creds with
          // env fallback + retries), so it works even when the Komunika key
          // lives only in the env. Only requires the alert phone to be set.
          if (config?.milestoneAlertPhone) {
            const content = `*Código Zero — Meta Alcançada*\n\nParabéns ${config.milestoneAlertName || 'Admin'}!\n\nA meta de *${label}* foi atingida!`;
            const r = await sendWhatsAppMessage({ phone: config.milestoneAlertPhone, content });
            if (r.ok) {
              await prisma.platformMilestone.update({ where: { id: m.id }, data: { notified: true } });
            }
            console.log(`[CRON] Milestone reached: ${m.category} ${m.targetValue} (whatsapp=${r.ok})`);
          }

          // 🔔 Push to superadmin
          sendPushToSuperAdmins({
            title: '🏆 Meta Alcançada!',
            body: label,
            url: '/admin/status',
          }).catch(() => {});
        }
      }
    } catch (error) { console.error('[CRON] Milestone check failed:', error); }
  });

  console.log('[CRON] ⏰ Daily subscription check scheduled (00:00)');
  console.log('[CRON] ⏰ Expiration alerts scheduled (Every 6 hours)');
  console.log('[CRON] ⏰ Remarketing check scheduled (Every 15 mins)');
  console.log('[CRON] ⏰ Lojou conciliation scheduled (01:00)');
  console.log('[CRON] ⏰ Milestone check scheduled (Every hour)');

  // ── Daily Inactivity Reminder (10:00 every day) ──
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] 💤 Running inactivity reminder...');
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      // Find active students who haven't logged in for 3+ days
      const inactiveUsers = await prisma.user.findMany({
        where: {
          subscriptionStatus: 'active',
          isActive: true,
          role: 'member',
          updatedAt: { lt: threeDaysAgo },
        },
        select: { id: true, name: true },
      });

      const motivationalMessages = [
        'Novas ferramentas de IA esperam por ti! 🧠',
        'Seus concorrentes estão estudando agora. E você? 🔥',
        'Cada dia sem praticar é um dia perdido. Volte já! 💪',
        'A comunidade sentiu sua falta! 👋',
        'Tem conteúdo novo esperando por ti. Confira! 🎯',
      ];
      const randomMsg = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];

      for (const user of inactiveUsers) {
        sendPushToUser(user.id, {
          title: '👋 Sentimos sua falta!',
          body: randomMsg,
          url: '/forja',
        }, 'system').catch(() => {});
      }

      console.log(`[CRON] 💤 Inactivity reminders sent: ${inactiveUsers.length}`);
    } catch (error) {
      console.error('[CRON] ❌ Inactivity reminder failed:', error);
    }
  });

  console.log('[CRON] ⏰ Inactivity reminder scheduled (10:00 daily)');

  // ── PWA install reminder (11:00 every day) ──
  // One day after subscribing, nudge paid users who haven't added the app to
  // their home screen (pwaInstalledAt is stamped client-side in standalone
  // mode). Sent once per user (pwaReminderSentAt) over WhatsApp.
  cron.schedule('0 11 * * *', async () => {
    console.log('[CRON] 📲 Running PWA install reminder...');
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      // Small daily batch sent as a slow drip with LONG RANDOM gaps. Blasting
      // everyone at once (or with a tiny fixed gap) is the pattern WhatsApp
      // bans for. Each day clears a few; the rest are picked up on following
      // days (already-messaged users are excluded via pwaReminderSentAt).
      const candidates = await prisma.user.findMany({
        where: {
          subscriptionStatus: 'active',
          isActive: true,
          role: 'member',
          lojouOrderId: { not: null },
          pwaInstalledAt: null,
          pwaReminderSentAt: null,
          createdAt: { lt: oneDayAgo },
        },
        select: { id: true, name: true, phone: true },
        take: 20,
      });

      let sent = 0;
      for (let i = 0; i < candidates.length; i++) {
        const user = candidates[i];
        const firstName = (user.name || 'membro').split(' ')[0];
        const message = [
          `📲 *${firstName}, instale o Código Zero no seu celular!*`,
          ``,
          `Adicionando o app à tela inicial você acessa tudo com um toque — e ainda recebe avisos de novas aulas e leads.`,
          ``,
          `Veja como em 30 segundos: ${env.FRONTEND_URL}/instalar`,
        ].join('\n');
        const r = await sendWhatsAppMessage({ phone: user.phone, content: message });
        await prisma.user.update({ where: { id: user.id }, data: { pwaReminderSentAt: new Date() } });
        if (r.ok) sent++;
        // Long, randomized interval (≈2–5 min) between sends. Skip after last.
        if (i < candidates.length - 1) {
          const waitMs = 120_000 + Math.floor(Math.random() * 180_000); // 120s–300s
          await new Promise((res) => setTimeout(res, waitMs));
        }
      }
      console.log(`[CRON] 📲 PWA install reminders sent: ${sent}/${candidates.length}`);
    } catch (error) {
      console.error('[CRON] ❌ PWA install reminder failed:', error);
    }
  });

  console.log('[CRON] ⏰ PWA install reminder scheduled (11:00 daily)');

  // ── Live mentoria reminders (every minute) ──
  // Push members 30 minutes before the live mentoria and again when it starts,
  // from SystemConfig.mentoriaSchedule. Dedup via mentoria30SentFor /
  // mentoriaStartSentFor (each stores the schedule value already notified), so a
  // reminder fires once per schedule and re-fires if the admin moves the date.
  // Sent with NO push category → reaches everyone, even members who muted the
  // community channel (a live mentoria is a high-value, time-sensitive event).
  cron.schedule('* * * * *', async () => {
    try {
      const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
      if (!cfg?.mentoriaSchedule || !cfg.mentoriaLink) return;
      const schedule = cfg.mentoriaSchedule;
      const target = new Date(schedule);
      if (isNaN(target.getTime())) return;

      const diffMs = target.getTime() - Date.now();

      // PAID members the mentoria reminder may reach. isActive alone is NOT a
      // subscriber gate — leads (never-paid form signups) are created with
      // role=member + isActive=true + subscriptionStatus='lead' (see
      // auth.routes.ts), so without this status gate the reminder blasts the
      // entire cold lead base. Includes grace_period/overdue (paid but late) so
      // a lapsing member still gets the live-event nudge; excludes 'lead' and
      // 'canceled' (PAID_STATUSES minus canceled).
      const MENTORIA_STATUSES = ['active', 'grace_period', 'overdue'];

      const notifyAll = async (title: string, body: string) => {
        const users = await prisma.user.findMany({
          where: { subscriptionStatus: { in: MENTORIA_STATUSES }, isActive: true, role: 'member' },
          select: { id: true },
        });
        // No category → bypasses notify* preferences (always delivered).
        await sendPushToUsers(users.map((u) => u.id), { title, body, url: '/qg' });
      };

      // NOTE: the live-mentoria WhatsApp "gap-fill" was REMOVED (2026-07-01) at
      // the owner's request — the "começou agora" blast to every no-push member
      // (seconds-apart sends on the shared Komunika number) was a ban risk.
      // Mentoria reminders are now PUSH-ONLY (notifyAll above).

      // 30 min before: first minute where 0 < diff <= 30min, once per schedule.
      if (diffMs > 0 && diffMs <= 30 * 60 * 1000 && cfg.mentoria30SentFor !== schedule) {
        await prisma.systemConfig.update({ where: { id: 'singleton' }, data: { mentoria30SentFor: schedule } });
        await notifyAll('🎥 Mentoria ao vivo em ~30 minutos', 'Prepare-se! A mentoria começa em breve. Toque para abrir o QG e entrar.');
        console.log('[CRON] 🎥 Mentoria 30-min reminder sent');
      }

      // At start: first minute where the start just passed (0 ≥ diff > -15min),
      // once per schedule. The -15min floor avoids blasting an old schedule if
      // the cron was down through the start time.
      if (diffMs <= 0 && diffMs > -15 * 60 * 1000 && cfg.mentoriaStartSentFor !== schedule) {
        await prisma.systemConfig.update({ where: { id: 'singleton' }, data: { mentoriaStartSentFor: schedule } });
        await notifyAll('🔴 A mentoria ao vivo começou!', 'Estamos ao vivo agora. Toque para entrar pelo QG.');
        console.log('[CRON] 🔴 Mentoria start reminder sent');
      }
    } catch (error) {
      console.error('[CRON] ❌ Mentoria reminder failed:', error);
    }
  });

  console.log('[CRON] ⏰ Live mentoria reminders scheduled (every minute)');

  // ── Scheduled WhatsApp dispatches (every 30 seconds) ──
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const picked = await processDueDispatches();
      if (picked > 0) console.log(`[CRON] 📤 Picked up ${picked} due dispatch(es)`);
    } catch (error) {
      console.error('[CRON] Dispatch tick failed:', error);
    }
  });
  console.log('[CRON] ⏰ Scheduled dispatches tick (every 30s)');

  // ── Affiliate commission availability (hourly) ──
  // Moves pending commissions to 'available' once their D+7 window matures.
  // Runs hourly rather than daily so admins manually adjusting D+7 don't have
  // to wait until the next midnight.
  cron.schedule('15 * * * *', async () => {
    try {
      const moved = await transitionDuePending();
      if (moved > 0) console.log(`[CRON] 💵 Affiliate commissions matured: ${moved}`);
    } catch (error) {
      console.error('[CRON] Affiliate availability tick failed:', error);
    }
    try {
      const movedPartners = await transitionDuePartnerPending();
      if (movedPartners > 0) console.log(`[CRON] 🤝 Partner commissions matured: ${movedPartners}`);
    } catch (error) {
      console.error('[CRON] Partner availability tick failed:', error);
    }
  });
  console.log('[CRON] ⏰ Affiliate + partner availability tick (hourly)');

  // ── Post-purchase onboarding nudges (every 6 hours) ──
  // Reminds recent buyers who haven't opened the platform yet to log in (max 3,
  // ~1/day per user via a 20h gate), and retries any pending welcome message.
  // Stops for a user the instant their firstAccessAt is stamped (GET /me).
  cron.schedule('45 */6 * * *', async () => {
    try {
      const sent = await processOnboardingNudges();
      if (sent > 0) console.log(`[CRON] 👋 Onboarding messages sent: ${sent}`);
    } catch (error) {
      console.error('[CRON] Onboarding nudge tick failed:', error);
    }
  });
  console.log('[CRON] ⏰ Onboarding nudge tick (every 6h)');

  // ── Recover orphaned dispatches on boot ──
  // Any 'running' rows left over from a previous process crash, plus any
  // 'pending' rows whose scheduledAt is already in the past, get picked
  // up immediately so the user doesn't have to wait for the next tick.
  recoverOrphanedDispatches().catch((e) => console.error('[BOOT] Dispatch recovery failed:', e));
}

async function recoverOrphanedDispatches() {
  const now = new Date();
  // Reset 'running' rows to 'pending' so processDispatch can re-claim them.
  const stalled = await prisma.scheduledDispatch.updateMany({
    where: { status: 'running' },
    data: { status: 'pending' },
  });
  if (stalled.count > 0) {
    console.log(`[BOOT] 🩹 Reset ${stalled.count} stalled dispatch(es) from 'running' → 'pending'`);
  }

  const due = await prisma.scheduledDispatch.findMany({
    where: { status: 'pending', scheduledAt: { lte: now } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of due) {
    processDispatch(id).catch((e) => console.error('[BOOT] Dispatch resume error', id, e));
  }
  if (due.length > 0) {
    console.log(`[BOOT] 📤 Resumed ${due.length} due dispatch(es)`);
  }
}
