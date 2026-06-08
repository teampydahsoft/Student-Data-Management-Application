#!/usr/bin/env bash
set -euo pipefail

APP="${HOME}/Student-Data-Management-Application"
ENV_FILE="${APP}/backend/.env"

echo "==> Backup .env"
cp "${ENV_FILE}" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"

echo "==> Patch production env"
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "${ENV_FILE}"
sed -i 's/^JWT_EXPIRES_I7d/JWT_EXPIRES_IN=24h/' "${ENV_FILE}"
grep -q '^JWT_EXPIRES_IN=' "${ENV_FILE}" || echo 'JWT_EXPIRES_IN=24h' >> "${ENV_FILE}"

if ! grep -q 'https://sdms.pydah.edu.in' "${ENV_FILE}"; then
  sed -i 's|^FRONTEND_URL=\(.*\)|FRONTEND_URL=\1,https://sdms.pydah.edu.in|' "${ENV_FILE}"
fi

grep -q '^CRT_APP_URL=' "${ENV_FILE}" || echo 'CRT_APP_URL=https://crt.pydahsoft.in' >> "${ENV_FILE}"
grep -q '^CRT_SSO_TOKEN_EXPIRES_IN=' "${ENV_FILE}" || echo 'CRT_SSO_TOKEN_EXPIRES_IN=15m' >> "${ENV_FILE}"

echo "==> Pull latest code"
cd "${APP}"
git fetch origin master
git reset --hard origin/master

echo "==> Backend dependencies"
cd "${APP}/backend"
npm install --omit=dev

echo "==> Attendance pending migration (if needed)"
node scripts/updateAttendanceStatusEnum.js || true

echo "==> Frontend build"
cd "${APP}/frontend"
export NODE_OPTIONS='--max-old-space-size=460'
npm install
npm run build

echo "==> Restart PM2"
pm2 restart sdbms
pm2 save

echo "==> Reload nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Health checks"
sleep 2
curl -s http://127.0.0.1:5000/health
echo
curl -sk -o /dev/null -w 'nginx_https:%{http_code}\n' https://127.0.0.1/ -H 'Host: sdms.pydah.edu.in'
curl -sk -o /dev/null -w 'api_health:%{http_code}\n' https://127.0.0.1/api/health -H 'Host: sdms.pydah.edu.in'
pm2 list
