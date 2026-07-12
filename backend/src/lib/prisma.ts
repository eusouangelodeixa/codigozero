import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient singleton compartilhado por TODO o processo.
 *
 * Antes cada arquivo instanciava seu próprio `new PrismaClient()` (43 no total),
 * e cada instância abre seu próprio pool de conexões — o que podia esgotar o
 * `max_connections` do Postgres sob carga (webhook + cron + tráfego). Aqui há UMA
 * instância, guardada em `globalThis.__czPrisma` para sobreviver ao hot-reload
 * do ts-node-dev em desenvolvimento.
 *
 * Código NOVO deve importar `{ prisma }` deste módulo. Os arquivos legados usam
 * `(((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient)`, que aponta para a
 * MESMA instância (mesma chave global).
 */
export const prisma: PrismaClient =
  (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);
