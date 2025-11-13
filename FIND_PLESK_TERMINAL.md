# How to Find Plesk Terminal

## Method 1: Through Tools & Settings

1. **Log into Plesk**
2. In the **left sidebar**, look for **"Tools & Settings"** (usually at the bottom)
3. Click **"Tools & Settings"**
4. Look for one of these:
   - **"SSH Terminal"**
   - **"Terminal"**
   - **"Command Line"**
   - **"Shell Access"**
5. Click it to open the terminal

## Method 2: Through Subscription/Service Plan

1. Go to **"Subscriptions"** or **"Service Plans"**
2. Find your subscription
3. Look for **"SSH Access"** or **"Terminal"** option

## Method 3: Direct SSH (If Terminal Not Available)

If you can't find Terminal in Plesk, you can SSH directly:

1. **Use an SSH client** (like PuTTY on Windows, or Terminal on Mac/Linux)
2. **Connect to your server:**
   - Host: Your server IP address
   - Port: 22 (default SSH port)
   - Username: Your Plesk username (might be different from domain user)
   - Password: Your Plesk password

## Method 4: Check User Permissions

If you don't see Terminal:
1. You might need **root access** or **administrator permissions**
2. Check if SSH is enabled for your user
3. Go to **"Tools & Settings"** → **"SSH Terminal Settings"** (if available)
4. Enable SSH access

## What to Look For

In Plesk's left sidebar, you should see:
```
- Websites & Domains
- Applications
- Files
- Databases
- Mail
- ...
- Tools & Settings  ← Look here
  - Terminal
  - SSH Terminal
  - Command Line
```

## Alternative: Use File Manager's Terminal

Some Plesk versions have a terminal button in File Manager:
1. Go to **File Manager**
2. Look for a **"Terminal"** or **"SSH"** button at the top
3. Click it

## If You Still Can't Find It

You might need to:
1. **Enable SSH** in your hosting plan
2. **Contact your server administrator** (if you're not the main admin)
3. **Use direct SSH** instead of Plesk terminal

## Quick Test

Once you find it, try running:
```bash
pwd
```

This should show your current directory. If it works, you're in the terminal!

