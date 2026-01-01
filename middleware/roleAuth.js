// Restaurant role-based authorization middleware
exports.authorizeRole = (roles = []) => {
  if (typeof roles === 'string') roles = [roles];
  
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('--- ROLE CHECK ---');
      console.log('User Role:', req.user?.role);
      console.log('Required Roles:', roles);
    }
    
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}` 
      });
    }
    
    next();
  };
};

// Convenience methods for common restaurant roles
exports.isAdmin = exports.authorizeRole(['admin']);
exports.isManager = exports.authorizeRole(['admin', 'manager']);
exports.isCashier = exports.authorizeRole(['admin', 'manager', 'cashier']);
exports.isWaiter = exports.authorizeRole(['admin', 'manager', 'cashier', 'waiter']);
exports.isChef = exports.authorizeRole(['admin', 'manager', 'chef']);