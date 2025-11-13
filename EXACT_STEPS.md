# Exact Steps to Fix This - Choose One Option

## Option 1: Contact Your Hosting Provider (EASIEST - 5 minutes)

**Just email or call them and say:**

"Hi, I need help configuring reverse proxy for my domain vevago.app. I have two Node.js applications running:
- Next.js frontend on port 3000
- Express backend on port 3002

Can you configure Nginx to:
- Route '/' to http://localhost:3000
- Route '/api' to http://localhost:3002

Thank you!"

**That's it. They'll do it for you.**

---

## Option 2: Do It Yourself in Plesk (10-15 minutes)

### Step 1: Open Plesk
1. Log into Plesk
2. Click **"Websites & Domains"** in the left menu
3. Click on **"vevago.app"**

### Step 2: Find the Settings
Look for one of these (click whichever you see):
- **"Apache & nginx Settings"**
- **"Hosting Settings"**
- **"Web Server Settings"**

### Step 3: Add the Configuration
1. Scroll down to find a text box labeled:
   - **"Additional nginx directives"** OR
   - **"Additional directives for httpd"** OR
   - **"Custom nginx configuration"**

2. **Copy and paste ONLY this** (nothing else):

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
}
```

3. Click **"OK"** or **"Apply"**

### Step 4: Modify Document Root for Frontend
1. In the same page, find **"Document Root"** or **"Website root"**
2. It probably says something like: `/var/www/vhosts/vevago.app/httpdocs`
3. We need to change this, BUT...

**STOP HERE** - If you can't find how to change the document root to proxy to port 3000, **use Option 1** (contact hosting provider).

### Step 5: Make Sure Services Are Running
1. In Plesk, look for **"Terminal"** or **"SSH Access"** in the left menu
2. Click it
3. Type these commands one by one:

```bash
cd ~/httpdocs/app
npm start &
node server.js &
```

4. Press Enter after each command

### Step 6: Test
1. Wait 30 seconds
2. Visit: `http://vevago.app`
3. If it works, you're done!

---

## If You're Stuck

**Just use Option 1** - Contact your hosting provider. They do this all the time and can fix it in 5 minutes.

Tell them exactly what I wrote above, and they'll know what to do.

---

## What I Need From You

If you want me to help you do it yourself, tell me:

1. **What do you see** when you click on "vevago.app" in Plesk?
   - List the options/buttons you see

2. **Can you find** "Apache & nginx Settings"?
   - Yes or No

3. **Do you see** a text box for "Additional nginx directives"?
   - Yes or No

4. **Can you access Terminal/SSH** in Plesk?
   - Yes or No

With that info, I can give you the EXACT next steps.

