// models/Ingredient.js
const db = require('../config/db');

class Ingredient {
  // ========== GET METHODS ==========
  
  // models/Ingredient.js
static async getAll(filters = {}) {
  try {
    let sql = `
      SELECT i.*, s.name as supplier_name
      FROM ingredients i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.category) {
      sql += ' AND i.category = ?';
      params.push(filters.category);
    }
    
    if (filters.search) {
      sql += ' AND (i.name LIKE ? OR i.notes LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    if (filters.low_stock === 'true') {
      sql += ' AND i.current_stock <= i.minimum_stock';
    }
    
    sql += ' ORDER BY i.name ASC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }
    
    // IMPORTANT: Return directly like MenuItem.getAll()
    return await db.query(sql, params);
    
  } catch (error) {
    throw new Error(`Error getting ingredients: ${error.message}`);
  }
}

  // Get ingredient by ID with ALL details
  static async findById(id) {
    try {
      // Get basic ingredient info with supplier
      const [rows] = await db.query(`
        SELECT 
          i.*,
          s.name as supplier_name,
          s.contact_person,
          s.phone as supplier_phone,
          s.email as supplier_email,
          s.address as supplier_address
        FROM ingredients i
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.id = ?
      `, [id]);
      
      const ingredient = rows[0];
      if (!ingredient) return null;
      
      // Get all recipes that use this ingredient
      const [recipes] = await db.query(`
        SELECT 
          mi.id,
          mi.name as menu_item_name,
          mi.price,
          mi.category_id,
          c.name as category_name,
          mii.quantity_required,
          mii.unit as recipe_unit,
          mii.notes as recipe_notes
        FROM menu_item_ingredients mii
        JOIN menu_items mi ON mii.menu_item_id = mi.id
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE mii.ingredient_id = ?
        ORDER BY mi.name ASC
      `, [id]);
      
      // Get stock history (if you have a stock_history table)
      const [stockHistory] = await db.query(`
        SELECT 
          sh.*,
          u.username as updated_by_name,
          u.role as updated_by_role
        FROM stock_history sh
        LEFT JOIN users u ON sh.updated_by = u.id
        WHERE sh.ingredient_id = ?
        ORDER BY sh.updated_at DESC
        LIMIT 20
      `, [id]);
      
      // Get supplier info if exists
      let supplier = null;
      if (ingredient.supplier_id) {
        const [suppliers] = await db.query(
          'SELECT * FROM suppliers WHERE id = ?',
          [ingredient.supplier_id]
        );
        supplier = suppliers[0] || null;
      }
      
      return {
        ...ingredient,
        recipes,
        stock_history: stockHistory,
        supplier_details: supplier,
        used_in_recipes_count: recipes.length,
        is_low_stock: parseFloat(ingredient.current_stock) <= parseFloat(ingredient.minimum_stock)
      };
    } catch (error) {
      console.error('Error in Ingredient.findById:', error);
      throw error;
    }
  }

  // ========== CREATE METHOD ==========
  static async create(ingredientData) {
    const connection = await db.beginTransaction();
    
    try {
      const {
        name, unit, current_stock = 0, minimum_stock = 10,
        cost_per_unit = 0, supplier_id, category, notes
      } = ingredientData;
      
      // Insert ingredient
      const [result] = await connection.query(`
        INSERT INTO ingredients 
        (name, unit, current_stock, minimum_stock, cost_per_unit, 
         supplier_id, category, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        name, unit, current_stock, minimum_stock, 
        cost_per_unit, supplier_id, category, notes
      ]);
      
      const ingredientId = result.insertId;
      
      // Record stock history (initial stock)
      if (current_stock > 0) {
        await connection.query(`
          INSERT INTO stock_history 
          (ingredient_id, previous_stock, new_stock, adjustment, 
           notes, updated_by, updated_at)
          VALUES (?, 0, ?, ?, 'Initial stock', 1, NOW())
        `, [ingredientId, current_stock, current_stock]);
      }
      
      await connection.commit();
      
      // Return full ingredient details
      return await this.findById(ingredientId);
    } catch (error) {
      await connection.rollback();
      console.error('Error in Ingredient.create:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ========== UPDATE METHOD ==========
  static async update(id, updateData, userId = 1) {
    const connection = await db.beginTransaction();
    
    try {
      // Get current ingredient data for history
      const [currentRows] = await connection.query(
        'SELECT * FROM ingredients WHERE id = ?',
        [id]
      );
      const currentIngredient = currentRows[0];
      
      if (!currentIngredient) {
        throw new Error('Ingredient not found');
      }
      
      const allowedFields = [
        'name', 'unit', 'current_stock', 'minimum_stock', 
        'cost_per_unit', 'supplier_id', 'category', 'notes'
      ];
      
      const updates = [];
      const params = [];
      
      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key) && updateData[key] !== undefined) {
          updates.push(`${key} = ?`);
          params.push(updateData[key]);
        }
      });
      
