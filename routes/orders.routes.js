const express = require('express');
const router = express.Router();
const OrderController = require('../controllers/OrderController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== PUBLIC ROUTES (Limited) ==========

// Get order by order number (for customers to check status)
router.get('/number/:order_number', OrderController.getOrderByNumber);

// ========== PROTECTED ROUTES ==========

// Create order (waiter/cashier/admin/manager)
router.post('/', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), OrderController.createOrder);

// Get all orders (admin/manager/cashier)
router.get('/', authenticateToken, authorizeRole(['admin', 'manager', 'cashier', 'chef']), OrderController.getAllOrders);

// Get waiter's own orders
router.get('/waiter/active', authenticateToken, authorizeRole(['waiter']), OrderController.getWaiterOrders);

// Get kitchen orders (chef/admin/manager)
router.get('/kitchen', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), OrderController.getKitchenOrders);

// Manager fetches all pending cancellations
router.get('/pending-cancellations',
  authenticateToken,
  authorizeRole(['admin', 'manager']),
  OrderController.getPendingCancellations);

// Get single order
router.get('/:id', authenticateToken, OrderController.getOrder);

// Update order status
router.patch('/:id/status', authenticateToken, OrderController.updateOrderStatus);

// Update payment status (cashier/admin/manager)
router.patch('/:id/payment', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), OrderController.updatePaymentStatus);

// Cancel order (admin/manager only)
router.delete('/:id/cancel', authenticateToken, authorizeRole(['admin', 'manager']), OrderController.cancelOrder);

// Add item to order (waiter/cashier/admin/manager)
router.post('/:id/items', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), OrderController.addItemToOrder);


// ========== ORDER ITEM REMOVAL (waiter — pending only, no approval) ==========
router.delete('/:id/items/:item_id',
  authenticateToken,
  authorizeRole(['waiter', 'cashier', 'admin', 'manager']),
  OrderController.removeOrderItem);

// ========== CANCELLATION FLOW ==========
// Waiter requests cancellation
router.patch('/:id/request-cancellation',
  authenticateToken,
  authorizeRole(['waiter']),
  OrderController.requestCancellation);

// Manager approves cancellation
router.patch('/:id/approve-cancellation',
  authenticateToken,
  authorizeRole(['admin', 'manager']),
  OrderController.approveCancellation);

// Manager rejects cancellation
router.patch('/:id/reject-cancellation',
  authenticateToken,
  authorizeRole(['admin', 'manager']),
  OrderController.rejectCancellation);



// Update item status (kitchen - chef/admin/manager)
router.patch('/items/:id/status', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), OrderController.updateOrderStatus);

// Get order statistics (admin/manager only)
router.get('/stats', authenticateToken, authorizeRole(['admin', 'manager']), OrderController.getOrderStats);

// Search orders (admin/manager/cashier)
router.get('/search', authenticateToken, authorizeRole(['admin', 'manager', 'cashier']), OrderController.searchOrders);

// Add this route before module.exports
router.get('/waiter/daily/:date?', authenticateToken, authorizeRole(['waiter', 'admin', 'manager']), OrderController.getDailyOrders);


module.exports = router;