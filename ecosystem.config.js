// PM2 Ecosystem Configuration for PathPilo
// Run from repo root: pm2 start ecosystem.config.js
// Requires: npm install (root), npm run build (root), npm install (api-server)

const path = require('path');
const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: 'vevago-frontend',
      script: 'npm',
      args: 'start',
      cwd: root,
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: path.join(root, 'logs', 'frontend-error.log'),
      out_file: path.join(root, 'logs', 'frontend-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'vevago-api',
      script: 'server.js',
      cwd: path.join(root, 'api-server'),
      env: {
        NODE_ENV: 'production',
        API_PORT: 3003
      },
      error_file: path.join(root, 'logs', 'api-error.log'),
      out_file: path.join(root, 'logs', 'api-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};

