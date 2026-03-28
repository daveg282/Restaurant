// controllers/InventoryController.js
const Ingredient = require('../models/Ingredient');
const db = require('../config/db');

class InventoryController {

  static async getIngredients(req, res) {
    try {
      const filters = {
        category:  req.query.category,
        search:    req.query.search,
        low_stock: req.query.low_stock,
        limit:     req.query.limit ? parseInt(req.query.limit) : null
      };

      const ingredients = await Ingredient.getAll(filters);

      res.json({ success: true, data: ingredients, count: ingredients.length });
    } catch (error) {
      console.error('Get all ingredients error:', error);
      res.status(500).json({ success: false, error: error.message || 'Server error getting ingredients' });
    }
  }

  static async getIngredient(req, res) {
    try {
      const { id } = req.params;
      const ingredient = await Ingredient.findById(id);

      if (!ingredient) {
        return res.status(404).json({ success: false, error: 'Ingredient not found' });
      }

      res.json({ success: true, data: ingredient, message: `Full details for ${ingredient.name}` });
    } catch (error) {
      console.error('Error in getIngredient:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch ingredient details', details: error.message });
    }
  }

  static async createIngredient(req, res) {
    try {
      const ingredientData = req.body;
      const performedBy   = req.user?.id || null;

      if (!ingredientData.name || !ingredientData.unit) {
        return res.status(400).json({ success: false, error: 'Name and unit are required fields' });
      }

      const ingredient = await Ingredient.create(ingredientData, performedBy);

      if (ingredient) {
        return res.status(201).json({
          success: true,
          message: 'Ingredient created successfully',
          data: ingredient
        });
      }

      return res.status(500).json({ success: false, error: 'Failed to create ingredient' });
    } catch (error) {
      console.error('Create error:', error);
      return res.status(500).json({ success: false, error: 'Failed to create ingredient', details: error.message });
    }
  }

  static async updateIngredient(req, res) {
    try {
      const { id }     = req.params;
      const updateData = req.body;

      const ingredient = await Ingredient.update(id, updateData);

      if (!ingredient) {
        return res.status(500).json({ success: false, error: 'Failed to update ingredient' });
      }

      return res.json({ success: true, message: 'Ingredient updated successfully', data: ingredient });
    } catch (error) {
      console.error('Update error:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: error.message });
      }

      return res.status(500).json({ success: false, error: 'Failed to update ingredient', details: error.message });
    }
  }

  static async deleteIngredient(req, res) {
    try {
      const { id } = req.params;
      const result = await Ingredient.delete(id);

      res.json({ success: true, message: result.message, deleted_id: id, deleted_by: req.user.username });
    } catch (error) {
      console.error('Error in deleteIngredient:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== UPDATE STOCK ==========
  static async updateStock(req, res) {
    try {
      const { id }                    = req.params;
      const { quantity, notes, type } = req.body;
      const userId                    = req.user?.id || null;

      if (!quantity || isNaN(parseFloat(quantity))) {
        return res.status(400).json({ success: false, error: 'Valid quantity required' });
      }

      // Validate type if provided
      const validTypes = ['restock', 'removal', 'adjustment', 'expiry'];
      const txType     = validTypes.includes(type) ? type : null;

      const result = await Ingredient.updateStock(
        id,
        parseFloat(quantity),
        userId,
        txType,
        notes || null
      );

      res.json({ success: true, message: 'Stock updated', data: result });
    } catch (error) {
      console.error('Update stock error:', error);
      const isValidationError = error.message.includes('Insufficient stock');
      res.status(isValidationError ? 400 : 500).json({ success: false, error: error.message });
    }
  }

  // ========== GET TRANSACTION LEDGER ==========
  static async getTransactions(req, res) {
    try {
      const { id }                                        = req.params;
      const { type, start_date, end_date, limit }        = req.query;

      // Lightweight existence check — avoids triggering findById which joins transactions
      const rows = await db.query(
        'SELECT id, name, unit, current_stock FROM ingredients WHERE id = ?', [id]
      );
      const ingredient = rows[0];

      if (!ingredient) {
        return res.status(404).json({ success: false, error: 'Ingredient not found' });
      }

      const [transactions, summary] = await Promise.all([
        Ingredient.getTransactions(id, { type, start_date, end_date, limit }),
        Ingredient.getTransactionSummary(id)
      ]);

      res.json({
        success: true,
        data: {
          ingredient: {
            id:            ingredient.id,
            name:          ingredient.name,
            unit:          ingredient.unit,
            current_stock: ingredient.current_stock
          },
          transactions,
          summary,
          count: transactions.length
        }
      });
    } catch (error) {
      console.error('Error in getTransactions:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch transactions', details: error.message });
    }
  }

  // ========== GET STOCK SUMMARY ==========
  static async getStockSummary(req, res) {
    try {
      const summary = await Ingredient.getStockSummary();

      res.json({ success: true, data: summary, message: 'Comprehensive stock summary' });
    } catch (error) {
      console.error('Error in getStockSummary:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch stock summary', details: error.message });
    }
  }

  static async getLowStock(req, res) {
    try {
      const lowStockItems = await Ingredient.getLowStock();

      res.json({
        success: true,
        data: {
          items: lowStockItems,
          count: lowStockItems.length,
          alert: lowStockItems.length > 0
            ? `${lowStockItems.length} items need attention`
            : 'All stock levels are adequate'
        },
        message: 'Low stock items report'
      });
    } catch (error) {
      console.error('Error in getLowStock:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch low stock', details: error.message });
    }
  }

  static async getByCategory(req, res) {
    try {
      const { category }  = req.params;
      const ingredients   = await Ingredient.getByCategory(category);

      res.json({ success: true, data: ingredients, count: ingredients.length });
    } catch (error) {
      console.error('Error in getByCategory:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch ingredients by category', details: error.message });
    }
  }

  static async getWithSuppliers(req, res) {
    try {
      const ingredients = await Ingredient.getWithSuppliers();

      res.json({ success: true, data: ingredients, count: ingredients.length, message: 'Ingredients with supplier information' });
    } catch (error) {
      console.error('Error in getWithSuppliers:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch ingredients with suppliers', details: error.message });
    }
  }

  static async searchIngredients(req, res) {
    try {
      const { q } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
      }

      const ingredients = await Ingredient.search(q);

      res.json({ success: true, data: ingredients, count: ingredients.length, query: q });
    } catch (error) {
      console.error('Error in searchIngredients:', error);
      res.status(500).json({ success: false, error: 'Failed to search ingredients', details: error.message });
    }
  }

  static async getUsageStats(req, res) {
    try {
      const usageStats = await Ingredient.getUsageStats();

      res.json({ success: true, data: usageStats, total_ingredients: usageStats.length });
    } catch (error) {
      console.error('Error in getUsageStats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch usage statistics', details: error.message });
    }
  }

  static async getCategories(req, res) {
    try {
      const categoryList = await Ingredient.getCategories();

      res.json({ success: true, data: categoryList, count: categoryList.length });
    } catch (error) {
      console.error('Error in getCategories:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch categories', details: error.message });
    }
  }

  static async checkOrderStock(req, res) {
    try {
      const { items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Items array is required' });
      }

      const results = [];
      let hasSufficientStock = true;

      for (const item of items) {
        if (!item.ingredient_id || !item.quantity_needed) continue;

        const ingredient = await Ingredient.findById(item.ingredient_id);
        if (!ingredient) {
          results.push({ ingredient_id: item.ingredient_id, reason: 'Ingredient not found', status: 'error' });
          hasSufficientStock = false;
        } else {
          const currentStock = parseFloat(ingredient.current_stock);
          const neededStock  = parseFloat(item.quantity_needed);

          if (currentStock < neededStock) {
            results.push({
              ingredient_id: item.ingredient_id, ingredient_name: ingredient.name,
              current_stock: currentStock, quantity_needed: neededStock,
              shortage: neededStock - currentStock, unit: ingredient.unit, status: 'insufficient'
            });
            hasSufficientStock = false;
          } else {
            results.push({
              ingredient_id: item.ingredient_id, ingredient_name: ingredient.name,
              current_stock: currentStock, quantity_needed: neededStock,
              remaining: currentStock - neededStock, unit: ingredient.unit, status: 'sufficient'
            });
          }
        }
      }

      res.json({
        success: true,
        data: {
          has_sufficient_stock: hasSufficientStock,
          insufficient_items: results.filter(i => i.status === 'insufficient'),
          sufficient_items:   results.filter(i => i.status === 'sufficient'),
          error_items:        results.filter(i => i.status === 'error'),
          can_proceed:        hasSufficientStock,
          total_items_checked: items.length
        }
      });
    } catch (error) {
      console.error('Error in checkOrderStock:', error);
      res.status(500).json({ success: false, error: 'Failed to check order stock', details: error.message });
    }
  }

  static async bulkUpdateStock(req, res) {
    try {
      const { updates } = req.body;
      const userId      = req.user?.id || null;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ success: false, error: 'Updates array is required' });
      }

      const results = [];
      const errors  = [];

      for (const update of updates) {
        try {
          if (!update.ingredient_id || update.quantity === undefined) {
            errors.push({ ingredient_id: update.ingredient_id, error: 'Missing ingredient_id or quantity' });
            continue;
          }

          const ingredient = await Ingredient.updateStock(
            update.ingredient_id,
            parseFloat(update.quantity),
            userId,
            null,
            update.notes || 'Bulk update'
          );

          results.push({
            ingredient_id: update.ingredient_id,
            new_stock:     ingredient.new_stock,
            adjustment:    parseFloat(update.quantity),
            success:       true
          });
        } catch (error) {
          errors.push({ ingredient_id: update.ingredient_id, error: error.message });
        }
      }

      res.json({
        success: true,
        data: {
          successful_updates: results,
          failed_updates:     errors,
          total_processed:    updates.length,
          successful_count:   results.length,
          failed_count:       errors.length
        },
        message: `Bulk stock update completed. ${results.length} successful, ${errors.length} failed.`
      });
    } catch (error) {
      console.error('Error in bulkUpdateStock:', error);
      res.status(500).json({ success: false, error: 'Failed to process bulk update', details: error.message });
    }
  }
}

module.exports = InventoryController;