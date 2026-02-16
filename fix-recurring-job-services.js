require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
});

async function fixRecurringJobServices() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('🔧 Adding custom_title column to recurring_job_services...');
    await client.query(`
      ALTER TABLE recurring_job_services 
      ADD COLUMN IF NOT EXISTS custom_title TEXT
    `);
    
    console.log('🔧 Making service_id nullable in recurring_job_services...');
    await client.query(`
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
    
    // Note: PostgreSQL's UNIQUE constraint already allows multiple NULL values,
    // so the existing UNIQUE(recurring_job_id, service_id) constraint will work fine
    // with nullable service_id
    
    await client.query('COMMIT');
    console.log('✅ Successfully fixed recurring_job_services table!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing recurring_job_services:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixRecurringJobServices()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
