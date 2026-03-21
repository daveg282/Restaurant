const mysql = require('mysql2/promise');
require('dotenv').config();

class Database {
  constructor() {
    // Create a MySQL pool
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'restaurant_erp',
      port: process.env.DB_PORT || 3306,

      waitForConnections: true,
      connectionLimit: 151,   // Match VPS max_connections
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,          // Unlimited queue
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,

      connectTimeout: 10000,
    });

    // Pool error handler
    this.pool.on('error', (err) => {
      console.error('❌ MySQL Pool Error:', err.message);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 Connection lost - pool will create new connections automatically');
      }
      if (err.code === 'ECONNREFUSED') {
        console.error('🚨 Database server is down!');
      }
    });

    // Initialize test connection and start monitoring
    this.initializeConnection();
    this.startHealthMonitoring();
  }

  // Test initial connection
  async initializeConnection() {
    try {
      const connection = await this.pool.getConnection();
      console.log('✅ MySQL connected successfully');

      const [result] = await connection.execute('SELECT 1 AS connected');
      if (result[0].connected === 1) {
        console.log('✅ Database query test passed');
      }

      connection.release();
      console.log('🔓 Test connection released');
    } catch (error) {
      console.error('❌ MySQL connection error:', error.message);
      console.log('⚠️ Running in demo mode without database...');
    }
  }

  // Start periodic pool health checks
  startHealthMonitoring() {
    setInterval(() => this.checkPoolHealth(), 60000); // every minute
  }

  async checkPoolHealth() {
  try {
    const connection = await this.pool.getConnection();
    await connection.ping();

    const poolState = this.pool.pool || this.pool;

    console.log('\n📊 Database Pool Status:', {
      timestamp: new Date().toLocaleTimeString(),
      totalConnections: poolState._allConnections?.length || 0,
      activeConnections: poolState._acquiringConnections?.length || 0,
      idleConnections: poolState._freeConnections?.length || 0,
      pendingQueries: poolState._connectionQueue?.length || 0,
      connectionLimit: this.pool.config?.connectionLimit || 0 // ✅ optional chaining
    });

    connection.release();
  } catch (error) {
    console.error('❌ Pool health check failed:', error.message);
  }
}

  // General query
  async query(sql, params = []) {
    let connection;
    try {
      connection = await this.pool.getConnection();
      console.log(`📝 Executing query: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
      const [rows] = await connection.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('❌ Database query error:', error.message);
      switch (error.code) {
        case 'PROTOCOL_CONNECTION_LOST':
          console.error('🔄 Connection lost - retry may work');
          break;
        case 'ER_LOCK_DEADLOCK':
          console.error('💀 Deadlock detected - retry transaction');
          break;
        case 'ECONNREFUSED':
          console.error('🚨 Database server refused connection');
          break;
        case 'ETIMEDOUT':
          console.error('⏱️ Connection timeout');
          break;
        case 'ER_PARSE_ERROR':
          console.error('📋 SQL syntax error:', error.sqlMessage);
          break;
      }
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  // Query returning only one row
  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  // Execute insert/update/delete statements
  async execute(sql, params = []) {
    let connection;
    try {
      connection = await this.pool.getConnection();
      console.log(`⚡ Executing statement: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
      const [result] = await connection.execute(sql, params);
      return {
        affectedRows: result.affectedRows,
        insertId: result.insertId,
        warningCount: result.warningCount,
        changedRows: result.changedRows
      };
    } catch (error) {
      console.error('❌ Database execute error:', error.message);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  // Transaction helpers
  async beginTransaction() {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    console.log('🔄 Transaction started');
    return connection;
  }

  async commit(connection) {
    try {
      await connection.commit();
      console.log('✅ Transaction committed');
    } catch (error) {
      console.error('❌ Commit failed:', error.message);
      throw error;
    } finally {
      connection.release();
      console.log('🔓 Transaction connection released');
    }
  }

  async rollback(connection) {
    try {
      await connection.rollback();
      console.log('↩️ Transaction rolled back');
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    } finally {
      connection.release();
      console.log('🔓 Transaction connection released');
    }
  }

  // Close pool cleanly
  async close() {
    console.log('🛑 Closing database pool...');
    try {
      await this.pool.end();
      console.log('✅ Database pool closed');
    } catch (error) {
      console.error('❌ Error closing database pool:', error.message);
    }
  }
}

// Singleton instance
const database = new Database();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT');
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM');
  await database.close();
  process.exit(0);
});

module.exports = database;