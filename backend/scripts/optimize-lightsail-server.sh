#!/usr/bin/env bash
# One-time / occasional tuning for 1 GB Lightsail SDMS host.
set -euo pipefail

APP="${HOME}/Student-Data-Management-Application"
PM2_APP="sdbms"

echo "==> PM2 logrotate (smaller footprint on 1GB RAM)"
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:workerInterval 60

echo "==> Trim PM2 logs"
pm2 flush "$PM2_APP" 2>/dev/null || pm2 flush || true

echo "==> Remove stray PM2 apps"
pm2 delete student-db-backend 2>/dev/null || true
pm2 delete pydah-backend 2>/dev/null || true

echo "==> Apply ecosystem (memory cap + nightly restart)"
cd "${APP}/backend"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 delete "$PM2_APP" 2>/dev/null || true
fi
pm2 start ecosystem.config.js --update-env
pm2 save

echo "==> Nginx gzip for static assets"
NGINX_SNIPPET="/etc/nginx/conf.d/sdms-gzip.conf"
if [ ! -f "$NGINX_SNIPPET" ]; then
  sudo tee "$NGINX_SNIPPET" >/dev/null <<'EOF'
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
EOF
  sudo nginx -t
  sudo systemctl reload nginx
  echo "Added sdms-gzip.conf"
else
  echo "gzip snippet already present"
fi

echo "==> Prune old frontend dist backups (keep last 2)"
cd "${APP}/frontend"
ls -dt dist.old.* 2>/dev/null | tail -n +3 | xargs -r rm -rf

echo "==> Done"
free -h
pm2 list
