const User = require('../models/user');
const AuditLog = require('../models/AuditLog');

class AuthController {
  // Login user with audit logging
  static async login(req, res) {
    let loginAttemptData = {
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'],
      attempted_email: null
    };

    try {
      const { email, password } = req.body;
      loginAttemptData.attempted_email = email;

      // Validation
      if (!email || !password) {
        await AuditLog.create({
          user_id: null,
          action: 'login_failed',
          ip_address: loginAttemptData.ip_address,
          user_agent: loginAttemptData.user_agent,
          success: false,
          details: { 
            reason: 'missing_credentials',
            attempted_email: email 
          }
        });

        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        await AuditLog.create({
          user_id: null,
          action: 'login_failed',
          ip_address: loginAttemptData.ip_address,
          user_agent: loginAttemptData.user_agent,
          success: false,
          details: { 
            reason: 'user_not_found',
            attempted_email: email 
          }
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Verify password
      const isValidPassword = await User.verifyPassword(password, user.password);
      if (!isValidPassword) {
        await AuditLog.create({
          user_id: user.id,
          action: 'login_failed',
          ip_address: loginAttemptData.ip_address,
          user_agent: loginAttemptData.user_agent,
          success: false,
          details: { 
            reason: 'invalid_password',
            attempted_email: email,
            user_role: user.role
          }
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Check if account is active
      if (user.status !== 'active') {
        await AuditLog.create({
          user_id: user.id,
          action: 'login_failed',
          ip_address: loginAttemptData.ip_address,
          user_agent: loginAttemptData.user_agent,
          success: false,
          details: { 
            reason: 'account_inactive',
            attempted_email: email,
            user_role: user.role
          }
        });

        return res.status(403).json({
          success: false,
          error: 'Account is inactive'
        });
      }

      // Generate token with token_version included
      const token = User.generateToken(user);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      // Log successful login
      await AuditLog.create({
        user_id: user.id,
        action: 'login',
        ip_address: loginAttemptData.ip_address,
        user_agent: loginAttemptData.user_agent,
        success: true,
        details: { 
          role: user.role,
          token_version: user.token_version || 1,
          user_agent: loginAttemptData.user_agent.substring(0, 100)
        }
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: userWithoutPassword,
        token
      });

    } catch (error) {
      // Log unexpected errors
      await AuditLog.create({
        user_id: null,
        action: 'login_error',
        ip_address: loginAttemptData.ip_address,
        user_agent: loginAttemptData.user_agent,
        success: false,
        details: { 
          error: error.message,
          attempted_email: loginAttemptData.attempted_email
        }
      });

      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error during login'
      });
    }
  }

  // Register new user (admin/manager only) with audit
  static async register(req, res) {
    try {
      const { username, email, password, role, first_name, last_name } = req.body;

      // Validation
      if (!username || !email || !password || !role || !first_name) {
        return res.status(400).json({
          success: false,
          error: 'Username, email, password, role, and first name are required'
        });
      }

      // Validate role
      const validRoles = ['admin', 'manager', 'cashier', 'waiter', 'chef'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role. Valid roles are: ${validRoles.join(', ')}`
        });
      }

      // PERMISSION CHECK: Manager cannot create admin/manager
      if (req.user.role === 'manager' && ['admin', 'manager'].includes(role)) {
        // Log attempted violation
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'register_user',
            attempted_role: role,
            reason: 'manager_cannot_create_admin'
          }
        });

        return res.status(403).json({
          success: false,
          error: 'Managers cannot create admin or manager accounts'
        });
      }

      // Check if user exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User with this email already exists'
        });
      }

      // Check if username exists
      const existingUsername = await User.findByUsername(username);
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          error: 'Username already taken'
        });
      }

      // Create user
      const user = await User.create({
        username,
        email,
        password,
        role: role || 'waiter',
        first_name,
        last_name
      });

      // Log user creation
      await AuditLog.create({
        user_id: req.user.id,
        action: 'user_created',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          created_user_id: user.id,
          created_user_role: user.role,
          created_user_email: user.email
        }
      });

      // Generate token if needed (for auto-login after creation)
      const token = User.generateToken(user);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          status: user.status,
          token_version: user.token_version || 1,
          created_at: user.created_at
        },
        token
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      // Log registration error
      await AuditLog.create({
        user_id: req.user?.id || null,
        action: 'user_creation_failed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        details: { 
          error: error.message,
          attempted_email: req.body.email
        }
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Server error during registration'
      });
    }
  }

  // Get current user profile
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const { password, ...userWithoutPassword } = user;
      res.json({
        success: true,
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error'
      });
    }
  }

  // Update user profile with audit
  static async updateProfile(req, res) {
    try {
      const { first_name, last_name, email, password } = req.body;
      
      const updateData = {};
      if (first_name !== undefined) updateData.first_name = first_name;
      if (last_name !== undefined) updateData.last_name = last_name;
      if (email !== undefined) updateData.email = email;
      if (password !== undefined) updateData.password = password;
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No data provided for update'
        });
      }
      
      // Log before update
      const oldUser = await User.findById(req.user.id);
      
      const updatedUser = await User.update(req.user.id, updateData);
      
      // If password changed, invalidate all tokens
      let newToken;
      if (password) {
        // Invalidate all tokens when password changes
        await User.invalidateTokens(req.user.id);
        // Generate new token with updated version
        const refreshedUser = await User.findById(req.user.id);
        newToken = User.generateToken(refreshedUser);
      }
      
      // Log profile update
      await AuditLog.create({
        user_id: req.user.id,
        action: 'profile_updated',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          updated_fields: Object.keys(updateData),
          old_email: oldUser.email,
          new_email: updatedUser.email || oldUser.email,
          password_changed: !!password,
          token_invalidated: !!password
        }
      });
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: userWithoutPassword,
        token: newToken || undefined
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating profile'
      });
    }
  }

  // Get all users with permission check
  static async getAllUsers(req, res) {
    try {
      const { role, search } = req.query;
      let users;
      
      // Manager can only see non-admin users
      if (req.user.role === 'manager') {
        users = await User.getStaffUsers(search);
      } else {
        // Admin sees all users
        if (search) {
          users = await User.search(search, role);
        } else {
          users = await User.getAll(role);
        }
      }
      
      res.json({
        success: true,
        users,
        count: users.length
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting users'
      });
    }
  }

  // Get user by ID with permission check
  static async getUserById(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Manager can only view non-admin users
      if (req.user.role === 'manager' && ['admin', 'manager'].includes(user.role)) {
        // Log permission denial
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'view_user',
            target_user_id: id,
            target_user_role: user.role,
            reason: 'manager_cannot_view_admin'
          }
        });

        return res.status(403).json({
          success: false,
          error: 'Access denied: Cannot view admin/manager accounts'
        });
      }
      
      const { password, ...userWithoutPassword } = user;
      
      res.json({
        success: true,
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting user'
      });
    }
  }

  // Update user by ID with permission check and audit
  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Get target user first
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // PERMISSION CHECK
      // Manager cannot update admin/manager users
      if (req.user.role === 'manager' && ['admin', 'manager'].includes(targetUser.role)) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'update_user',
            target_user_id: id,
            target_user_role: targetUser.role,
            reason: 'manager_cannot_update_admin'
          }
        });

        return res.status(403).json({
          success: false,
          error: 'Cannot update admin or manager accounts'
        });
      }
      
      // Manager cannot change role to admin/manager
      if (req.user.role === 'manager' && updateData.role && ['admin', 'manager'].includes(updateData.role)) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'update_user_role',
            target_user_id: id,
            attempted_role: updateData.role,
            reason: 'manager_cannot_promote_to_admin'
          }
        });

        return res.status(403).json({
          success: false,
          error: 'Cannot assign admin or manager role'
        });
      }
      
      // Log before update
      const oldUserData = {
        email: targetUser.email,
        role: targetUser.role,
        status: targetUser.status,
        token_version: targetUser.token_version || 1
      };
      
      // Remove protected fields
      delete updateData.id;
      delete updateData.created_at;
      delete updateData.token_version; // Cannot directly update token version
      
      const updatedUser = await User.update(id, updateData);
      const { password, ...userWithoutPassword } = updatedUser;
      
      // Log user update
      await AuditLog.create({
        user_id: req.user.id,
        action: 'user_updated',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          target_user_id: id,
          updated_fields: Object.keys(updateData),
          old_data: oldUserData,
          new_data: {
            email: updatedUser.email,
            role: updatedUser.role,
            status: updatedUser.status,
            token_version: updatedUser.token_version || 1
          }
        }
      });
      
      res.json({
        success: true,
        message: 'User updated successfully',
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating user'
      });
    }
  }

  // Delete user with permission check and audit
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      
      // Get target user first
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Prevent self-deletion
      if (parseInt(id) === req.user.id) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'delete_user',
            target_user_id: id,
            reason: 'self_deletion_attempt'
          }
        });

        return res.status(400).json({
          success: false,
          error: 'Cannot delete your own account'
        });
      }
      
      // Manager cannot delete admin/manager
      if (req.user.role === 'manager' && ['admin', 'manager'].includes(targetUser.role)) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'delete_user',
            target_user_id: id,
            target_user_role: targetUser.role,
            reason: 'manager_cannot_delete_admin'
          }
        });

        return res.status(403).json({
          success: false,
          error: 'Cannot delete admin or manager accounts'
        });
      }
      
      // Store user info before deleting for audit
      const deletedUserInfo = {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        token_version: targetUser.token_version || 1
      };
      
      await User.delete(id);
      
      // Log user deletion
      await AuditLog.create({
        user_id: req.user.id,
        action: 'user_deleted',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          deleted_user: deletedUserInfo,
          deleted_by_role: req.user.role
        }
      });
      
      res.json({
        success: true,
        message: 'User deleted successfully',
        deleted_user: deletedUserInfo,
        deleted_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error deleting user'
      });
    }
  }

  // Admin reset password with audit
  static async adminResetPassword(req, res) {
    try {
      const { userId, newPassword } = req.body;
      
      if (!userId || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'User ID and new password are required'
        });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters'
        });
      }
      
      // Get target user
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Manager cannot reset admin/manager passwords
      if (req.user.role === 'manager' && ['admin', 'manager'].includes(targetUser.role)) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'permission_denied',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            action: 'reset_password',
            target_user_id: userId,
            target_user_role: targetUser.role,
            reason: 'manager_cannot_reset_admin_password'
        }
        });

        return res.status(403).json({
          success: false,
          error: 'Cannot reset admin or manager passwords'
        });
      }
      
      // Log before reset
      await AuditLog.create({
        user_id: req.user.id,
        action: 'password_reset_initiated',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          target_user_id: userId,
          target_user_email: targetUser.email,
          reset_by_role: req.user.role,
          target_token_version: targetUser.token_version || 1
        }
      });
      
      // Update password and invalidate all tokens
      await User.update(userId, { password: newPassword });
      await User.invalidateTokens(userId);
      
      // Log successful reset
      await AuditLog.create({
        user_id: req.user.id,
        action: 'password_reset_completed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          target_user_id: userId,
          target_user_email: targetUser.email,
          token_version_incremented: true
        }
      });
      
      res.json({
        success: true,
        message: 'Password reset successfully. All existing sessions have been invalidated.',
        user_id: userId
      });
    } catch (error) {
      console.error('Admin reset password error:', error);
      
      // Log reset failure
      await AuditLog.create({
        user_id: req.user?.id || null,
        action: 'password_reset_failed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: false,
        details: { 
          target_user_id: req.body.userId,
          error: error.message
        }
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Server error resetting password'
      });
    }
  }

  // Get user statistics (admin sees all, manager sees staff only)
  static async getUserStats(req, res) {
    try {
      let stats;
      
      if (req.user.role === 'manager') {
        stats = await User.getStaffStats();
      } else {
        stats = await User.getStats();
      }
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting user stats'
      });
    }
  }

  // Change own password with audit
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password and new password are required'
        });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 6 characters long'
        });
      }
      
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      const isValidPassword = await User.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        // Log failed password change attempt
        await AuditLog.create({
          user_id: req.user.id,
          action: 'password_change_failed',
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          success: false,
          details: { 
            reason: 'incorrect_current_password'
          }
        });

        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }
      
      // Log before changing
      await AuditLog.create({
        user_id: req.user.id,
        action: 'password_change_initiated',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          current_token_version: user.token_version || 1
        }
      });
      
      // Update password and invalidate all tokens
      await User.update(req.user.id, { password: newPassword });
      await User.invalidateTokens(req.user.id);
      
      // Generate new token with updated version
      const updatedUser = await User.findById(req.user.id);
      const newToken = User.generateToken(updatedUser);
      
      // Log successful change
      await AuditLog.create({
        user_id: req.user.id,
        action: 'password_changed',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          token_version_incremented: true,
          new_token_version: updatedUser.token_version || 1
        }
      });
      
      res.json({
        success: true,
        message: 'Password changed successfully. All other sessions have been logged out.',
        token: newToken
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error changing password'
      });
    }
  }

  // Logout with audit
  static async logout(req, res) {
    try {
      // Log logout action
      await AuditLog.create({
        user_id: req.user.id,
        action: 'logout',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          token_version: req.user.token_version || 1
        }
      });

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout logging error:', error);
      res.json({
        success: true,
        message: 'Logout successful'
      });
    }
  }

  // NEW: Force logout from all devices
  static async logoutAllDevices(req, res) {
    try {
      // Invalidate all tokens by incrementing token_version
      await User.invalidateTokens(req.user.id);
      
      // Get updated user to generate new token
      const updatedUser = await User.findById(req.user.id);
      const newToken = User.generateToken(updatedUser);
      
      // Log the action
      await AuditLog.create({
        user_id: req.user.id,
        action: 'logout_all_devices',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          old_token_version: req.user.token_version || 1,
          new_token_version: updatedUser.token_version || 1,
          devices_logged_out: 'all'
        }
      });

      res.json({
        success: true,
        message: 'Logged out from all devices',
        token: newToken  // Send new token for current session
      });
    } catch (error) {
      console.error('Logout all devices error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error logging out all devices'
      });
    }
  }

  // NEW: Suspend user account and invalidate all tokens
  static async suspendUser(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      // Get target user first
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Permission checks (similar to deleteUser)
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot suspend your own account'
        });
      }
      
      if (req.user.role === 'manager' && ['admin', 'manager'].includes(targetUser.role)) {
        return res.status(403).json({
          success: false,
          error: 'Cannot suspend admin or manager accounts'
        });
      }
      
      // Invalidate all tokens first
      await User.invalidateTokens(id);
      
      // Then suspend the account
      const updatedUser = await User.update(id, { 
        status: 'inactive',
        ...(reason && { suspension_reason: reason })
      });
      
      // Log suspension
      await AuditLog.create({
        user_id: req.user.id,
        action: 'user_suspended',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        success: true,
        details: { 
          target_user_id: id,
          target_user_email: targetUser.email,
          reason: reason || 'No reason provided',
          token_version_incremented: true,
          old_token_version: targetUser.token_version || 1,
          new_token_version: updatedUser.token_version || 1
        }
      });
      
      res.json({
        success: true,
        message: 'User account suspended. All active sessions have been terminated.',
        user_id: id,
        suspended_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Suspend user error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error suspending user'
      });
    }
  }
}

module.exports = AuthController;