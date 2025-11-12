# Fix: Push to GitHub

## Your branch is called `master`, not `main`

### Option 1: Push to `master` (Quickest)
```bash
git push -u origin master --force
```

### Option 2: Rename branch to `main` first (Recommended for new repos)
```bash
# Rename local branch from master to main
git branch -M main

# Then push
git push -u origin main --force
```

## If you get "remote rejected" error about large files:

The large files are still in your Git history. You need to clean it first:

### Quick Fix - Start Fresh:
```bash
# 1. Remove .git folder (deletes all history)
rm -rf .git

# 2. Initialize new repo
git init

# 3. Add .gitignore first
git add .gitignore
git commit -m "Add .gitignore"

# 4. Add all other files (node_modules will be ignored)
git add .
git commit -m "Initial commit"

# 5. Rename to main
git branch -M main

# 6. Add remote
git remote add origin https://github.com/mlp0808/Vevago.git

# 7. Push
git push -u origin main --force
```



