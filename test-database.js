const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'vevago_dev',
  password: 'password123',
  port: 5432,
});

async function testDatabase() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to database');
    
    // Check if work_hours table exists
    console.log('🔍 Checking if work_hours table exists...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'work_hours'
      );
    `);
    
    console.log('work_hours table exists:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      // Check table structure
      console.log('🔍 Checking work_hours table structure...');
      const structure = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'work_hours' 
        ORDER BY ordinal_position;
      `);
      
      console.log('Table structure:');
      structure.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
      
      // Check if there are any companies
      console.log('🔍 Checking companies...');
      const companies = await client.query('SELECT id, name FROM companies LIMIT 5;');
      console.log('Companies:', companies.rows);
      
    } else {
      console.log('❌ work_hours table does not exist!');
      
      // List all tables
      console.log('🔍 Listing all tables...');
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      
      console.log('Existing tables:');
      tables.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testDatabase();




