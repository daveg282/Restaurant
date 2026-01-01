const db = require('../config/db');

class MenuItem {
  // Get all menu items with optional filters
  static async getAll(filters = {}) {
    try {
      let sql = `
        SELECT mi.*, c.name as category_name 
        FROM menu_items mi
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (filters.category_id) {
        sql += ' AND mi.category_id = ?';
        params.push(filters.category_id);
      }
      
      if (filters.available !== undefined) {
        sql += ' AND mi.available = ?';
        params.push(filters.available);
      }
      
      if (filters.popular !== undefined) {
        sql += ' AND mi.popular = ?';
        params.push(filters.popular);
      }
      
      if (filters.search) {
        sql += ' AND (mi.name LIKE ? OR mi.description LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
      }
      
      sql += ' ORDER BY mi.category_id, mi.name';
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting menu items: ${error.message}`);
    }
  }

  // Get menu item by ID
  static async findById(id) {
    try {
      const sql = `
        SELECT mi.*, c.name as category_name 
        FROM menu_items mi
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE mi.id = ?
      `;
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding menu item: ${error.message}`);
    }
  }

  // Create new menu item
  static async create(itemData) {
    try {
      const sql = `
        INSERT INTO menu_items 
        (name, description, price, category_id, image, available, popular, preparation_time, ingredients) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        itemData.name,
        itemData.description || '',
        itemData.price,
        itemData.category_id || null,
        itemData.image || '',
        itemData.available !== undefined ? itemData.available : true,
        itemData.popular !== undefined ? itemData.popular : false,
        itemData.preparation_time || 15,
        itemData.ingredients || ''
      ];
      
      const result = await db.execute(sql, params);
      
      return {
        id: result.insertId,
        ...itemData
      };
    } catch (error) {
      throw new Error(`Error creating menu item: ${error.message}`);
    }
  }

  // Update menu item
  static async update(id, itemData) {
    try {
      const updates = [];
      const params = [];
      
      if (itemData.name !== undefined) {
        updates.push('name = ?');
        params.push(itemData.name);
      }
      if (itemData.description !== undefined) {
        updates.push('description = ?');
        params.push(itemData.description);
      }
      if (itemData.price !== undefined) {
        updates.push('price = ?');
        params.push(itemData.price);
      }
      if (itemData.category_id !== undefined) {
        updates.push('category_id = ?');
        params.push(itemData.category_id);
      }
      if (itemData.image !== undefined) {
        updates.push('image = ?');
        params.push(itemData.image);
      }
      if (itemData.available !== undefined) {
        updates.push('available = ?');
        params.push(itemData.available);
      }
      if (itemData.popular !== undefined) {
        updates.push('popular = ?');
        params.push(itemData.popular);
      }
      if (itemData.preparation_time !== undefined) {
        updates.push('preparation_time = ?');
        params.push(itemData.preparation_time);
      }
      if (itemData.ingredients !== undefined) {
        updates.push('ingredients = ?');
        params.push(itemData.ingredients);
      }
      
      if (updates.length === 0) {
        return { message: 'No updates provided' };
      }
      
      params.push(id);
      const sql = `UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`;
      
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Error updating menu item: ${error.message}`);
    }
  }

  // Delete menu item (soft delete by setting available=false)
  static async delete(id) {
    try {
      const sql = 'UPDATE menu_items SET available = false WHERE id = ?';
      await db.execute(sql, [id]);
      return { message: 'Menu item deleted (set to unavailable)' };
    } catch (error) {
      throw new Error(`Error deleting menu item: ${error.message}`);
    }
  }

  // Get popular items
  static async getPopular() {
    try {
      const sql = `
        SELECT mi.*, c.name as category_name 
        FROM menu_items mi
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE mi.popular = true AND mi.available = true
        ORDER BY mi.name
      `;
      return await db.query(sql);
    } catch (error) {
      throw new Error(`Error getting popular items: ${error.message}`);
    }
  }

  // Toggle availability
  static async toggleAvailability(id) {
    try {
      const sql = 'UPDATE menu_items SET available = NOT available WHERE id = ?';
      await db.execute(sql, [id]);
      const item = await this.findById(id);
      return { 
        message: `Item ${item.available ? 'available' : 'unavailable'}`,
        available: item.available 
      };
    } catch (error) {
      throw new Error(`Error toggling availability: ${error.message}`);
    }
  }

  // Toggle popular status
  static async togglePopular(id) {
    try {
      const sql = 'UPDATE menu_items SET popular = NOT popular WHERE id = ?';
      await db.execute(sql, [id]);
      const item = await this.findById(id);
      return { 
        message: `Item ${item.popular ? 'marked as popular' : 'removed from popular'}`,
        popular: item.popular 
      };
    } catch (error) {
      throw new Error(`Error toggling popular status: ${error.message}`);
    }
  }

  // Search menu items
  static async search(query) {
  try {
    const sql = `
      SELECT mi.*, c.name as category_name 
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      WHERE (mi.name LIKE ? OR mi.description LIKE ?)
      AND mi.available = true
      ORDER BY mi.name
    `;
    const searchTerm = `%${query}%`;
    return await db.query(sql, [searchTerm, searchTerm]);
  } catch (error) {
    throw new Error(`Error searching menu items: ${error.message}`);
  }
}

  // Get menu statistics
  static async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_items,
          SUM(CASE WHEN available = true THEN 1 ELSE 0 END) as available_items,
          SUM(CASE WHEN popular = true THEN 1 ELSE 0 END) as popular_items,
          AVG(price) as average_price,
          MIN(price) as min_price,
          MAX(price) as max_price
        FROM menu_items
      `;
      return await db.queryOne(sql);
    } catch (error) {
      throw new Error(`Error getting menu stats: ${error.message}`);
    }
  }
  // Get menu item with full recipe (ingredients)
