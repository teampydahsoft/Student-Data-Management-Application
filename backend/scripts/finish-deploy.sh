#!/usr/bin/env bash
set -e
APP="${HOME}/Student-Data-Management-Application"

echo "==> Deploy frontend dist"
cd "${APP}/frontend"
if [ -d dist ]; then
  mv dist "dist.old.$(date +%Y%m%d%H%M%S)"
fi
tar -xzf /tmp/sdms-dist.tar.gz -C "${APP}/frontend"
ls -la dist/index.html
if grep -q 'crt-sso' dist/assets/index-*.js; then
  echo "OK: CRT SSO code present in frontend bundle"
else
  echo "WARN: crt-sso not found in bundle"
fi

echo "==> Backend deps + migration"
cd "${APP}/backend"
npm install --omit=dev
node scripts/updateAttendanceStatusEnum.js || true

echo "==> Restart PM2 with updated env"
pm2 restart sdbms --update-env
pm2 save

echo "==> Reload nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Health"
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:5000/health >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  echo "Health attempt $i/30 — waiting for :5000 ..."
  sleep 2
done
if [ "$HEALTH_OK" != "1" ]; then
  echo "Backend did not become healthy"
  pm2 list || true
  pm2 logs sdbms --lines 80 --nostream || true
  exit 1
fi
curl -s http://127.0.0.1:5000/health
echo
curl -sk https://127.0.0.1/api/health -H 'Host: sdms.pydah.edu.in' || true
echo
pm2 list
