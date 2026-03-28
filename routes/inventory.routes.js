// routes/inventory.routes.js
const express = require('express');
const router  = express.Router();
const InventoryController = require('../controllers/InventoryController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole }     = require('../middleware/roleAuth');

// ========== READ ROUTES (all roles) ==========

// IMPORTANT: specific routes before :id catch-all
router.get('/ingredients/:id/transactions',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.getTransactions);

router.get('/ingredients/:id',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef', 'cashier', 'waiter']),
  InventoryController.getIngredient);

router.get('/ingredients',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef', 'cashier', 'waiter']),
  InventoryController.getIngredients);

// ========== RESTRICTED READ ROUTES ==========
router.get('/low-stock',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef']),
  InventoryController.getLowStock);

router.get('/stock-summary',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef']),
  InventoryController.getStockSummary);

router.get('/category/:category',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef']),
  InventoryController.getByCategory);

router.get('/with-suppliers',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef']),
  InventoryController.getWithSuppliers);

router.get('/usage-stats',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.getUsageStats);

router.get('/search',
  authenticateToken, authorizeRole(['admin', 'manager', 'chef', 'cashier']),
  InventoryController.searchIngredients);

// ========== WRITE ROUTES (admin/manager only) ==========
router.post('/ingredients',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.createIngredient);

router.put('/ingredients/:id',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.updateIngredient);

router.delete('/ingredients/:id',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.deleteIngredient);

// Accepts optional body: { quantity, notes, type: 'restock'|'removal'|'adjustment'|'expiry' }
router.patch('/ingredients/:id/stock',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.updateStock);

router.post('/bulk-stock-update',
  authenticateToken, authorizeRole(['admin', 'manager']),
  InventoryController.bulkUpdateStock);

// ========== ORDER STOCK CHECK ==========
router.post('/stock-check',
  authenticateToken, authorizeRole(['admin', 'manager', 'cashier', 'chef', 'waiter']),
  InventoryController.checkOrderStock);

module.exports = router;