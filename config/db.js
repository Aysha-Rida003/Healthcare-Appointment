const mysql = require('mysql2');
require('dotenv').config();

//


const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'healthcare_db',
  waitForConnections: true,
  connectionLimit: 10
});

const db = pool.promise();

// Test connection
db.execute('SELECT 1')
  .then(() => console.log('✅ MySQL connected successfully'))
  .catch(err => console.error('❌ MySQL connection error:', err.message));

module.exports = db;