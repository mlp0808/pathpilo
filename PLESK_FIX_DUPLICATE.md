# Fix: Duplicate Location "/" Error in Plesk

## The Problem

You're getting this error:
```
nginx: [emerg] duplicate location "/" in /var/www/vhosts/system/vevago.app/conf/vhost_nginx.conf:1
```

This means there's already a `location /` block in your nginx configuration, and we're trying to add another one.

## Solution: Replace the Existing Location Block

Instead of adding a new `location /` block, we need to **modify the existing one** or use a different approach.

### Option 1: Use Additional Directives (Recommended)

In Plesk, instead of adding a full `location /` block, we'll add the proxy configuration in a way that doesn't conflict.

1. Go back to **Apache & nginx Settings** for `vevago.app`
2. In **"Additional nginx directives"**, **REMOVE** what you just added
3. Add this instead (this goes BEFORE the existing location blocks):

```nginx
# Proxy configuration for Next.js frontend
location ~ ^/(?!api) {
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

# Backend API
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

### Option 2: Modify Existing Location Block

If Option 1 doesn't work, we need to find and modify the existing location block:

1. In Plesk, go to **File Manager**
2. Navigate to: `/var/www/vhosts/system/vevago.app/conf/`
3. Open `vhost_nginx.conf`
4. Find the existing `location /` block
5. Replace it with:

```nginx
location / {
    # Don't proxy API calls
    if ($uri ~ ^/api) {
        proxy_pass http://localhost:3002;
        break;
    }
    
    # Proxy everything else to Next.js
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
```

6. Save the file
7. Go back to Plesk and click **"Apply"** or restart the web server

### Option 3: Use Plesk's Proxy Settings (Easiest)

Some Plesk versions have built-in proxy settings:

1. Go to **Websites & Domains** → **vevago.app**
2. Look for **"Proxy Settings"** or **"Reverse Proxy"**
3. If you see it:
   - Enable reverse proxy
   - Set backend URL to: `http://localhost:3000`
   - Add exception for `/api` to point to: `http://localhost:3002`

### Option 4: Use Subdomain Approach (Alternative)

If the above don't work, you could:
- Use `vevago.app` for the frontend
- Use `api.vevago.app` for the backend
- Then update your frontend code to use `api.vevago.app` for API calls

## Step-by-Step Fix (Try This First)

1. **Remove the configuration you just added** from "Additional nginx directives"
2. **Clear the text box** completely
3. **Add ONLY this** (without the `location /` part):

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

4. **For the frontend**, we need to modify the existing location block. Look for **"Document Root"** or **"Hosting Settings"** in Plesk
5. Change the document root to use a proxy instead, OR
6. Contact your hosting provider to modify the main location block

## Quick Test After Fix

1. Save the configuration
2. Check if nginx test passes (should show no errors)
3. Visit `http://vevago.app` - should work now

## If Still Having Issues

The easiest solution might be to:
1. **Contact your hosting provider** and ask them to:
   - Configure reverse proxy for `vevago.app`
   - Route `/` to `http://localhost:3000`
   - Route `/api` to `http://localhost:3002`

2. Or **use a different port** for the frontend and configure it differently

Let me know which option you want to try, or if you need help finding the right settings in Plesk!

