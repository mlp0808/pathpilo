require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

/**
 * Single database setup script (dev/staging).
 *
 * Usage:
 *   node setup-database.js --reset --seed
 *   node setup-database.js --seed
 *   node setup-database.js
 *
 * Flags:
 *   --reset  Drops all app tables first (DESTRUCTIVE).
 *   --seed   Inserts a small demo dataset if database is empty.
 *
 * Notes:
 * - This script is intended for local/dev environments. Do NOT run --reset in production.
 * - It creates all tables used by the app, including subscriptions (recurring_jobs).
 */

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const SEED = args.has('--seed');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123'
});

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function safeQuery(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (e) {
    // Helpful when running against partially-existing schemas
    console.log(`⚠️  Skipped (non-fatal): ${e.message}`);
    return null;
  }
}

async function createSchema() {
  console.log('🧱 Creating schema...');

  // Core tables
    await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        country VARCHAR(100),
        country_code VARCHAR(2) NOT NULL DEFAULT 'DK',
        cvr_number VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        zip_code VARCHAR(20),
        owner_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        language_code VARCHAR(10) NOT NULL DEFAULT 'en',
        role VARCHAR(20) NOT NULL DEFAULT 'company-owner' CHECK (role IN ('admin', 'company-owner', 'manager', 'employee')),
      company_id INTEGER REFERENCES companies(id), -- backward compatibility
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

  await safeQuery(`
    ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'DK'
  `);
  await safeQuery(`
    UPDATE companies
    SET country_code = CASE
      WHEN country_code IS NOT NULL AND LENGTH(TRIM(country_code)) = 2 THEN UPPER(TRIM(country_code))
      WHEN country ILIKE 'denmark' OR country ILIKE 'danmark' THEN 'DK'
      WHEN country ILIKE 'united states' OR country ILIKE 'usa' OR country ILIKE 'us' THEN 'US'
      WHEN country ILIKE 'united kingdom' OR country ILIKE 'uk' THEN 'GB'
      WHEN country ILIKE 'germany' OR country ILIKE 'deutschland' THEN 'DE'
      WHEN country ILIKE 'sweden' OR country ILIKE 'sverige' THEN 'SE'
      WHEN country ILIKE 'norway' OR country ILIKE 'norge' THEN 'NO'
      ELSE 'DK'
    END
    WHERE country_code IS NULL OR LENGTH(TRIM(country_code)) <> 2
  `);
  await safeQuery(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS language_code VARCHAR(10) NOT NULL DEFAULT 'en'
  `);
  await safeQuery(`
    UPDATE users
    SET language_code = 'en'
    WHERE language_code IS NULL OR TRIM(language_code) = ''
  `);

  await safeQuery(`
    ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS reply_to_email VARCHAR(255)
  `);

  await safeQuery(`ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS notification_subject TEXT`);

  await safeQuery(`
    ALTER TABLE companies
    ADD CONSTRAINT fk_companies_owner
    FOREIGN KEY (owner_id) REFERENCES users(id);
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_companies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'admin', 'manager', 'employee')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, company_id)
      );
    `);

    await pool.query(`
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accepted_at TIMESTAMP,
        UNIQUE(company_id, email, status)
      );
    `);
    
    // Some existing DBs may have company_invitations without updated_at.
    // We keep an updated_at trigger for consistency, so ensure the column exists.
    await safeQuery(
      `ALTER TABLE company_invitations
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    );
    
    await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        duration_minutes INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        client_type VARCHAR(20) NOT NULL DEFAULT 'person' CHECK (client_type IN ('person', 'company')),
        name VARCHAR(255) NOT NULL,
        last_name VARCHAR(100),
        company_number VARCHAR(50),
        contact_name VARCHAR(255),
        country VARCHAR(100),
        address TEXT,
        zip_code VARCHAR(20),
        city VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        billing_address TEXT,
        billing_zip_code VARCHAR(20),
        billing_city VARCHAR(100),
        billing_email VARCHAR(255),
        billing_phone VARCHAR(50),
        deleted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add new columns for client type support (safe for existing databases)
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) DEFAULT 'person'`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_number VARCHAR(50)`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20)`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`);

    // Migrate data from old columns to new ones (only if old columns exist and new ones are empty)
    await safeQuery(`
      UPDATE clients
      SET address = COALESCE(address, personal_address),
          zip_code = COALESCE(zip_code, personal_zip_code),
          city = COALESCE(city, personal_city),
          email = COALESCE(email, personal_email),
          phone = COALESCE(phone, personal_phone)
      WHERE address IS NULL OR zip_code IS NULL OR city IS NULL OR email IS NULL OR phone IS NULL
    `);

    // Migrate name data from old schema (first_name for persons, company_name for companies)
    await safeQuery(`
      UPDATE clients
      SET name = CASE
        WHEN client_type = 'company' AND company_name IS NOT NULL THEN company_name
        WHEN client_type = 'person' AND first_name IS NOT NULL THEN first_name
        ELSE name
      END
      WHERE name IS NULL
    `);

    // Add constraint for client_type if it doesn't exist
    await safeQuery(`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check`);
    await safeQuery(`ALTER TABLE clients ADD CONSTRAINT clients_client_type_check CHECK (client_type IN ('person', 'company'))`);

    // Drop old columns that are no longer needed
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS first_name`);
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS company_name`);
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS personal_address`);
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS personal_zip_code`);
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS personal_city`);
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS personal_email`);
    await safeQuery(`ALTER TABLE clients DROP COLUMN IF EXISTS personal_phone`);

    // ============================================
    // Leads (public embeddable form intake)
    // ============================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_forms (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Video guides (Get Started modal - admin-managed)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_guides (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        duration VARCHAR(20) NOT NULL DEFAULT '0:00',
        video_id VARCHAR(100) NOT NULL,
        language_code VARCHAR(10) NOT NULL DEFAULT 'en',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await safeQuery(`ALTER TABLE video_guides ADD COLUMN IF NOT EXISTS language_code VARCHAR(10) NOT NULL DEFAULT 'en'`);
    await safeQuery(`ALTER TABLE video_guides ADD COLUMN IF NOT EXISTS topic VARCHAR(50) NOT NULL DEFAULT 'getting_started'`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost')),
        source VARCHAR(50) NOT NULL DEFAULT 'form',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        country VARCHAR(100),
        address TEXT,
        zip_code VARCHAR(20),
        city VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        message TEXT,
        preferred_date DATE,
        preferred_time TIME,
        notes TEXT,
        meta JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Backward-compatible: ensure new lead fields exist if table already existed.
    await safeQuery(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS country VARCHAR(100)`);
    await safeQuery(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS address TEXT`);
    await safeQuery(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20)`);
    await safeQuery(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
    // Lead → client conversion bookkeeping.
    await safeQuery(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`);
    await safeQuery(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP NULL`);

    // Master on/off switch for the whole leads feature (mirrors invoicing_enabled).
    // Opt-in: defaults to FALSE so the company must activate it in settings
    // before the leads area and public form become usable. Pure UI/route gate —
    // never mutates existing leads or saved form settings.
    await safeQuery(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS leads_enabled BOOLEAN NOT NULL DEFAULT FALSE`);

    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_leads_company_created_at ON leads(company_id, created_at DESC)`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status)`);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        assigned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invoice_id INTEGER,
        title VARCHAR(255) NOT NULL,
        note TEXT,
        scheduled_date VARCHAR(10) NOT NULL,
        scheduled_time_from TIME,
        scheduled_time_to TIME,
        status VARCHAR(50) DEFAULT 'scheduled',
        recurring_job_id INTEGER,
        -- Occurrence index within a subscription (1 = first occurrence, 2 = second, ...)
        recurring_occurrence INTEGER,
        is_generated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Backward-compatible: ensure recurring_occurrence exists if jobs table already existed.
    await safeQuery(
      `ALTER TABLE jobs
       ADD COLUMN IF NOT EXISTS recurring_occurrence INTEGER`
    );

    // Add sort_order field for job ordering within a day
    await safeQuery(
      `ALTER TABLE jobs
       ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`
    );

    // Create index for efficient sorting
    await safeQuery(
      `CREATE INDEX IF NOT EXISTS idx_jobs_sort_order 
       ON jobs(company_id, scheduled_date, assigned_user_id, sort_order)`
    );

    // Route planner: geocode cache (lat/lng) and day-view route order
    await safeQuery(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await safeQuery(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    await safeQuery(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS route_order INTEGER`);

    // Daily route travel totals — persists route order, drive times, and leg minutes per user per day
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_routes (
        id              SERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id         INTEGER NOT NULL,
        scheduled_date  DATE    NOT NULL,
        total_minutes   INTEGER,
        total_km        NUMERIC(8,1),
        job_ids         INTEGER[],
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE (company_id, user_id, scheduled_date)
      )
    `);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_daily_routes_company_date ON daily_routes(company_id, scheduled_date)`);
    await safeQuery(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS leg_minutes REAL[]`);
    await safeQuery(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS total_job_minutes INTEGER`);
    // Ensure job_ids is INTEGER[] (early installs may have created it as JSONB)
    await safeQuery(`
      DO $$ BEGIN
        IF (SELECT data_type FROM information_schema.columns
            WHERE table_name='daily_routes' AND column_name='job_ids') = 'USER-DEFINED'
           OR (SELECT udt_name FROM information_schema.columns
               WHERE table_name='daily_routes' AND column_name='job_ids') = 'jsonb'
        THEN
          ALTER TABLE daily_routes ALTER COLUMN job_ids TYPE INTEGER[]
          USING ARRAY(SELECT jsonb_array_elements_text(job_ids)::integer);
        END IF;
      END $$
    `);
    // Address autocomplete: store verified coordinates on clients
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await safeQuery(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);

    // Backward-compatible: ensure deleted_at exists if clients table already existed.
    await safeQuery(
      `ALTER TABLE clients
       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`
    );

  // Subscriptions / recurring job templates
    await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        assigned_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        note TEXT,
        scheduled_time_from TIME,
        scheduled_time_to TIME,
        recurrence_type VARCHAR(20) NOT NULL DEFAULT 'weekly' CHECK (recurrence_type IN ('weekly', 'monthly')),
        day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- NULL for monthly
        day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31), -- NULL for weekly
        interval_value INTEGER NOT NULL DEFAULT 1, -- Every N weeks/months
        is_active BOOLEAN DEFAULT TRUE,
        starting_date DATE NOT NULL,
        next_occurrence_date DATE NOT NULL,
        last_generated_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

  await safeQuery(`
      ALTER TABLE jobs 
      ADD CONSTRAINT fk_jobs_recurring_job 
      FOREIGN KEY (recurring_job_id) REFERENCES recurring_jobs(id) ON DELETE SET NULL;
    `);

    // Add sort_order to existing recurring_jobs if it doesn't exist
    await safeQuery(
      `ALTER TABLE recurring_jobs
       ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`
    );

    // Add paused_at for subscription pause feature (no future jobs from this date)
    await safeQuery(
      `ALTER TABLE recurring_jobs
       ADD COLUMN IF NOT EXISTS paused_at DATE`
    );

  // Uniquely identify a subscription occurrence per company to prevent duplicate ghosts/materializations.
  await safeQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_jobs_recurring_occurrence
    ON jobs(company_id, recurring_job_id, recurring_occurrence)
    WHERE recurring_job_id IS NOT NULL AND recurring_occurrence IS NOT NULL
  `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_job_services (
        id SERIAL PRIMARY KEY,
        recurring_job_id INTEGER NOT NULL REFERENCES recurring_jobs(id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        custom_price DECIMAL(10,2),
        custom_duration_minutes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(recurring_job_id, service_id)
      );
    `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_services (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      -- service_id is nullable to support ad-hoc job tasks that are not saved in the services catalog
      service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
      custom_title TEXT,
      custom_price DECIMAL(10,2),
      custom_duration_minutes INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, service_id)
    );
  `);

  // Backward-compatible: ensure ad-hoc fields exist if table already existed.
  await safeQuery(`ALTER TABLE job_services ADD COLUMN IF NOT EXISTS custom_title TEXT`);
  await safeQuery(`ALTER TABLE recurring_job_services ADD COLUMN IF NOT EXISTS custom_title TEXT`);
  await safeQuery(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_services'
          AND column_name = 'service_id'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE job_services ALTER COLUMN service_id DROP NOT NULL;
      END IF;
    END $$;
  `);
  await safeQuery(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'recurring_job_services'
          AND column_name = 'service_id'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE recurring_job_services ALTER COLUMN service_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  // --- Service-level status: job_services can be scheduled | completed | cancelled ---
  // Job status is derived: all completed -> job completed; all cancelled -> job cancelled; mix -> sub_completed
  await safeQuery(`
    ALTER TABLE job_services
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
  `);
  await safeQuery(`
    ALTER TABLE job_services
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP
  `);
  await safeQuery(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_services' AND column_name = 'status') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_services_status_check') THEN
          ALTER TABLE job_services ADD CONSTRAINT job_services_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'));
        END IF;
      END IF;
    END $$;
  `);

  // Backfill job_services.status from jobs.status for existing rows (so legacy data is consistent)
  await safeQuery(`
    UPDATE job_services js
    SET status = 'completed', completed_at = COALESCE(j.updated_at, j.created_at)
    FROM jobs j
    WHERE js.job_id = j.id AND j.status = 'completed'
      AND (js.status IS NULL OR js.status = 'scheduled');
  `);
  await safeQuery(`
    UPDATE job_services js
    SET status = 'cancelled', completed_at = NULL
    FROM jobs j
    WHERE js.job_id = j.id AND j.status = 'cancelled'
      AND (js.status IS NULL OR js.status = 'scheduled');
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_notes (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      notification_subject TEXT,
      notification_message TEXT,
      notification_email VARCHAR(255),
      note_content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Invoices
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      invoice_number VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency VARCHAR(3) NOT NULL DEFAULT 'DKK',
      notes TEXT,
      payment_terms TEXT,
      created_by INTEGER REFERENCES users(id),
      sent_at TIMESTAMP,
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, invoice_number)
    );
  `);

  await safeQuery(`ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL`);

  await safeQuery(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS title VARCHAR(50) DEFAULT ''`);
  await safeQuery(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2)`);
  await safeQuery(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_source VARCHAR(50)`);

  await safeQuery(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check`);
  await safeQuery(`ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'credited', 'overpaid'))`);

  await safeQuery(`
    ALTER TABLE jobs
    ADD CONSTRAINT fk_jobs_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_invoice_id ON jobs(invoice_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_transactions (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('charge', 'payment')),
      amount DECIMAL(10,2) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      payment_source VARCHAR(50),
      transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await safeQuery(`CREATE INDEX IF NOT EXISTS idx_invoice_transactions_invoice_id ON invoice_transactions(invoice_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_public_tokens (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
      token VARCHAR(128) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await safeQuery(`CREATE INDEX IF NOT EXISTS idx_invoice_public_tokens_token ON invoice_public_tokens(token);`);

  // Integrations foundation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_registry (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_integrations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL REFERENCES integration_registry(provider) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      secret_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, provider)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_events (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL REFERENCES integration_registry(provider) ON DELETE CASCADE,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      event_type VARCHAR(100) NOT NULL,
      status_from VARCHAR(50),
      status_to VARCHAR(50),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await safeQuery(`CREATE INDEX IF NOT EXISTS idx_company_integrations_company_id ON company_integrations(company_id)`);
  await safeQuery(`CREATE INDEX IF NOT EXISTS idx_integration_events_company_id ON integration_events(company_id, created_at DESC)`);

  await safeQuery(`
    INSERT INTO integration_registry (provider, title, description, capabilities, is_active)
    VALUES (
      'bank_transfer',
      'Bank transfer',
      'Accept invoice payments by manual bank transfer.',
      '["invoice_payment"]'::jsonb,
      TRUE
    )
    ON CONFLICT (provider) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      capabilities = EXCLUDED.capabilities,
      is_active = EXCLUDED.is_active,
      updated_at = CURRENT_TIMESTAMP
  `);

  // Backfill: one payment transaction for invoices that have paid_at/paid_amount but no transactions yet
  await safeQuery(`
    INSERT INTO invoice_transactions (invoice_id, type, amount, description, payment_source, transaction_date)
    SELECT id, 'payment', COALESCE(paid_amount, total), 'Payment', payment_source, COALESCE(paid_at, CURRENT_TIMESTAMP)
    FROM invoices
    WHERE paid_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM invoice_transactions it WHERE it.invoice_id = invoices.id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      -- service_id is nullable to support invoicing ad-hoc job tasks
      service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(10,2) NOT NULL,
      line_total DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(invoice_id, job_id, service_id)
    );
  `);

  await safeQuery(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_items'
          AND column_name = 'service_id'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE invoice_items ALTER COLUMN service_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  // Email templates
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('change_date', 'change_time', 'change_employee', 'cancel_job', 'send_invoice')),
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, template_type)
    );
  `);

  // Work hours
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_company_work_hours (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      monday_hours DECIMAL(3,1) DEFAULT 7.5,
      tuesday_hours DECIMAL(3,1) DEFAULT 7.5,
      wednesday_hours DECIMAL(3,1) DEFAULT 7.5,
      thursday_hours DECIMAL(3,1) DEFAULT 7.5,
      friday_hours DECIMAL(3,1) DEFAULT 7.0,
      saturday_hours DECIMAL(3,1) DEFAULT 0.0,
      sunday_hours DECIMAL(3,1) DEFAULT 0.0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, company_id)
    );
  `);

  // updated_at triggers
  await pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  const tablesWithUpdatedAt = [
    'companies',
    'users',
    'user_companies',
    'company_invitations',
    'clients',
    'services',
    'jobs',
    'recurring_jobs',
    'invoices',
    'integration_registry',
    'company_integrations',
    'email_templates',
    'user_company_work_hours'
  ];

  for (const t of tablesWithUpdatedAt) {
    try {
      await pool.query(`
        CREATE TRIGGER update_${t}_updated_at
        BEFORE UPDATE ON ${t}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      `);
    } catch (_) {
      // trigger already exists
    }
  }

  // Helpful indexes
  await pool.query('CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON company_invitations(token);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jobs_assigned_user_id ON jobs(assigned_user_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recurring_jobs_company_id ON recurring_jobs(company_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_recurring_jobs_client_id ON recurring_jobs(client_id);');

  // Backfill job_services.status from job.status (one-time migration for service-level status)
  await safeQuery(`
    UPDATE job_services js
    SET
      status = CASE
        WHEN j.status = 'completed' THEN 'completed'::varchar
        WHEN j.status = 'cancelled' THEN 'cancelled'::varchar
        ELSE 'scheduled'::varchar
      END,
      completed_at = CASE WHEN j.status = 'completed' THEN COALESCE(j.updated_at, j.created_at) ELSE NULL END
    FROM jobs j
    WHERE js.job_id = j.id
  `);
}

async function resetDatabase() {
  console.log('🗑️  Resetting database (dropping tables)...');

  // Drop in dependency order (safe with CASCADE)
  const tablesToDrop = [
    'integration_events',
    'company_integrations',
    'integration_registry',
    'invoice_public_tokens',
    'invoice_items',
    'invoices',
    'email_templates',
    'company_invitations',
    'user_company_work_hours',
    'recurring_job_services',
    'recurring_jobs',
    'job_logs',
    'job_notes',
    'job_services',
    'jobs',
    'services',
    'clients',
    'user_companies',
    'users',
    'companies'
  ];

  for (const t of tablesToDrop) {
    await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
  }

  await pool.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
  await pool.query('DROP FUNCTION IF EXISTS prevent_remove_last_owner() CASCADE;');
  await pool.query('DROP FUNCTION IF EXISTS prevent_update_last_owner() CASCADE;');
}

async function seedMiniDemo() {
  console.log('🌱 Seeding demo data (small)...');

  const companyCount = await pool.query('SELECT COUNT(*)::int AS n FROM companies;');
  if ((companyCount.rows[0]?.n || 0) > 0) {
    console.log('✅ Seed skipped (companies already exist).');
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  const upsertUser = async (first, last, email, role) => {
    const res = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role
       RETURNING id`,
      [first, last, email, passwordHash, role]
    );
    return res.rows[0].id;
  };

  const adminId = await upsertUser('Admin', 'User', 'admin@vevago.com', 'admin');
  const ownerId = await upsertUser('John', 'Doe', 'user@vevago.com', 'company-owner');
  const managerId = await upsertUser('Sarah', 'Wilson', 'sarah.wilson@vevago.com', 'manager');
  const employeeId = await upsertUser('Lisa', 'Garcia', 'employee@vevago.com', 'employee');

  const companyName = 'Demo Company';
  const companySlug = slugify(companyName);

  const companyRes = await pool.query(
    `INSERT INTO companies (name, slug, owner_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [companyName, companySlug, ownerId]
  );
  const companyId = companyRes.rows[0].id;

  // Set default active company for demo logins (back-compat field)
  await pool.query('UPDATE users SET company_id = $1 WHERE id = ANY($2::int[])', [
    companyId,
    [adminId, ownerId, managerId, employeeId]
  ]);

  // Link users to company
  await safeQuery(
    'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING',
    [adminId, companyId, 'admin']
  );
  await safeQuery(
    'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING',
    [ownerId, companyId, 'owner']
  );
  await safeQuery(
    'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING',
    [managerId, companyId, 'manager']
  );
  await safeQuery(
    'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO NOTHING',
    [employeeId, companyId, 'employee']
  );

  const clients = await pool.query(
    `INSERT INTO clients (company_id, client_type, name, last_name, email, phone, address, city, zip_code, country)
     VALUES
      ($1,'person','Zoe','Johanson','zoe@example.com','+45 1111 1111','Main St 1','Copenhagen','1000','Denmark'),
      ($1,'person','Emma','Nielsen','emma@example.com','+45 2222 2222','Park Ave 12','Copenhagen','2100','Denmark'),
      ($1,'company','TechCorp ApS',NULL,'contact@techcorp.dk','+45 3333 3333','Business Blvd 5','Aarhus','8000','Denmark'),
      ($1,'company','Clean Solutions Ltd',NULL,'info@cleansolutions.dk','+45 4444 4444','Industrial Ave 10','Copenhagen','2200','Denmark')
     RETURNING id, name, last_name, client_type`,
    [companyId]
  );
  const [clientA, clientB, clientC, clientD] = clients.rows;

  const services = await pool.query(
    `INSERT INTO services (company_id, title, price, duration_minutes)
     VALUES
      ($1,'Window cleaning', 199.00, 60),
      ($1,'Garden maintenance', 299.00, 90),
      ($1,'Deep cleaning', 499.00, 120)
     RETURNING id, title, price, duration_minutes`,
    [companyId]
  );
  const [svc1, svc2, svc3] = services.rows;

  // One subscription (recurring job) for testing subscriptions UI/APIs
  const today = new Date();
  const yyyyMmDd = (d) => d.toISOString().slice(0, 10);
  const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const nextDate = new Date(startDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 14);

  const subscription = await pool.query(
          `INSERT INTO recurring_jobs (
            company_id, client_id, assigned_user_id, title, note,
            scheduled_time_from, scheduled_time_to, day_of_week, interval_weeks,
            is_active, starting_date, next_occurrence_date
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id`,
    [
      companyId,
      clientA.id,
      employeeId,
      'Bi-weekly window cleaning',
      'Seeded subscription for testing',
      '09:00',
      '10:00',
      2,
      2,
      true,
      yyyyMmDd(startDate),
      yyyyMmDd(nextDate)
    ]
  );
  const subscriptionId = subscription.rows[0].id;

        await pool.query(
    `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
     VALUES ($1,$2,$3,$4)`,
    [subscriptionId, svc1.id, 199.0, 60]
  );

  // Jobs: 3 completed (invoiceable), 1 completed already invoiced, 1 scheduled
  const jobs = await pool.query(
    `INSERT INTO jobs (company_id, client_id, assigned_user_id, title, note, scheduled_date, scheduled_time_from, scheduled_time_to, status, recurring_job_id, is_generated)
     VALUES
      ($1,$2,$3,'Window cleaning - Apartment','Please ring bell',$6,'09:00','10:00','completed', NULL, false),
      ($1,$4,$3,'Garden maintenance','Gate code 1234',$7,'12:00','13:30','completed', NULL, false),
      ($1,$5,$3,'Deep cleaning','Bring eco products',$8,'14:00','16:00','completed', NULL, false),
      ($1,$2,$3,'Window cleaning (already invoiced)','Old invoice test',$9,'10:00','11:00','completed', NULL, false),
      ($1,$2,$3,'Scheduled follow-up','Confirm by SMS',$10,'09:00','10:00','scheduled', $11, true)
     RETURNING id, client_id, title, status`,
    [
      companyId,
      clientA.id,
      employeeId,
      clientB.id,
      clientC.id,
      yyyyMmDd(new Date(Date.now() - 1 * 86400000)),
      yyyyMmDd(new Date(Date.now() - 2 * 86400000)),
      yyyyMmDd(new Date(Date.now() - 3 * 86400000)),
      yyyyMmDd(new Date(Date.now() - 4 * 86400000)),
      yyyyMmDd(new Date(Date.now() + 3 * 86400000)),
      subscriptionId
    ]
  );

  const [job1, job2, job3, jobInvoiced] = jobs.rows;

  // Assign services to jobs
  await pool.query(
    'INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1,$2,$3,$4)',
    [job1.id, svc1.id, 144.0, 45]
  );
  await pool.query(
    'INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1,$2,$3,$4)',
    [job2.id, svc2.id, 299.0, 90]
  );
  await pool.query(
    'INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1,$2,$3,$4)',
    [job3.id, svc3.id, 499.0, 120]
  );
          await pool.query(
    'INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes) VALUES ($1,$2,$3,$4)',
    [jobInvoiced.id, svc1.id, 199.0, 60]
  );

  // Create one draft invoice + connect one job to it (to test "can't invoice twice")
  const inv = await pool.query(
    `INSERT INTO invoices (company_id, client_id, invoice_number, issue_date, due_date, subtotal, tax_rate, tax_amount, total, currency, notes, payment_terms, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      companyId,
      clientA.id,
      'INV-DEMO-0001',
      yyyyMmDd(new Date(Date.now() - 4 * 86400000)),
      yyyyMmDd(new Date(Date.now() + 26 * 86400000)),
      199.0,
      25,
      49.75,
      248.75,
      'DKK',
      'Seeded invoice for testing',
      'Payment due within 30 days',
      ownerId
    ]
  );
  const invoiceId = inv.rows[0].id;

                await pool.query(
    `INSERT INTO invoice_items (invoice_id, job_id, service_id, description, quantity, unit_price, line_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [invoiceId, jobInvoiced.id, svc1.id, 'Window cleaning', 1, 199.0, 199.0]
  );
  await pool.query('UPDATE jobs SET invoice_id = $1 WHERE id = $2', [invoiceId, jobInvoiced.id]);

  // Ensure basic templates exist
  const templateTypes = ['change_date', 'change_time', 'change_employee', 'cancel_job', 'send_invoice'];
  for (const t of templateTypes) {
    await safeQuery(
      `INSERT INTO email_templates (company_id, template_type, subject, message)
       VALUES ($1,$2,'','')
       ON CONFLICT (company_id, template_type) DO NOTHING`,
      [companyId, t]
    );
  }

  console.log('✅ Demo seed complete!');
  console.log('🏢 Company slug:', companySlug);
  console.log('👤 Login users (password: password123):');
  console.log('   - admin@vevago.com (admin)');
  console.log('   - user@vevago.com (company-owner)');
  console.log('   - sarah.wilson@vevago.com (manager)');
  console.log('   - employee@vevago.com (employee)');
  console.log('🔄 Subscriptions: 1 recurring job seeded (bi-weekly).');
}

async function main() {
  try {
    console.log('🔧 PathPilo database setup');
    console.log(`   reset: ${RESET ? 'yes' : 'no'}`);
    console.log(`   seed:  ${SEED ? 'yes' : 'no'}`);

    if (RESET) await resetDatabase();
    await createSchema();
    if (SEED) await seedMiniDemo();

    console.log('✅ Done.');
  } catch (e) {
    console.error('❌ Database setup failed:', e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();


