# Git Setup Instructions

## If you haven't initialized Git yet:

1. Initialize Git repository:
```bash
git init
```

2. Add all files (node_modules will be ignored):
```bash
git add .
```

3. Commit your files:
```bash
git commit -m "Initial commit"
```

4. Add your remote repository (replace with your GitHub/GitLab URL):
```bash
git remote add origin <your-repository-url>
```

5. Push to remote:
```bash
git push -u origin main
```

## If you've already committed node_modules:

1. Remove node_modules from Git (but keep it locally):
```bash
git rm -r --cached node_modules
```

2. Commit the removal:
```bash
git commit -m "Remove node_modules from Git"
```

3. Push to remote:
```bash
git push
```

## Environment Variables

Make sure to create a `.env` file locally with your database credentials and JWT secret. The `.env` file is already in `.gitignore` so it won't be committed.

Example `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/vevago
JWT_SECRET=your-secret-key-here
PORT=3002
```




