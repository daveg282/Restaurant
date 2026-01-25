const express = require('express');
const router = express.Router();
const SupplierController = require('../controllers/SupplierController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== SUPPLIER ROUTES ==========

// Get all suppliers
router.get('/', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.getSuppliers);

// Get supplier by ID
router.get('/:id', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.getSupplier);

// Create new supplier
router.post('/', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.createSupplier);

// Update supplier
router.put('/:id', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.updateSupplier);

// Delete supplier (soft delete)
router.delete('/:id', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.deleteSupplier);

// Get suppliers with their ingredients
router.get('/:id/ingredients', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.getSuppliersWithIngredients);

// Get all suppliers with ingredients (if no ID provided)
router.get('/with-ingredients/all', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.getSuppliersWithIngredients);

// Get supplier performance report
router.get('/performance/report', authenticateToken, authorizeRole(['admin', 'manager']), 
  SupplierController.getSupplierPerformance);

module.exports = router;