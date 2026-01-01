const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import database (initialize connection)
const db = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth.routes');
const menuRoutes = require('./routes/menu.routes');
// Import table routes
const tableRoutes = require('./routes/tables.routes');
// Import order routes
const orderRoutes = require('./routes/orders.routes');
// Add kitchen routes
const kitchenRoutes = require('./routes/kitchen.routes');
const billingRoutes = require('./routes/billing.routes');
// Add with other imports
const inventoryRoutes = require('./routes/inventory.routes');
const supplierRoutes = require('./routes/supplier.routes');
const purchaseOrderRoutes = require('./routes/purchase-order.routes');
const stationRoutes = require('./routes/stations.routes');
const reportRoutes = require('./routes/report.routes');
// Add with other route middleware

// Import middleware
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:8000', 'http://localhost:3000', 'https://vortex-admin-kuku.pro.et' ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/public', express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// ========== ROUTES ==========
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/reports', reportRoutes);
// Protected test route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'You have access to this protected route',
    user: req.user
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Restaurant ERP API',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    demo_mode: process.env.DEMO_MODE === 'true'
  });
});

// Welcome endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Restaurant ERP API',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register (admin only)',
        profile: 'GET /api/auth/profile',
        demo_login: 'POST /api/auth/demo-login'
      },
      health: 'GET /api/health',
      protected_test: 'GET /api/protected (requires token)'
    },
    documentation: 'Coming soon...'
  });
});

// ========== ERROR HANDLING ==========

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  // Multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: 'File upload error',
      message: err.message
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired'
    });
  }
  
  // Database errors
  if (err.code?.startsWith('ER_')) {
    return res.status(400).json({
      success: false,
      error: 'Database error',
      message: err.message
    });
  }
  
  // Default error
  const statusCode = err.status || 500;
  const errorMessage = err.message || 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    })
  });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Restaurant ERP API running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔐 JWT Expire: ${process.env.JWT_EXPIRE || '7d'}`);
  console.log(`🎮 Demo Mode: ${process.env.DEMO_MODE === 'true' ? 'Enabled' : 'Disabled'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📁 Public files: http://localhost:${PORT}/public`);
});

module.exports = app;