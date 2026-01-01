const db = require('../config/db');

class StockTransaction {
  // Get all transactions with filters
  static async getAll(filters = {}) {
    let query = `
      SELECT 
        st.*,
        i.name as ingredient_name,
        i.unit,
        u.username as user_name,
        u.role as user_role
      FROM stock_transactions st
      LEFT JOIN ingredients i ON st.ingredient_id = i.id
      LEFT JOIN users u ON st.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.ingredient_id) {
      query += ' AND st.ingredient_id = ?';
      params.push(filters.ingredient_id);
    }
    
    if (filters.transaction_type) {
      query += ' AND st.transaction_type = ?';
      params.push(filters.transaction_type);
    }
    
    if (filters.start_date) {
      query += ' AND DATE(st.created_at) >= ?';
      params.push(filters.start_date);
    }
    
    if (filters.end_date) {
      query += ' AND DATE(st.created_at) <= ?';
      params.push(filters.end_date);
    }
    
    query += ' ORDER BY st.created_at DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }
    
    return await db.query(query, params);
  }

  // Record wastage
  static async recordWastage(ingredientId, quantity, userId, notes = '') {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get current stock
      const [currentRows] = await connection.query(
        'SELECT current_stock FROM ingredients WHERE id = ? FOR UPDATE',
        [ingredientId]
      );
      
      if (currentRows.length === 0) {
        throw new Error('Ingredient not found');
      }
      
      const currentStock = currentRows[0].current_stock;
      const newStock = currentStock - quantity;
      
      if (newStock < 0) {
        throw new Error('Cannot waste more than available stock');
      }
      
      // Update ingredient stock
      await connection.query(
        'UPDATE ingredients SET current_stock = ?, updated_at = NOW() WHERE id = ?',
        [newStock, ingredientId]
      );
      
      // Record wastage transaction
      await connection.query(`
        INSERT INTO stock_transactions 
        (ingredient_id, transaction_type, quantity, previous_stock, new_stock,
         reference_id, reference_type, notes, user_id, created_at)
        VALUES (?, 'wastage', ?, ?, ?, NULL, 'wastage', ?, ?, NOW())
      `, [ingredientId, -quantity, currentStock, newStock, notes, userId]);
      
      await connection.commit();
      
      return {
        ingredient_id: ingredientId,
        quantity_wasted: quantity,
        previous_stock: currentStock,
        new_stock: newStock,
        recorded_at: new Date()
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get wastage report
  static async getWastageReport(startDate = null, endDate = null) {
    let query = `
      SELECT 
        st.ingredient_id,
        i.name as ingredient_name,
        i.unit,
        SUM(st.quantity) as quantity,
        COUNT(*) as occurrence_count,
        MIN(st.created_at) as first_occurrence,
        MAX(st.created_at) as last_occurrence,
        GROUP_CONCAT(DISTINCT st.notes SEPARATOR '; ') as notes_summary
      FROM stock_transactions st
      JOIN ingredients i ON st.ingredient_id = i.id
      WHERE st.transaction_type = 'wastage'
    `;
    
    const params = [];
    
    if (startDate) {
      query += ' AND DATE(st.created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(st.created_at) <= ?';
      params.push(endDate);
    }
    
    query += `
      GROUP BY st.ingredient_id, i.name, i.unit
      ORDER BY quantity DESC
    `;
    
    return await db.query(query, params);
  }

  // Get top used ingredients
  static async getTopUsedIngredients(limit = 10, days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return await db.query(`
      SELECT 
        st.ingredient_id,
        i.name as ingredient_name,
        i.unit,
        SUM(ABS(st.quantity)) as total_quantity_used,
        COUNT(*) as usage_count,
        i.current_stock
      FROM stock_transactions st
      JOIN ingredients i ON st.ingredient_id = i.id
      WHERE st.transaction_type IN ('usage', 'wastage')
        AND st.created_at >= ?
      GROUP BY st.ingredient_id, i.name, i.unit, i.current_stock
      ORDER BY total_quantity_used DESC
      LIMIT ?
    `, [cutoffDate.toISOString().split('T')[0], limit]);
  }
}

module.exports = StockTransaction;