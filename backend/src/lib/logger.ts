import pino from 'pino';

// Structured logger.
// - dev (NODE_ENV !== 'production'): human-friendly, colorized output via pino-pretty.
// - prod: line-delimited JSON to stdout (cheap to ship to log aggregators).
// Read NODE_ENV directly from process.env (config/env.ts is owned elsewhere).
const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  // Pretty transport only outside production. In prod we emit raw JSON so
  // there's no extra dependency in the hot path.
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});

export default logger;
