const mysql = require('mysql2/promise');
require('dotenv').config();

class Database {
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'vortex_admin',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'restaurant_erp',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });
    
    this.initializeConnection();
  }

  async initializeConnection() {
    try {
      const connection = await this.pool.getConnection();
      console.log('✅ MySQL connected successfully');
      connection.release();
      
      // Test query
      await this.pool.execute('SELECT 1');
    } catch (error) {
      console.error('❌ MySQL connection error:', error.message);
      console.log('⚠️  Running in demo mode without database...');
    }
  }

  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('Database query error:', error.message);
      throw error;
    }
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  async execute(sql, params = []) {
    try {
      const [result] = await this.pool.execute(sql, params);
      return result;
    } catch (error) {
      console.error('Database execute error:', error.message);
      throw error;
    }
  }

  async beginTransaction() {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  async commit(connection) {
    await connection.commit();
    connection.release();
  }

  async rollback(connection) {
    await connection.rollback();
    connection.release();
  }
}

module.exports = new Database();