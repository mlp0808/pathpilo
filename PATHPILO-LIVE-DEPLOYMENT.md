# PathPilo – Live Deployment Guide (Hetzner + CloudPanel)

This guide is tailored for your setup: **pathpilo.com** (marketing), **app.pathpilo.com** (platform + API), Hetzner server, CloudPanel, SSL already configured.

---

## Overview

| Domain | What runs there | Port | Technology |
|--------|-----------------|------|------------|
| **pathpilo.com** | Marketing site (Home, Features, Pricing, etc.) | 3004 | Next.js (marketing/) |
| **app.pathpilo.com** | SaaS platform + API (proxied at `/api`) | 3005 + 3003 | Next.js (app/) + Express (api-server/) |
| **Mobile app** | Uses the API at `https://app.pathpilo.com/api` | — | React Native (deploys to App Store / Play Store) |

---

## Part 1: Push all changes to Git (on your PC)

From PowerShell in the project folder:

```powershell
cd "C:\Users\kylli\Desktop\CODE EXPORT\Vevago\Vevago"
git add .
git status
git commit -m "PathPilo: deployment-ready – app, API, marketing, deploy script"
git push origin main
```

Your remote is already `https://github.com/mlp0808/pathpilo.git`. After this, the server can pull the latest code.

---

## Part 2: First-time server setup (one-time only)

SSH into your Hetzner server (e.g. `ssh root@your-server-ip` or `ssh your-user@your-server-ip`).

### 2.1 Install Node.js 20, Git, PM2, PostgreSQL (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
sudo npm install -g pm2
sudo apt-get install -y postgresql postgresql-contrib
```

### 2.2 Create PostgreSQL database and user

```bash
sudo -u postgres psql
```

In the psql prompt:

```sql
CREATE USER pathpilo WITH PASSWORD 'your_secure_password';
CREATE DATABASE pathpilo_prod OWNER pathpilo;
\q
```

### 2.3 Clone the repo

CloudPanel typically uses `/home/youruser/htdocs/` or similar. Use a path that makes sense, e.g.:

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/mlp0808/pathpilo.git
sudo chown -R $USER:$USER pathpilo
cd pathpilo
```

### 2.4 Create environment files (never commit these)

```bash
cp env.example .env
cp api-server/env.example api-server/.env
nano .env
```

**Root `.env`** – set at minimum:

```
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pathpilo_prod
DB_USER=pathpilo
DB_PASSWORD=your_secure_password
JWT_SECRET=your_long_random_secret_here
FRONTEND_URL=https://app.pathpilo.com
RESEND_API_KEY=re_xxx   # optional, for emails
```

**`api-server/.env`** – same database values, plus:

```
NODE_ENV=production
API_PORT=3003
FRONTEND_URL=https://app.pathpilo.com
ALLOWED_ORIGINS=https://app.pathpilo.com
JWT_SECRET=your_long_random_secret_here
```

For production, leave `NEXT_PUBLIC_API_URL` **empty** in root `.env` so the app uses relative `/api` (proxied by Nginx).

### 2.5 Install, build, and run setup

```bash
npm install
npm run build
cd api-server && npm install && cd ..
cd marketing && npm install && npm run build && cd ..
mkdir -p logs
node setup-database.js   # creates tables, seeds if needed
chmod +x scripts/deploy.sh
```

### 2.6 Start everything with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the command it prints to start on reboot
pm2 status
```

You should see: `vevago-frontend` (3005), `vevago-api` (3003), `pathpilo-marketing` (3004).

---

## Part 3: CloudPanel / Nginx configuration

CloudPanel uses Nginx. You need two sites (or subdomains):

### Site 1: pathpilo.com → Marketing (port 3004)

In CloudPanel, create or edit the site for **pathpilo.com**. The Nginx config should proxy to `http://127.0.0.1:3004`:

```nginx
server {
    listen 80;
    server_name pathpilo.com www.pathpilo.com;
    
    location / {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Site 2: app.pathpilo.com → Platform + API

Create or edit the site for **app.pathpilo.com**:

```nginx
server {
    listen 80;
    server_name app.pathpilo.com;

    location /api {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Important:** The `/api` location must be defined **before** the `/` location so API requests are routed correctly.

Enable SSL for both domains (CloudPanel usually has “SSL” or “Let’s Encrypt” – follow its UI). If you use Certbot: `sudo certbot --nginx -d pathpilo.com -d www.pathpilo.com -d app.pathpilo.com`

---

## Part 4: Regular updates (after going live)

Every time you want to deploy changes:

**1. On your PC:** push to Git

```powershell
cd "C:\Users\kylli\Desktop\CODE EXPORT\Vevago\Vevago"
git add .
git commit -m "Describe your change"
git push origin main
```

**2. On the server:** run the deploy script

```bash
cd /var/www/pathpilo
./scripts/deploy.sh
```

The script pulls, installs, builds app + marketing, and restarts all three PM2 processes (frontend, API, marketing).

---

## Part 5: Mobile app

The mobile app **does not run on your server**. It runs on users’ phones and connects to your API.

### What you need to do

1. **Point the app to the live API**  
   Edit `PathPiloMobile/src/api/config.ts` and set:
   ```ts
   BASE_URL: 'https://app.pathpilo.com/api',
   ```
   Commit and push this change.

2. **Build and submit to stores** (when you’re ready)  
   - **iOS:** Build with Xcode or EAS Build → submit to App Store Connect  
   - **Android:** Build with `./gradlew assembleRelease` or EAS Build → submit to Google Play Console  

This is separate from the web deployment. The API must be live first (which happens when app.pathpilo.com is running).

---

## Checklist

- [ ] Push all changes to Git from your PC
- [ ] Server: Node 20, PM2, PostgreSQL, Git installed
- [ ] Repo cloned; `.env` and `api-server/.env` created (not committed)
- [ ] `npm install`, `npm run build` (root + marketing); `api-server npm install`
- [ ] `node setup-database.js` run
- [ ] PM2: vevago-frontend, vevago-api, pathpilo-marketing running
- [ ] Nginx/CloudPanel: pathpilo.com → 3004, app.pathpilo.com → 3005 + /api → 3003
- [ ] SSL enabled for pathpilo.com and app.pathpilo.com
- [ ] Mobile: `config.ts` updated to `https://app.pathpilo.com/api` when API is live

---

## If something fails

- **502 Bad Gateway:** App not running or wrong port. Check `pm2 status` and logs: `pm2 logs`
- **API errors:** Check `pm2 logs vevago-api`, ensure `NEXT_PUBLIC_API_URL` is empty in production
- **Database errors:** Verify PostgreSQL is running, credentials in `.env` match the DB
- **Marketing not updating:** Run `npm run build` in `marketing/` and `pm2 restart pathpilo-marketing`
