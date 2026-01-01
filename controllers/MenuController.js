const MenuItem = require('../models/menuItem');
const Category = require('../models/category');

class MenuController {
  // Get all menu items
  static async getMenuItems(req, res) {
    try {
      const filters = {
        category_id: req.query.category_id,
        available: req.query.available ? req.query.available === 'true' : undefined,
        popular: req.query.popular ? req.query.popular === 'true' : undefined,
        search: req.query.search
      };
      
      const items = await MenuItem.getAll(filters);
      
      res.json({
        success: true,
        items,
        count: items.length
      });
    } catch (error) {
      console.error('Get menu items error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting menu items'
      });
    }
  }

  // Get single menu item
  static async getMenuItem(req, res) {
    try {
      const { id } = req.params;
      const item = await MenuItem.findById(id);
      
      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Menu item not found'
        });
      }
      
      res.json({
        success: true,
        item
      });
    } catch (error) {
      console.error('Get menu item error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting menu item'
      });
    }
  }

  // Create menu item (admin/manager only)
  static async createMenuItem(req, res) {
    try {
      const itemData = req.body;
      
      // Validation
      if (!itemData.name || !itemData.price) {
        return res.status(400).json({
          success: false,
          error: 'Name and price are required'
        });
      }
      
      const item = await MenuItem.create(itemData);
      
      res.status(201).json({
        success: true,
        message: 'Menu item created successfully',
        item
      });
    } catch (error) {
      console.error('Create menu item error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error creating menu item'
      });
    }
  }

  // Update menu item (admin/manager only)
  static async updateMenuItem(req, res) {
    try {
      const { id } = req.params;
      const itemData = req.body;
      
      const item = await MenuItem.findById(id);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Menu item not found'
        });
      }
      
      const updatedItem = await MenuItem.update(id, itemData);
      
      res.json({
        success: true,
        message: 'Menu item updated successfully',
        item: updatedItem
      });
    } catch (error) {
      console.error('Update menu item error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating menu item'
      });
    }
  }

  // Delete menu item (admin/manager only)
  static async deleteMenuItem(req, res) {
    try {
      const { id } = req.params;
      
      const item = await MenuItem.findById(id);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Menu item not found'
        });
      }
      
      await MenuItem.delete(id);
      
      res.json({
        success: true,
        message: 'Menu item deleted successfully'
      });
    } catch (error) {
      console.error('Delete menu item error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error deleting menu item'
      });
    }
  }

  // Toggle availability (admin/manager only)
  static async toggleAvailability(req, res) {
    try {
      const { id } = req.params;
      
      const item = await MenuItem.findById(id);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Menu item not found'
        });
      }
      
      const result = await MenuItem.toggleAvailability(id);
      
      res.json({
        success: true,
        message: result.message,
        available: result.available
      });
    } catch (error) {
      console.error('Toggle availability error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error toggling availability'
      });
    }
  }

  // Toggle popular status (admin/manager only)
  static async togglePopular(req, res) {
    try {
      const { id } = req.params;
      
      const item = await MenuItem.findById(id);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Menu item not found'
        });
      }
      
      const result = await MenuItem.togglePopular(id);
      
      res.json({
        success: true,
        message: result.message,
        popular: result.popular
      });
    } catch (error) {
      console.error('Toggle popular error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error toggling popular status'
      });
    }
  }

  // Get popular items
  static async getPopularItems(req, res) {
    try {
      const items = await MenuItem.getPopular();
      
      res.json({
        success: true,
        items,
        count: items.length
      });
    } catch (error) {
      console.error('Get popular items error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting popular items'
      });
    }
  }

  // Search menu items
  // Search menu items
