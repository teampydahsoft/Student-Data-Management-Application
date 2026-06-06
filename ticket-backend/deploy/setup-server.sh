#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/ticket-app}"
TICKET_PUBLIC_URL="${TICKET_PUBLIC_URL:-https://maintenance.pydah.edu.in}"
MAIN_APP_URL="${MAIN_APP_URL:-https://pydahgroup.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Ensuring app directory exists: $APP_ROOT"
sudo mkdir -p "$APP_ROOT"

echo "==> Installing nginx config"
sudo cp "$SCRIPT_DIR/nginx-ticket-fullstack.conf" /etc/nginx/conf.d/ticket.conf

for backend_dir in \
  /home/ec2-user/Student-Data-Management-Application/ticket-backend \
  /var/www/ticket-backend \
  /home/ubuntu/ticket-backend; do
  if [ -f "$backend_dir/.env" ]; then
    echo "==> Updating CORS in $backend_dir/.env"
    cors="$MAIN_APP_URL,$TICKET_PUBLIC_URL,http://43.201.200.99"
    if grep -q '^CORS_ORIGINS=' "$backend_dir/.env"; then
      sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$cors|" "$backend_dir/.env"
    else
      echo "CORS_ORIGINS=$cors" >> "$backend_dir/.env"
    fi
    break
  fi
done

echo "==> Testing nginx configuration"
sudo nginx -t

echo "==> Reloading nginx"
sudo systemctl reload nginx

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe sdbms-ticket >/dev/null 2>&1; then
    echo "==> Restarting sdbms-ticket via pm2"
    pm2 restart sdbms-ticket
  elif pm2 describe ticket-backend >/dev/null 2>&1; then
    echo "==> Restarting ticket-backend via pm2"
    pm2 restart ticket-backend
  fi
fi

echo "==> Deployment complete"
curl -fsS "http://127.0.0.1/health" && echo ""
curl -fsS "http://127.0.0.1/" -o /dev/null -w "frontend_status=%{http_code}\n"
