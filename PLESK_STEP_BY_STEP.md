# Plesk Step-by-Step Fix Guide

## What Happened?

Your domain `vevago.app` is currently pointing directly to your Express backend server (port 3002), which is why you see:
```json
{"message":"Hello Vevago! Server is working!"}
```

This is the backend's test message. Your domain should show your Next.js frontend (the React app) instead.

## The Solution

We need to configure Plesk to route:
- **Your domain (`/`)** → Next.js frontend (port 3000) 
- **API calls (`/api`)** → Express backend (port 3002)

This is called a "reverse proxy" - Plesk will act as a middleman and send requests to the right place.

---

## Step-by-Step Instructions

### STEP 1: Log into Plesk

1. Go to your Plesk login page (usually `https://your-server-ip:8443`)
2. Log in with your credentials

### STEP 2: Find Your Domain Settings

1. In the left sidebar, click **"Websites & Domains"**
2. Find and click on **"vevago.app"** (or your domain name)
3. You should see various options for your domain

### STEP 3: Open Apache & nginx Settings

1. Look for a section called **"Apache & nginx Settings"** 
   - It might be in the main domain page
   - Or under "Hosting Settings"
   - Or in a tab/section menu
2. Click on **"Apache & nginx Settings"**

### STEP 4: Add Reverse Proxy Configuration

1. Scroll down to find **"Additional nginx directives"** or **"Additional directives for httpd"**
   - This is usually at the bottom of the page
   - It's a text box where you can add custom configuration

2. **Copy and paste this configuration** into that text box:

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

3. Click **"OK"** or **"Apply"** to save

### STEP 5: Restart Web Server

1. After saving, Plesk should automatically restart the web server
2. If not, look for a **"Restart"** or **"Apply Changes"** button
3. Wait about 30 seconds for the changes to take effect

### STEP 6: Make Sure Your Services Are Running

Before the reverse proxy will work, both services need to be running:

#### Check if they're running:

1. In Plesk, look for **"Terminal"** or **"SSH Access"** in the left sidebar
2. Click it to open a terminal
3. Run these commands:

```bash
# Check if Next.js is running (should show something)
curl http://localhost:3000

# Check if Express is running (should show the JSON message)
curl http://localhost:3002
```

#### If they're NOT running, start them:

1. In the terminal, navigate to your app:
```bash
cd ~/httpdocs/app
```

2. Check if you have PM2 installed:
```bash
pm2 --version
```

3. **If PM2 is installed**, start services:
```bash
pm2 start npm --name vevago-frontend -- start
pm2 start server.js --name vevago-api
pm2 save
```

4. **If PM2 is NOT installed**, start manually:
```bash
# Start Next.js (runs in background)
nohup npm start > nextjs.log 2>&1 &

# Start Express (runs in background)
nohup node server.js > server.log 2>&1 &
```

### STEP 7: Test Your Domain

1. Open a new browser tab
2. Go to: `http://vevago.app`
3. **You should now see your React app** (not the JSON message!)

4. Test the API: `http://vevago.app/api/`
   - Should show: `{"message":"Hello Vevago! Server is working!"}`

---

## Troubleshooting

### If you can't find "Apache & nginx Settings":

1. Look for **"Hosting Settings"** or **"Web Server Settings"**
2. The option might be under a different name like:
   - "Additional nginx directives"
   - "Custom nginx configuration"
   - "Web server configuration"

### If the services won't start:

1. Check Node.js is installed:
```bash
node --version
npm --version
```

2. Check if ports are already in use:
```bash
netstat -tulpn | grep -E ':(3000|3002)'
```

3. Check the logs:
```bash
cd ~/httpdocs/app
cat nextjs.log
cat server.log
```

### If you see errors in Plesk:

- Make sure you copied the nginx configuration exactly
- Check for typos
- Make sure both services are running on ports 3000 and 3002

### If it still shows the backend message:

1. Clear your browser cache (Ctrl+F5)
2. Wait a few minutes for DNS/proxy to update
3. Check if both services are actually running
4. Verify the nginx configuration was saved correctly

---

## Visual Guide (What to Look For)

In Plesk, you're looking for something like this:

```
Websites & Domains
  └── vevago.app
      ├── Hosting Settings
      ├── Apache & nginx Settings  ← CLICK HERE
      │   └── Additional nginx directives  ← PASTE CONFIG HERE
      ├── SSL/TLS Settings
      └── ...
```

---

## Still Confused?

If you're still having trouble:

1. **Take a screenshot** of your Plesk domain settings page
2. **Tell me what options you see** - I can guide you to the right place
3. **Check if you have terminal/SSH access** in Plesk - we can verify services are running

The key is finding where to add the nginx configuration. Once that's done and services are running, it should work!