      if (updates.length === 0) {
        await connection.rollback();
        return await this.findById(id);
      }
      
      updates.push('updated_at = NOW()');
      params.push(id);
      
      // Update ingredient
      await connection.query(
        `UPDATE ingredients SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
      
      // Record stock history if stock changed
      if (updateData.current_stock !== undefined) {
        const newStock = parseFloat(updateData.current_stock);
        const oldStock = parseFloat(currentIngredient.current_stock);
        const adjustment = newStock - oldStock;
        
        await connection.query(`
          INSERT INTO stock_history 
          (ingredient_id, previous_stock, new_stock, adjustment, 
           notes, updated_by, updated_at)
          VALUES (?, ?, ?, ?, 'Manual adjustment', ?, NOW())
        `, [id, oldStock, newStock, adjustment, userId]);
      }
      
      await connection.commit();
      
      // Return updated ingredient with all details
      return await this.findById(id);
    } catch (error) {
      await connection.rollback();
      console.error('Error in Ingredient.update:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ========== DELETE METHOD ==========
  static async delete(id) {
    const connection = await db.beginTransaction();
    
    try {
      // Check if ingredient is used in recipes
      const [usedInRecipes] = await connection.query(
        'SELECT COUNT(*) as count FROM menu_item_ingredients WHERE ingredient_id = ?',
        [id]
      );
      
      if (usedInRecipes[0].count > 0) {
        await connection.rollback();
        throw new Error('Cannot delete ingredient: It is used in one or more recipes');
      }
      
      // Delete from ingredients table
      await connection.query('DELETE FROM ingredients WHERE id = ?', [id]);
      
      // Also delete stock history (optional)
      await connection.query('DELETE FROM stock_history WHERE ingredient_id = ?', [id]);
      
      await connection.commit();
      
      return { 
        message: 'Ingredient deleted successfully',
        id: id
      };
    } catch (error) {
      await connection.rollback();
      console.error('Error in Ingredient.delete:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ========== BATCH OPERATIONS ==========
  
  // Get all ingredients by category
  static async getByCategory(category) {
    try {
      const [ingredients] = await db.query(`
        SELECT 
          i.*,
          s.name as supplier_name,
          COUNT(DISTINCT mii.menu_item_id) as used_in_recipes_count
        FROM ingredients i
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        LEFT JOIN menu_item_ingredients mii ON i.id = mii.ingredient_id
        WHERE i.category = ?
        GROUP BY i.id
        ORDER BY i.name ASC
      `, [category]);
      
      return ingredients;
    } catch (error) {
      console.error('Error in Ingredient.getByCategory:', error);
      throw error;
    }
  }

  // Get low stock ingredients
  static async getLowStock() {
    try {
      const [ingredients] = await db.query(`
        SELECT 
          i.*,
          s.name as supplier_name,
          s.contact_person,
          s.phone as supplier_phone,
          ROUND((i.current_stock / i.minimum_stock) * 100, 2) as stock_percentage
        FROM ingredients i
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.current_stock <= i.minimum_stock
        ORDER BY i.current_stock / i.minimum_stock ASC
      `);
      
      return ingredients;
    } catch (error) {
      console.error('Error in Ingredient.getLowStock:', error);
      throw error;
    }
  }

  // Get ingredients with supplier info
  static async getWithSuppliers() {
    try {
      const [ingredients] = await db.query(`
        SELECT 
          i.*,
          s.name as supplier_name,
          s.contact_person,
          s.phone,
          s.email,
          s.address
        FROM ingredients i
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        ORDER BY i.name ASC
      `);
      
      return ingredients;
    } catch (error) {
      console.error('Error in Ingredient.getWithSuppliers:', error);
      throw error;
    }
  }

  // Get stock summary statistics
  static async getStockSummary() {
    try {
      // Get category-wise summary
      const [categorySummary] = await db.query(`
        SELECT 
          category,
          COUNT(*) as total_items,
          SUM(current_stock) as total_stock,
          SUM(cost_per_unit * current_stock) as total_value,
          SUM(CASE WHEN current_stock <= minimum_stock THEN 1 ELSE 0 END) as low_stock_count,
          SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) as out_of_stock_count
        FROM ingredients
        GROUP BY category
        ORDER BY total_value DESC
      `);
      
      // Get overall totals
      const [overallTotals] = await db.query(`
        SELECT 
          COUNT(*) as total_ingredients,
          SUM(current_stock) as overall_stock,
          SUM(cost_per_unit * current_stock) as overall_value,
          SUM(CASE WHEN current_stock <= minimum_stock THEN 1 ELSE 0 END) as total_low_stock,
          SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) as total_out_of_stock
        FROM ingredients
      `);
      
      // Get top 5 most valuable items
      const [mostValuable] = await db.query(`
        SELECT 
          name,
          category,
          current_stock,
          cost_per_unit,
          ROUND(cost_per_unit * current_stock, 2) as value
        FROM ingredients
        ORDER BY value DESC
        LIMIT 5
      `);
      
      return {
        category_summary: categorySummary,
        overall_totals: overallTotals[0] || {},
        most_valuable_items: mostValuable,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in Ingredient.getStockSummary:', error);
      throw error;
    }
  }

  // ========== SPECIALIZED QUERIES ==========
  
  // Search ingredients by name or notes
  static async search(query) {
    try {
      const [ingredients] = await db.query(`
        SELECT 
          i.*,
          s.name as supplier_name,
          CASE 
            WHEN i.current_stock <= i.minimum_stock THEN 'Low'
            ELSE 'Adequate'
          END as stock_status
        FROM ingredients i
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.name LIKE ? 
           OR i.notes LIKE ?
           OR i.category LIKE ?
           OR s.name LIKE ?
        ORDER BY i.name ASC
        LIMIT 50
      `, [
        `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`
      ]);
      
      return ingredients;
    } catch (error) {
      console.error('Error in Ingredient.search:', error);
      throw error;
    }
  }

  // Update stock with transaction tracking
  static async updateStock(id, quantity, userId, notes = '') {
    const connection = await db.beginTransaction();
    
    try {
      // Get current stock
      const [rows] = await connection.query(
        'SELECT * FROM ingredients WHERE id = ?',
        [id]
      );
      const ingredient = rows[0];
      
      if (!ingredient) {
        throw new Error('Ingredient not found');
      }
      
      const oldStock = parseFloat(ingredient.current_stock);
      const newStock = oldStock + parseFloat(quantity);
      
      // Update ingredient stock
      await connection.query(
        'UPDATE ingredients SET current_stock = ?, updated_at = NOW() WHERE id = ?',
        [newStock, id]
      );
      
      // Record stock history
      await connection.query(`
        INSERT INTO stock_history 
        (ingredient_id, previous_stock, new_stock, adjustment, 
         notes, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `, [id, oldStock, newStock, quantity, notes, userId]);
      
      await connection.commit();
      
      // Return updated ingredient
      return await this.findById(id);
    } catch (error) {
      await connection.rollback();
      console.error('Error in Ingredient.updateStock:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get ingredient usage statistics
  static async getUsageStats() {
    try {
      const [usageStats] = await db.query(`
        SELECT 
          i.id,
          i.name,
          i.category,
          COUNT(DISTINCT mii.menu_item_id) as used_in_recipes,
          GROUP_CONCAT(DISTINCT mi.name SEPARATOR ', ') as recipe_names
        FROM ingredients i
        LEFT JOIN menu_item_ingredients mii ON i.id = mii.ingredient_id
        LEFT JOIN menu_items mi ON mii.menu_item_id = mi.id
        GROUP BY i.id
        ORDER BY used_in_recipes DESC
      `);
      
      return usageStats;
    } catch (error) {
      console.error('Error in Ingredient.getUsageStats:', error);
      throw error;
    }
  }
}

module.exports = Ingredient;