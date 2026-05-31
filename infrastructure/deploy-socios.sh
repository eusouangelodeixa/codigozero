#!/bin/bash
# ==========================================================================
# Código Zero — Deploy do módulo de Sócios (revenue share) — rodar NA VPS
#
#   cd /opt/codigozero && bash infrastructure/deploy-socios.sh
#
# Passos (todos idempotentes):
#   1. Backup do banco (pg_dump) — rede de segurança
#   2. Rebuild dos containers a partir do código já presente em /opt/codigozero
#   3. prisma migrate deploy  (migration ADITIVA: só cria tabelas Partner*)
#   4. Healthcheck do backend
#
# A migration não altera nem apaga dados existentes — apenas adiciona
# PartnerAccount, PartnerCommission e PartnerWithdrawal.
# ==========================================================================
set -euo pipefail

DEPLOY_DIR="/opt/codigozero"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP="/root/cz_backup_${TS}.sql"

cd "$DEPLOY_DIR/infrastructure"

echo "🛡️  [1/4] Backup do banco -> ${BACKUP}"
$COMPOSE exec -T czero_db pg_dump -U czero -d codigozero > "$BACKUP"
echo "    OK — $(du -h "$BACKUP" | cut -f1)"

echo "🔨 [2/4] Rebuild dos containers"
$COMPOSE up -d --build

echo "⏳ aguardando o banco ficar saudável..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T czero_db pg_isready -U czero -d codigozero >/dev/null 2>&1; then
    echo "    banco OK"; break
  fi
  sleep 2
done

echo "🗄️  [3/4] prisma migrate deploy"
$COMPOSE exec -T czero_backend npx prisma migrate deploy

echo "🩺 [4/4] healthcheck"
sleep 4
if curl -fsS http://localhost:4000/api/health >/dev/null 2>&1 \
   || docker exec czero_backend_prod wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; then
  echo "    backend respondendo ✅"
else
  echo "    ⚠️  /api/health não respondeu. Verifique:"
  echo "        $COMPOSE logs -n 60 czero_backend"
  echo "    Restaurar o banco se necessário:"
  echo "        cat ${BACKUP} | $COMPOSE exec -T czero_db psql -U czero -d codigozero"
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
echo ""
echo "✅ Deploy do módulo de Sócios concluído."
echo "   Agora: https://app.czero.sbs/admin/socios — adicione os 4 sócios"
echo "   (cada um recebe email+senha pelo WhatsApp). A soma das % deve dar 100%."
