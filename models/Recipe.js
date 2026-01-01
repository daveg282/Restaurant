const db = require('../config/db');

class Recipe {
  // Get recipe for a menu item
  static async getByMenuItem(menuItemId) {
    return await db.query(`
      SELECT 
        mii.*,
        i.name as ingredient_name,
        i.unit as ingredient_unit,
        i.current_stock,
        i.cost_per_unit,
        ROUND(i.cost_per_unit * mii.quantity_required, 2) as ingredient_cost
      FROM menu_item_ingredients mii
      JOIN ingredients i ON mii.ingredient_id = i.id
      WHERE mii.menu_item_id = ?
      ORDER BY i.name
    `, [menuItemId]);
  }

  // Calculate menu item cost
  static async calculateMenuItemCost(menuItemId) {
    const [cost] = await db.query(`
      SELECT ROUND(SUM(i.cost_per_unit * mii.quantity_required), 2) as total_cost
      FROM menu_item_ingredients mii
      JOIN ingredients i ON mii.ingredient_id = i.id
      WHERE mii.menu_item_id = ?
    `, [menuItemId]);
    
    return cost[0]?.total_cost || 0;
  }

  // Add ingredient to recipe
  static async addIngredient(menuItemId, ingredientId, quantityRequired) {
    await db.query(`
      INSERT INTO menu_item_ingredients 
      (menu_item_id, ingredient_id, quantity_required, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
        quantity_required = VALUES(quantity_required),
        updated_at = NOW()
    `, [menuItemId, ingredientId, quantityRequired]);
    
    return await this.getByMenuItem(menuItemId);
  }

  // Remove ingredient from recipe
  static async removeIngredient(menuItemId, ingredientId) {
    await db.query(`
      DELETE FROM menu_item_ingredients 
      WHERE menu_item_id = ? AND ingredient_id = ?
    `, [menuItemId, ingredientId]);
    
    return { message: 'Ingredient removed from recipe successfully' };
  }

  // Calculate profit margin
  static async calculateProfitMargin(menuItemId) {
    // First get menu item price
    const [menuItem] = await db.query(`
      SELECT price FROM menu_items WHERE id = ?
    `, [menuItemId]);
    
    if (!menuItem[0]) return null;
    
    const menuItemPrice = menuItem[0].price;
    const totalCost = await this.calculateMenuItemCost(menuItemId);
    const profit = menuItemPrice - totalCost;
    const marginPercentage = menuItemPrice > 0 ? (profit / menuItemPrice) * 100 : 0;
    
    return {
      menu_item_id: menuItemId,
      menu_item_price: menuItemPrice,
      total_cost: totalCost,
      profit: profit,
      margin_percentage: Math.round(marginPercentage * 100) / 100
    };
  }

  // Get most profitable items
  static async getMostProfitableItems(limit = 10) {
    return await db.query(`
      SELECT 
        mi.id,
        mi.name,
        mi.price,
        COALESCE(ROUND(SUM(i.cost_per_unit * mii.quantity_required), 2), 0) as total_cost,
        COALESCE(mi.price - ROUND(SUM(i.cost_per_unit * mii.quantity_required), 2), mi.price) as profit,
        CASE 
          WHEN mi.price > 0 THEN 
            ROUND(((mi.price - COALESCE(ROUND(SUM(i.cost_per_unit * mii.quantity_required), 2), 0)) / mi.price) * 100, 2)
          ELSE 0 
        END as margin_percentage
      FROM menu_items mi
      LEFT JOIN menu_item_ingredients mii ON mi.id = mii.menu_item_id
      LEFT JOIN ingredients i ON mii.ingredient_id = i.id
      WHERE mi.available = 1
      GROUP BY mi.id, mi.name, mi.price
      HAVING profit > 0
      ORDER BY margin_percentage DESC
      LIMIT ?
    `, [limit]);
  }
}

module.exports = Recipe;