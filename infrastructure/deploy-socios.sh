#!/bin/bash
# ==========================================================================
# Código Zero — Deploy seguro do módulo de Sócios (revenue share)
# Rode na VPS:  bash infrastructure/deploy-socios.sh
#
# Faz, em ordem:
#   1. Backup do banco (pg_dump) antes de qualquer coisa
#   2. git pull origin main
#   3. rebuild dos containers
#   4. prisma migrate deploy  (migration aditiva: só cria tabelas Partner*)
#   5. healthcheck do backend
#
# A migration NÃO altera/apaga dados existentes — só adiciona PartnerAccount,
# PartnerCommission e PartnerWithdrawal. O backup é uma rede de segurança.
# ==========================================================================
set -euo pipefail

REPO_DIR="/root/codigo-zero"
COMPOSE_FILE="infrastructure/docker-compose.prod.yml"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP="/root/cz_backup_${TS}.sql"

cd "$REPO_DIR"

echo "🛡️  [1/5] Backup do banco -> ${BACKUP}"
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U czero -d codigozero > "$BACKUP"
echo "    OK — $(du -h "$BACKUP" | cut -f1)"

echo "📥 [2/5] git pull origin main"
git pull origin main

echo "🔨 [3/5] rebuild dos containers"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "⏳ aguardando o banco ficar saudável..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U czero -d codigozero >/dev/null 2>&1; then
    echo "    banco OK"; break
  fi
  sleep 2
done

echo "🗄️  [4/5] prisma migrate deploy"
docker compose -f "$COMPOSE_FILE" exec -T backend npx prisma migrate deploy

echo "🩺 [5/5] healthcheck"
sleep 3
if curl -fsS http://localhost:4000/api/health >/dev/null; then
  echo "    backend respondendo ✅"
else
  echo "    ⚠️  /api/health não respondeu — verifique:  docker compose -f $COMPOSE_FILE logs -n 50 backend"
  echo "    Para restaurar o banco:  cat ${BACKUP} | docker compose -f $COMPOSE_FILE exec -T db psql -U czero -d codigozero"
  exit 1
fi

docker image prune -f >/dev/null 2>&1 || true
echo ""
echo "✅ Deploy do módulo de Sócios concluído."
echo "   Próximo passo: adicione os 4 sócios em https://app.eusouangelodeixa.com/admin/socios"
echo "   (cada um recebe email+senha pelo WhatsApp). A soma das % deve dar 100%."
