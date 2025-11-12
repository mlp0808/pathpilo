const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres', // Replace with your PostgreSQL username
  host: 'localhost',
  database: 'vevago_dev',
  password: 'password', // Replace with your PostgreSQL password
  port: 5432,
});

async function checkWorkHoursTable() {
  try {
    console.log('🔍 Checking if user_work_hours table exists...');
    
    const res = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE  schemaname = 'public'
        AND    tablename  = 'user_work_hours'
      );
    `);
    
    const tableExists = res.rows[0].exists;
    
    if (tableExists) {
      console.log('✅ The "user_work_hours" table exists.');
      
      // Get table structure
      const columnsRes = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_work_hours'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Table structure:');
      columnsRes.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
      
      // Check if there are any records
      const countRes = await pool.query('SELECT COUNT(*) FROM user_work_hours;');
      console.log(`\n📊 Records in table: ${countRes.rows[0].count}`);
      
    } else {
      console.log('❌ The "user_work_hours" table DOES NOT exist.');
      console.log('\n🔧 To fix this, run: node setup-database.js');
    }
    
    // Also check all tables
    const allTablesRes = await pool.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
    `);
    
    console.log('\n📁 All tables in database:');
    allTablesRes.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

  } catch (err) {
    console.error('❌ Error checking database:', err.message);
  } finally {
    await pool.end();
  }
}

checkWorkHoursTable();




