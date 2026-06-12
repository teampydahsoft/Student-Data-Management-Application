#!/usr/bin/env bash
# Server-side helper: sync ticket-backend .env for maintenance hosting.
# Usage (on Lightsail):
#   HRMS_MONGO_URL='mongodb+srv://...' ./fix-server-env.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/ec2-user/Student-Data-Management-Application/ticket-backend/.env}"
MAIN_APP_URL="${MAIN_APP_URL:-https://sdms.pydah.edu.in}"
TICKET_PUBLIC_URL="${TICKET_PUBLIC_URL:-https://maintenance.pydah.edu.in}"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — create from ticket-backend/.env.example first."
  exit 1
fi

if [ -n "${HRMS_MONGO_URL:-}" ]; then
  upsert_env "HRMS_MONGO_URL" "$HRMS_MONGO_URL"
else
  echo "==> HRMS_MONGO_URL not set — skip (required for staff unified login)"
fi

upsert_env "TICKET_APP_URL" "$TICKET_PUBLIC_URL"
upsert_env "HRMS_PORTAL_URL" "${HRMS_PORTAL_URL:-https://hrms.pydah.edu.in}"
upsert_env "HRMS_SSO_CALLBACK_PATH" "${HRMS_SSO_CALLBACK_PATH:-/auth-callback}"
upsert_env "HRMS_RETURN_REDIRECT_PATH" "${HRMS_RETURN_REDIRECT_PATH:-/dashboard}"
upsert_env "CORS_ORIGINS" "$MAIN_APP_URL,$TICKET_PUBLIC_URL,http://43.201.200.99"

echo "==> Updated env keys:"
grep -E '^(HRMS_MONGO_URL|TICKET_APP_URL|CORS_ORIGINS|JWT_SECRET|DB_HOST)=' "$ENV_FILE" | sed 's/JWT_SECRET=.*/JWT_SECRET=***/;s/HRMS_MONGO_URL=.*/HRMS_MONGO_URL=***/'

cd "$(dirname "$ENV_FILE")"
node <<'NODE'
require('dotenv').config();
const { masterPool } = require('./config/database');
const { getHRMSConnection } = require('./config/mongoConfig');

(async () => {
  const [rows] = await masterPool.query("SELECT id, username, role, is_active FROM rbac_users WHERE username = 'teja' LIMIT 1");
  console.log('teja_rbac:', rows[0] || 'not found');
  const hrms = getHRMSConnection();
  console.log('hrms_connection:', hrms ? 'ok' : 'missing');
  process.exit(0);
})().catch((e) => {
  console.error('check_failed:', e.message);
  process.exit(1);
});
NODE

pm2 restart sdbms-ticket --update-env
pm2 save
echo "==> Restarted sdbms-ticket"
