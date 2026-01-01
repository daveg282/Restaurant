const express = require('express');
const router = express.Router();
const KitchenController = require('../controllers/KitchenController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== KITCHEN ROUTES (Chef/Manager/Admin only) ==========

// Get all kitchen orders
router.get('/orders', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), KitchenController.getKitchenOrders);

// Get urgent orders (over 20 minutes)
router.get('/orders/urgent', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), KitchenController.getUrgentOrders);

// Get orders by station
router.get('/station/:station', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), KitchenController.getOrdersByStation);

// Update item status
router.patch('/items/:id/status', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), KitchenController.updateOrderStatus);

// Mark entire order as ready
router.patch('/orders/:id/ready', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), KitchenController.markOrderReady);

// Kitchen statistics
router.get('/stats', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), KitchenController.getKitchenStats);

module.exports = router;