static async getWithRecipe(id) {
  try {
    // Get menu item
    const menuItem = await this.findById(id);
    if (!menuItem) return null;
    
    // Get ingredients for this menu item
    const recipeSql = `
      SELECT mi.*, i.name as ingredient_name, i.unit as base_unit
      FROM menu_item_ingredients mi
      JOIN ingredients i ON mi.ingredient_id = i.id
      WHERE mi.menu_item_id = ?
      ORDER BY i.name
    `;
    
    const recipe = await db.query(recipeSql, [id]);
    
    return {
      ...menuItem,
      recipe: recipe
    };
  } catch (error) {
    throw new Error(`Error getting menu item with recipe: ${error.message}`);
  }
}

// Get all menu items with recipes
static async getAllWithRecipes(filters = {}) {
  try {
    // Get all menu items
    const menuItems = await this.getAll(filters);
    
    // Get recipes for all items
    const recipePromises = menuItems.map(async (item) => {
      const recipeSql = `
        SELECT mi.*, i.name as ingredient_name, i.unit as base_unit
        FROM menu_item_ingredients mi
        JOIN ingredients i ON mi.ingredient_id = i.id
        WHERE mi.menu_item_id = ?
      `;
      
      const recipe = await db.query(recipeSql, [item.id]);
      
      return {
        ...item,
        recipe: recipe
      };
    });
    
    return await Promise.all(recipePromises);
  } catch (error) {
    throw new Error(`Error getting menu items with recipes: ${error.message}`);
  }
}

// Add ingredient to menu item
static async addIngredient(menuItemId, ingredientData) {
  try {
    const sql = `
      INSERT INTO menu_item_ingredients 
      (menu_item_id, ingredient_id, quantity_required, unit, notes) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      quantity_required = VALUES(quantity_required),
      unit = VALUES(unit),
      notes = VALUES(notes)
    `;
    
    const params = [
      menuItemId,
      ingredientData.ingredient_id,
      ingredientData.quantity_required,
      ingredientData.unit,
      ingredientData.notes || ''
    ];
    
    const result = await db.execute(sql, params);
    
    return {
      id: result.insertId || result.affectedRows,
      menu_item_id: menuItemId,
      ...ingredientData
    };
  } catch (error) {
    throw new Error(`Error adding ingredient to menu item: ${error.message}`);
  }
}

