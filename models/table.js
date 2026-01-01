const db = require('../config/db');

class Table {
  // Get all tables
  static async getAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM tables WHERE 1=1';
      const params = [];
      
      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }
      
      if (filters.section) {
        sql += ' AND section = ?';
        params.push(filters.section);
      }
      
      if (filters.min_capacity) {
        sql += ' AND capacity >= ?';
        params.push(filters.min_capacity);
      }
      
      sql += ' ORDER BY section, CAST(SUBSTRING(table_number, 2) AS UNSIGNED)';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting tables: ${error.message}`);
    }
  }

  // Get table by ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM tables WHERE id = ?';
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding table: ${error.message}`);
    }
  }

  // Get table by table number
  static async findByNumber(tableNumber) {
    try {
      const sql = 'SELECT * FROM tables WHERE table_number = ?';
      return await db.queryOne(sql, [tableNumber]);
    } catch (error) {
      throw new Error(`Error finding table: ${error.message}`);
    }
  }

  // Create new table
  static async create(tableData) {
    try {
      const sql = `
        INSERT INTO tables 
        (table_number, capacity, status, customer_count, section, notes) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        tableData.table_number,
        tableData.capacity || 2,
        tableData.status || 'available',
        tableData.customer_count || 0,
        tableData.section || 'Main Hall',
        tableData.notes || ''
      ];
      
      const result = await db.execute(sql, params);
      
      return {
        id: result.insertId,
        ...tableData
      };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Table number already exists');
      }
      throw new Error(`Error creating table: ${error.message}`);
    }
  }

  // Update table
  static async update(id, tableData) {
    try {
      const updates = [];
      const params = [];
      
      if (tableData.table_number !== undefined) {
        updates.push('table_number = ?');
        params.push(tableData.table_number);
      }
      if (tableData.capacity !== undefined) {
        updates.push('capacity = ?');
        params.push(tableData.capacity);
      }
      if (tableData.status !== undefined) {
        updates.push('status = ?');
        params.push(tableData.status);
      }
      if (tableData.customer_count !== undefined) {
        updates.push('customer_count = ?');
        params.push(tableData.customer_count);
      }
      if (tableData.section !== undefined) {
        updates.push('section = ?');
        params.push(tableData.section);
      }
      if (tableData.notes !== undefined) {
        updates.push('notes = ?');
        params.push(tableData.notes);
      }
      
      if (updates.length === 0) {
        return { message: 'No updates provided' };
      }
      
      params.push(id);
      const sql = `UPDATE tables SET ${updates.join(', ')} WHERE id = ?`;
      
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Table number already exists');
      }
      throw new Error(`Error updating table: ${error.message}`);
    }
  }

  // Delete table
  static async delete(id) {
    try {
      const sql = 'DELETE FROM tables WHERE id = ?';
      await db.execute(sql, [id]);
      return { message: 'Table deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting table: ${error.message}`);
    }
  }

  // Update table status
  static async updateStatus(id, status, customerCount = 0) {
    try {
      const sql = 'UPDATE tables SET status = ?, customer_count = ? WHERE id = ?';
      await db.execute(sql, [status, customerCount, id]);
      
      const table = await this.findById(id);
      return { 
        message: `Table ${table.table_number} status updated to ${status}`,
        table 
      };
    } catch (error) {
      throw new Error(`Error updating table status: ${error.message}`);
    }
  }

  // Occupy table (when customers sit)
  static async occupy(id, customerCount) {
    try {
      const table = await this.findById(id);
      
      if (!table) {
        throw new Error('Table not found');
      }
      
      if (table.status === 'occupied') {
        throw new Error('Table is already occupied');
      }
      
      if (customerCount > table.capacity) {
        throw new Error(`Table capacity is ${table.capacity}, but ${customerCount} customers provided`);
      }
      
      return await this.updateStatus(id, 'occupied', customerCount);
    } catch (error) {
      throw new Error(`Error occupying table: ${error.message}`);
    }
  }

  // Free table (when customers leave)
  static async free(id) {
    try {
      const table = await this.findById(id);
      
      if (!table) {
        throw new Error('Table not found');
      }
      
      if (table.status === 'available') {
        throw new Error('Table is already available');
      }
      
      return await this.updateStatus(id, 'available', 0);
    } catch (error) {
      throw new Error(`Error freeing table: ${error.message}`);
    }
  }

  // Reserve table
  static async reserve(id, customerCount) {
    try {
      const table = await this.findById(id);
      
      if (!table) {
        throw new Error('Table not found');
      }
      
      if (table.status !== 'available') {
        throw new Error(`Table is ${table.status}, cannot reserve`);
      }
      
      return await this.updateStatus(id, 'reserved', customerCount);
    } catch (error) {
      throw new Error(`Error reserving table: ${error.message}`);
    }
  }

  // Get available tables (for seating customers)
  static async getAvailable(customerCount = null) {
    try {
      let sql = 'SELECT * FROM tables WHERE status = "available"';
      const params = [];
      
      if (customerCount) {
        sql += ' AND capacity >= ?';
        params.push(customerCount);
      }
      
      sql += ' ORDER BY capacity, section, table_number';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting available tables: ${error.message}`);
    }
  }

  // Get table statistics
  static async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_tables,
          SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_tables,
          SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied_tables,
          SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved_tables,
          SUM(capacity) as total_capacity,
          SUM(customer_count) as current_customers,
          COUNT(DISTINCT section) as sections_count
        FROM tables
      `;
      
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting table stats: ${error.message}`);
    }
  }

  // Search tables
  static async search(query) {
    try {
      const sql = `
        SELECT * FROM tables 
        WHERE table_number LIKE ? 
           OR section LIKE ?
           OR notes LIKE ?
        ORDER BY table_number
      `;
      const searchTerm = `%${query}%`;
      return await db.query(sql, [searchTerm, searchTerm, searchTerm]);
    } catch (error) {
      throw new Error(`Error searching tables: ${error.message}`);
    }
  }
}

module.exports = Table;