static async searchMenuItems(req, res) {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const items = await MenuItem.search(q);
    
    // FIX: Return empty array if no results, not error
    res.json({
      success: true,
      items,
      count: items.length,
      query: q
    });
  } catch (error) {
    console.error('Search menu items error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error searching menu items'
    });
  }
}

  // Get menu statistics (admin/manager only)
  static async getMenuStats(req, res) {
    try {
      const stats = await MenuItem.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get menu stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting menu stats'
      });
    }
  }

  // ========== CATEGORY METHODS ==========

  // Get all categories
  static async getCategories(req, res) {
    try {
      const categories = await Category.getAll();
      
      res.json({
        success: true,
        categories,
        count: categories.length
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting categories'
      });
    }
  }

  // Get category by ID
  static async getCategory(req, res) {
    try {
      const { id } = req.params;
      const category = await Category.getWithItems(id);
      
      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
      }
      
      res.json({
        success: true,
        category
      });
    } catch (error) {
      console.error('Get category error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting category'
      });
    }
  }

  // Create category (admin/manager only)
  static async createCategory(req, res) {
    try {
      const categoryData = req.body;
      
      if (!categoryData.name) {
        return res.status(400).json({
          success: false,
          error: 'Category name is required'
        });
      }
      
      const category = await Category.create(categoryData);
      
      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        category
      });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error creating category'
      });
    }
  }

  // Update category (admin/manager only)
  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const categoryData = req.body;
      
      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
      }
      
      const updatedCategory = await Category.update(id, categoryData);
      
      res.json({
        success: true,
        message: 'Category updated successfully',
        category: updatedCategory
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating category'
      });
    }
  }

  // Delete category (admin/manager only)
  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      
      const category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({
          success: false,
          error: 'Category not found'
        });
      }
      
      await Category.delete(id);
      
      res.json({
        success: true,
        message: 'Category deleted successfully'
      });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error deleting category'
      });
    }
  }
  // Get menu item with ingredients
static async getMenuItemIngredients(req, res) {
  try {
    const { id } = req.params;
    const menuItem = await MenuItem.getWithRecipe(id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: 'Menu item not found'
      });
    }
    
    res.json({
      success: true,
      menu_item: menuItem
    });
  } catch (error) {
    console.error('Get menu item ingredients error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting menu item ingredients'
    });
  }
}

// Get all menu items with recipes
static async getMenuItemsWithRecipes(req, res) {
  try {
    const filters = {
      category_id: req.query.category_id,
      available: req.query.available ? req.query.available === 'true' : undefined,
      popular: req.query.popular ? req.query.popular === 'true' : undefined,
      search: req.query.search
    };
    
    const items = await MenuItem.getAllWithRecipes(filters);
    
    res.json({
      success: true,
      menu_items: items,
      count: items.length
    });
  } catch (error) {
    console.error('Get menu items with recipes error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting menu items with recipes'
    });
  }
}

// Add ingredient to menu item
static async addIngredientToMenuItem(req, res) {
  try {
    const { id } = req.params;
    const ingredientData = req.body;
    
    // Validate required fields
    if (!ingredientData.ingredient_id || !ingredientData.quantity_required || !ingredientData.unit) {
      return res.status(400).json({
        success: false,
        error: 'ingredient_id, quantity_required, and unit are required'
      });
    }
    
    // Check if menu item exists
    const menuItem = await MenuItem.findById(id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: 'Menu item not found'
      });
    }
    
    const result = await MenuItem.addIngredient(id, ingredientData);
    
    res.status(201).json({
      success: true,
      message: 'Ingredient added to menu item successfully',
      data: result
    });
  } catch (error) {
    console.error('Add ingredient to menu item error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error adding ingredient to menu item'
    });
  }
}

// Update menu item ingredient
static async updateMenuItemIngredient(req, res) {
  try {
    const { id, ingredientId } = req.params;
    const updateData = req.body;
    
    // Check if menu item exists
    const menuItem = await MenuItem.findById(id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: 'Menu item not found'
      });
    }
    
    const result = await MenuItem.updateIngredient(id, ingredientId, updateData);
    
    res.json({
      success: true,
      message: 'Menu item ingredient updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Update menu item ingredient error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error updating menu item ingredient'
    });
  }
}

// Remove ingredient from menu item
static async removeIngredientFromMenuItem(req, res) {
  try {
    const { id, ingredientId } = req.params;
    
    // Check if menu item exists
    const menuItem = await MenuItem.findById(id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: 'Menu item not found'
      });
    }
    
    const result = await MenuItem.removeIngredient(id, ingredientId);
    
    res.json({
      success: true,
      message: 'Ingredient removed from menu item successfully',
      data: result
    });
  } catch (error) {
    console.error('Remove ingredient from menu item error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error removing ingredient from menu item'
    });
  }
}
// Add multiple ingredients to menu item (bulk)
static async addIngredientsBulk(req, res) {
  try {
    const { id } = req.params;
    const { ingredients } = req.body;
    
    // Validate
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Ingredients array is required and must not be empty'
      });
    }
    
    // Check if menu item exists
    const menuItem = await MenuItem.findById(id);
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: 'Menu item not found'
      });
    }
    
    const result = await MenuItem.addIngredientsBulk(id, ingredients);
    
    res.status(201).json({
      success: true,
      message: result.message,
      data: result.results,
      count: result.results.length
    });
  } catch (error) {
    console.error('Add ingredients bulk error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error adding bulk ingredients'
    });
  }
}
}

module.exports = MenuController;