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

## How publishing works (no daily rebuild)

Marketing and the product app are separate processes. The blog is **file-based** MDX under `marketing/content/articles/`.

1. Bot writes/updates an `.mdx` file via MCP (and optional images under `public/images/articles/`).
2. The marketing Next site reads those files **live** on each request (fingerprint cache; changes show within seconds).
3. Set `draft: false` (or omit draft) to publish. Drafts stay off the public site.

You do **not** need to rebuild marketing after every bot post. Rebuild only when you change marketing **code** (layout, components, design).

`blog_refresh_index` updates `ARTICLE-INDEX.md` for internal-link guidance. Creates/updates/deletes also refresh that index automatically.

---

## One-time setup on the live server (Hetzner)

### 1. Password

In the server’s root `.env` (or `marketing/mcp-blog/.env`), add:

```bash
BLOG_MCP_TOKEN=pick-a-long-random-password
BLOG_MCP_PORT=8787
BLOG_MCP_ALLOWED_HOSTS=pathpilo.com,www.pathpilo.com
# Optional override — defaults to the marketing/ folder next to mcp-blog/
# BLOG_MCP_MARKETING_ROOT=/home/pathpilo/htdocs/pathpilo.com/marketing
```

`BLOG_MCP_MARKETING_ROOT` must be the **same** `marketing/` directory the live site runs from (`pm2` cwd for `pathpilo-marketing`).

**Critical on this server:** the live site is

`/home/pathpilo/htdocs/pathpilo.com/marketing`

not `/home/ssh-pathpilo/pathpilo/marketing`. If MCP runs from the ssh-pathpilo clone, bots “save successfully” but pathpilo.com never sees the files. Always start PM2 from the htdocs tree:

```bash
cd /home/pathpilo/htdocs/pathpilo.com
pm2 delete pathpilo-blog-mcp
pm2 start ecosystem.config.js --only pathpilo-blog-mcp
pm2 save
```

Then call `blog_sandbox_info` — `marketingRoot` / `articlesDir` must start with `/home/pathpilo/htdocs/…`.

### 2. Install + start with PM2

```bash
cd /path/to/Vevago   # your repo on the server
cd marketing/mcp-blog && npm install && cd ../..
pm2 start ecosystem.config.js --only pathpilo-blog-mcp
pm2 save
```

(Or run a normal deploy — it installs and restarts this too.)

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

---

## Local testing (optional)

```bash
cd marketing/mcp-blog
cp .env.example .env   # set BLOG_MCP_TOKEN
npm start
# http://localhost:8787/mcp  + your token
```

Run marketing separately (`cd marketing && npm run dev`) so you can see new posts at `/articles` without rebuilding.
