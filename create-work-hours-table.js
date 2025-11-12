const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres', // Replace with your PostgreSQL username
  host: 'localhost',
  database: 'vevago_dev',
  password: 'password', // Replace with your PostgreSQL password
  port: 5432,
});

async function createWorkHoursTable() {
  try {
    console.log('🔧 Creating user_work_hours table...');
    
    // First check if table exists
    const checkRes = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE  schemaname = 'public'
        AND    tablename  = 'user_work_hours'
      );
    `);
    
    if (checkRes.rows[0].exists) {
      console.log('⚠️  Table already exists. Dropping and recreating...');
      await pool.query('DROP TABLE IF EXISTS user_work_hours CASCADE;');
    }
    
    // Create the table
    await pool.query(`
      CREATE TABLE user_work_hours (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, etc.
        start_time TIME,
        end_time TIME,
        is_off BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, day_of_week)
      );
    `);
    
    console.log('✅ user_work_hours table created successfully!');
    
    // Insert some default work hours for existing users
    const usersRes = await pool.query('SELECT id FROM users;');
    
    if (usersRes.rows.length > 0) {
      console.log(`📝 Adding default work hours for ${usersRes.rows.length} users...`);
      
      for (const user of usersRes.rows) {
        const userId = user.id;
        
        // Insert default work hours for each day (Monday-Friday: 9-17, Sunday: off)
        for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
          const isOff = dayOfWeek === 0; // Sunday is off
          const startTime = isOff ? null : '09:00';
          const endTime = isOff ? null : '17:00';
          
          await pool.query(`
            INSERT INTO user_work_hours (user_id, day_of_week, start_time, end_time, is_off)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, day_of_week) DO NOTHING;
          `, [userId, dayOfWeek, startTime, endTime, isOff]);
        }
      }
      
      console.log('✅ Default work hours added for all users!');
    }
    
  } catch (err) {
    console.error('❌ Error creating table:', err.message);
    console.error('Full error:', err);
  } finally {
    await pool.end();
  }
}

createWorkHoursTable();




