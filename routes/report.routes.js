const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/ReportController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== DASHBOARD ROUTES ==========

// Get comprehensive dashboard data
router.get('/dashboard', authenticateToken, ReportController.getDashboardData);

// ========== SALES REPORT ROUTES ==========

// Get detailed sales report with filtering
router.get('/sales/detailed', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getSalesReport);

// Get daily sales report
router.get('/sales/daily', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getDailySalesReport);

// Get weekly sales report
router.get('/sales/weekly', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getWeeklySalesReport);

// Get monthly sales report
router.get('/sales/monthly', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getMonthlySalesReport);

// ========== STAFF PERFORMANCE ROUTES ==========

// Get staff performance report
router.get('/staff/performance', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getStaffPerformanceReport);

// ========== INVENTORY REPORT ROUTES ==========

// Get inventory report
router.get('/inventory', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getInventoryReport);

  // ========== FINANCIAL REPORT ROUTES ==========

// Get comprehensive financial report (Profit & Loss)
router.get('/financial/pl', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getProfitLossReport);

// Get VAT/Tax report
router.get('/financial/vat', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getVATReport);

// Get financial summary (for dashboard)
router.get('/financial/summary', authenticateToken, authorizeRole(['admin', 'manager']), 
  ReportController.getFinancialSummary);



// Get quick stats (for dashboard widgets)
router.get('/quick-stats', authenticateToken, (req, res) => {
  try {
    res.json({
      success: true,
      data: ReportController.getQuickStats()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;