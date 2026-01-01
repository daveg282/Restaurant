// controllers/InventoryController.js
const Ingredient = require('../models/Ingredient');

class InventoryController {
 
static async getIngredients(req, res) {
  try {
    const filters = {
      category: req.query.category,
      search: req.query.search,
      low_stock: req.query.low_stock,
      limit: req.query.limit ? parseInt(req.query.limit) : null
    };
    
    console.log('Fetching ingredients with filters:', filters);
    
    // IMPORTANT: Destructure like in MenuItem controller
    const ingredients = await Ingredient.getAll(filters);
    
    res.json({
      success: true,
      data: ingredients,
      count: ingredients.length
    });
  } catch (error) {
    console.error('Get all ingredients error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting ingredients'
    });
  }
}

  // ========== GET SINGLE INGREDIENT WITH ALL DETAILS ==========
  static async getIngredient(req, res) {
    try {
      const { id } = req.params;
      console.log(`Fetching full details for ingredient ID: ${id}`);
      
      const ingredient = await Ingredient.findById(id);
      
      if (!ingredient) {
        return res.status(404).json({ 
          success: false, 
          error: 'Ingredient not found' 
        });
      }
      
      console.log(`Successfully fetched ingredient: ${ingredient.name}`);
      
      res.json({
        success: true,
        data: ingredient,
        message: `Full details for ${ingredient.name}`
      });
    } catch (error) {
      console.error('Error in getIngredient:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch ingredient details',
        details: error.message 
      });
    }
  }

  // ========== CREATE INGREDIENT (WITH HISTORY) ==========
  static async createIngredient(req, res) {
    try {
      const ingredientData = req.body;
      const userId = req.user.id;
      
      console.log('Creating new ingredient:', ingredientData.name);
      
      // Validate required fields
      if (!ingredientData.name || !ingredientData.unit) {
        return res.status(400).json({ 
          success: false, 
          error: 'Name and unit are required fields' 
        });
      }
      
      // Add user ID to ingredient data for history
      const ingredientWithUser = { ...ingredientData };
      
      const ingredient = await Ingredient.create(ingredientWithUser);
      
      console.log(`Ingredient created successfully: ${ingredient.name} (ID: ${ingredient.id})`);
      
      res.status(201).json({
        success: true,
        message: 'Ingredient created successfully',
        data: ingredient,
        created_by: req.user.username
      });
    } catch (error) {
      console.error('Error in createIngredient:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create ingredient',
        details: error.message 
      });
    }
  }

  // ========== UPDATE INGREDIENT (WITH HISTORY) ==========
  static async updateIngredient(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const userId = req.user.id;
      
      console.log(`Updating ingredient ID: ${id}`, updateData);
      
      // Check if ingredient exists first
      const existingIngredient = await Ingredient.findById(id);
      if (!existingIngredient) {
        return res.status(404).json({ 
          success: false, 
          error: 'Ingredient not found' 
        });
      }
      
      const ingredient = await Ingredient.update(id, updateData, userId);
      
      console.log(`Ingredient updated successfully: ${ingredient.name}`);
      
      res.json({
        success: true,
        message: 'Ingredient updated successfully',
        data: ingredient,
        updated_by: req.user.username
      });
    } catch (error) {
      console.error('Error in updateIngredient:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update ingredient',
        details: error.message 
      });
    }
  }

  // ========== DELETE INGREDIENT ==========
  static async deleteIngredient(req, res) {
    try {
      const { id } = req.params;
      
      console.log(`Attempting to delete ingredient ID: ${id}`);
      
      const result = await Ingredient.delete(id);
      
      console.log(`Ingredient deleted successfully: ID ${id}`);
      
      res.json({
        success: true,
        message: result.message,
        deleted_id: id,
        deleted_by: req.user.username
      });
    } catch (error) {
      console.error('Error in deleteIngredient:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // ========== UPDATE STOCK (WITH HISTORY) ==========
  static async updateStock(req, res) {
    try {
      const { id } = req.params;
      const { quantity, notes } = req.body;
      const userId = req.user.id;
      
      console.log(`Updating stock for ingredient ID: ${id}, quantity: ${quantity}`);
      
      if (!quantity || isNaN(parseFloat(quantity))) {
        return res.status(400).json({ 
          success: false, 
          error: 'Valid quantity is required' 
        });
      }
      
      const ingredient = await Ingredient.updateStock(
        id, 
        parseFloat(quantity), 
        userId, 
        notes || 'Manual stock adjustment'
      );
      
      console.log(`Stock updated successfully for ${ingredient.name}`);
      
      res.json({
        success: true,
        message: 'Stock updated successfully',
        data: ingredient,
        adjustment: parseFloat(quantity),
        updated_by: req.user.username
      });
    } catch (error) {
      console.error('Error in updateStock:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // ========== GET STOCK SUMMARY (COMPREHENSIVE) ==========
  static async getStockSummary(req, res) {
    try {
      console.log('Fetching comprehensive stock summary...');
      
      const summary = await Ingredient.getStockSummary();
      
      console.log('Stock summary fetched successfully');
      
      res.json({
        success: true,
        data: summary,
        message: 'Comprehensive stock summary'
      });
    } catch (error) {
      console.error('Error in getStockSummary:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch stock summary',
        details: error.message 
      });
    }
  }

  // ========== GET LOW STOCK ITEMS ==========
  static async getLowStock(req, res) {
    try {
      console.log('Fetching low stock items...');
      
      const lowStockItems = await Ingredient.getLowStock();
      
      console.log(`Found ${lowStockItems.length} low stock items`);
      
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
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch low stock items',
        details: error.message 
      });
    }
  }

  // ========== GET BY CATEGORY ==========
  static async getByCategory(req, res) {
    try {
      const { category } = req.params;
      
      console.log(`Fetching ingredients for category: ${category}`);
      
      const ingredients = await Ingredient.getByCategory(category);
      
      console.log(`Found ${ingredients.length} ingredients in category: ${category}`);
      
      res.json({
        success: true,
        data: ingredients,
        count: ingredients.length,
        category: category
      });
    } catch (error) {
      console.error('Error in getByCategory:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch category ingredients',
        details: error.message 
      });
    }
  }

  // ========== GET WITH SUPPLIERS ==========
  static async getWithSuppliers(req, res) {
    try {
      console.log('Fetching ingredients with supplier info...');
      
      const ingredients = await Ingredient.getWithSuppliers();
      
      console.log(`Fetched ${ingredients.length} ingredients with supplier details`);
      
      res.json({
        success: true,
        data: ingredients,
        count: ingredients.length,
        message: 'Ingredients with supplier information'
      });
    } catch (error) {
      console.error('Error in getWithSuppliers:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch ingredients with suppliers',
        details: error.message 
      });
    }
  }

  // ========== SEARCH INGREDIENTS ==========
  static async searchIngredients(req, res) {
    try {
      const { q } = req.query;
      
      if (!q || q.trim().length < 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'Search query must be at least 2 characters' 
        });
      }
      
      console.log(`Searching ingredients for: "${q}"`);
      
      const ingredients = await Ingredient.search(q);
      
      console.log(`Found ${ingredients.length} ingredients matching "${q}"`);
      
      res.json({
        success: true,
        data: ingredients,
        count: ingredients.length,
        query: q,
        message: `Search results for "${q}"`
      });
    } catch (error) {
      console.error('Error in searchIngredients:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search ingredients',
        details: error.message 
      });
    }
  }

  // ========== GET USAGE STATISTICS ==========
  static async getUsageStats(req, res) {
    try {
      console.log('Fetching ingredient usage statistics...');
      
      const usageStats = await Ingredient.getUsageStats();
      
      console.log('Usage statistics fetched successfully');
      
      res.json({
        success: true,
        data: usageStats,
        message: 'Ingredient usage statistics',
        total_ingredients: usageStats.length
      });
    } catch (error) {
      console.error('Error in getUsageStats:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch usage statistics',
        details: error.message 
      });
    }
  }

  // ========== CHECK ORDER STOCK AVAILABILITY ==========
  static async checkOrderStock(req, res) {
    try {
      const { items } = req.body;
      
      console.log('Checking stock availability for order items:', items);
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Items array is required' 
        });
      }
      
      const insufficientItems = [];
      let hasSufficientStock = true;
      
      for (const item of items) {
        if (!item.ingredient_id || !item.quantity_needed) {
          console.warn('Invalid item format:', item);
          continue;
        }
        
        const ingredient = await Ingredient.findById(item.ingredient_id);
        if (!ingredient) {
          insufficientItems.push({
            ingredient_id: item.ingredient_id,
            reason: 'Ingredient not found',
            status: 'error'
          });
          hasSufficientStock = false;
        } else {
          const currentStock = parseFloat(ingredient.current_stock);
          const neededStock = parseFloat(item.quantity_needed);
          
          if (currentStock < neededStock) {
            insufficientItems.push({
              ingredient_id: item.ingredient_id,
              ingredient_name: ingredient.name,
              current_stock: currentStock,
              quantity_needed: neededStock,
              shortage: neededStock - currentStock,
              unit: ingredient.unit,
              status: 'insufficient'
            });
            hasSufficientStock = false;
          } else {
            insufficientItems.push({
              ingredient_id: item.ingredient_id,
              ingredient_name: ingredient.name,
              current_stock: currentStock,
              quantity_needed: neededStock,
              remaining: currentStock - neededStock,
              unit: ingredient.unit,
              status: 'sufficient'
            });
          }
        }
      }
      
      const result = {
        has_sufficient_stock: hasSufficientStock,
        insufficient_items: insufficientItems.filter(item => item.status === 'insufficient'),
        sufficient_items: insufficientItems.filter(item => item.status === 'sufficient'),
        error_items: insufficientItems.filter(item => item.status === 'error'),
        can_proceed: hasSufficientStock,
        total_items_checked: items.length
      };
      
      console.log('Stock check completed:', result);
      
      res.json({
        success: true,
        data: result,
        message: hasSufficientStock 
          ? 'All items have sufficient stock' 
          : 'Some items are low on stock'
      });
    } catch (error) {
      console.error('Error in checkOrderStock:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to check order stock',
        details: error.message 
      });
    }
  }

  // ========== GET CATEGORIES LIST ==========
  static async getCategories(req, res) {
    try {
      console.log('Fetching ingredient categories...');
      
      const [categories] = await db.query(`
        SELECT DISTINCT category 
        FROM ingredients 
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category ASC
      `);
      
      const categoryList = categories.map(c => c.category);
      
      console.log(`Found ${categoryList.length} categories`);
      
      res.json({
        success: true,
        data: categoryList,
        count: categoryList.length,
        message: 'Available ingredient categories'
      });
    } catch (error) {
      console.error('Error in getCategories:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch categories',
        details: error.message 
      });
    }
  }

  // ========== BULK STOCK UPDATE ==========
  static async bulkUpdateStock(req, res) {
    try {
      const { updates } = req.body;
      const userId = req.user.id;
      
      console.log('Processing bulk stock update:', updates);
      
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Updates array is required' 
        });
      }
      
      const results = [];
      const errors = [];
      
      for (const update of updates) {
        try {
          if (!update.ingredient_id || update.quantity === undefined) {
            errors.push({
              ingredient_id: update.ingredient_id,
              error: 'Missing ingredient_id or quantity'
            });
            continue;
          }
          
          const ingredient = await Ingredient.updateStock(
            update.ingredient_id,
            parseFloat(update.quantity),
            userId,
            update.notes || 'Bulk update'
          );
          
          results.push({
            ingredient_id: update.ingredient_id,
            ingredient_name: ingredient.name,
            new_stock: ingredient.current_stock,
            adjustment: parseFloat(update.quantity),
            success: true
          });
          
        } catch (error) {
          errors.push({
            ingredient_id: update.ingredient_id,
            error: error.message
          });
        }
      }
      
      console.log(`Bulk update completed: ${results.length} successful, ${errors.length} failed`);
      
      res.json({
        success: true,
        data: {
          successful_updates: results,
          failed_updates: errors,
          total_processed: updates.length,
          successful_count: results.length,
          failed_count: errors.length
        },
        message: `Bulk stock update completed. ${results.length} successful, ${errors.length} failed.`
      });
    } catch (error) {
      console.error('Error in bulkUpdateStock:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process bulk update',
        details: error.message 
      });
    }
  }
}

module.exports = InventoryController;