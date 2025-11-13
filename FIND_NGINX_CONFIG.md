# Finding Nginx Config in Plesk

## The Issue

The nginx configuration files are in a system directory that might not be visible in the regular file manager. They're usually in:
- `/var/www/vhosts/system/vevago.app/conf/` (system-level, needs root access)
- Or managed directly through Plesk interface

## Option 1: Use Plesk's Interface (Easiest)

Since you're the hosting provider, you should have access to the domain settings:

1. **Go to:** Websites & Domains → **vevago.app**
2. **Look for:** "Apache & nginx Settings" or "Hosting Settings"
3. **Find:** "Additional nginx directives" text box

The duplicate location error means there's already a `location /` block. We need to work around it.

## Option 2: Access System Directory via SSH/Terminal

If you have SSH/root access:

1. **SSH into your server** (not through Plesk file manager)
2. **Navigate to:**
```bash
cd /var/www/vhosts/system/vevago.app/conf/
ls -la
```

You should see `vhost_nginx.conf` there.

## Option 3: Use Plesk's File Manager with Root Access

1. In Plesk, go to **"Tools & Settings"**
2. Look for **"File Manager"** with root/system access
3. Navigate to: `/var/www/vhosts/system/vevago.app/conf/`

## Option 4: Check What's Actually Happening

Let's first see what the current nginx config looks like:

1. **In Plesk Terminal**, run:
```bash
cat /var/www/vhosts/system/vevago.app/conf/vhost_nginx.conf
```

This will show you the current configuration.

## Option 5: Use Subdomains Instead (Simpler)

If finding/editing the nginx config is too complicated, use subdomains:

1. **Create subdomain:** `api.vevago.app`
2. **Point main domain** to port 3000
3. **Point subdomain** to port 3002
4. **Update frontend code** to use `api.vevago.app`

This avoids the reverse proxy complexity entirely.

