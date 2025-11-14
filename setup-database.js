require('dotenv').config();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_',
  user: process.env.DB_USER || 'vevago.app',
  password: process.env.DB_PASSWORD || 'E9n!GdczqusW@43i'
});

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database...');
    
    // Drop existing tables
    console.log('🗑️  Dropping existing tables...');
    await pool.query('DROP TABLE IF EXISTS company_invitations CASCADE;');
    await pool.query('DROP TABLE IF EXISTS user_company_work_hours CASCADE;');
    await pool.query('DROP TABLE IF EXISTS user_companies CASCADE;');
    await pool.query('DROP TABLE IF EXISTS recurring_job_services CASCADE;');
    await pool.query('DROP TABLE IF EXISTS recurring_jobs CASCADE;');
    await pool.query('DROP TABLE IF EXISTS job_notes CASCADE;');
    await pool.query('DROP TABLE IF EXISTS job_services CASCADE;');
    await pool.query('DROP TABLE IF EXISTS jobs CASCADE;');
    await pool.query('DROP TABLE IF EXISTS services CASCADE;');
    await pool.query('DROP TABLE IF EXISTS clients CASCADE;');
    await pool.query('DROP TABLE IF EXISTS users CASCADE;');
    await pool.query('DROP TABLE IF EXISTS companies CASCADE;');
    
    // Drop functions and triggers
    await pool.query('DROP FUNCTION IF EXISTS prevent_remove_last_owner() CASCADE;');
    await pool.query('DROP FUNCTION IF EXISTS prevent_update_last_owner() CASCADE;');
    await pool.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
    
    // Create companies table first (without foreign key to users)
    console.log('📝 Creating companies table...');
    await pool.query(`
      CREATE TABLE companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        country VARCHAR(100),
        cvr_number VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        zip_code VARCHAR(20),
        owner_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create users table (no company_id - will use user_companies junction table)
    console.log('📝 Creating users table...');
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'company-owner' CHECK (role IN ('admin', 'company-owner', 'manager', 'employee')),
        company_id INTEGER REFERENCES companies(id), -- Deprecated, kept for backward compatibility
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create user_companies junction table (many-to-many relationship)
    console.log('📝 Creating user_companies table...');
    await pool.query(`
      CREATE TABLE user_companies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'admin', 'manager', 'employee')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, company_id)
      );
    `);

    // Add foreign key constraint to companies table after users table exists
    console.log('🔗 Adding foreign key constraints...');
    await pool.query(`
      ALTER TABLE companies 
      ADD CONSTRAINT fk_companies_owner 
      FOREIGN KEY (owner_id) REFERENCES users(id);
    `);
    
    // Make owner_id required (NOT NULL)
    await pool.query(`
      ALTER TABLE companies 
      ALTER COLUMN owner_id SET NOT NULL;
    `);
    
    // Create company_invitations table
    console.log('📝 Creating company_invitations table...');
    await pool.query(`
      CREATE TABLE company_invitations (
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
        UNIQUE(company_id, email, status)
      );
    `);
    
    // Create indexes for performance
    console.log('📝 Creating indexes...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_companies_role ON user_companies(role);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON company_invitations(token);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations(email);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_company_invitations_status ON company_invitations(status);');
    
    // Create function to update updated_at timestamp
    console.log('📝 Creating update_updated_at_column function...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Create triggers for updated_at
    await pool.query(`
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    await pool.query(`
      CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    await pool.query(`
      CREATE TRIGGER update_user_companies_updated_at BEFORE UPDATE ON user_companies
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    
    // Create functions to prevent removing the last owner
    console.log('📝 Creating owner protection functions...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION prevent_remove_last_owner()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.role = 'owner' THEN
          IF (SELECT COUNT(*) FROM user_companies WHERE company_id = OLD.company_id AND role = 'owner') <= 1 THEN
            RAISE EXCEPTION 'Cannot remove the last owner from a company. Company must always have an owner.';
          END IF;
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await pool.query(`
      CREATE OR REPLACE FUNCTION prevent_update_last_owner()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
          IF (SELECT COUNT(*) FROM user_companies WHERE company_id = NEW.company_id AND role = 'owner') <= 1 THEN
            RAISE EXCEPTION 'Cannot change the last owner to a different role. Company must always have an owner.';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Create triggers to enforce owner requirement
    await pool.query(`
      DROP TRIGGER IF EXISTS check_last_owner_before_delete ON user_companies;
      CREATE TRIGGER check_last_owner_before_delete
        BEFORE DELETE ON user_companies
        FOR EACH ROW
        EXECUTE FUNCTION prevent_remove_last_owner();
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS check_last_owner_before_update ON user_companies;
      CREATE TRIGGER check_last_owner_before_update
        BEFORE UPDATE ON user_companies
        FOR EACH ROW
        EXECUTE FUNCTION prevent_update_last_owner();
    `);

    // Create services table
    console.log('📝 Creating services table...');
    await pool.query(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        duration_minutes INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create clients table
    console.log('📝 Creating clients table...');
    await pool.query(`
      CREATE TABLE clients (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        country VARCHAR(100),
        -- Personal info
        personal_address TEXT,
        personal_zip_code VARCHAR(20),
        personal_city VARCHAR(100),
        personal_email VARCHAR(255),
        personal_phone VARCHAR(50),
        -- Billing info (optional - if null, use personal info)
        billing_address TEXT,
        billing_zip_code VARCHAR(20),
        billing_city VARCHAR(100),
        billing_email VARCHAR(255),
        billing_phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create jobs table
    console.log('📝 Creating jobs table...');
    await pool.query(`
      CREATE TABLE jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        assigned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        note TEXT,
        scheduled_date VARCHAR(10) NOT NULL,
        scheduled_time_from TIME,
        scheduled_time_to TIME,
        status VARCHAR(50) DEFAULT 'scheduled',
        recurring_job_id INTEGER,
        is_generated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create recurring_jobs table for recurring job templates
    console.log('📝 Creating recurring_jobs table...');
    await pool.query(`
      CREATE TABLE recurring_jobs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        assigned_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        note TEXT,
        scheduled_time_from TIME,
        scheduled_time_to TIME,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        interval_weeks INTEGER NOT NULL DEFAULT 2,
        is_active BOOLEAN DEFAULT TRUE,
        starting_date DATE NOT NULL,
        next_occurrence_date DATE NOT NULL,
        last_generated_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add foreign key constraint for recurring_job_id
    console.log('🔗 Adding recurring_job foreign key constraint...');
    await pool.query(`
      ALTER TABLE jobs 
      ADD CONSTRAINT fk_jobs_recurring_job 
      FOREIGN KEY (recurring_job_id) REFERENCES recurring_jobs(id) ON DELETE SET NULL;
    `);

    // Create recurring_job_services table
    console.log('📝 Creating recurring_job_services table...');
    await pool.query(`
      CREATE TABLE recurring_job_services (
        id SERIAL PRIMARY KEY,
        recurring_job_id INTEGER NOT NULL REFERENCES recurring_jobs(id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        custom_price DECIMAL(10,2),
        custom_duration_minutes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(recurring_job_id, service_id)
      );
    `);

  // Create job_services table (many-to-many relationship between jobs and services)
  console.log('📝 Creating job_services table...');
  await pool.query(`
    CREATE TABLE job_services (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      custom_price DECIMAL(10,2),
      custom_duration_minutes INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, service_id)
    );
  `);

  // Create job_notes table for multiple notes per job
  console.log('📝 Creating job_notes table...');
  await pool.query(`
    CREATE TABLE job_notes (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create user_company_work_hours table
  console.log('📝 Creating user_company_work_hours table...');
  await pool.query(`
    CREATE TABLE user_company_work_hours (
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

    
    console.log('✅ Database setup complete!');
    console.log('📊 Tables created:');
    console.log('   Companies table:');
    console.log('     - id, name, cvr_number, address, zip_code, city');
    console.log('     - owner_id (references users, NOT NULL), created_at, updated_at');
    console.log('   Users table:');
    console.log('     - id, first_name, last_name, email');
    console.log('     - password_hash, role (admin/company-owner/manager/employee)');
    console.log('     - company_id (deprecated, kept for backward compatibility)');
    console.log('     - created_at, updated_at');
    console.log('   User Companies table (many-to-many):');
    console.log('     - id, user_id, company_id, role (owner/admin/manager/employee)');
    console.log('     - created_at, updated_at');
    console.log('   Company Invitations table:');
    console.log('     - id, company_id, invited_by_user_id, email, role, token');
    console.log('     - status, expires_at, created_at, accepted_at');
    console.log('   User Company Work Hours table:');
    console.log('     - id, user_id (references users), company_id (references companies)');
    console.log('     - monday_hours, tuesday_hours, wednesday_hours, thursday_hours');
    console.log('     - friday_hours, saturday_hours, sunday_hours');
    console.log('     - created_at, updated_at');
    
    // Add demo users for testing
    console.log('👥 Adding demo users...');
    const bcrypt = require('bcryptjs');
    
    // Create admin user first (no company)
    console.log('👤 Creating admin user...');
    const adminPasswordHash = await bcrypt.hash('password123', 10);
    const adminResult = await pool.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['Admin', 'User', 'admin@vevago.com', adminPasswordHash, 'admin']
    );
    const adminId = adminResult.rows[0].id;
    console.log('   ✅ Added admin user: admin@vevago.com');
    
    // Create company owner user
    console.log('👤 Creating company owner user...');
    const ownerPasswordHash = await bcrypt.hash('password123', 10);
    const ownerResult = await pool.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['John', 'Doe', 'user@vevago.com', ownerPasswordHash, 'company-owner']
    );
    const ownerId = ownerResult.rows[0].id;
    console.log('   ✅ Added company owner: user@vevago.com');
    
    // Create demo company with owner
    console.log('🏢 Creating demo company...');
    const companyResult = await pool.query(
      'INSERT INTO companies (name, owner_id) VALUES ($1, $2) RETURNING id',
      ['Demo Company', ownerId]
    );
    const companyId = companyResult.rows[0].id;
    console.log('   ✅ Created demo company');
    
    // Link owner to company via user_companies
    await pool.query(
      'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
      [ownerId, companyId, 'owner']
    );
    console.log('   ✅ Linked owner to company');
    
    // Also update users.company_id for backward compatibility
    await pool.query(
      'UPDATE users SET company_id = $1 WHERE id = $2',
      [companyId, ownerId]
    );
    
    // Test the tables
    const userCount = await pool.query('SELECT COUNT(*) FROM users;');
    const companyCount = await pool.query('SELECT COUNT(*) FROM companies;');
    const userCompanyCount = await pool.query('SELECT COUNT(*) FROM user_companies;');
    console.log(`📈 Total users in database: ${userCount.rows[0].count}`);
    console.log(`📈 Total companies in database: ${companyCount.rows[0].count}`);
    console.log(`📈 Total user-company links: ${userCompanyCount.rows[0].count}`);

    // Add demo services for the company
    console.log('🔧 Adding demo services...');
    const demoServices = [
      { title: 'Window Cleaning', price: 150.00, duration_minutes: 60 },
      { title: 'Deep Window Cleaning', price: 250.00, duration_minutes: 120 },
      { title: 'Gutter Cleaning', price: 200.00, duration_minutes: 90 },
      { title: 'Pressure Washing', price: 300.00, duration_minutes: 180 },
      { title: 'Roof Cleaning', price: 400.00, duration_minutes: 240 },
      { title: 'Solar Panel Cleaning', price: 180.00, duration_minutes: 75 },
      { title: 'Exterior House Washing', price: 350.00, duration_minutes: 150 },
      { title: 'Driveway Cleaning', price: 120.00, duration_minutes: 45 }
    ];

    for (const service of demoServices) {
      try {
        await pool.query(
          'INSERT INTO services (company_id, title, price, duration_minutes) VALUES ($1, $2, $3, $4)',
          [companyId, service.title, service.price, service.duration_minutes]
        );
        console.log(`   ✅ Added service: ${service.title}`);
      } catch (error) {
        console.log(`   ❌ Failed to add service ${service.title}:`, error.message);
      }
    }

    // Add demo clients
    console.log('👥 Adding demo clients...');
    const demoClients = [
      {
        first_name: 'Alice',
        last_name: 'Johnson',
        country: 'Denmark',
        personal_address: 'Københavnsvej 123',
        personal_zip_code: '2100',
        personal_city: 'København',
        personal_email: 'alice.johnson@email.com',
        personal_phone: '+45 1234 5678',
        billing_address: null,
        billing_zip_code: null,
        billing_city: null,
        billing_email: null,
        billing_phone: null
      },
      {
        first_name: 'Bob',
        last_name: 'Andersen',
        country: 'Denmark',
        personal_address: 'Aarhusvej 456',
        personal_zip_code: '8000',
        personal_city: 'Aarhus',
        personal_email: 'bob.andersen@email.com',
        personal_phone: '+45 8765 4321',
        billing_address: 'Aarhusvej 456',
        billing_zip_code: '8000',
        billing_city: 'Aarhus',
        billing_email: 'bob.andersen@email.com',
        billing_phone: '+45 8765 4321'
      },
      {
        first_name: 'Claire',
        last_name: 'Nielsen',
        country: 'Denmark',
        personal_address: 'Odensevej 789',
        personal_zip_code: '5000',
        personal_city: 'Odense',
        personal_email: 'claire.nielsen@email.com',
        personal_phone: '+45 2468 1357',
        billing_address: 'Odensevej 789',
        billing_zip_code: '5000',
        billing_city: 'Odense',
        billing_email: 'billing@claire-company.dk',
        billing_phone: '+45 2468 1358'
      },
      {
        first_name: 'David',
        last_name: 'Hansen',
        country: 'Denmark',
        personal_address: 'Aalborgvej 321',
        personal_zip_code: '9000',
        personal_city: 'Aalborg',
        personal_email: 'david.hansen@email.com',
        personal_phone: '+45 3691 2580',
        billing_address: null,
        billing_zip_code: null,
        billing_city: null,
        billing_email: null,
        billing_phone: null
      },
      {
        first_name: 'Eva',
        last_name: 'Pedersen',
        country: 'Denmark',
        personal_address: 'Esbjergvej 654',
        personal_zip_code: '6700',
        personal_city: 'Esbjerg',
        personal_email: 'eva.pedersen@email.com',
        personal_phone: '+45 4815 9263',
        billing_address: 'Esbjergvej 654',
        billing_zip_code: '6700',
        billing_city: 'Esbjerg',
        billing_email: 'eva.pedersen@email.com',
        billing_phone: '+45 4815 9263'
      }
    ];

    for (const client of demoClients) {
      try {
        await pool.query(
          `INSERT INTO clients (
            company_id, first_name, last_name, country,
            personal_address, personal_zip_code, personal_city, personal_email, personal_phone,
            billing_address, billing_zip_code, billing_city, billing_email, billing_phone
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            companyId, client.first_name, client.last_name, client.country,
            client.personal_address, client.personal_zip_code, client.personal_city, 
            client.personal_email, client.personal_phone,
            client.billing_address, client.billing_zip_code, client.billing_city,
            client.billing_email, client.billing_phone
          ]
        );
        console.log(`   ✅ Added client: ${client.first_name} ${client.last_name}`);
      } catch (error) {
        console.log(`   ❌ Failed to add client ${client.first_name} ${client.last_name}:`, error.message);
      }
    }

    // Add additional team members
    console.log('👥 Adding demo team members...');
    const teamMembers = [
      { first_name: 'Sarah', last_name: 'Wilson', email: 'sarah.wilson@vevago.com', password: 'password123', role: 'manager', companyRole: 'manager' },
      { first_name: 'Mike', last_name: 'Brown', email: 'mike.brown@vevago.com', password: 'password123', role: 'employee', companyRole: 'employee' },
      { first_name: 'Lisa', last_name: 'Garcia', email: 'lisa.garcia@vevago.com', password: 'password123', role: 'employee', companyRole: 'employee' }
    ];

    for (const member of teamMembers) {
      try {
        const passwordHash = await bcrypt.hash(member.password, 10);
        // Create user
        const userResult = await pool.query(
          'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [member.first_name, member.last_name, member.email, passwordHash, member.role]
        );
        const userId = userResult.rows[0].id;
        
        // Link user to company via user_companies
        await pool.query(
          'INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3)',
          [userId, companyId, member.companyRole]
        );
        
        // Also update users.company_id for backward compatibility
        await pool.query(
          'UPDATE users SET company_id = $1 WHERE id = $2',
          [companyId, userId]
        );
        
        console.log(`   ✅ Added team member: ${member.email} (${member.companyRole})`);
      } catch (error) {
        if (error.code === '23505') {
          console.log(`   ⚠️  Team member already exists: ${member.email}`);
        } else {
          console.log(`   ❌ Failed to add team member ${member.email}:`, error.message);
        }
      }
    }

    console.log('\n🔑 Demo Login Credentials:');
    console.log('   Admin (can access /admin/users): admin@vevago.com / password123');
    console.log('   Company Owner: user@vevago.com / password123');
    console.log('   Manager: sarah.wilson@vevago.com / password123');
    console.log('   Employee: mike.brown@vevago.com / password123');
    console.log('   Employee: lisa.garcia@vevago.com / password123');
    console.log('\n📊 Demo Data Summary:');
    console.log(`   - 8 services (Window Cleaning, Deep Cleaning, etc.)`);
    console.log(`   - 5 clients (Alice, Bob, Claire, David, Eva)`);
    console.log(`   - 5 users (1 admin, 1 owner, 1 manager, 2 employees)`);
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.log('\n🔍 Troubleshooting tips:');
    console.log('1. Make sure PostgreSQL is running');
    console.log('2. Check if the password in this script matches your PostgreSQL password');
    console.log('3. Make sure the database "vevago_dev" exists');
    console.log('\nTo create the database, run:');
    console.log('CREATE DATABASE vevago_dev;');
  } finally {
    await pool.end();
  }
}

setupDatabase();
