import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6381';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const scraperQueue = new Queue('scraperQueue', {
  connection: redisConnection,
  // Sem isto o BullMQ guarda TODO job terminado para sempre — em 2026-08-04 o
  // Redis chegou a 4,2GB (52% da RAM da VPS) só de jobs completed/failed do
  // scraper, derrubando a performance da caixa inteira (bgsave forkava 4GB).
  // Mantém só o suficiente para debug recente e descarta o resto sozinho.
  defaultJobOptions: {
    removeOnComplete: { age: 24 * 60 * 60, count: 200 }, // 24h ou 200 últimos
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 }, // falhas: 7 dias p/ investigar
  },
});
