# Configure Reverse Proxy in Plesk - Step by Step

Since you're the hosting provider, here's how to configure it yourself.

## Step 1: Make Sure Both Services Are Running

### Check if they're running:

1. In Plesk, go to **"Tools & Settings"** → **"Terminal"** (or SSH Access)
2. Run these commands:

```bash
# Check if Next.js is running
curl http://localhost:3000

# Check if Express is running  
curl http://localhost:3002
```

### If they're NOT running, start them:

```bash
cd ~/httpdocs/app

# Option A: Using PM2 (recommended)
pm2 start npm --name vevago-frontend -- start
pm2 start server.js --name vevago-api
pm2 save

# Option B: Using nohup (if PM2 not available)
nohup npm start > nextjs.log 2>&1 &
nohup node server.js > server.log 2>&1 &
```

---

## Step 2: Configure Reverse Proxy in Plesk

### Method 1: Using Apache & nginx Settings (Recommended)

1. **Go to:** Websites & Domains → **vevago.app**
2. **Click:** "Apache & nginx Settings"
3. **Scroll down** to "Additional nginx directives"
4. **Add ONLY this** (don't add location /, it already exists):

```nginx
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

5. **For the frontend**, we need to modify the existing location block. Look for:
   - **"Hosting Settings"** or **"Document Root"**
   - Change it to proxy to port 3000

### Method 2: Edit nginx Config File Directly

If Method 1 doesn't work or you get duplicate location errors:

1. **Go to:** File Manager in Plesk
2. **Navigate to:** `/var/www/vhosts/system/vevago.app/conf/`
3. **Open:** `vhost_nginx.conf`
4. **Find the existing `location /` block** (should be near the top)
5. **Replace the entire `location /` block** with:

```nginx
location / {
    # Don't proxy API calls - they go to /api location
    if ($uri ~ ^/api) {
        return 404;
    }
    
    # Proxy everything else to Next.js frontend
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
```

6. **Add the API location block** after the main location block:

```nginx
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
```

7. **Save the file**
8. **Go back to Plesk** → Click "Apply" or restart web server

---

## Step 3: Test Nginx Configuration

1. In Terminal, run:
```bash
sudo nginx -t
```

2. Should show: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

3. If there are errors, fix them and test again

---

## Step 4: Restart Web Server

In Plesk:
1. Go to **"Tools & Settings"** → **"Services Management"**
2. Find **"nginx"** or **"Web Server"**
3. Click **"Restart"**

Or in Terminal:
```bash
sudo systemctl restart nginx
# or
sudo service nginx restart
```

---

## Step 5: Verify It's Working

1. **Wait 30 seconds** for services to restart
2. **Visit:** `http://vevago.app`
   - Should show your Next.js frontend (React app)
3. **Visit:** `http://vevago.app/api/`
   - Should show: `{"message":"Hello Vevago! Server is working!"}`

---

## Troubleshooting

### If you get "duplicate location /" error:

The existing location block conflicts. Use **Method 2** above to edit the file directly.

### If services aren't running:

```bash
# Check what's running
ps aux | grep node
netstat -tulpn | grep -E ':(3000|3002)'

# Start them
cd ~/httpdocs/app
pm2 start ecosystem.config.js  # if you have PM2 config
# or
npm start &
node server.js &
```

### If nginx won't restart:

```bash
# Check nginx error log
sudo tail -f /var/log/nginx/error.log

# Check configuration
sudo nginx -t
```

### If domain still shows backend:

1. Clear browser cache (Ctrl+F5)
2. Check both services are running
3. Verify nginx config was saved
4. Check nginx is actually using the new config

---

## Quick Checklist

- [ ] Both services running (port 3000 and 3002)
- [ ] Nginx config updated (location /api added)
- [ ] Existing location / modified to proxy to port 3000
- [ ] Nginx config test passes (`nginx -t`)
- [ ] Web server restarted
- [ ] Tested domain - shows frontend
- [ ] Tested /api - shows backend message

---

## Still Having Issues?

Tell me:
1. What error messages you're seeing
2. What happens when you visit `vevago.app`
3. What happens when you visit `vevago.app/api/`
4. Output of `sudo nginx -t`

I'll help you fix it!

