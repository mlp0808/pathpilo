# Deployment (Production) - Vevago

## Prerequisites
- SSH access to your VPS
- Node.js and npm installed on the VPS
- Git installed on the VPS
- PostgreSQL database configured

## Deployment Steps

### 1. SSH into your VPS
```bash
ssh your-username@your-vps-ip
```

### 2. Navigate to your application directory
```bash
cd ~/httpdocs/app
# or if it's in a different location:
# cd /path/to/your/httpdocs/app
```

### 3. Pull latest changes from GitHub
```bash
git pull origin main
```

### 4. Install/Update dependencies
```bash
npm install
```

### 5. Build the Next.js application
```bash
npm run build
```

### 6. Set up environment variables
Make sure you have a `.env` file (or `.env.production`) with at least:
```
DATABASE_URL=your_database_connection_string
JWT_SECRET=your_jwt_secret
NODE_ENV=production
# Express API port (Next.js is separate)
PORT=3003
# Add any other environment variables your app needs
```

### 7. Start the application

You have two options:

#### Option A: Using PM2 (Recommended for production)

Install PM2 globally (if not already installed):
```bash
npm install -g pm2
```

Use the included `ecosystem.config.js` (recommended):

```bash
pm2 start ecosystem.config.js
```

Save PM2 configuration:
```bash
pm2 save
pm2 startup  # Follow the instructions to set up auto-start on reboot
```

#### Option B: Using nohup (Simple but less robust)
```bash
# Start backend server
nohup node server.js > server.log 2>&1 &

# Start Next.js frontend (in a separate terminal or screen session)
nohup npm start > nextjs.log 2>&1 &
```

### 8. Configure Reverse Proxy (if using Nginx/Apache)

If your VPS uses Nginx, configure it to proxy requests:

**Nginx configuration example:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API (Express)
    location /api {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 9. Verify the deployment

Check if processes are running:
```bash
# If using PM2:
pm2 list
pm2 logs

# If using nohup:
ps aux | grep node
```

Test the application:
- Visit your domain in a browser
- Check API endpoints: `http://your-domain.com/api/`

## Updating the Application

When you push new changes to GitHub:

1. SSH into VPS
2. Navigate to app directory: `cd ~/httpdocs/app`
3. Pull changes: `git pull origin main`
4. Install dependencies: `npm install`
5. Rebuild: `npm run build`
6. Restart services:
   ```bash
   # If using PM2:
   pm2 restart vevago-api
   pm2 restart vevago-frontend
   
   # If using nohup, kill old processes and restart
   ```

## Troubleshooting

### Check if ports are in use:
```bash
netstat -tulpn | grep :3002  # Next.js frontend
netstat -tulpn | grep :3003  # Express backend
```

### Check logs:
```bash
# PM2 logs
pm2 logs vevago-api
pm2 logs vevago-frontend

# Or check log files if using nohup
tail -f server.log
tail -f nextjs.log
```

### Check Node.js version:
```bash
node --version
npm --version
```

Make sure you're using Node.js 18+ for Next.js 15.

## Important Notes

- **Never commit `.env` files** - they contain sensitive information
- **Build artifacts** (`.next/` folder) are generated on the server, don't commit them
- **Database migrations** - Make sure your database schema is up to date
- **SSL/HTTPS** - Set up SSL certificates (Let's Encrypt) for production


