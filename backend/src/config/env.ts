import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'codigo-zero-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  LOJOU_API_KEY: process.env.LOJOU_API_KEY || '',
  LOJOU_API_URL: process.env.LOJOU_API_URL || 'https://api.lojou.app',
  LOJOU_WEBHOOK_SECRET: process.env.LOJOU_WEBHOOK_SECRET || '',
  LOJOU_PLAN_ID: process.env.LOJOU_PLAN_ID || 'tbo8f',
  LOJOU_PRODUCT_PID: process.env.LOJOU_PRODUCT_PID || 'uoEHz',
  // Numeric product id from Lojou — used to scope coupons via discount.product_ids.
  // Left empty by default so coupons created in admin are unrestricted.
  LOJOU_PRODUCT_ID: process.env.LOJOU_PRODUCT_ID || '',
  // Close Friends order bump product — when this pid is detected in a webhook
  // payload alongside the main product, the buyer gets +2 months (3 total) and
  // the closeFriends flag set on their account.
  LOJOU_CLOSE_FRIENDS_PID: process.env.LOJOU_CLOSE_FRIENDS_PID || 'JQQWc',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  MAX_DAILY_SEARCHES: parseInt(process.env.MAX_DAILY_SEARCHES || '10', 10),
  KOMUNIKA_API_URL: process.env.KOMUNIKA_API_URL || 'https://api.komunika.site',
  KOMUNIKA_ADMIN_API_KEY: process.env.KOMUNIKA_ADMIN_API_KEY || '',
  KOMUNIKA_FUNNEL_VISITOR_ID: process.env.KOMUNIKA_FUNNEL_VISITOR_ID || '', // Funil de Visitantes Puros
  KOMUNIKA_FUNNEL_CHECKOUT_ID: process.env.KOMUNIKA_FUNNEL_CHECKOUT_ID || '', // Funil de Carrinho Abandonado
};
