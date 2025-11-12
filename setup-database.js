const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'vevago_dev',
  user: 'postgres',
  password: '!Pvy29fxg' // Update this if your password is different
});

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database...');
    
    // Drop existing tables
    console.log('🗑️  Dropping existing tables...');
    await pool.query('DROP TABLE IF EXISTS recurring_job_services CASCADE;');
    await pool.query('DROP TABLE IF EXISTS recurring_jobs CASCADE;');
    await pool.query('DROP TABLE IF EXISTS job_notes CASCADE;');
    await pool.query('DROP TABLE IF EXISTS job_services CASCADE;');
    await pool.query('DROP TABLE IF EXISTS jobs CASCADE;');
    await pool.query('DROP TABLE IF EXISTS services CASCADE;');
    await pool.query('DROP TABLE IF EXISTS clients CASCADE;');
    await pool.query('DROP TABLE IF EXISTS users CASCADE;');
    await pool.query('DROP TABLE IF EXISTS companies CASCADE;');
    await pool.query('DROP TABLE IF EXISTS user_company_work_hours CASCADE;');
    
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

    // Create users table
    console.log('📝 Creating users table...');
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'company-owner' CHECK (role IN ('admin', 'company-owner', 'manager', 'employee')),
        company_id INTEGER REFERENCES companies(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add foreign key constraint to companies table after users table exists
    console.log('🔗 Adding foreign key constraints...');
    await pool.query(`
      ALTER TABLE companies 
      ADD CONSTRAINT fk_companies_owner 
      FOREIGN KEY (owner_id) REFERENCES users(id);
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
    console.log('     - owner_id (references users), created_at, updated_at');
    console.log('   Users table:');
    console.log('     - id, first_name, last_name, email');
    console.log('     - password_hash, role (admin/company-owner)');
    console.log('     - company_id (references companies)');
    console.log('     - created_at, updated_at');
    console.log('   User Company Work Hours table:');
    console.log('     - id, user_id (references users), company_id (references companies)');
    console.log('     - monday_hours, tuesday_hours, wednesday_hours, thursday_hours');
    console.log('     - friday_hours, saturday_hours, sunday_hours');
    console.log('     - created_at, updated_at');
    
    // Add demo users for testing
    console.log('👥 Adding demo users...');
    const bcrypt = require('bcryptjs');
    
    // Create demo company
    console.log('🏢 Creating demo company...');
    const companyResult = await pool.query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id',
      ['Demo Company']
    );
    const companyId = companyResult.rows[0].id;

    const demoUsers = [
      { first_name: 'Admin', last_name: 'User', email: 'admin@vevago.com', password: 'password123', role: 'admin', company_id: null },
      { first_name: 'John', last_name: 'Doe', email: 'user@vevago.com', password: 'password123', role: 'company-owner', company_id: companyId }
    ];
    
    for (const demoUser of demoUsers) {
      try {
        const passwordHash = await bcrypt.hash(demoUser.password, 10);
        await pool.query(
          'INSERT INTO users (first_name, last_name, email, password_hash, role, company_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [demoUser.first_name, demoUser.last_name, demoUser.email, passwordHash, demoUser.role, demoUser.company_id]
        );
        console.log(`   ✅ Added demo user: ${demoUser.email}`);
      } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`   ⚠️  Demo user already exists: ${demoUser.email}`);
        } else {
          console.log(`   ❌ Failed to add demo user ${demoUser.email}:`, error.message);
        }
      }
    }
    
    // Test the table
    const result = await pool.query('SELECT COUNT(*) FROM users;');
    console.log(`📈 Total users in database: ${result.rows[0].count}`);
    
    // Update company with owner
    await pool.query(
      'UPDATE companies SET owner_id = $1 WHERE id = $2',
      [2, companyId] // Assuming the company owner is the second user
    );

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
      { first_name: 'Sarah', last_name: 'Wilson', email: 'sarah.wilson@vevago.com', password: 'password123', role: 'manager', company_id: companyId },
      { first_name: 'Mike', last_name: 'Brown', email: 'mike.brown@vevago.com', password: 'password123', role: 'employee', company_id: companyId },
      { first_name: 'Lisa', last_name: 'Garcia', email: 'lisa.garcia@vevago.com', password: 'password123', role: 'employee', company_id: companyId }
    ];

    for (const member of teamMembers) {
      try {
        const passwordHash = await bcrypt.hash(member.password, 10);
        await pool.query(
          'INSERT INTO users (first_name, last_name, email, password_hash, role, company_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [member.first_name, member.last_name, member.email, passwordHash, member.role, member.company_id]
        );
        console.log(`   ✅ Added team member: ${member.email} (${member.role})`);
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
