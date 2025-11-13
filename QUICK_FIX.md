# Quick Fix: Domain Showing Backend Instead of Frontend

## The Problem
Your domain `vevago.app` is showing `{"message":"Hello Vevago! Server is working!"}` which is the Express backend response, not the Next.js frontend.

## Immediate Fix: Update Nginx/Apache Configuration

### Step 1: Check if Next.js is Running

SSH into your VPS and check:
```bash
# Check if Next.js is running on port 3000
curl http://localhost:3000

# Check if Express is running on port 3002  
curl http://localhost:3002
```

If Next.js isn't running, start it:
```bash
cd ~/httpdocs/app
npm start  # This runs Next.js on port 3000
# Or if using PM2:
pm2 start npm --name vevago-frontend -- start
```

### Step 2: Update Reverse Proxy Configuration

Your reverse proxy needs to route:
- **Root (`/`)** → `http://localhost:3000` (Next.js frontend)
- **API (`/api`)** → `http://localhost:3002` (Express backend)

#### For Nginx:

Edit your Nginx config (usually `/etc/nginx/sites-available/vevago.app`):
```nginx
server {
    listen 80;
    server_name vevago.app www.vevago.app;

    # Frontend - Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then reload:
```bash
sudo nginx -t  # Test config
sudo systemctl reload nginx  # Reload
```

#### For Apache (if using):

Edit your Apache config and add:
```apache
<VirtualHost *:80>
    ServerName vevago.app
    
    # Frontend
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    # Backend API
    ProxyPass /api http://localhost:3002/api
    ProxyPassReverse /api http://localhost:3002/api
</VirtualHost>
```

Then restart:
```bash
sudo systemctl restart apache2
```

### Step 3: Update Frontend API Calls (Optional but Recommended)

Currently, your frontend code uses `http://localhost:3002` which won't work in production. 

**Quick fix:** Update your `.env` file on the VPS to set:
```
NEXT_PUBLIC_API_URL=
```

This will make the frontend use relative paths (`/api/...`) which work with the reverse proxy.

**Better fix:** I've created `app/utils/api.ts` - you can gradually update your code to use `apiUrl()` helper function instead of hardcoded URLs.

## Verify It's Working

After updating the reverse proxy:
1. Visit `http://vevago.app` - should show the Next.js frontend
2. Visit `http://vevago.app/api/` - should show the backend message

## If Still Not Working

Check logs:
```bash
# Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check what's running
pm2 list  # if using PM2
netstat -tulpn | grep -E ':(3000|3002)'
```

