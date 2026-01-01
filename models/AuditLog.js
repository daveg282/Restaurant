// File: models/AuditLog.js
const db = require('../config/db');

class AuditLog {
  static async create(logData) {
    try {
      const sql = `
        INSERT INTO audit_logs (user_id, action, ip_address, user_agent, success, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      await db.execute(sql, [
        logData.user_id || null,
        logData.action,
        logData.ip_address || null,
        logData.user_agent || null,
        logData.success !== undefined ? logData.success : true,
        JSON.stringify(logData.details || {})
      ]);
      
      return true;
    } catch (error) {
      // Silent fail - don't break the app if audit logging fails
      console.error('Audit log write failed:', error.message);
      return false;
    }
  }
  
  static async getLogs(filters = {}, limit = 100, offset = 0) {
    try {
      let sql = 'SELECT * FROM audit_logs WHERE 1=1';
      const params = [];
      
      if (filters.user_id) {
        sql += ' AND user_id = ?';
        params.push(filters.user_id);
      }
      
      if (filters.action) {
        sql += ' AND action = ?';
        params.push(filters.action);
      }
      
      if (filters.success !== undefined) {
        sql += ' AND success = ?';
        params.push(filters.success);
      }
      
      if (filters.start_date) {
        sql += ' AND created_at >= ?';
        params.push(filters.start_date);
      }
      
      if (filters.end_date) {
        sql += ' AND created_at <= ?';
        params.push(filters.end_date);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting audit logs: ${error.message}`);
    }
  }
  
  static async getUserActivity(userId, limit = 50) {
    try {
      const sql = `
        SELECT * FROM audit_logs 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      return await db.query(sql, [userId, limit]);
    } catch (error) {
      throw new Error(`Error getting user activity: ${error.message}`);
    }
  }
}

module.exports = AuditLog;