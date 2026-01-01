const db = require('../config/db');

class Pager {
  // Get all pagers
  static async getAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM pagers WHERE 1=1';
      const params = [];
      
      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }
      
      sql += ' ORDER BY pager_number';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting pagers: ${error.message}`);
    }
  }

  // Get pager by number
  static async findByNumber(pagerNumber) {
    try {
      const sql = 'SELECT * FROM pagers WHERE pager_number = ?';
      return await db.queryOne(sql, [pagerNumber]);
    } catch (error) {
      throw new Error(`Error finding pager: ${error.message}`);
    }
  }

  // Get pager by ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM pagers WHERE id = ?';
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding pager: ${error.message}`);
    }
  }

  // Get available pager
  static async getAvailable() {
    try {
      const sql = 'SELECT * FROM pagers WHERE status = "available" ORDER BY pager_number LIMIT 1';
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting available pager: ${error.message}`);
    }
  }

  // Assign pager to order
  static async assignToOrder(pagerNumber, orderId) {
    try {
      const sql = 'UPDATE pagers SET status = "assigned", order_id = ?, assigned_at = NOW() WHERE pager_number = ? AND status = "available"';
      const result = await db.execute(sql, [orderId, pagerNumber]);
      
      if (result.affectedRows === 0) {
        throw new Error('Pager not available or already assigned');
      }
      
      return await this.findByNumber(pagerNumber);
    } catch (error) {
      throw new Error(`Error assigning pager: ${error.message}`);
    }
  }

  // Activate pager (when order is ready)
  static async activate(pagerNumber) {
    try {
      const sql = 'UPDATE pagers SET status = "active" WHERE pager_number = ? AND status = "assigned"';
      const result = await db.execute(sql, [pagerNumber]);
      
      if (result.affectedRows === 0) {
        throw new Error('Pager not assigned or already active');
      }
      
      return await this.findByNumber(pagerNumber);
    } catch (error) {
      throw new Error(`Error activating pager: ${error.message}`);
    }
  }

  // Release pager (when order completed)
  static async release(pagerNumber) {
    try {
      const sql = 'UPDATE pagers SET status = "available", order_id = NULL, assigned_at = NULL WHERE pager_number = ?';
      const result = await db.execute(sql, [pagerNumber]);
      
      if (result.affectedRows === 0) {
        throw new Error('Pager not found');
      }
      
      return { message: `Pager #${pagerNumber} released successfully` };
    } catch (error) {
      throw new Error(`Error releasing pager: ${error.message}`);
    }
  }

  // Create new pager
  static async create(pagerNumber) {
    try {
      const sql = 'INSERT INTO pagers (pager_number) VALUES (?)';
      await db.execute(sql, [pagerNumber]);
      
      return await this.findByNumber(pagerNumber);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Pager number already exists');
      }
      throw new Error(`Error creating pager: ${error.message}`);
    }
  }

  // Delete pager
  static async delete(pagerNumber) {
    try {
      const sql = 'DELETE FROM pagers WHERE pager_number = ?';
      await db.execute(sql, [pagerNumber]);
      return { message: 'Pager deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting pager: ${error.message}`);
    }
  }

  // Get pager statistics
  static async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_pagers,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_pagers,
          SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned_pagers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_pagers,
          MIN(pager_number) as min_pager,
          MAX(pager_number) as max_pager
        FROM pagers
      `;
      
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting pager stats: ${error.message}`);
    }
  }

  // Buzz pager (simulate notification)
  static async buzz(pagerNumber) {
    try {
      const pager = await this.findByNumber(pagerNumber);
      
      if (!pager) {
        throw new Error('Pager not found');
      }
      
      if (pager.status !== 'active') {
        throw new Error(`Pager is ${pager.status}, cannot buzz`);
      }
      
      // In real system, this would trigger physical pager
      // For now, just log it
      console.log(`🛎️ BUZZING Pager #${pagerNumber} for order ${pager.order_id}`);
      
      return { 
        message: `Pager #${pagerNumber} buzzed successfully`,
        pager_number: pagerNumber,
        order_id: pager.order_id
      };
    } catch (error) {
      throw new Error(`Error buzzing pager: ${error.message}`);
    }
  }
}

module.exports = Pager;