# PathPilo – Git & Deployment Guide

This guide covers getting the whole project onto Git and deploying the **marketing site**, **web app**, and **API** (and optionally the **mobile app**).

---

## What’s in this repo

| Part | Path | Tech | Purpose |
|------|------|------|---------|
| **Web app (SaaS)** | `/app`, root Next.js | Next.js 15 | Main product – jobs, clients, team, etc. |
| **API server** | `/api-server` | Express | Backend for the web app (auth, jobs, clients, etc.) |
| **Marketing site** | `/marketing` | Next.js | Sales site – Home, Features, Pricing, FAQ, Contact |
| **Mobile app** | `/PathPiloMobile` | React Native | iOS/Android app (optional to deploy separately) |
| **Legacy** | `/server.js`, `/pathpilo_web` | Express / static | Old monolith; can be ignored if you use `api-server` only |

Recommended: one **single Git repo** (monorepo) containing all of the above. The server runs the **web app** + **API**; the **marketing** site can be on the same server or on Vercel/Netlify.

---

## Part 1: Git setup (local → remote)

### 1.1 Check current Git state

```powershell
cd "C:\Users\kylli\Desktop\CODE EXPORT\Vevago\Vevago"
git status
git remote -v
```

- If you see a remote (e.g. `origin` → GitHub/GitLab), the repo is already connected.
- If the “platform has completely changed”, create a **new** repo on GitHub/GitLab and add it as a new remote (or replace `origin`).

### 1.2 Create a new repo on GitHub (or GitLab)

1. GitHub: **Repositories → New** (e.g. `pathpilo` or `vevago`).
2. Do **not** add a README, .gitignore, or license (you already have a repo).
3. Copy the repo URL (HTTPS or SSH), e.g. `https://github.com/your-username/pathpilo.git`.

### 1.3 Point your local repo at the new remote

If this is the first time, or you’re replacing the old host:

```powershell
# If you already have origin but want to switch URL:
git remote set-url origin https://github.com/your-username/pathpilo.git

# If you have no remote yet:
git remote add origin https://github.com/your-username/pathpilo.git
```

### 1.4 What to commit (and what not to)

- **Commit:** All app code, `marketing/`, `api-server/`, `PathPiloMobile/`, `app/`, configs (`package.json`, `next.config.js`, `tailwind.config.js`, etc.), `env.example`, `setup-database.js`, `ecosystem.config.js`, and this `DEPLOYMENT.md`.
- **Do not commit:**  
  - `.env` and any `.env.*` with secrets  
  - `node_modules/`, `.next/`, `marketing/.next/`, `out/`, `build/`, `dist/`  
  - `.vercel`, `*.log`, `.DS_Store`  

Your existing `.gitignore` already excludes most of these. Double-check:

```powershell
# See what would be added (without adding)
git add -n .
# If something like .env or node_modules appears, add it to .gitignore
```

### 1.5 First push (or re-push)

```powershell
git add .
git status
git commit -m "PathPilo: web app, api-server, marketing, mobile – deployment ready"
git branch -M main
git push -u origin main
```

From here on, normal workflow: `git add` → `git commit` → `git push`. The server will pull from this repo.

---

## Part 2: Deploying to a server

You need:

- A **VPS** (e.g. DigitalOcean, Linode, Hetzner) with Node.js 18+, npm, Git, and PostgreSQL.
- A **domain** (e.g. `app.pathpilo.com` for the app, `api.pathpilo.com` for the API, and optionally `pathpilo.com` for marketing or a subdomain).

### 2.1 Architecture (recommended)

```
pathpilo.com              → Marketing (Vercel/Netlify or same VPS)
app.pathpilo.com          → Next.js web app (VPS)
api.pathpilo.com (or /api) → API server (VPS, reverse-proxied)
```

- **Option A – All on one VPS**  
  - Nginx (or Caddy) serves:  
    - `pathpilo.com` → marketing (or static export).  
    - `app.pathpilo.com` → Next.js (e.g. port 3002).  
    - `api.pathpilo.com` or `app.pathpilo.com/api` → API (e.g. port 3003).

- **Option B – Marketing on Vercel**  
  - `pathpilo.com` → Vercel (from `marketing/`).  
  - VPS only runs app + API as above.

### 2.2 One-time server setup (VPS)

SSH in, then:

