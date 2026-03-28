// models/Ingredient.js
const db = require('../config/db');

class Ingredient {
  // ========== GET METHODS ==========

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

      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting ingredients: ${error.message}`);
    }
  }

  static async getCategories() {
    try {
      const result = await db.query(`
        SELECT DISTINCT category
        FROM ingredients
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category ASC
      `);

      let rows = Array.isArray(result) ? result : (result.rows || []);

      return rows
        .map(row => (typeof row === 'string' ? row : row?.category))
        .filter(cat => cat && typeof cat === 'string' && cat.trim() !== '')
        .map(cat => cat.trim());
    } catch (error) {
      console.error('Error in Ingredient.getCategories:', error);
      return [];
    }
  }

  static async findById(id) {
    try {
      const rows = await db.query(`
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

      const recipes = await db.query(`
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

      // Fetch recent transactions (last 20) for the detail view
      const recentTransactions = await Ingredient.getTransactions(id, { limit: 20 });

      let supplier = null;
      if (ingredient.supplier_id) {
        const suppliers = await db.query('SELECT * FROM suppliers WHERE id = ?', [ingredient.supplier_id]);
        supplier = suppliers[0] || null;
      }

      return {
        ...ingredient,
        recipes,
        stock_history: recentTransactions, // keeps backward compat with existing UI
        supplier_details: supplier,
        used_in_recipes_count: recipes.length,
        is_low_stock: parseFloat(ingredient.current_stock) <= parseFloat(ingredient.minimum_stock)
      };
    } catch (error) {
      console.error('Error in Ingredient.findById:', error);
      throw error;
    }
  }

  // ========== CREATE ==========
  static async create(ingredientData, performedBy = null) {
    const connection = await db.beginTransaction();

    try {
      const {
        name, unit, current_stock = 0, minimum_stock = 10,
        cost_per_unit = 0, supplier_id, category, notes
      } = ingredientData;

      const [result] = await connection.query(`
        INSERT INTO ingredients
          (name, unit, current_stock, minimum_stock, cost_per_unit,
           supplier_id, category, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [name, unit, current_stock, minimum_stock, cost_per_unit, supplier_id, category, notes]);

      const ingredientId = result.insertId;

      // Log initial stock transaction if stock > 0
      if (parseFloat(current_stock) > 0) {
        await connection.query(`
          INSERT INTO ingredient_transactions
            (ingredient_id, transaction_type, quantity, quantity_before, quantity_after,
             cost_per_unit, notes, performed_by, created_at)
          VALUES (?, 'initial', ?, 0, ?, ?, 'Initial stock on ingredient creation', ?, NOW())
        `, [
          ingredientId,
          parseFloat(current_stock),
          parseFloat(current_stock),
          parseFloat(cost_per_unit),
          performedBy
        ]);
      }

      await connection.commit();

      return {
        id: ingredientId,
        name, unit, current_stock, minimum_stock,
        cost_per_unit, supplier_id, category, notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        supplier_name: null
      };
    } catch (error) {
      await connection.rollback();
      console.error('Create error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ========== UPDATE ==========
  static async update(id, updateData) {
    try {
      const checkRows = await db.query('SELECT * FROM ingredients WHERE id = ?', [id]);

      if (!checkRows || checkRows.length === 0) {
        throw new Error(`Ingredient ${id} not found`);
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

      if (updates.length === 0) return checkRows[0];

      updates.push('updated_at = NOW()');
      params.push(id);

      await db.query(`UPDATE ingredients SET ${updates.join(', ')} WHERE id = ?`, params);

      return {
        ...checkRows[0],
        ...updateData,
        id: parseInt(id),
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  }

  // ========== DELETE ==========
  static async delete(id) {
    const connection = await db.beginTransaction();

    try {
      const [usedInRecipes] = await connection.query(
        'SELECT COUNT(*) as count FROM menu_item_ingredients WHERE ingredient_id = ?',
        [id]
      );

      if (usedInRecipes[0].count > 0) {
        await connection.rollback();
        throw new Error('Cannot delete ingredient: It is used in one or more recipes');
      }

      // Transactions are deleted automatically via ON DELETE CASCADE
      await connection.query('DELETE FROM ingredients WHERE id = ?', [id]);

      await connection.commit();
      return { message: 'Ingredient deleted successfully', id };
    } catch (error) {
      await connection.rollback();
      console.error('Error in Ingredient.delete:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ========== UPDATE STOCK (with transaction logging) ==========
  static async updateStock(id, quantity, performedBy = null, type = null, notes = null, referenceId = null, referenceType = null) {
    const connection = await db.beginTransaction();

    try {
      const [rows] = await connection.query('SELECT current_stock, cost_per_unit FROM ingredients WHERE id = ?', [id]);

      if (!rows || rows.length === 0) {
        throw new Error(`Ingredient ${id} not found`);
      }

      const oldStock    = parseFloat(rows[0].current_stock);
      const costPerUnit = parseFloat(rows[0].cost_per_unit);
      const adjustment  = parseFloat(quantity);
      const newStock    = oldStock + adjustment;

      // Prevent negative stock
      if (newStock < 0) {
        await connection.rollback();
        connection.release();
        throw new Error(`Insufficient stock. Available: ${oldStock}, Requested: ${Math.abs(adjustment)}`);
      }

      // Determine transaction type automatically if not provided
      let txType = type;
      if (!txType) {
        if (adjustment > 0) txType = 'restock';
        else if (adjustment < 0) txType = 'removal';
        else txType = 'adjustment';
      }

      // Update stock
      await connection.query(
        'UPDATE ingredients SET current_stock = ?, updated_at = NOW() WHERE id = ?',
        [newStock, id]
      );

      // Log transaction
      await connection.query(`
        INSERT INTO ingredient_transactions
          (ingredient_id, transaction_type, quantity, quantity_before, quantity_after,
           cost_per_unit, reference_id, reference_type, notes, performed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        id, txType, adjustment, oldStock, newStock,
        costPerUnit, referenceId, referenceType,
        notes || `Stock ${adjustment >= 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustment)}`,
        performedBy
      ]);

      await connection.commit();

      return { id, new_stock: newStock, adjustment };
    } catch (error) {
      await connection.rollback();
      console.error('Update stock error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ========== LOG TRANSACTION (standalone, for order usage etc.) ==========
  static async logTransaction(data) {
    const {
      ingredient_id, transaction_type, quantity,
      quantity_before, quantity_after, cost_per_unit,
      reference_id, reference_type, notes, performed_by
    } = data;

    await db.query(`
      INSERT INTO ingredient_transactions
        (ingredient_id, transaction_type, quantity, quantity_before, quantity_after,
         cost_per_unit, reference_id, reference_type, notes, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      ingredient_id, transaction_type, quantity,
      quantity_before, quantity_after, cost_per_unit,
      reference_id || null, reference_type || null,
      notes || null, performed_by || null
    ]);
  }

  // ========== GET TRANSACTIONS (ledger per ingredient) ==========
  static async getTransactions(ingredientId, filters = {}) {
    try {
      let sql = `
        SELECT
          it.*,
          u.username   as performed_by_name,
          u.role       as performed_by_role,
          CASE
            WHEN it.quantity > 0 THEN 'in'
            WHEN it.quantity < 0 THEN 'out'
            ELSE 'neutral'
          END as direction
        FROM ingredient_transactions it
        LEFT JOIN users u ON it.performed_by = u.id
        WHERE it.ingredient_id = ?
      `;

      const params = [ingredientId];

      if (filters.type) {
        sql += ' AND it.transaction_type = ?';
        params.push(filters.type);
      }

      if (filters.start_date) {
        sql += ' AND it.created_at >= ?';
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        sql += ' AND it.created_at <= ?';
        params.push(filters.end_date + ' 23:59:59');
      }

      sql += ' ORDER BY it.created_at DESC';

      const limit = parseInt(filters.limit) || 100;
      sql += ' LIMIT ?';
      params.push(limit);

      const rows = await db.query(sql, params);
      return rows || [];
    } catch (error) {
      console.error('Error in Ingredient.getTransactions:', error);
      throw error;
    }
  }

  // ========== GET TRANSACTION SUMMARY (stats per ingredient) ==========
  static async getTransactionSummary(ingredientId) {
    try {
      const rows = await db.query(`
        SELECT
          transaction_type,
          COUNT(*)                                          as count,
          SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END)  as total_in,
          SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as total_out,
          MAX(created_at)                                    as last_occurrence
        FROM ingredient_transactions
        WHERE ingredient_id = ?
        GROUP BY transaction_type
        ORDER BY last_occurrence DESC
      `, [ingredientId]);

      return rows || [];
    } catch (error) {
      console.error('Error in Ingredient.getTransactionSummary:', error);
      throw error;
    }
  }

  // ========== BATCH OPERATIONS ==========

  static async getByCategory(category) {
    try {
      const ingredients = await db.query(`
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

  static async getLowStock() {
    try {
      const ingredients = await db.query(`
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

      return ingredients || [];
    } catch (error) {
      console.error('Error in Ingredient.getLowStock:', error);
      return [];
    }
  }

  static async getWithSuppliers() {
    try {
      const ingredients = await db.query(`
        SELECT i.*, s.name as supplier_name, s.contact_person, s.phone, s.email, s.address
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

  static async getStockSummary() {
    try {
      const categorySummary = await db.query(`
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

      const overallTotals = await db.query(`
        SELECT
          COUNT(*) as total_ingredients,
          SUM(current_stock) as overall_stock,
          SUM(cost_per_unit * current_stock) as overall_value,
          SUM(CASE WHEN current_stock <= minimum_stock THEN 1 ELSE 0 END) as total_low_stock,
          SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) as total_out_of_stock
        FROM ingredients
      `);

      const mostValuable = await db.query(`
        SELECT name, category, current_stock, cost_per_unit,
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

  static async search(query) {
    try {
      const ingredients = await db.query(`
        SELECT
          i.*,
          s.name as supplier_name,
          CASE WHEN i.current_stock <= i.minimum_stock THEN 'Low' ELSE 'Adequate' END as stock_status
        FROM ingredients i
        LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.name LIKE ? OR i.notes LIKE ? OR i.category LIKE ? OR s.name LIKE ?
        ORDER BY i.name ASC
        LIMIT 50
      `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);

      return ingredients;
    } catch (error) {
      console.error('Error in Ingredient.search:', error);
      throw error;
    }
  }

  static async getUsageStats() {
    try {
      const usageStats = await db.query(`
        SELECT
          i.id, i.name, i.category,
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