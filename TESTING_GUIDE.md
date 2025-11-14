# Multi-Company System Testing Guide

## Step 1: Restart Your Server

**Local Development:**
```bash
# Stop current server (Ctrl+C if running)
# Then start backend:
node server.js

# In another terminal, start frontend:
npm run dev
```

**Live Server:**
```bash
# SSH into your server, then:
cd /var/www/vhosts/vevago.app/httpdocs/app
pkill -f "node server.js"
node server.js > /tmp/backend.log 2>&1 &

# Restart frontend:
pkill -f "next start"
npm start > /tmp/frontend.log 2>&1 &
```

---

## Step 2: Test Normal Registration (Path 1)

**What to test:**
1. Go to `/register` page
2. Fill in registration form:
   - First Name: `John`
   - Last Name: `Doe`
   - Email: `john@test.com`
   - Password: `password123`
3. Submit registration

**Expected Result:**
- ✅ User is created
- ✅ Company is automatically created (named "John's Company")
- ✅ User is linked to company as "owner" in `user_companies` table
- ✅ You're automatically logged in
- ✅ JWT token contains `activeCompanyId`

**What you'll see:**
- Redirected to dashboard
- You should see your company data
- All features should work normally

---

## Step 3: Test Login (Multi-Company Support)

**What to test:**
1. Log out (if logged in)
2. Log in with the user you just created
3. Check the browser console Network tab → Login response

**Expected Result:**
```json
{
  "token": "...",
  "user": {
    "id": 1,
    "activeCompany": {
      "id": 1,
      "name": "John's Company",
      "role": "owner",
      "isOwner": true
    },
    "companies": [
      {
        "id": 1,
        "name": "John's Company",
        "role": "owner",
        "isOwner": true
      }
    ]
  }
}
```

