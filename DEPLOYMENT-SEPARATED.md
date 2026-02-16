# Deployment Guide - Separated Architecture

This guide covers deploying PathPilo with separated marketing and SaaS applications.

## 🏗️ Architecture Overview

```
pathpilo.com (Marketing) ← Vercel/Netlify
    ↓
app.pathpilo.com (SaaS App) ← VPS
    ↓
api.pathpilo.com (API) ← VPS
```

## 📦 Applications

### 1. Marketing Website (`marketing/`)
- **Framework**: Next.js
- **Port**: 3001 (dev)
- **URL**: `pathpilo.com`
- **Hosting**: Vercel/Netlify (recommended)

### 2. SaaS Application (`app/`)
- **Framework**: Next.js
- **Port**: 3002 (dev)
- **URL**: `app.pathpilo.com`
- **Hosting**: VPS with reverse proxy

### 3. API Server (`api-server/`)
- **Framework**: Express.js
- **Port**: 8000 (dev), 3003 (prod)
- **URL**: `api.pathpilo.com`
- **Hosting**: VPS

## 🚀 Deployment Steps

### Step 1: Deploy Marketing Site

**Option A: Vercel (Recommended)**
```bash
cd marketing
npm install
npm run build
# Deploy to Vercel - connects to pathpilo.com
```

**Option B: Netlify**
```bash
cd marketing
npm run build
# Deploy dist folder to Netlify - connects to pathpilo.com
```

### Step 2: Deploy SaaS App to VPS

```bash
# On your VPS
git clone your-repo
cd Vevago
npm install

# Configure environment
cp app/env.example app/.env.local
# Edit .env.local with production URLs:
# NEXT_PUBLIC_API_URL=https://api.pathpilo.com

# Build and start
npm run build
npm start  # Runs on port 3002
```

### Step 3: Deploy API Server to VPS

```bash
# On your VPS
cd api-server
npm install

# Configure environment
cp env.example .env
# Edit .env with production settings

# Start API server
node server.js  # Runs on port 3003
```

### Step 4: Configure Reverse Proxy (Nginx)

**nginx.conf:**
```nginx
# Marketing site (if not using Vercel/Netlify)
server {
    listen 80;
    server_name pathpilo.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

# SaaS Application
server {
    listen 80;
    server_name app.pathpilo.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # API proxy for app
    location /api {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

# API Server
server {
    listen 80;
    server_name api.pathpilo.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### Step 5: DNS Configuration

```
pathpilo.com     → Your marketing hosting (Vercel/Netlify)
app.pathpilo.com → Your VPS IP
api.pathpilo.com → Your VPS IP
```

## 🔧 Development Setup

Run all services locally:
```bash
npm run dev:fullstack
```

This starts:
- API Server: http://localhost:3003
- SaaS App: http://localhost:3002
- Marketing: http://localhost:3001

## 🔗 URL Updates Required

Update marketing site links to use production URLs:
```typescript
// Instead of /app/login
https://app.pathpilo.com/login

// Instead of /api endpoints
https://api.pathpilo.com/api/...
```

## 📊 Traffic Flow

1. **Visitor** → `pathpilo.com` (Marketing)
2. **"Sign Up"** → `app.pathpilo.com/register` (SaaS App)
3. **API Calls** → `api.pathpilo.com/api/*` (API Server)

## 🛠️ Maintenance

- **Marketing Updates**: Deploy to Vercel/Netlify
- **App Updates**: Deploy to VPS, restart PM2
- **API Updates**: Deploy to VPS, restart API server

## 📈 Scaling

- **Marketing**: CDN scales automatically
- **SaaS App**: Add more VPS instances behind load balancer
- **API**: Add more API servers behind load balancer