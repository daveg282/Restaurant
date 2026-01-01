require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function seedDatabase() {
  console.log('🌱 Starting user seed...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restaurant_erp', // ADD DATABASE HERE
    port: process.env.DB_PORT || 3306,
    multipleStatements: true // Allow multiple SQL statements
  });

  try {
    console.log('✅ Connected to database');
    
    // Create table if not exists (using regular query, not prepared statement)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'manager', 'cashier', 'waiter', 'chef') DEFAULT 'waiter',
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created/verified');
    
    // Hash passwords using YOUR bcryptjs
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash('password123', 10);
    console.log('Generated hash:', hashedPassword);
    
    // Clear existing users
    await connection.query('DELETE FROM users');
    console.log('🗑️  Cleared existing users');
    
    // Insert users with PROPERLY hashed password
    const users = [
      ['admin', 'admin@restaurant.com', hashedPassword, 'admin', 'System', 'Admin'],
      ['manager1', 'manager@restaurant.com', hashedPassword, 'manager', 'John', 'Manager'],
      ['cashier1', 'cashier1@restaurant.com', hashedPassword, 'cashier', 'Sarah', 'Cashier'],
      ['cashier2', 'cashier2@restaurant.com', hashedPassword, 'cashier', 'Mike', 'Jones'],
      ['waiter1', 'waiter1@restaurant.com', hashedPassword, 'waiter', 'Emma', 'Davis'],
      ['waiter2', 'waiter2@restaurant.com', hashedPassword, 'waiter', 'David', 'Wilson'],
      ['waiter3', 'waiter3@restaurant.com', hashedPassword, 'waiter', 'Lisa', 'Brown'],
      ['chef1', 'chef1@restaurant.com', hashedPassword, 'chef', 'Gordon', 'Ramsay'],
      ['chef2', 'chef2@restaurant.com', hashedPassword, 'chef', 'Julia', 'Child']
    ];

    const sql = `
      INSERT INTO users (username, email, password, role, first_name, last_name) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    for (const user of users) {
      await connection.execute(sql, user);
    }
    
    console.log('✅ Inserted', users.length, 'users');
    
    // Verify insertion
    const [rows] = await connection.query('SELECT username, email, role FROM users ORDER BY id');
    console.log('\n📋 Users created:');
    rows.forEach(row => {
      console.log(`  - ${row.username} (${row.email}) - ${row.role}`);
    });
    
    console.log('\n🔑 Login credentials for ALL users:');
    console.log('   Email: [any email from above]');
    console.log('   Password: password123');
    console.log('\n🎉 Seed completed successfully!');
    
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    console.error('Error code:', error.code);
    
    // If database doesn't exist, create it
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('⚠️  Database not found. Creating database...');
      try {
        const tempConnection = await mysql.createConnection({
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          port: process.env.DB_PORT || 3306
        });
        
        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'restaurant_erp'}\``);
        console.log('✅ Database created');
        await tempConnection.end();
        
        // Run seed again
        console.log('🔄 Restarting seed...');
        return seedDatabase();
      } catch (createError) {
        console.error('❌ Failed to create database:', createError.message);
      }
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔒 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;