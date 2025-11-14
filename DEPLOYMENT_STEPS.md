# Deployment Steps for Multi-Company Update

## ⚠️ IMPORTANT: Database Migration Required

This update includes significant database schema changes. You **MUST** run the migration on the live server before the new code will work.

---

## Step 1: Push to Git (Local)

```bash
git add .
git commit -m "Add multi-company support, admin panel improvements, and invitation system"
git push origin main
```

---

## Step 2: On Live Server - Pull Latest Code

SSH into your server or use Plesk terminal, then navigate to your app directory:

```bash
cd /var/www/vhosts/vevago.app/httpdocs/app
git pull origin main
```

---

## Step 3: Install Dependencies (if needed)

```bash
npm install
```

---

## Step 4: Run Database Migration ⚠️ CRITICAL

**This is the most important step!** The migration will:
- Create `user_companies` table (many-to-many relationship)
- Create `company_invitations` table
- Migrate existing user-company relationships
- Add triggers to ensure companies always have owners

```bash
node migrations/run-migration.js
```

**Expected output:**
```
🔄 Running migration: Multi-Company Support...
✅ Migration completed successfully!
```

**If you see errors:**
- Check that your `.env` file has correct database credentials
- The migration is idempotent (safe to run multiple times)
- If it fails, check the error message and fix the issue

---

## Step 5: Rebuild Frontend

```bash
npm run build
```

---

## Step 6: Restart Services

Stop existing services:

```bash
# Kill Next.js frontend
pkill -f "next start"

# Kill Express backend
pkill -f "node server.js"
```

Start services:

```bash
# Start Next.js frontend (port 3002)
npm start &

# Start Express backend (port 3003)
node server.js &
```

**Or use PM2 (recommended for production):**

```bash
pm2 restart all
# or
pm2 start ecosystem.config.js
```

---

## Step 7: Verify Everything Works

1. **Check services are running:**
   ```bash
   curl http://localhost:3002
   curl http://localhost:3003
   ```

2. **Test login** - Try logging in as an existing user
3. **Test admin panel** - Login as admin and check:
   - Users page shows companies correctly
   - Companies page works
   - Click a company to see users

---

## What the Migration Does

The migration is **idempotent** (safe to run multiple times). It:

1. ✅ Creates `user_companies` table (if not exists)
2. ✅ Creates `company_invitations` table (if not exists)
3. ✅ Migrates existing `users.company_id` data to `user_companies` as 'owner' roles
4. ✅ Ensures all companies have an `owner_id`
5. ✅ Adds indexes for performance
6. ✅ Creates triggers to prevent removing the last owner

**Existing data is preserved** - all your current users and companies will continue to work.

---

## Rollback Plan (if needed)

If something goes wrong, you can:

1. **Revert code:**
   ```bash
   git reset --hard HEAD~1
   git pull origin main
   ```

2. **The database changes are additive** - the old `users.company_id` column still exists, so old code will still work

3. **Restart with old code:**
   ```bash
   npm run build
   pkill -f "next start"
   pkill -f "node server.js"
   npm start &
   node server.js &
   ```

---

## Notes

- The migration is **non-destructive** - it only adds new tables and relationships
- Existing users will automatically be linked to their companies as 'owner'
- The `users.company_id` column is kept for backward compatibility (but deprecated)
- All new code uses the `user_companies` table

