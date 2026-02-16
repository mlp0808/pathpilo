# Git – Step-by-step (beginner)

This guide gets your PathPilo project onto GitHub so you have a backup and can deploy from it later. No prior Git experience needed.

---

## What you need

1. **Git** on your PC  
   - Check: open **PowerShell** and run `git --version`.  
   - If it’s not installed: [git-scm.com/download/win](https://git-scm.com/download/win) – use the default options.

2. **A GitHub account**  
   - Sign up at [github.com](https://github.com) if you don’t have one.

---

## Step 1: Open PowerShell in your project

1. Press **Win + R**, type `powershell`, press Enter.
2. Go to your project folder:

```powershell
cd "C:\Users\kylli\Desktop\CODE EXPORT\Vevago\Vevago"
```

You should see your project files when you run `dir`.

---

## Step 2: See what Git thinks about your project

Run:

```powershell
git status
```

- You’ll see “modified” and “untracked” files. That’s normal.
- If it says “not a git repository”, run: `git init` (only once).

Then check if a remote is already set:

```powershell
git remote -v
```

- If you see a line with `origin` and a URL, your repo is already connected to a site (maybe an old one). You can keep it or replace it in Step 4.
- If it says nothing, you don’t have a remote yet. That’s fine.

---

## Step 3: Create a new repo on GitHub

1. Log in to [github.com](https://github.com).
2. Click the **+** (top right) → **New repository**.
3. **Repository name:** e.g. `pathpilo` or `vevago` (whatever you like).
4. Leave **Public** selected.
5. **Do not** tick “Add a README”, “Add .gitignore”, or “Choose a license” – your project already has these.
6. Click **Create repository**.

You’ll see a page with a URL like:  
`https://github.com/YOUR-USERNAME/pathpilo.git`  
Copy that URL; you’ll use it in the next step. Replace `YOUR-USERNAME` with your real GitHub username.

---

## Step 4: Connect your folder to GitHub

In PowerShell (still in your project folder), run **one** of these:

**If you had no remote (Step 2 showed nothing):**

```powershell
git remote add origin https://github.com/YOUR-USERNAME/pathpilo.git
```

**If you already had `origin` and want to point it to the new repo:**

```powershell
git remote set-url origin https://github.com/YOUR-USERNAME/pathpilo.git
```

Replace `YOUR-USERNAME/pathpilo` with your real username and repo name.

Check it:

```powershell
git remote -v
```

You should see `origin` and your URL.

---

## Step 5: Add and commit your files

These three commands save a “snapshot” of your project (only the files that aren’t in `.gitignore` – so no `.env`, no `node_modules`, etc.):

```powershell
git add .
git commit -m "PathPilo: web app, marketing, api, mobile"
git branch -M main
```

- `git add .` = “include all allowed files”.
- `git commit -m "..."` = “save this snapshot with a message”.
- `git branch -M main` = “call the main branch `main`” (GitHub’s default).

If Git says “Please tell me who you are”, run these once (use your name and email):

```powershell
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

Then run the three commands above again.

---

## Step 6: Push to GitHub

Upload your snapshot to GitHub:

```powershell
git push -u origin main
```

- The first time, a browser or window may open and ask you to log in to GitHub (or use a **Personal Access Token** instead of a password). Follow the prompts.
- When it finishes, refresh your repo page on GitHub – you should see all your folders and files.

From now on, after you make changes:

```powershell
git add .
git commit -m "Short description of what you did"
git push
```

That’s the basic loop: **add → commit → push**.

---

## If something goes wrong

| Problem | What to do |
|--------|------------|
| “Please tell me who you are” | Run the `git config --global user.name` and `user.email` lines in Step 5. |
| “failed to push / permission denied” | Log in to GitHub in the browser when Git asks, or create a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens) and use that as the password when Git asks. |
| “remote already has content” | On GitHub, if you added a README when creating the repo, run: `git pull origin main --allow-unrelated-histories`, then `git push -u origin main`. |
| I want to start over in this folder | Delete the hidden `.git` folder in your project (only if you’re sure you don’t need the history), then run `git init` and repeat from Step 4. |

---

## Next

After your code is on GitHub, use **DEPLOYMENT.md** for putting the app on a server (VPS, Vercel, etc.).
