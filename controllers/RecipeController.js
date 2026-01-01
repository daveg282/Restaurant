// controllers/RecipeController.js
const Recipe = require('../models/Recipe');

class RecipeController {
  // Get recipe for menu item
  static async getByMenuItem(req, res) {
    try {
      const { menu_item_id } = req.params;
      
      const recipe = await Recipe.findByMenuItem(menu_item_id);
      const cost = await Recipe.calculateCost(menu_item_id);
      
      // Get menu item details
      const menuItem = await db.queryOne(
        'SELECT name, price FROM menu_items WHERE id = ?',
        [menu_item_id]
      );
      
      res.json({
        success: true,
        data: {
          menu_item_id,
          menu_item_name: menuItem?.name || 'Unknown',
          selling_price: menuItem?.price || 0,
          cost_price: cost,
          profit_margin: menuItem?.price ? ((menuItem.price - cost) / menuItem.price * 100).toFixed(2) : 0,
          ingredients: recipe
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add ingredient to recipe
  static async addIngredient(req, res) {
    try {
      const { menu_item_id } = req.params;
      const { ingredient_id, quantity_required, is_optional } = req.body;
      
      if (!ingredient_id || !quantity_required) {
        return res.status(400).json({
          success: false,
          error: 'ingredient_id and quantity_required are required'
        });
      }
      
      const recipe = await Recipe.addIngredient(
        menu_item_id, 
        ingredient_id, 
        parseFloat(quantity_required),
        is_optional || false
      );
      
      res.json({
        success: true,
        message: 'Ingredient added to recipe',
        data: recipe
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Check availability for menu item
  static async checkAvailability(req, res) {
    try {
      const { menu_item_id } = req.params;
      const { quantity } = req.query;
      
      const availability = await Recipe.checkAvailability(
        menu_item_id, 
        parseInt(quantity) || 1
      );
      
      res.json({
        success: true,
        data: availability
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update recipe ingredient
  static async updateIngredient(req, res) {
    try {
      const { menu_item_id, ingredient_id } = req.params;
      const { quantity_required, is_optional } = req.body;
      
      const sql = `
        UPDATE recipes 
        SET quantity_required = ?, is_optional = ?
        WHERE menu_item_id = ? AND ingredient_id = ?
      `;
      
      await db.execute(sql, [
        parseFloat(quantity_required),
        is_optional || false,
        menu_item_id,
        ingredient_id
      ]);
      
      // Recalculate cost
      await Recipe.updateMenuItemCost(menu_item_id);
      
      res.json({
        success: true,
        message: 'Recipe updated successfully'
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // Remove ingredient from recipe
  static async removeIngredient(req, res) {
    try {
      const { menu_item_id, ingredient_id } = req.params;
      
      await db.execute(
        'DELETE FROM recipes WHERE menu_item_id = ? AND ingredient_id = ?',
        [menu_item_id, ingredient_id]
      );
      
      // Recalculate cost
      await Recipe.updateMenuItemCost(menu_item_id);
      
      res.json({
        success: true,
        message: 'Ingredient removed from recipe'
      });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = RecipeController;