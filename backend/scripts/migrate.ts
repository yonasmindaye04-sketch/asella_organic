import fs from 'fs';
import path from 'path';
import pool from '../src/config/db.js';

async function migrate() {
  const connection = await pool.getConnection();
  try {
    const sqlPath = path.join(__dirname, '..', 'db', 'sql', '014_employee_tracking.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Some basic parsing if there are multiple statements
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    
    for (const stmt of statements) {
      console.log('Executing:', stmt);
      await connection.query(stmt);
    }
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
