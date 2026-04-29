#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════════════
# Código Zero — Production Deploy Script
# VPS: 72.60.155.120 | Domain: app.eusouangelodeixa.com
# ═══════════════════════════════════════════════════════════════════════════════

echo "🚀 Código Zero — Deploy to Production"
echo "══════════════════════════════════════"

DEPLOY_DIR="/opt/codigozero"
REPO_URL="https://github.com/eusouangelodeixa/codigozero.git"

# ── 1. Clone or pull repo ──
if [ -d "$DEPLOY_DIR" ]; then
  echo "📦 Updating existing repo..."
  cd "$DEPLOY_DIR"
  git pull origin main
else
  echo "📦 Cloning repo..."
  git clone "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# ── 2. Copy production env ──
echo "🔧 Setting up production environment..."
cp infrastructure/.env.production infrastructure/.env

# ── 3. Add Código Zero nginx config to Mira's nginx ──
echo "🌐 Adding nginx config for app.eusouangelodeixa.com..."
cp infrastructure/nginx/codigozero.conf /opt/mira-funnel/nginx/conf.d/codigozero.conf

# ── 4. Build and start Código Zero containers ──
echo "🐳 Building and starting containers..."
cd infrastructure
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# ── 5. Connect Código Zero network to Mira's nginx ──
echo "🔗 Connecting czero-network to Mira nginx..."
docker network connect czero-network mira_nginx_prod 2>/dev/null || echo "  (already connected)"

# ── 6. Reload Mira nginx to pick up the new config ──
echo "🔄 Reloading nginx config (graceful, no downtime)..."
docker exec mira_nginx_prod nginx -s reload

# ── 7. Wait for backend to be healthy ──
echo "⏳ Waiting for backend to start..."
sleep 10

# ── 8. Run database seed (first deploy only) ──
echo "🌱 Seeding database..."
docker exec czero_backend_prod npx prisma db seed 2>/dev/null || echo "  (seed already applied or not needed)"

echo ""
echo "══════════════════════════════════════"
echo "✅ Deploy complete!"
echo ""
echo "⚠️  SSL Setup (run once after DNS propagates):"
echo "   certbot certonly --webroot -w /var/www/certbot -d app.eusouangelodeixa.com"
echo "   docker exec mira_nginx_prod nginx -s reload"
echo ""
echo "🔗 http://app.eusouangelodeixa.com (HTTP → will redirect to HTTPS after SSL)"
echo "══════════════════════════════════════"
