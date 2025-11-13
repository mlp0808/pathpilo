# Nginx Reverse Proxy Configuration for Vevago

## Problem
Your domain `vevago.app` is currently pointing to the Express backend (port 3002) instead of the Next.js frontend (port 3000).

## Solution
Configure Nginx to route:
- **Root domain (`/`)** → Next.js frontend (port 3000)
- **API routes (`/api`)** → Express backend (port 3002)

## Nginx Configuration

Add or update your Nginx configuration file (usually in `/etc/nginx/sites-available/vevago.app` or similar):

```nginx
server {
    listen 80;
    server_name vevago.app www.vevago.app;

    # Increase body size for file uploads if needed
    client_max_body_size 10M;

    # Frontend - Next.js (port 3000)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Backend API - Express (port 3002)
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Optional: Serve static files directly (if needed)
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
```

## Steps to Apply Configuration

### 1. SSH into your VPS
```bash
ssh your-username@your-vps-ip
```

### 2. Create or edit the Nginx config file
```bash
sudo nano /etc/nginx/sites-available/vevago.app
# or
sudo nano /etc/nginx/conf.d/vevago.app.conf
```

### 3. Paste the configuration above

### 4. Enable the site (if using sites-available)
```bash
sudo ln -s /etc/nginx/sites-available/vevago.app /etc/nginx/sites-enabled/
```

### 5. Test Nginx configuration
```bash
sudo nginx -t
```

### 6. Reload Nginx
```bash
sudo systemctl reload nginx
# or
sudo service nginx reload
```

## Verify Services Are Running

Before applying the config, make sure both services are running:

```bash
# Check if Next.js is running on port 3000
curl http://localhost:3000

# Check if Express backend is running on port 3002
curl http://localhost:3002
```

If they're not running, start them:

```bash
# If using PM2
pm2 start npm --name vevago-frontend -- start
pm2 start server.js --name vevago-api

# Or manually
cd ~/httpdocs/app
npm start &  # Runs Next.js on port 3000
node server.js &  # Runs Express on port 3002
```

## Troubleshooting

### Check what's running on each port:
```bash
sudo netstat -tulpn | grep :3000  # Should show Next.js
sudo netstat -tulpn | grep :3002  # Should show Express
```

### Check Nginx error logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

### Check if Nginx is running:
```bash
sudo systemctl status nginx
```

### Restart Nginx if needed:
```bash
sudo systemctl restart nginx
```

## For Apache Users

If you're using Apache instead of Nginx, you'll need to configure it differently. Let me know and I can provide Apache configuration.

