/**
 * Entrada do worker do Radar como PROCESSO PRÓPRIO.
 *
 * Por padrão o worker sobe dentro da API (server.ts) — comportamento
 * histórico. Para separá-lo (recomendado quando o Radar pesa):
 *   1. API com DISABLE_SCRAPER_WORKER=1;
 *   2. um serviço extra no compose com a MESMA imagem do backend e
 *      `command: node dist/workers/standalone.js` (precisa do mesmo bloco de
 *      environment — DATABASE_URL, REDIS_URL — e do Chromium já presente na
 *      imagem).
 * O BullMQ mantém o event loop vivo; nada mais é necessário aqui.
 */
import './scraper.worker';

console.log('[WORKER] 🛰️ Radar worker em processo próprio — aguardando jobs');

process.on('SIGTERM', () => {
  console.log('[WORKER] SIGTERM — encerrando');
  process.exit(0);
});
