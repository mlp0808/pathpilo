# PathPilo Blog connector (for Grok)

Give Grok a **link** and a **password**. That’s it.

| | |
| --- | --- |
| **Link** | `https://pathpilo.com/blog-mcp/mcp` |
| **Password** | the value of `BLOG_MCP_TOKEN` on the server |

In Grok: **Connectors → New → Custom**, paste the link, enter the password when asked.  
Or tell the bot: `Add this MCP server: https://pathpilo.com/blog-mcp/mcp`

The bot can then create/edit blog posts, titles, meta descriptions, categories, tags, and images. It **cannot** touch app code.

---

## One-time setup on the live server (Hetzner)

### 1. Password

In the server’s root `.env` (same place as other secrets), add:

```bash
BLOG_MCP_TOKEN=pick-a-long-random-password
BLOG_MCP_PORT=8787
BLOG_MCP_ALLOWED_HOSTS=pathpilo.com,www.pathpilo.com
```

### 2. Install + start with PM2

```bash
cd /path/to/Vevago   # your repo on the server
cd marketing/mcp-blog && npm install && cd ../..
pm2 start ecosystem.config.js --only pathpilo-blog-mcp
pm2 save
```

(Or run a normal `./scripts/deploy.sh` after the deploy script update — it will install and restart this too.)

### 3. Nginx (pathpilo.com)

Add this **inside** the existing `pathpilo.com` server block (above `location /`):

```nginx
location /blog-mcp/ {
    proxy_pass http://127.0.0.1:8787/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
    proxy_pass_header Authorization;
}
```

Reload Nginx. Check:

- Open `https://pathpilo.com/blog-mcp/health` → should say `"ok": true`
- Then give Grok the link + password above

### Important

Blog files live on this server under `marketing/content/articles/`. After the bot publishes, rebuild/restart marketing if your live site doesn’t pick up MDX changes until build:

```bash
cd marketing && npm run build && pm2 restart pathpilo-marketing
```

(Or fold that into deploy when you’re ready.)

---

## Local testing (optional)

```bash
cd marketing/mcp-blog
cp .env.example .env   # set BLOG_MCP_TOKEN
npm start
# http://localhost:8787/mcp  + your token
```