**What you'll see:**
- Login works normally
- You see your company data
- (Later, when you have multiple companies, you'll see all of them in the `companies` array)

---

## Step 4: Test Invitation Flow (Path 2)

### 4a. Send Invitation (as Owner)

**What to test:**
1. While logged in as the owner, you'll need to create an invitation endpoint UI (or test via API)
2. For now, test via API or create a simple UI

**API Test:**
```bash
# Get your JWT token from browser localStorage or login response
# Get your company ID from the login response

curl -X POST http://localhost:3003/api/companies/1/invite \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@test.com",
    "role": "employee"
  }'
```

**Expected Result:**
```json
{
  "message": "Invitation sent successfully",
  "invitation": {
    "id": 1,
    "email": "jane@test.com",
    "role": "employee",
    "expiresAt": "...",
    "invitationUrl": "http://localhost:3002/register?token=abc123..."
  }
}
```

**Copy the `invitationUrl` or `token` for next step**

### 4b. Register via Invitation

**What to test:**
1. Open registration page with invitation token:
   - Go to: `/register?token=YOUR_TOKEN_HERE`
   - OR manually add token to registration form
2. Fill in registration:
   - First Name: `Jane`
   - Last Name: `Smith`
   - Email: `jane@test.com` (must match invitation email)
   - Password: `password123`
   - **Invitation Token**: (should be pre-filled from URL, or add manually)
3. Submit

**Expected Result:**
- ✅ User is created
- ✅ User is linked to existing company (not creating new one)
- ✅ User role is "employee" (as set in invitation)
- ✅ User is automatically logged in
- ✅ JWT contains `activeCompanyId` of the company they joined

**What you'll see:**
- Redirected to dashboard
- You see the company's data (same company as the owner)
- Your role is "employee" (limited permissions)

---

## Step 5: Test Multi-Company User

### 5a. Create Second Company (as Owner)

**What to test:**
1. While logged in as John (owner of Company 1)
2. Create a second company (via API or UI if you have it)

**API Test:**
```bash
curl -X POST http://localhost:3003/api/companies \
  -H "Authorization: Bearer JOHN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Johns Second Company",
    "country": "Denmark",
    "address": "123 Main St",
    "city": "Copenhagen",
    "zipCode": "1000"
  }'
```

**Expected Result:**
- ✅ Second company created
- ✅ John is owner of both companies
- ✅ John is linked to both in `user_companies` table

### 5b. Login and See All Companies

**What to test:**
1. Log out and log back in as John
2. Check login response

**Expected Result:**
```json
{
  "user": {
    "companies": [
      {
        "id": 1,
        "name": "John's Company",
        "role": "owner",
        "isOwner": true
      },
      {
        "id": 2,
        "name": "Johns Second Company",
        "role": "owner",
        "isOwner": true
      }
    ],
    "activeCompany": {
      "id": 1,  // First company (owned companies prioritized)
      "name": "John's Company",
      "role": "owner"
    }
  }
}
```

**What you'll see:**
- Login response shows all companies
- Active company is set to first owned company
- All data shown is from active company

---

## Step 6: Test Company Switching

**What to test:**
1. While logged in as John (with multiple companies)
2. Switch to second company

**API Test:**
```bash
curl -X POST http://localhost:3003/api/companies/2/switch \
  -H "Authorization: Bearer JOHN_JWT_TOKEN"
```

**Expected Result:**
```json
{
  "message": "Company switched successfully",
  "token": "NEW_JWT_TOKEN_WITH_UPDATED_ACTIVE_COMPANY",
  "activeCompany": {
    "id": 2,
    "name": "Johns Second Company",
    "role": "owner",
    "isOwner": true
  }
}
```

**What you'll see:**
- New JWT token with updated `activeCompanyId`
- All subsequent API calls use Company 2's data
- Data is isolated per company

---

## Step 7: Test Data Isolation

**What to test:**
1. As John, switch to Company 1
2. Create a client: "Client A"
3. Switch to Company 2
4. Check clients list

**Expected Result:**
- ✅ Company 1 has "Client A"
- ✅ Company 2 has no clients (or different clients)
- ✅ Data is completely isolated between companies

**What you'll see:**
- Each company has its own data
- Switching companies shows different data
- No cross-contamination between companies

---

## Step 8: Test Owner Protection

**What to test:**
1. Try to remove the last owner from a company
2. Try to change the last owner's role to employee

**Expected Result:**
- ✅ Database triggers prevent removing last owner
- ✅ Error: "Cannot remove the last owner from a company"
- ✅ Company always has at least one owner

---

## Step 9: Test Role-Based Access

**What to test:**
1. Log in as Jane (employee)
2. Try to update company profile
3. Try to invite users
4. Try to delete users

**Expected Result:**
- ✅ Employee can view data
- ✅ Employee CANNOT update company profile (403 error)
- ✅ Employee CANNOT invite users (403 error)
- ✅ Employee CANNOT delete users (403 error)
- ✅ Only owners/admins can do these actions

---

## Common Issues & Troubleshooting

### Issue: "No active company selected"
**Solution:** User needs to be linked to at least one company. Check `user_companies` table.

### Issue: "You do not have access to this company"
**Solution:** User is not in `user_companies` table for that company. Verify membership.

### Issue: Login shows empty companies array
**Solution:** User exists but isn't linked to any company. Run migration again or manually link user.

### Issue: Data from wrong company showing
**Solution:** Check JWT token - `activeCompanyId` might be wrong. Switch companies to update token.

---

## Database Verification

**Check user_companies table:**
```sql
SELECT uc.*, u.email, c.name as company_name
FROM user_companies uc
JOIN users u ON uc.user_id = u.id
JOIN companies c ON uc.company_id = c.id;
```

**Check company_invitations table:**
```sql
SELECT * FROM company_invitations;
```

**Check companies have owners:**
```sql
SELECT c.id, c.name, c.owner_id, u.email as owner_email
FROM companies c
JOIN users u ON c.owner_id = u.id;
```

---

## Next Steps After Testing

1. **Frontend Updates Needed:**
   - Add company switcher UI component
   - Update registration page to handle invitation tokens from URL
   - Update user context to store multiple companies
   - Add invitation UI for owners/admins

2. **Email Integration:**
   - Set up email service (SendGrid, Mailgun, etc.)
   - Send actual invitation emails instead of returning URL

3. **UI Improvements:**
   - Show active company in header
   - Company dropdown/switcher
   - Role badges (Owner, Admin, Employee)

---

## Quick Test Checklist

- [ ] Normal registration creates user + company
- [ ] Login returns all companies user belongs to
- [ ] Invitation can be sent
- [ ] Registration via invitation works
- [ ] User can belong to multiple companies
- [ ] Company switching works
- [ ] Data is isolated per company
- [ ] Owner cannot be removed (last owner protection)
- [ ] Role-based access control works
- [ ] All existing features still work

