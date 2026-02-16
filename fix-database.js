require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vevago_local',
  user: process.env.DB_USER || 'vevago_local',
  password: process.env.DB_PASSWORD || 'password123',
});

async function fixDatabase() {
  try {
    console.log('🔧 Fixing database schema...');

    // Add is_active column to user_companies table if it doesn't exist
    console.log('Adding is_active column to user_companies...');
    await pool.query(`
      ALTER TABLE user_companies
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
    `);

    // Set all existing user_companies to active
    console.log('Setting existing user_company records to active...');
    await pool.query(`
      UPDATE user_companies
      SET is_active = TRUE
      WHERE is_active IS NULL
    `);

    console.log('✅ Database schema fixed successfully!');
    console.log('🎉 You can now login to the web app!');

  } catch (error) {
    console.error('❌ Error fixing database:', error);
  } finally {
    await pool.end();
  }
}

fixDatabase();
