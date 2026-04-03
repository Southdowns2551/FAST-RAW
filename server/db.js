/**
 * MySQL connection pool for Material Hub API.
 * Connects to MySQL container via Docker app-network hostname "mysql".
 *
 * Requires env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * @module db
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'material_hub',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'material_hub',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

/**
 * Tests the database connection.
 * @returns {Promise<boolean>} true if connected
 * @throws {Error} if connection fails
 */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };
