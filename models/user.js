const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

class User {
  static async findByEmail(email) {
    try {
      const sql = 'SELECT * FROM users WHERE email = ? AND status = "active"';
      return await db.queryOne(sql, [email]);
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  }

  static async findById(id) {
    try {
      const sql = 'SELECT * FROM users WHERE id = ?';
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  }

  static async findByUsername(username) {
    try {
      const sql = 'SELECT * FROM users WHERE username = ? AND status = "active"';
      return await db.queryOne(sql, [username]);
    } catch (error) {
      throw new Error(`Error finding user: ${error.message}`);
    }
  }

  static async create(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const sql = `
        INSERT INTO users (username, email, password, role, first_name, last_name, token_version) 
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `;
      
      const params = [
        userData.username,
        userData.email,
        hashedPassword,
        userData.role || 'waiter',
        userData.first_name || '',
        userData.last_name || ''
      ];
      
      const result = await db.execute(sql, params);
      
      return {
        id: result.insertId,
        username: userData.username,
        email: userData.email,
        role: userData.role || 'waiter',
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        status: 'active',
        token_version: 1,
        created_at: new Date()
      };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Username or email already exists');
      }
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static generateToken(user) {
    // Validate JWT_SECRET exists
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }
    
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        token_version: user.token_version || 1  // Include token version in token
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
  }

  static async getAll(role = null) {
    try {
      let sql = `
        SELECT id, username, email, role, first_name, last_name, 
               status, token_version, created_at, updated_at
        FROM users
        WHERE 1=1
      `;
      
      const params = [];
      
      if (role) {
        sql += ' AND role = ?';
        params.push(role);
      }
      
      sql += ' ORDER BY created_at DESC';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting users: ${error.message}`);
    }
  }

  static async getStaffUsers(search = null) {
    try {
      let sql = `
        SELECT id, username, email, role, first_name, last_name, 
               status, token_version, created_at, updated_at
        FROM users
        WHERE role IN ('cashier', 'waiter', 'chef')
      `;
      
      const params = [];
      
      if (search) {
        sql += ' AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }
      
      sql += ' ORDER BY created_at DESC';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting staff users: ${error.message}`);
    }
  }

  static async update(id, userData) {
    try {
      const updates = [];
      const params = [];
      
      if (userData.first_name !== undefined) {
        updates.push('first_name = ?');
        params.push(userData.first_name);
      }
      if (userData.last_name !== undefined) {
        updates.push('last_name = ?');
        params.push(userData.last_name);
      }
      if (userData.role) {
        updates.push('role = ?');
        params.push(userData.role);
      }
      if (userData.status) {
        updates.push('status = ?');
        params.push(userData.status);
      }
      if (userData.email) {
        updates.push('email = ?');
        params.push(userData.email);
      }
      if (userData.username) {
        updates.push('username = ?');
        params.push(userData.username);
      }
      
      // Note: We don't allow direct update of token_version through this method
      // Use invalidateTokens() method instead
      
      if (userData.password) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        updates.push('password = ?');
        params.push(hashedPassword);
      }
      
      if (updates.length === 0) {
        return { message: 'No updates provided' };
      }
      
      params.push(id);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Username or email already exists');
      }
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      const sql = 'UPDATE users SET status = "inactive" WHERE id = ?';
      await db.execute(sql, [id]);
      return { message: 'User deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }

  static async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
          SUM(CASE WHEN role = 'manager' THEN 1 ELSE 0 END) as manager_count,
          SUM(CASE WHEN role = 'cashier' THEN 1 ELSE 0 END) as cashier_count,
          SUM(CASE WHEN role = 'waiter' THEN 1 ELSE 0 END) as waiter_count,
          SUM(CASE WHEN role = 'chef' THEN 1 ELSE 0 END) as chef_count,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_count
        FROM users
      `;
      
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting user stats: ${error.message}`);
    }
  }

  static async getStaffStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_staff,
          SUM(CASE WHEN role = 'cashier' THEN 1 ELSE 0 END) as cashier_count,
          SUM(CASE WHEN role = 'waiter' THEN 1 ELSE 0 END) as waiter_count,
          SUM(CASE WHEN role = 'chef' THEN 1 ELSE 0 END) as chef_count,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_count
        FROM users
        WHERE role IN ('cashier', 'waiter', 'chef')
      `;
      
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting staff stats: ${error.message}`);
    }
  }

  static async search(query, role = null) {
    try {
      let sql = `
        SELECT id, username, email, role, first_name, last_name, 
               status, token_version, created_at
        FROM users
        WHERE status = "active"
        AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)
      `;
      
      const searchTerm = `%${query}%`;
      const params = [searchTerm, searchTerm, searchTerm, searchTerm];
      
      if (role) {
        sql += ' AND role = ?';
        params.push(role);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT 50';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error searching users: ${error.message}`);
    }
  }

  // NEW: Invalidate all tokens for a user by incrementing token_version
  static async invalidateTokens(userId) {
    try {
      const sql = 'UPDATE users SET token_version = token_version + 1 WHERE id = ?';
      const result = await db.execute(sql, [userId]);
      
      // Return the new token version
      const updatedUser = await this.findById(userId);
      return {
        success: true,
        new_token_version: updatedUser.token_version,
        affected_rows: result.affectedRows
      };
    } catch (error) {
      throw new Error(`Error invalidating tokens: ${error.message}`);
    }
  }

  // NEW: Get user with token version check
  static async findByIdWithTokenCheck(id, tokenVersion) {
    try {
      const sql = 'SELECT * FROM users WHERE id = ? AND token_version = ?';
      return await db.queryOne(sql, [id, tokenVersion]);
    } catch (error) {
      throw new Error(`Error finding user with token check: ${error.message}`);
    }
  }

  // NEW: Get active sessions count (if you implement sessions table later)
  static async getActiveSessionsCount(userId) {
    try {
      const sql = `
        SELECT COUNT(*) as active_sessions 
        FROM user_sessions 
        WHERE user_id = ? AND is_active = TRUE AND expires_at > NOW()
      `;
      const result = await db.queryOne(sql, [userId]);
      return result.active_sessions || 0;
    } catch (error) {
      // If sessions table doesn't exist yet, return 0
      return 0;
    }
  }

  // NEW: Get user's token version
  static async getTokenVersion(userId) {
    try {
      const sql = 'SELECT token_version FROM users WHERE id = ?';
      const result = await db.queryOne(sql, [userId]);
      return result ? result.token_version : null;
    } catch (error) {
      throw new Error(`Error getting token version: ${error.message}`);
    }
  }
}

module.exports = User;