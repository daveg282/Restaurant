const db = require('../config/db');

class Category {
  // Get all categories
  static async getAll() {
    try {
      const sql = 'SELECT * FROM categories ORDER BY name';
      return await db.query(sql);
    } catch (error) {
      throw new Error(`Error getting categories: ${error.message}`);
    }
  }

  // Get category by ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM categories WHERE id = ?';
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding category: ${error.message}`);
    }
  }

  // Create new category
  static async create(categoryData) {
    try {
      const sql = 'INSERT INTO categories (name, description) VALUES (?, ?)';
      const params = [categoryData.name, categoryData.description || ''];
      
      const result = await db.execute(sql, params);
      
      return {
        id: result.insertId,
        ...categoryData
      };
    } catch (error) {
      throw new Error(`Error creating category: ${error.message}`);
    }
  }

  // Update category
  static async update(id, categoryData) {
    try {
      const updates = [];
      const params = [];
      
      if (categoryData.name !== undefined) {
        updates.push('name = ?');
        params.push(categoryData.name);
      }
      if (categoryData.description !== undefined) {
        updates.push('description = ?');
        params.push(categoryData.description);
      }
      
      if (updates.length === 0) {
        return { message: 'No updates provided' };
      }
      
      params.push(id);
      const sql = `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`;
      
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Error updating category: ${error.message}`);
    }
  }

  // Delete category
  static async delete(id) {
    try {
      // Check if category has menu items
      const checkSql = 'SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?';
      const checkResult = await db.queryOne(checkSql, [id]);
      
      if (checkResult.count > 0) {
        throw new Error('Cannot delete category with menu items. Reassign items first.');
      }
      
      const sql = 'DELETE FROM categories WHERE id = ?';
      await db.execute(sql, [id]);
      return { message: 'Category deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting category: ${error.message}`);
    }
  }

  // Get category with menu items
  static async getWithItems(id) {
    try {
      const category = await this.findById(id);
      if (!category) return null;
      
      const sql = 'SELECT * FROM menu_items WHERE category_id = ? AND available = true ORDER BY name';
      const items = await db.query(sql, [id]);
      
      return {
        ...category,
        items,
        item_count: items.length
      };
    } catch (error) {
      throw new Error(`Error getting category with items: ${error.message}`);
    }
  }
  static async getByStation(stationId) {
  try {
    const sql = 'SELECT * FROM categories WHERE station_id = ? ORDER BY name';
    return await db.query(sql, [stationId]);
  } catch (error) {
    throw new Error(`Error getting categories by station: ${error.message}`);
  }
}

// Assign station to category
static async assignStation(categoryId, stationId) {
  try {
    const sql = 'UPDATE categories SET station_id = ? WHERE id = ?';
    await db.execute(sql, [stationId, categoryId]);
    return await this.findById(categoryId);
  } catch (error) {
    throw new Error(`Error assigning station: ${error.message}`);
  }
}

// Remove station from category
static async removeStation(categoryId) {
  try {
    const sql = 'UPDATE categories SET station_id = NULL WHERE id = ?';
    await db.execute(sql, [categoryId]);
    return await this.findById(categoryId);
  } catch (error) {
    throw new Error(`Error removing station: ${error.message}`);
  }
}
}

module.exports = Category;