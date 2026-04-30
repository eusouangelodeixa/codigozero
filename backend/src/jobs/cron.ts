import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendPushToSuperAdmins, sendPushToUser } from '../routes/auth.routes';

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

  // ── Expiration Alerts via WhatsApp (every 6 hours) ──
  cron.schedule('0 */6 * * *', async () => {
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

        if (alertTier === '3days') {
          message = `Olá ${name}! 👋\n\nSua assinatura do *Código Zero* expira em *${daysLeft} dia${daysLeft > 1 ? 's' : ''}*.\n\nRenove agora para não perder acesso às aulas, scripts e ferramentas:\n🔗 ${user.checkoutUrl || process.env.FRONTEND_URL || 'https://codigozero.app'}\n\nQualquer dúvida, estamos aqui! 💪`;
        } else if (alertTier === '1day') {
          message = `⚠️ *Atenção, ${name}!*\n\nSua assinatura do Código Zero expira *amanhã*!\n\nSe não renovar, você perderá acesso a:\n• Todas as aulas e materiais\n• Scripts de prospecção\n• Radar de leads\n• Chat da comunidade\n\n👉 Renove agora: ${user.checkoutUrl || process.env.FRONTEND_URL || 'https://codigozero.app'}\n\nNão deixe para última hora! 🚀`;
        } else {
          message = `🔴 ${name}, sua assinatura do Código Zero *expirou*.\n\nSeu acesso será bloqueado em breve.\n\nRenove agora e continue sua jornada:\n👉 ${user.checkoutUrl || process.env.FRONTEND_URL || 'https://codigozero.app'}\n\nSe precisar de ajuda, fale com o mentor pelo suporte. 🤝`;
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
            }).catch(() => {});
          }
        } catch (e) {
          console.error(`[CRON] Failed to send alert to ${user.email}:`, e);
        }

        // Small delay between sends
        await new Promise(r => setTimeout(r, 2000));
      }

      console.log(`[CRON] 🔔 Expiration alerts complete: ${alertsSent} sent.`);
    } catch (error) {
      console.error('[CRON] ❌ Expiration alert check failed:', error);
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
      const visitorFunnelId = systemConfig?.komunikaVisitorFunnelId || process.env.KOMUNIKA_FUNNEL_VISITOR_ID;
      const hasApiKey = systemConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;

      if (abandonedLeads.length > 0 && hasApiKey && visitorFunnelId) {
        console.log(`[CRON] Encontrados ${abandonedLeads.length} leads abandonados.`);
        
        for (const lead of abandonedLeads) {
          let cleanPhone = lead.phone.replace(/\D/g, '');
          if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
            cleanPhone = `258${cleanPhone}`;
          }
          try {
            const res = await fetch(`${process.env.KOMUNIKA_API_URL || 'https://api.komunika.site'}/api/v1/funnels/${visitorFunnelId}/add-lead`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': systemConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY || ''
              },
              body: JSON.stringify({
                phone: cleanPhone,
                name: lead.name,
                email: lead.email,
                customFields: { 
                  origem: 'Landing Page Abandonada',
                  checkout_url: lead.checkoutUrl || '',
                  ...(lead.surveyAnswers && typeof lead.surveyAnswers === 'object' ? lead.surveyAnswers : {})
                }
              })
            });

            if (!res.ok) {
              const errBody = await res.text();
              throw new Error(`HTTP ${res.status}: ${errBody}`);
            }
            
            // Marcar como enviado o funil de visitante
            await prisma.user.update({
              where: { id: lead.id },
              data: { remarketingStage: 'visitor_sent' }
            });
            console.log(`[CRON] 🎯 Remarketing (Visitante) enviado para o lead: ${cleanPhone}`);
          } catch (e) {
            console.error(`[CRON] Falha ao enviar remarketing para ${cleanPhone}:`, e);
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

      const checkoutFunnelId = systemConfig?.komunikaCheckoutFunnelId || process.env.KOMUNIKA_FUNNEL_CHECKOUT_ID;
      const hasCheckoutApiKey = systemConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;

      if (abandonedCheckouts.length > 0 && hasCheckoutApiKey && checkoutFunnelId) {
        console.log(`[CRON] Encontrados ${abandonedCheckouts.length} checkouts pendentes.`);
        
        for (const lead of abandonedCheckouts) {
          let cleanPhone = lead.phone.replace(/\D/g, '');
          if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
            cleanPhone = `258${cleanPhone}`;
          }
          try {
            const res = await fetch(`${process.env.KOMUNIKA_API_URL || 'https://api.komunika.site'}/api/v1/funnels/${checkoutFunnelId}/add-lead`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': systemConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY || ''
              },
              body: JSON.stringify({
                phone: cleanPhone,
                name: lead.name,
                email: lead.email,
                customFields: {
                  order_id: lead.lojouOrderId || '',
                  checkout_url: lead.checkoutUrl || '',
                  ...(lead.surveyAnswers && typeof lead.surveyAnswers === 'object' ? lead.surveyAnswers : {})
                }
              })
            });

            if (!res.ok) {
              const errBody = await res.text();
              throw new Error(`HTTP ${res.status}: ${errBody}`);
            }
            
            await prisma.user.update({
              where: { id: lead.id },
              data: { remarketingStage: 'checkout_failed_sent' }
            });
            console.log(`[CRON] 🛒 Remarketing (Checkout) enviado para o lead: ${cleanPhone}`);
          } catch (e) {
            console.error(`[CRON] Falha ao enviar remarketing de checkout para ${cleanPhone}:`, e);
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
              amount: order.amount || 797,
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

          // WhatsApp alert
          if (config?.milestoneAlertPhone && config.komunikaAdminApiKey && config.komunikaInstanceId) {
            const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
            let phone = config.milestoneAlertPhone.replace(/\D/g, '');
            if (phone.length === 9 && phone.startsWith('8')) phone = `258${phone}`;

            await fetch(`${apiUrl}/api/v1/messages/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-API-Key': config.komunikaAdminApiKey },
              body: JSON.stringify({ instanceId: config.komunikaInstanceId, to: phone, type: 'text', content: `*Código Zero — Meta Alcançada*\n\nParabéns ${config.milestoneAlertName || 'Admin'}!\n\nA meta de *${label}* foi atingida!` }),
            });
            await prisma.platformMilestone.update({ where: { id: m.id }, data: { notified: true } });
            console.log(`[CRON] Milestone reached: ${m.category} ${m.targetValue}`);
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
        }).catch(() => {});
      }

      console.log(`[CRON] 💤 Inactivity reminders sent: ${inactiveUsers.length}`);
    } catch (error) {
      console.error('[CRON] ❌ Inactivity reminder failed:', error);
    }
  });

  console.log('[CRON] ⏰ Inactivity reminder scheduled (10:00 daily)');
}
