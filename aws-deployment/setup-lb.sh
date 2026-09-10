#!/bin/bash
# EC2 Load Balancer Setup
# Run once on a fresh Ubuntu t3.medium after launch.
# Before running: edit the two variables below.

set -e

# ── CONFIGURE THESE BEFORE RUNNING ───────────────────────────────────────────
EC2_DOMAIN="YOUR_EC2_DOMAIN"          # e.g. ec2.cerbyl.com or api.cerbyl.com
GITHUB_REPO="https://github.com/AdityaLanka04/L1"
GITHUB_BRANCH="main"
APP_DIR="/home/ubuntu/brainwave"
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

[ "$EC2_DOMAIN" = "YOUR_EC2_DOMAIN" ]       && fail "Set EC2_DOMAIN before running"

echo "=== Brainwave EC2 Load Balancer Setup ==="
echo "Domain: $EC2_DOMAIN"
echo ""

# ── System deps ──────────────────────────────────────────────────────────────
ok "Updating packages..."
sudo apt-get update -qq

ok "Installing Nginx, Certbot, Git, Docker..."
sudo apt-get install -y -qq nginx certbot python3-certbot-nginx git

if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker ubuntu
    ok "Docker installed (re-login or use 'newgrp docker' if docker commands fail)"
fi

if ! command -v docker-compose &>/dev/null; then
    sudo curl -sL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    ok "Docker Compose installed"
fi

# ── Repo ─────────────────────────────────────────────────────────────────────
if [ -d "$APP_DIR" ]; then
    ok "Pulling latest changes..."
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" reset --hard "origin/$GITHUB_BRANCH"
else
    ok "Cloning repo..."
    git clone -b "$GITHUB_BRANCH" "$GITHUB_REPO" "$APP_DIR"
fi

cd "$APP_DIR"

[ -f "backend/.env.production" ] || fail "Missing backend/.env.production"

# ── Certbot / Let's Encrypt ───────────────────────────────────────────────────
# Temporarily allow port 80 through Nginx for ACME challenge
sudo mkdir -p /var/www/certbot

# Minimal HTTP-only Nginx config just for cert issuance
sudo tee /etc/nginx/sites-available/certbot-temp > /dev/null <<EOF
server {
    listen 80;
    server_name $EC2_DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/certbot-temp /etc/nginx/sites-enabled/certbot-temp
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

ok "Obtaining SSL certificate for $EC2_DOMAIN..."
sudo certbot certonly --webroot -w /var/www/certbot -d "$EC2_DOMAIN" \
    --non-interactive --agree-tos --email admin@cerbyl.com

# ── Nginx LB config ───────────────────────────────────────────────────────────
ok "Installing load balancer Nginx config..."
sudo cp "$APP_DIR/aws-deployment/nginx.lb.conf" /etc/nginx/nginx.conf

# Substitute placeholders
sudo sed -i "s|EC2_DOMAIN|$EC2_DOMAIN|g" /etc/nginx/nginx.conf

# Remove the temp certbot site
sudo rm -f /etc/nginx/sites-enabled/certbot-temp /etc/nginx/sites-available/certbot-temp

sudo nginx -t || fail "Nginx config test failed — check /etc/nginx/nginx.conf"
sudo systemctl reload nginx
ok "Nginx load balancer active"

# ── Docker containers (backend + frontend) ────────────────────────────────────
ok "Building and starting Docker containers..."
docker-compose -f "$APP_DIR/aws-deployment/docker-compose.lb.yml" build --no-cache
docker-compose -f "$APP_DIR/aws-deployment/docker-compose.lb.yml" up -d

# Wait for backend health
ok "Waiting for backend to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
        ok "Backend healthy"
        break
    fi
    echo "  ($i/30) waiting..."
    sleep 4
done

# ── Certbot auto-renew ────────────────────────────────────────────────────────
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && nginx -s reload") | crontab -
ok "Certbot auto-renew cron set (3am daily)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Setup complete ==="
echo ""
echo "Load balancer: https://$EC2_DOMAIN"
echo "  100% → EC2 local backend  (http://127.0.0.1:8000)"
echo "  100% → EC2 local frontend (http://127.0.0.1:3000)"
echo ""
echo "Useful commands:"
echo "  Logs:    docker-compose -f $APP_DIR/aws-deployment/docker-compose.lb.yml logs -f"
echo "  Restart: docker-compose -f $APP_DIR/aws-deployment/docker-compose.lb.yml restart"
echo "  Nginx:   sudo nginx -t && sudo systemctl reload nginx"
echo ""
warn "DNS: point $EC2_DOMAIN to this EC2 instance's public IP"
