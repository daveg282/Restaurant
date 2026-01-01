const db = require('../config/db');

class Station {
  // Get all stations
  static async getAll() {
    try {
      const sql = `
        SELECT ks.*, 
               u.username as chef_name, 
               u.first_name, 
               u.last_name,
               (SELECT COUNT(*) FROM categories WHERE station_id = ks.id) as category_count,
               (SELECT COUNT(*) FROM menu_items WHERE station_id = ks.id) as menu_item_count
        FROM kitchen_stations ks
        LEFT JOIN users u ON ks.assigned_chef_id = u.id
        ORDER BY ks.name
      `;
      return await db.query(sql);
    } catch (error) {
      throw new Error(`Error getting stations: ${error.message}`);
    }
  }

  // Get station by ID
  static async findById(id) {
    try {
      const sql = `
        SELECT ks.*, 
               u.username as chef_name, 
               u.first_name, 
               u.last_name,
               (SELECT COUNT(*) FROM categories WHERE station_id = ks.id) as category_count,
               (SELECT COUNT(*) FROM menu_items WHERE station_id = ks.id) as menu_item_count
        FROM kitchen_stations ks
        LEFT JOIN users u ON ks.assigned_chef_id = u.id
        WHERE ks.id = ?
      `;
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding station: ${error.message}`);
    }
  }

  // Create station
  static async create(stationData) {
    try {
      const sql = `
        INSERT INTO kitchen_stations (name, description, status, color)
        VALUES (?, ?, ?, ?)
      `;
      const params = [
        stationData.name,
        stationData.description || '',
        stationData.status || 'active',
        stationData.color || '#4CAF50'
      ];
      
      const result = await db.execute(sql, params);
      return { id: result.insertId, ...stationData };
    } catch (error) {
      throw new Error(`Error creating station: ${error.message}`);
    }
  }

  // Update station
  static async update(id, stationData) {
    try {
      const updates = [];
      const params = [];
      
      const fields = {
        'name': 'name',
        'description': 'description',
        'status': 'status',
        'assigned_chef_id': 'assigned_chef_id',
        'color': 'color'
      };
      
      Object.entries(fields).forEach(([key, dbField]) => {
        if (stationData[key] !== undefined) {
          updates.push(`${dbField} = ?`);
          params.push(stationData[key]);
        }
      });
      
      if (updates.length === 0) {
        return { message: 'No updates provided' };
      }
      
      params.push(id);
      const sql = `UPDATE kitchen_stations SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Error updating station: ${error.message}`);
    }
  }

  // Delete station
  static async delete(id) {
    try {
      // Check if station is in use
      const checkSql = `
        SELECT 
          (SELECT COUNT(*) FROM categories WHERE station_id = ?) as category_count,
          (SELECT COUNT(*) FROM menu_items WHERE station_id = ?) as menu_item_count
      `;
      const usage = await db.queryOne(checkSql, [id, id]);
      
      if (usage.category_count > 0 || usage.menu_item_count > 0) {
        throw new Error('Cannot delete station assigned to categories or menu items');
      }
      
      const sql = 'DELETE FROM kitchen_stations WHERE id = ?';
      await db.execute(sql, [id]);
      return { message: 'Station deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting station: ${error.message}`);
    }
  }

  // Get station statistics
  static async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_stations,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_stations,
          SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy_stations,
          SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_stations,
          SUM(CASE WHEN assigned_chef_id IS NOT NULL THEN 1 ELSE 0 END) as staffed_stations
        FROM kitchen_stations
      `;
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting station stats: ${error.message}`);
    }
  }

  // Get station workload
  static async getWorkload(stationId) {
    try {
      const sql = `
        SELECT 
          COUNT(DISTINCT oi.order_id) as active_orders,
          COUNT(oi.id) as total_items,
          SUM(CASE WHEN oi.status = 'pending' THEN 1 ELSE 0 END) as pending_items,
          SUM(CASE WHEN oi.status = 'preparing' THEN 1 ELSE 0 END) as preparing_items
        FROM order_items oi
        INNER JOIN menu_items mi ON oi.menu_item_id = mi.id
        INNER JOIN categories c ON mi.category_id = c.id
        WHERE (mi.station_id = ? OR c.station_id = ?)
          AND oi.status IN ('pending', 'preparing')
      `;
      return await db.queryOne(sql, [stationId, stationId]);
    } catch (error) {
      throw new Error(`Error getting station workload: ${error.message}`);
    }
  }

  // Get available chefs
  static async getAvailableChefs() {
    try {
      const sql = `
        SELECT u.id, u.username, u.first_name, u.last_name,
               COUNT(ks.id) as current_stations
        FROM users u
        LEFT JOIN kitchen_stations ks ON u.id = ks.assigned_chef_id
        WHERE u.role = 'chef' AND u.status = 'active'
        GROUP BY u.id
        HAVING current_stations < 2
        ORDER BY u.first_name
      `;
      return await db.query(sql);
    } catch (error) {
      throw new Error(`Error getting available chefs: ${error.message}`);
    }
  }
}

module.exports = Station;