-- Migration: Multi-Company Support
-- This migration updates the schema to support:
-- 1. Users can belong to multiple companies
-- 2. Users can be owner of one company and employee of another
-- 3. Company invitations system
-- 4. Company must always have an owner

-- Step 1: Create user_companies junction table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS user_companies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'admin', 'manager', 'employee')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, company_id)
);

-- Step 2: Create company_invitations table
CREATE TABLE IF NOT EXISTS company_invitations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
  token VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  UNIQUE(company_id, email, status) -- One pending invite per email per company
);

-- Step 3: Migrate existing data from users.company_id to user_companies
-- This assumes existing users are owners of their companies
-- Only insert if user_companies table exists and has data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_companies') THEN
    INSERT INTO user_companies (user_id, company_id, role)
    SELECT id, company_id, 'owner'
    FROM users
    WHERE company_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_companies uc 
        WHERE uc.user_id = users.id AND uc.company_id = users.company_id
      )
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;
END $$;

-- Step 4: Add constraint to ensure company always has an owner
-- First, ensure all companies have an owner
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_companies') THEN
    UPDATE companies 
    SET owner_id = (
      SELECT user_id 
      FROM user_companies 
      WHERE company_id = companies.id AND role = 'owner' 
      LIMIT 1
    )
    WHERE owner_id IS NULL;
  END IF;
END $$;

-- Step 5: Make owner_id required (can't be NULL) - only if column allows NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' 
      AND column_name = 'owner_id' 
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE companies ALTER COLUMN owner_id SET NOT NULL;
  END IF;
END $$;

-- Step 6: Add indexes for performance (IF NOT EXISTS handles duplicates)
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_role ON user_companies(role);
CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations(email);
CREATE INDEX IF NOT EXISTS idx_company_invitations_status ON company_invitations(status);

-- Step 7: Create function to prevent removing the last owner from a company
CREATE OR REPLACE FUNCTION prevent_remove_last_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- If deleting an owner role
  IF OLD.role = 'owner' THEN
    -- Check if this is the last owner
    IF (SELECT COUNT(*) FROM user_companies WHERE company_id = OLD.company_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last owner from a company. Company must always have an owner.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to enforce owner requirement (drop if exists first)
DROP TRIGGER IF EXISTS check_last_owner_before_delete ON user_companies;
CREATE TRIGGER check_last_owner_before_delete
  BEFORE DELETE ON user_companies
  FOR EACH ROW
  EXECUTE FUNCTION prevent_remove_last_owner();

-- Step 9: Create trigger to prevent updating owner role to non-owner if it's the last owner
CREATE OR REPLACE FUNCTION prevent_update_last_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- If changing from owner to non-owner
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    -- Check if this is the last owner
    IF (SELECT COUNT(*) FROM user_companies WHERE company_id = NEW.company_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Cannot change the last owner to a different role. Company must always have an owner.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_last_owner_before_update ON user_companies;
CREATE TRIGGER check_last_owner_before_update
  BEFORE UPDATE ON user_companies
  FOR EACH ROW
  EXECUTE FUNCTION prevent_update_last_owner();

-- Note: We keep company_id in users table for now (for backward compatibility)
-- But it should be considered deprecated. Use user_companies table instead.

