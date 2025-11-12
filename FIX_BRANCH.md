# Fix: Push to GitHub

## Your branch is `master`, but you're trying to push to `main`

### Option 1: Push to `master` (Quickest)
```bash
git push -u origin master --force
```

### Option 2: Rename branch to `main` first (Recommended)
```bash
# Rename local branch from master to main
git branch -M main

# Then push
git push -u origin main --force
```

## But first, you have uncommitted changes!

You need to commit your changes first:

```bash
# 1. Add all changes
git add .

# 2. Commit
git commit -m "Remove node_modules from Git tracking and add .gitignore"

# 3. Rename branch to main (if you want)
git branch -M main

# 4. Push
git push -u origin main --force
```

## Complete Steps:

```bash
# Step 1: Add all changes
git add .

# Step 2: Commit
git commit -m "Remove node_modules from Git tracking and add .gitignore"

# Step 3: Rename branch to main
git branch -M main

# Step 4: Push to GitHub
git push -u origin main --force
```