```bash
# Node 18+ (example for Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Git, PM2, Nginx
sudo apt-get install -y git nginx
sudo npm install -g pm2

# PostgreSQL (if not already installed)
sudo apt-get install -y postgresql postgresql-contrib
```

Create a DB and user for PathPilo, then run your schema (e.g. `node setup-database.js` with production `.env`).

### 2.3 Clone and build on the server

```bash
cd /var/www   # or wherever you keep apps
sudo git clone https://github.com/your-username/pathpilo.git
cd pathpilo
```

Create env files (never commit these):

```bash
# Root .env (used by Next.js and by api-server if you load it from here)
cp env.example .env
nano .env   # set DB_*, JWT_SECRET, PORT=3003, NODE_ENV=production, RESEND_API_KEY, etc.

# api-server can use the same .env or its own
cp api-server/env.example api-server/.env
# Edit api-server/.env with same DB and JWT_SECRET; API_PORT=3003
```

Install and build:

```bash
npm install
npm run build

cd api-server && npm install && cd ..
cd marketing && npm install && npm run build && cd ..
```

### 2.4 Start app and API with PM2

Use the project’s `ecosystem.config.js` (see below). It starts:

1. **Next.js web app** (e.g. port 3002).  
2. **API server** from `api-server` (e.g. port 3003).

From repo root:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # enable start on reboot
```

### 2.5 Nginx reverse proxy (example)

- **app.pathpilo.com** → `http://127.0.0.1:3002`  
- **api.pathpilo.com** or **app.pathpilo.com/api** → `http://127.0.0.1:3003`

Example for app + API on same domain:

```nginx
server {
    listen 80;
    server_name app.pathpilo.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then enable HTTPS (e.g. Certbot): `sudo certbot --nginx -d app.pathpilo.com`.

### 2.6 Frontend environment (production)

So the web app talks to your API in production:

- If API is at **same domain** under `/api`:  
  - Set `NEXT_PUBLIC_API_URL=` (empty) in `.env.production` or on the server so the app uses relative `/api` (handled by Nginx above).
- If API is on a **different subdomain** (e.g. `api.pathpilo.com`):  
  - Set `NEXT_PUBLIC_API_URL=https://api.pathpilo.com` and proxy or CORS accordingly.

Build after setting env:

```bash
NODE_ENV=production NEXT_PUBLIC_API_URL= npm run build
pm2 restart vevago-frontend
```

---

## Part 3: Marketing site

- **Vercel:** Connect the repo, set **Root Directory** to `marketing`, build command `npm run build`, output Next.js. Point `pathpilo.com` to that project.
- **Same VPS:** Build `marketing` and serve it with Nginx (e.g. another server block for `pathpilo.com` pointing at the marketing build or a static export).

---

## Part 4: Mobile app (PathPiloMobile)

- **Git:** Already in the same repo under `PathPiloMobile/`; no extra Git step.
- **Deploy:** Build and submit to App Store / Play Store (e.g. EAS Build or local builds). Configure the app’s API base URL to `https://api.pathpilo.com` (or your production API URL).

---

## Part 5: Updates (after first deployment)

1. **Local:**  
   `git add .` → `git commit -m "..."` → `git push origin main`
2. **Server:**  
   ```bash
   cd /var/www/pathpilo
   git pull origin main
   npm install
   npm run build
   cd api-server && npm install && cd ..
   pm2 restart vevago-frontend vevago-api
   ```

---

## Checklist

- [ ] Git repo created (e.g. GitHub), remote set, first push done.
- [ ] Server: Node 18+, Git, PM2, Nginx, PostgreSQL installed.
- [ ] Repo cloned on server; `.env` (and api-server `.env`) created and not committed.
- [ ] `npm install` and `npm run build` (root + marketing if needed); api-server `npm install`.
- [ ] PM2 started with `ecosystem.config.js`; `pm2 save` and `pm2 startup`.
- [ ] Nginx (or Caddy) proxies app and API; SSL enabled.
- [ ] `NEXT_PUBLIC_API_URL` set (or empty) for production frontend.
- [ ] Marketing deployed (Vercel or same VPS).
- [ ] Mobile app API URL set to production and store builds done when ready.

If you tell me your host (e.g. “GitHub + one VPS”) and domain plan (one domain vs app/pathpilo.com + api.pathpilo.com), I can adapt this into a minimal step-by-step for your exact setup.
