import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6381';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const scraperQueue = new Queue('scraperQueue', {
  connection: redisConnection,
});