// Update ingredient in menu item
static async updateIngredient(menuItemId, ingredientId, updateData) {
  try {
    const updates = [];
    const params = [];
    
    if (updateData.quantity_required !== undefined) {
      updates.push('quantity_required = ?');
      params.push(updateData.quantity_required);
    }
    if (updateData.unit !== undefined) {
      updates.push('unit = ?');
      params.push(updateData.unit);
    }
    if (updateData.notes !== undefined) {
      updates.push('notes = ?');
      params.push(updateData.notes);
    }
    
    if (updates.length === 0) {
      return { message: 'No updates provided' };
    }
    
    params.push(menuItemId, ingredientId);
    const sql = `
      UPDATE menu_item_ingredients 
      SET ${updates.join(', ')} 
      WHERE menu_item_id = ? AND ingredient_id = ?
    `;
    
    await db.execute(sql, params);
    
    return { message: 'Ingredient updated successfully' };
  } catch (error) {
    throw new Error(`Error updating menu item ingredient: ${error.message}`);
  }
}

// Remove ingredient from menu item
static async removeIngredient(menuItemId, ingredientId) {
  try {
    const sql = `
      DELETE FROM menu_item_ingredients 
      WHERE menu_item_id = ? AND ingredient_id = ?
    `;
    
    await db.execute(sql, [menuItemId, ingredientId]);
    
    return { message: 'Ingredient removed from menu item' };
  } catch (error) {
    throw new Error(`Error removing ingredient from menu item: ${error.message}`);
  }
}

// Get ingredients for menu item
static async getIngredients(menuItemId) {
  try {
    const sql = `
      SELECT mi.*, i.name as ingredient_name, i.unit as base_unit,
             i.current_stock, i.minimum_stock
      FROM menu_item_ingredients mi
      JOIN ingredients i ON mi.ingredient_id = i.id
      WHERE mi.menu_item_id = ?
      ORDER BY i.name
    `;
    
    return await db.query(sql, [menuItemId]);
  } catch (error) {
    throw new Error(`Error getting menu item ingredients: ${error.message}`);
  }
}
// Add multiple ingredients to menu item at once (bulk)
static async addIngredientsBulk(menuItemId, ingredientsArray) {
  try {
    if (!Array.isArray(ingredientsArray) || ingredientsArray.length === 0) {
      throw new Error('Ingredients array is required and must not be empty');
    }

    const results = [];
    const errors = [];
    
    for (const ingredientData of ingredientsArray) {
      try {
        // Validate each ingredient
        if (!ingredientData.ingredient_id || !ingredientData.quantity_required || !ingredientData.unit) {
          errors.push({
            ingredient_id: ingredientData.ingredient_id,
            error: 'Missing required fields: ingredient_id, quantity_required, and unit are required'
          });
          continue;
        }

        const sql = `
          INSERT INTO menu_item_ingredients 
          (menu_item_id, ingredient_id, quantity_required, unit, notes) 
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          quantity_required = VALUES(quantity_required),
          unit = VALUES(unit),
          notes = VALUES(notes)
        `;
        
        const params = [
          menuItemId,
          ingredientData.ingredient_id,
          ingredientData.quantity_required,
          ingredientData.unit,
          ingredientData.notes || ''
        ];
        
        const result = await db.execute(sql, params);
        results.push({
          ingredient_id: ingredientData.ingredient_id,
          success: true,
          id: result.insertId,
          message: 'Ingredient added/updated successfully'
        });
        
      } catch (error) {
        errors.push({
          ingredient_id: ingredientData.ingredient_id,
          error: error.message
        });
      }
    }
    
    return {
      message: `Processed ${ingredientsArray.length} ingredients`,
      successful: results.length,
      failed: errors.length,
      results: results,
      errors: errors.length > 0 ? errors : undefined
    };
    
  } catch (error) {
    throw new Error(`Error adding bulk ingredients: ${error.message}`);
  }
}
}

module.exports = MenuItem;