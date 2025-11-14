# Multi-Company Implementation Guide

## Overview
This document outlines the multi-company system implementation where:
- Users and Companies are separate entities
- A user can be owner of multiple companies
- A user can be employee/admin of multiple companies
- Companies always have an owner (cannot be ownerless)
- Billing is per company (owner pays)

## Database Changes

### New Tables
1. **user_companies** - Junction table linking users to companies with roles
   - `user_id` (references users)
   - `company_id` (references companies)
   - `role` (owner, admin, manager, employee)
   - Unique constraint on (user_id, company_id)

2. **company_invitations** - Tracks pending invitations
   - `company_id`, `invited_by_user_id`, `email`, `role`, `token`, `status`, `expires_at`

### Migration
Run the migration to update your database:
```bash
node migrations/run-migration.js
```

This will:
- Create `user_companies` table
- Create `company_invitations` table
- Migrate existing data (users with company_id → user_companies)
- Add constraints to prevent removing last owner
- Make `companies.owner_id` required (NOT NULL)

## API Changes

### Registration (Two Paths)

**Path 1: Normal Registration** (Creates user + company)
```http
POST /api/auth/register
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123"
}
```
- Creates user
- Creates company with user as owner
- Links user to company in `user_companies` table

**Path 2: Invitation Registration** (Joins existing company)
```http
POST /api/auth/register
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "password": "password123",
  "invitationToken": "abc123..."
}
```
- Creates user
- Validates invitation token
- Links user to company with assigned role
- Marks invitation as accepted

### Login
```http
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```
**Response:**
```json
{
  "token": "...",
  "user": {
    "id": 1,
    "activeCompany": {
      "id": 1,
      "name": "Company Name",
      "role": "owner",
      "isOwner": true
    },
    "companies": [
      {
        "id": 1,
        "name": "My Company",
        "role": "owner",
        "isOwner": true
      },
      {
        "id": 2,
        "name": "Other Company",
        "role": "employee",
        "isOwner": false
      }
    ]
  }
}
```

### Invitation Endpoints

**Send Invitation** (Owner/Admin only)
```http
POST /api/companies/:companyId/invite
Authorization: Bearer <token>
{
  "email": "newuser@example.com",
  "role": "employee" // or "admin", "manager"
}
```

**Get Invitation Details** (Public)
```http
GET /api/invitations/:token
```
Returns invitation details for registration page.

**Switch Active Company**
```http
POST /api/companies/:companyId/switch
Authorization: Bearer <token>
```
Returns new JWT with updated `activeCompanyId`.

## JWT Token Structure

The JWT now contains:
```json
{
  "userId": 1,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "activeCompanyId": 1,  // Currently active company
  "role": "owner"        // Role in active company
}
```

## Next Steps

### 1. Update All Endpoints
All endpoints that filter by `company_id` need to be updated to use `req.user.activeCompanyId` instead of querying `user.company_id` from database.

**Before:**
```javascript
const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
const companyId = userResult.rows[0].company_id;
```

**After:**
```javascript
const companyId = req.user.activeCompanyId;
```

### 2. Add Company Access Validation
Before accessing company data, verify user has access:
```javascript
const accessCheck = await pool.query(`
  SELECT role FROM user_companies 
  WHERE user_id = $1 AND company_id = $2
`, [req.user.userId, req.user.activeCompanyId]);

if (accessCheck.rows.length === 0) {
  return res.status(403).json({ error: 'Access denied' });
}
```

### 3. Frontend Updates
- Update registration page to handle invitation tokens from URL
- Add company switcher UI component
- Update all API calls to use new JWT structure
- Update user context to store multiple companies

### 4. Email Integration
- Implement email sending for invitations (currently returns URL in response)
- Use service like SendGrid, Mailgun, or AWS SES

## Testing Checklist

- [ ] Run database migration
- [ ] Test normal registration (creates user + company)
- [ ] Test invitation flow (send invite → register → join company)
- [ ] Test login (returns all companies)
- [ ] Test company switching
- [ ] Test that owner cannot be removed from their company
- [ ] Test that company must always have an owner
- [ ] Test multi-company user (owner of Company A, employee of Company B)

## Important Notes

1. **Backward Compatibility**: The `users.company_id` column is kept for now but should be considered deprecated. All new code should use `user_companies` table.

2. **Owner Protection**: Database triggers prevent removing the last owner from a company. This is enforced at the database level.

3. **Billing**: Billing is per company. The owner of each company is responsible for payment. If User 2 owns Company B and is employee of Company A, Company A's owner pays for Company A, User 2 pays for Company B.

4. **Security**: Always validate company access before returning data. Users should only see data from companies they belong to.

