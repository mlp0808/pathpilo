# Fix Domain Routing Using File Manager

Since you're using a file manager (not SSH), here's how to fix the issue where your domain shows the backend instead of the frontend.

## Understanding the Problem

Your domain `vevago.app` is currently pointing to:
- Express backend (port 3002) → Shows: `{"message":"Hello Vevago! Server is working!"}`

It should point to:
- Next.js frontend (port 3000) → Should show your React app
- `/api` routes → Express backend (port 3002)

## Step 1: Check Your Control Panel Type

You're likely using one of these:
- **Plesk** - Most common for VPS with httpdocs
- **cPanel** - Alternative control panel
- **Direct Nginx/Apache** - If you have direct file access

## Step 2: Access Reverse Proxy Configuration

### If Using Plesk:

1. Log into Plesk control panel
2. Go to **Domains** → Select `vevago.app`
3. Look for **"Apache & nginx Settings"** or **"Web Server Settings"**
4. Find the **"Additional nginx directives"** or **"Additional directives for httpd"** section
5. Add the configuration below

### If Using cPanel:

1. Log into cPanel
2. Look for **"Apache Configuration"** or **"Nginx Configuration"**
3. Or go to **"File Manager"** → Navigate to `/etc/nginx/` or `/etc/apache2/`

### If Using Direct File Access:

Navigate to your web server config directory:
- Nginx: Usually in `/etc/nginx/sites-available/` or `/etc/nginx/conf.d/`
- Apache: Usually in `/etc/apache2/sites-available/`

## Step 3: Add/Update Configuration

### For Nginx (Most Common):

Add this configuration to your domain's nginx settings:

```nginx
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
}
```

### For Apache:

Add this to your Apache configuration:

```apache
# Frontend
ProxyPass / http://localhost:3000/
ProxyPassReverse / http://localhost:3000/

# Backend API
ProxyPass /api http://localhost:3002/api
ProxyPassReverse /api http://localhost:3002/api
```

## Step 4: Check if Services Are Running

### Through File Manager:

1. Navigate to your app directory: `~/httpdocs/app`
2. Check if there's a `package.json` file
3. Look for process management files:
   - `ecosystem.config.js` (PM2 config)
   - `.pm2/` folder
   - Any startup scripts

### Check Running Processes (if you have terminal access in control panel):

Many control panels have a "Terminal" or "SSH Terminal" feature. If available:

```bash
# Check if Next.js is running
curl http://localhost:3000

# Check if Express is running
curl http://localhost:3002

# Check what's listening on ports
netstat -tulpn | grep -E ':(3000|3002)'
```

## Step 5: Start Services (If Not Running)

### Option A: Using PM2 (Recommended)

If PM2 is installed, create a file `ecosystem.config.js` in your `~/httpdocs/app` directory:

```javascript
module.exports = {
  apps: [
    {
      name: 'vevago-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/path/to/httpdocs/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'vevago-api',
      script: 'server.js',
      cwd: '/path/to/httpdocs/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    }
  ]
}
```

Then start with: `pm2 start ecosystem.config.js`

### Option B: Create Startup Script

Create a file `start.sh` in your app directory:

```bash
#!/bin/bash
cd ~/httpdocs/app
npm start > nextjs.log 2>&1 &
node server.js > server.log 2>&1 &
```

Make it executable and run it.

## Step 6: Verify Configuration

After updating the reverse proxy:

1. **Save the configuration** in your control panel
2. **Restart the web server** (usually a button in the control panel)
3. **Wait 30 seconds** for services to restart
4. **Visit your domain**: `http://vevago.app`
   - Should show your Next.js frontend (not the JSON message)
5. **Test API**: `http://vevago.app/api/`
   - Should show the backend message

## Troubleshooting

### If you can't find reverse proxy settings:

1. **Check Plesk**: Look for "Apache & nginx Settings" → "Additional directives"
2. **Check cPanel**: Look for "Apache Configuration" or "Nginx Configuration"
3. **Contact your hosting provider** - They may need to configure it for you

### If services aren't running:

1. **Check Node.js is installed**: Look for `node` command in terminal
2. **Check if ports are available**: Ports 3000 and 3002 should be free
3. **Check logs**: Look for `server.log` or `nextjs.log` files in your app directory

### If you need to install PM2:

Through terminal in control panel:
```bash
npm install -g pm2
pm2 startup  # Follow instructions
pm2 save
```

## Alternative: Contact Your Hosting Provider

If you can't access these settings, contact your hosting provider and ask them to:

1. Configure reverse proxy for `vevago.app`:
   - Route `/` to `http://localhost:3000`
   - Route `/api` to `http://localhost:3002`

2. Ensure both Node.js services are running:
   - Next.js on port 3000
   - Express on port 3002

3. Set up process management (PM2) to keep services running

## Quick Test

After configuration, test these URLs:
- `http://vevago.app` → Should show your React app
- `http://vevago.app/api/` → Should show `{"message":"Hello Vevago! Server is working!"}`

If both work, you're all set! 🎉

