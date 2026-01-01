const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authenticateToken } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/roleAuth');

// Public routes
router.post('/login', AuthController.login);

// Protected user routes
router.get('/profile', authenticateToken, AuthController.getProfile);
router.put('/profile', authenticateToken, AuthController.updateProfile);
router.post('/change-password', authenticateToken, AuthController.changePassword);
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// User management routes (admin/manager with permissions in controller)
router.post('/register', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.register);
router.get('/users', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.getAllUsers);
router.get('/stats', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.getUserStats);
router.post('/admin-reset-password', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.adminResetPassword);

// Admin/manager routes (permissions checked in controller)
router.get('/users/:id', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.getUserById);
router.put('/users/:id', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.updateUser);
router.delete('/users/:id', authenticateToken, authorizeRole(['admin', 'manager']), AuthController.deleteUser);

module.exports = router;