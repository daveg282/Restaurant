const express = require('express');
const router = express.Router();
const StationController = require('../controllers/StationController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// Public routes (with authentication)
router.get('/', authenticateToken, authorizeRole(['admin', 'manager', 'chef', 'waiter', 'cashier']), StationController.getAllStations);
router.get('/:id', authenticateToken, authorizeRole(['admin', 'manager', 'chef', 'waiter', 'cashier']), StationController.getStation);

// Admin/Manager routes
router.post('/', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), StationController.createStation);
router.put('/:id', authenticateToken, authorizeRole(['admin', 'manager', 'chef']), StationController.updateStation);
router.delete('/:id', authenticateToken, authorizeRole(['admin']), StationController.deleteStation);

// Station statistics (Admin/Manager only)
router.get('/stats/summary', authenticateToken, authorizeRole(['admin', 'manager']), StationController.getStationStats);

// Station assignment routes (Admin/Manager only)
router.post('/:id/assign-categories', authenticateToken, authorizeRole(['admin', 'manager']), StationController.assignCategories);
router.post('/:id/assign-chef', authenticateToken, authorizeRole(['admin', 'manager']), StationController.assignChef);
router.post('/:id/remove-chef', authenticateToken, authorizeRole(['admin', 'manager']), StationController.removeChef);
router.get('/chefs/available', authenticateToken, authorizeRole(['admin', 'manager']), StationController.getAvailableChefs);

module.exports = router;