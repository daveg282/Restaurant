const jwt = require('jsonwebtoken');

exports.authenticateToken = (req, res, next) => {
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
    
    let user = {};

    // For restaurant system, we expect these fields in the token:
    // id, role, email, username
    if (decoded.id) {
      user = {
        id: decoded.id,
        role: decoded.role || 'waiter', // Default to waiter if not specified
        email: decoded.email,
        username: decoded.username
      };
    } 
    // Backward compatibility for other ID formats
    else if (decoded.userId) {
      user = { 
        id: decoded.userId, 
        role: decoded.role || 'user',
        email: decoded.email,
        username: decoded.username
      };
    }
    else if (decoded.staffId) {
      user = { 
        id: decoded.staffId, 
        role: decoded.role || 'staff'
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