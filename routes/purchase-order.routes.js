const express = require('express');
const router = express.Router();
const PurchaseOrderController = require('../controllers/PurchaseOrderController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== PURCHASE ORDER ROUTES ==========

// Get all purchase orders
router.get('/', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.getPurchaseOrders);

// Get purchase order by ID
router.get('/:id', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.getPurchaseOrder);

// Create new purchase order
router.post('/', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.createPurchaseOrder);

// Update purchase order status
router.patch('/:id/status', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.updatePurchaseOrderStatus);

// Add item to purchase order
router.post('/:id/items', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.addItemToPurchaseOrder);

// Remove item from purchase order
router.delete('/:id/items/:item_id', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.removeItemFromPurchaseOrder);

// Receive partial shipment
router.post('/:id/receive-partial', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.receivePartialShipment);

// ========== SPECIAL ROUTES ==========

// Get pending purchase orders
router.get('/pending/all', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.getPendingPurchaseOrders);

// Get purchase order statistics
router.get('/statistics/summary', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.getPurchaseOrderStatistics);

// Get suggested purchases for low stock
router.get('/suggestions/low-stock', authenticateToken, authorizeRole(['admin', 'manager']), 
  PurchaseOrderController.getSuggestedPurchases);

module.exports = router;