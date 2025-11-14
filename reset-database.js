require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_',
  user: process.env.DB_USER || 'vevago.app',
  password: process.env.DB_PASSWORD || 'E9n!GdczqusW@43i'
});

async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🗑️  Dropping all tables...');
    
    // Drop all tables in correct order (respecting foreign keys)
    await client.query('DROP TABLE IF EXISTS company_invitations CASCADE;');
    await client.query('DROP TABLE IF EXISTS user_company_work_hours CASCADE;');
    await client.query('DROP TABLE IF EXISTS user_companies CASCADE;');
    await client.query('DROP TABLE IF EXISTS job_notes CASCADE;');
    await client.query('DROP TABLE IF EXISTS jobs CASCADE;');
    await client.query('DROP TABLE IF EXISTS recurring_jobs CASCADE;');
    await client.query('DROP TABLE IF EXISTS clients CASCADE;');
    await client.query('DROP TABLE IF EXISTS services CASCADE;');
    await client.query('DROP TABLE IF EXISTS companies CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    
    // Drop functions and triggers
    await client.query('DROP FUNCTION IF EXISTS prevent_remove_last_owner() CASCADE;');
    await client.query('DROP FUNCTION IF EXISTS prevent_update_last_owner() CASCADE;');
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;');
    
    console.log('✅ All tables dropped');
    
    await client.query('COMMIT');
    
    console.log('🔄 Now running setup-database.js to create fresh schema...');
    console.log('   Run: node setup-database.js');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database reset failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase().catch(console.error);

