const jwt = require('jsonwebtoken');
const User = require('../models/user'); // Add this import

exports.authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Access token is required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ NEW: Validate token version
    // Get user from database to check token_version
    const userFromDB = await User.findById(decoded.id);
    
    if (!userFromDB) {
      return res.status(403).json({ 
        success: false,
        message: 'User no longer exists' 
      });
    }
    
    // Check if token version matches database
    if (userFromDB.token_version !== decoded.token_version) {
      return res.status(403).json({ 
        success: false,
        message: 'Session expired. Please login again.',
        code: 'TOKEN_VERSION_MISMATCH'
      });
    }
    
    let user = {};

    // For restaurant system, we expect these fields in the token:
    // id, role, email, username
    if (decoded.id) {
      user = {
        id: decoded.id,
        role: decoded.role || 'waiter', // Default to waiter if not specified
        email: decoded.email,
        username: decoded.username,
        token_version: decoded.token_version || 1  // Add token_version to req.user
      };
    } 
    // Backward compatibility for other ID formats
    else if (decoded.userId) {
      user = { 
        id: decoded.userId, 
        role: decoded.role || 'user',
        email: decoded.email,
        username: decoded.username,
        token_version: decoded.token_version || 1
      };
    }
    else if (decoded.staffId) {
      user = { 
        id: decoded.staffId, 
        role: decoded.role || 'staff',
        token_version: decoded.token_version || 1
      };
    }
    else {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid token: Missing user identifier' 
      });
    }

    // Attach any additional fields from token
    if (decoded.first_name) user.first_name = decoded.first_name;
    if (decoded.last_name) user.last_name = decoded.last_name;
    if (decoded.status) user.status = decoded.status;

    // ✅ NEW: Add token_version from decoded token
    if (decoded.token_version) {
      user.token_version = decoded.token_version;
    }

    req.user = user;
    
    next();
  } catch (err) {
    console.error('JWT verification error:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ 
        success: false,
        message: 'Token has expired' 
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    
    res.status(403).json({ 
      success: false,
      message: 'Token verification failed' 
    });
  }
};

// ✅ NEW: Optional - Admin-only middleware with token version check
exports.authenticateAdmin = async (req, res, next) => {
  await this.authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Admin access required' 
      });
    }
    next();
  });
};

// ✅ NEW: Optional - Manager or Admin middleware
exports.authenticateManager = async (req, res, next) => {
  await this.authenticateToken(req, res, () => {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Manager or Admin access required' 
      });
    }
    next();
  });
};

// ✅ NEW: Optional - Staff middleware (any staff role)
exports.authenticateStaff = async (req, res, next) => {
  await this.authenticateToken(req, res, () => {
    const staffRoles = ['admin', 'manager', 'cashier', 'waiter', 'chef'];
    if (!staffRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Staff access required' 
      });
    }
    next();
  });
};