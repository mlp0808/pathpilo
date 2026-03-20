// PM2 Ecosystem Configuration for PathPilo
// Run from repo root: pm2 start ecosystem.config.js

const path = require("path");
const root = path.resolve(__dirname);

module.exports = {
  apps: [
    {
      name: "pathpilo-frontend",
      script: "npm",
      args: "start",
      cwd: root,
      env: {
        NODE_ENV: "production",
        PORT: 3005
      },
      error_file: path.join(root, "logs", "frontend-error.log"),
      out_file: path.join(root, "logs", "frontend-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    },
    {
      name: "pathpilo-api",
      script: "server.js",
      cwd: path.join(root, "api-server"),
      env: {
        NODE_ENV: "production",
        API_PORT: 3005
      },
      error_file: path.join(root, "logs", "api-error.log"),
      out_file: path.join(root, "logs", "api-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    },
    {
      name: "pathpilo-marketing",
      script: "npm",
      args: "run start -- -p 3004",
      cwd: path.join(root, "marketing"),
      env: {
        NODE_ENV: "production",
        PORT: 3004
      },
      error_file: path.join(root, "logs", "marketing-error.log"),
      out_file: path.join(root, "logs", "marketing-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    }
  ]
};
