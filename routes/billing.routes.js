const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/BillingController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== BILLING ROUTES (Cashier/Manager/Admin only) ==========

// Get orders ready for payment (Cashier Dashboard)
router.get('/pending', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.getPendingPayments);

// Process payment for order
router.post('/orders/:id/pay', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.processPayment);

// Generate receipt
router.get('/orders/:id/receipt', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.generateReceipt);

// Apply discount to order
router.post('/orders/:id/discount', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.applyDiscount);

// Get sales summary
router.get('/sales/summary', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.getSalesSummary);

// Get daily sales report
router.get('/orders/:id/receipt/html', authenticateToken, BillingController.generateReceiptHTML);

router.get('/sales/summary', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.getSalesSummary);

// Get daily sales report
router.get('/sales/daily', authenticateToken, authorizeRole(['cashier', 'admin', 'manager']), BillingController.getDailySalesReport);

module.exports = router;