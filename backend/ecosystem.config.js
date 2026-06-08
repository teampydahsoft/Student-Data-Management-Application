/**
 * PM2 config for SDMS production (1 GB Lightsail).
 * App name must match nginx + deploy workflow: sdbms
 */
module.exports = {
  apps: [
    {
      name: 'sdbms',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '380M',
      node_args: '--max-old-space-size=384',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Kolkata'
      },
      cron_restart: '0 3 * * *',
      time: true
    }
  ]
};
