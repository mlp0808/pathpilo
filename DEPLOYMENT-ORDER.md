# PathPilo – Deployment order

Deploy in this order so the main domain goes live first, then the app.

---

## Phase 1 – Marketing on the main domain (pathpilo.com)

Get **pathpilo.com** live first (sales site: Home, Features, Pricing, etc.).

### Option A – Same server (CloudPanel)

You already created **pathpilo.com** on port **3004**. You need to put the code on the server, then build and run.

**1. Get the code onto the server (SSH)**

- SSH into the server (e.g. `ssh your-user@your-server-ip`).
- Go to the folder CloudPanel uses for this site (often something like `/home/youruser/htdocs/pathpilo.com` or shown in CloudPanel under the site’s “Path” or “Document root”). If the folder is empty, use it. If you’re not sure, create a folder and note the path, e.g.:
  ```bash
  mkdir -p /var/www/pathpilo
  cd /var/www/pathpilo
  ```
- Clone the repo (this downloads the project from GitHub):
  ```bash
  git clone https://github.com/mlp0808/pathpilo.git .
  ```
  (The `.` means “clone into the current folder”. If the folder already has other files, clone into a new folder: `git clone https://github.com/mlp0808/pathpilo.git pathpilo` then `cd pathpilo`.)

**2. Build and run the marketing app on port 3004**
   ```bash
   cd marketing
   npm install
   npm run build
   npm start -- -p 3004
   ```
   Or use PM2: from repo root, `pm2 start "npm run start -- -p 3004" --name pathpilo-marketing --cwd marketing`.
3. CloudPanel already points **pathpilo.com** to port 3004. Enable SSL for pathpilo.com.

### Option B – Vercel (or Netlify)

1. At [vercel.com](https://vercel.com), import the repo **mlp0808/pathpilo**.
2. Set **Root Directory** to `marketing`. Build command: `npm run build`. Output: Next.js.
3. Deploy. In your domain DNS, point **pathpilo.com** to the Vercel project (they’ll show the CNAME or A record).

---

## Phase 2 – Platform on subdomain (app.pathpilo.com)

After pathpilo.com is live, get the **main platform** and API running.

1. Use the **Node.js site you already created** in CloudPanel (port **3004**), domain **app.pathpilo.com**.
2. Clone the repo (if not done in Phase 1) or use the same clone:
   ```bash
   cd /var/www/pathpilo   # or your path
   git pull origin main
   ```
3. Create `.env` and `api-server/.env` (see root and api-server `env.example`). Set `FRONTEND_URL=https://app.pathpilo.com`, `ALLOWED_ORIGINS=https://app.pathpilo.com`.
4. Install, build, start:
   ```bash
   npm install
   npm run build
   cd api-server && npm install && cd ..
   mkdir -p logs
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```
5. In CloudPanel (or Nginx), ensure **app.pathpilo.com** proxies to **localhost:3005** (platform), and **/api** (or your API subdomain) proxies to **localhost:3003**. Enable SSL for app.pathpilo.com.

From then on, updates: push from PC, then on server run `./scripts/deploy.sh` (see DEPLOYMENT.md).
