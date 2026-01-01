const express = require('express');
const router = express.Router();
const MenuController = require('../controllers/MenuController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== PUBLIC ROUTES ==========

// Get all menu items
router.get('/items', MenuController.getMenuItems);

// Get single menu item
router.get('/items/:id', MenuController.getMenuItem);

// Get popular items
router.get('/items/popular', MenuController.getPopularItems);

// Search menu items
router.get('/items/search', MenuController.searchMenuItems);

// Get all categories
router.get('/categories', MenuController.getCategories);

// Get category with items
router.get('/categories/:id', MenuController.getCategory);

// ========== PROTECTED ROUTES (Admin/Manager only) ==========

// Create menu item
router.post('/items', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.createMenuItem);

// Update menu item
router.put('/items/:id', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.updateMenuItem);

// Delete menu item
router.delete('/items/:id', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.deleteMenuItem);

// Toggle availability
router.patch('/items/:id/availability', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.toggleAvailability);

// Toggle popular status
router.patch('/items/:id/popular', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.togglePopular);

// Get menu statistics
router.get('/stats', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.getMenuStats);

// Create category
router.post('/categories', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.createCategory);

// Update category
router.put('/categories/:id', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.updateCategory);

// Delete category
router.delete('/categories/:id', authenticateToken, authorizeRole(['admin', 'manager']), MenuController.deleteCategory);

// ========== MENU ITEM INGREDIENTS (RECIPES) ==========

// Get menu item with ingredients
router.get('/items/:id/ingredients', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), 
  MenuController.getMenuItemIngredients);

// Get all menu items with recipes
router.get('/items-with-recipes', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), 
  MenuController.getMenuItemsWithRecipes);

// Add ingredient to menu item
router.post('/items/:id/ingredients', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), 
  MenuController.addIngredientToMenuItem);

// Update ingredient in menu item
router.put('/items/:id/ingredients/:ingredientId', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), 
  MenuController.updateMenuItemIngredient);

// Remove ingredient from menu item
router.delete('/items/:id/ingredients/:ingredientId', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), 
  MenuController.removeIngredientFromMenuItem);

  // Add multiple ingredients to menu item at once (bulk)
router.post('/items/:id/ingredients/bulk', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), 
  MenuController.addIngredientsBulk);

module.exports = router;