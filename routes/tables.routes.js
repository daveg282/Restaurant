const express = require('express');
const router = express.Router();
const TableController = require('../controllers/TableController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// ========== PUBLIC ROUTES ==========

// Get all tables
router.get('/', TableController.getTables);

// Get available tables
router.get('/available', TableController.getAvailableTables);

// Get single table
router.get('/:id', TableController.getTable);

// Search tables
router.get('/search', TableController.searchTables);

// Get table statistics
router.get('/stats', TableController.getTableStats);

// ========== PROTECTED ROUTES ==========

// Create table (admin/manager only)
router.post('/', authenticateToken, authorizeRole(['admin', 'manager']), TableController.createTable);

// Update table (admin/manager only)
router.put('/:id', authenticateToken, authorizeRole(['admin', 'manager']), TableController.updateTable);

// Delete table (admin only)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), TableController.deleteTable);

// Occupy table (waiter/cashier/admin/manager)
router.post('/:id/occupy', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), TableController.occupyTable);

// Free table (waiter/cashier/admin/manager)
router.post('/:id/free', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), TableController.freeTable);

// Reserve table (waiter/cashier/admin/manager)
router.post('/:id/reserve', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), TableController.reserveTable);

// Update table status (admin/manager only)
router.patch('/:id/status', authenticateToken, authorizeRole(['admin', 'manager']), TableController.updateTableStatus);

// ========== PAGER ROUTES ==========

// Get all pagers
router.get('/pagers/all', authenticateToken, TableController.getPagers);

// Get available pager
router.get('/pagers/available', authenticateToken, TableController.getAvailablePager);

// Assign pager to order
router.post('/pagers/:pager_number/assign', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), TableController.assignPager);

// Activate pager
router.post('/pagers/:pager_number/activate', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), TableController.activatePager);

// Release pager
router.post('/pagers/:pager_number/release', authenticateToken, authorizeRole(['waiter', 'cashier', 'admin', 'manager']), TableController.releasePager);

// Buzz pager
router.post('/pagers/:pager_number/buzz', authenticateToken, authorizeRole(['chef', 'admin', 'manager']), TableController.buzzPager);

// Get pager statistics
router.get('/pagers/stats', authenticateToken, authorizeRole(['admin', 'manager']), TableController.getPagerStats);

module.exports = router;