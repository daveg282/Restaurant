const mysql = require('mysql2/promise'); // Ensure you're using the promise version
require('dotenv').config();

class Database {
  constructor() {
    // ✅ Only valid pool options from the documentation are included
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'vortex_admin',
      password: process.env.DB_PASSWORD || '', // Ensure this is set correctly in .env
      database: process.env.DB_NAME || 'restaurant_erp',
      port: process.env.DB_PORT || 3306,
      
      // Connection pool configuration (valid options)
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 5,                    // Keep max 5 idle connections
      idleTimeout: 60000,             // Release idle connections after 60 seconds
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      
      // Timeouts (valid for pool)
      connectTimeout: 10000,           // Fail if can't connect within 10s
    });
    
    // ✅ Pool error handler (valid event)
    this.pool.on('error', (err) => {
      console.error('❌ MySQL Pool Error:', err.message);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 Connection lost - pool will create new connections automatically');
      }
      if (err.code === 'ECONNREFUSED') {
        console.error('🚨 Database server is down!');
      }
    });
    
    // Initialize connection and start monitoring
    this.initializeConnection();
    this.startHealthMonitoring();
  }

  async initializeConnection() {
    try {
      // ✅ Correct way to get a connection from the promise-based pool
      const connection = await this.pool.getConnection();
      console.log('✅ MySQL connected successfully');
      
      // ✅ Test query using promise-based execute
      const [result] = await connection.execute('SELECT 1 as connected');
      if (result[0].connected === 1) {
        console.log('✅ Database query test passed');
      }
      
      connection.release(); // Always release the connection back to the pool
      console.log('🔓 Test connection released');
      
    } catch (error) {
      console.error('❌ MySQL connection error:', error.message);
      console.log('⚠️  Running in demo mode without database...');
    }
  }

  startHealthMonitoring() {
    // Monitor pool health every minute
    setInterval(() => {
      this.checkPoolHealth();
    }, 60000);
  }

  async checkPoolHealth() {
    try {
      // Get a connection to ping the server
      const connection = await this.pool.getConnection();
      await connection.ping(); // Tests if connection is alive
      
      // Log pool status (using internal structure - for debugging only)
      // This is not part of the official API but can be useful for development
      const poolState = this.pool.pool || this.pool;
      console.log('\n📊 Database Pool Status:', {
        timestamp: new Date().toLocaleTimeString(),
        totalConnections: poolState._allConnections?.length || 0,
        activeConnections: poolState._acquiringConnections?.length || 0,
        idleConnections: poolState._freeConnections?.length || 0,
        pendingQueries: poolState._connectionQueue?.length || 0,
        connectionLimit: 10
      });
      
      connection.release();
      
    } catch (error) {
      console.error('❌ Pool health check failed:', error.message);
    }
  }

  async query(sql, params = []) {
    let connection;
    try {
      connection = await this.pool.getConnection();
      console.log(`📝 Executing query: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
      
      // ✅ Using promise-based execute
      const [rows] = await connection.execute(sql, params);
      return rows;
      
    } catch (error) {
      console.error('❌ Database query error:', error.message);
      
      // Handle specific MySQL errors
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
      if (connection) {
        try {
          connection.release();
          console.log(`🔓 Connection released`);
        } catch (releaseError) {
          console.error('Error releasing connection:', releaseError);
        }
      }
    }
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

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
      if (connection) {
        connection.release();
      }
    }
  }

  async beginTransaction() {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    console.log(`🔄 Transaction started`);
    return connection;
  }

  async commit(connection) {
    try {
      await connection.commit();
      console.log(`✅ Transaction committed`);
    } catch (error) {
      console.error('❌ Commit failed:', error.message);
      throw error;
    } finally {
      connection.release();
      console.log(`🔓 Transaction connection released`);
    }
  }

  async rollback(connection) {
    try {
      await connection.rollback();
      console.log(`↩️ Transaction rolled back`);
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    } finally {
      connection.release();
      console.log(`🔓 Transaction connection released`);
    }
  }

  // Clean shutdown
  async close() {
    console.log('🛑 Closing database pool...');
    try {
      await this.pool.end(); // ✅ Correct way to close the pool
      console.log('✅ Database pool closed');
    } catch (error) {
      console.error('❌ Error closing database pool:', error.message);
    }
  }
}

// Create singleton instance
const database = new Database();

// Handle application shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT signal');
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM signal');
  await database.close();
  process.exit(0);
});

module.exports = database;