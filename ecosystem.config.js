// PM2 Ecosystem Configuration
// Upload this to ~/httpdocs/app/ and run: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'vevago-frontend',
      script: 'npm',
      args: 'start',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'vevago-api',
      script: 'server.js',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
}

