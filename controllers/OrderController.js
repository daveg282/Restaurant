const Order = require('../models/Order');
const OrderItem = require('../models/orderItem');
const Table = require('../models/Table');
const Pager = require('../models/Pager');
const MenuItem = require('../models/menuItem');

class OrderController {
  // Create new order
 static async createOrder(req, res) {
  try {
    const { table_id, customer_name, items, customer_count, notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validation (same as before)
    if (!table_id) {
      return res.status(400).json({
        success: false,
        error: 'Table ID is required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one menu item is required'
      });
    }

    // Validate table exists and is available
    const table = await Table.findById(table_id);
    if (!table) {
      return res.status(404).json({
        success: false,
        error: 'Table not found'
      });
    }

    if (table.status !== 'available' && table.status !== 'reserved') {
      return res.status(400).json({
        success: false,
        error: `Table is ${table.status}. Please select an available table.`
      });
    }

    // Validate menu items and get current prices
    const validatedItems = [];
    for (const item of items) {
      const menuItem = await MenuItem.findById(item.menu_item_id);
      if (!menuItem) {
        return res.status(404).json({
          success: false,
          error: `Menu item with ID ${item.menu_item_id} not found`
        });
      }

      if (!menuItem.available) {
        return res.status(400).json({
          success: false,
          error: `Menu item "${menuItem.name}" is not available`
        });
      }

      validatedItems.push({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity || 1,
        price: menuItem.price,
        special_instructions: item.special_instructions || ''
      });
    }

    // Simplified order data WITHOUT pager
    const orderData = {
      table_id,
      customer_name: customer_name || `Table ${table.table_number}`,
      customer_count: customer_count || table.capacity,
      notes: notes || ''
    };

    // Create order
    const order = await Order.create(orderData, validatedItems, userId);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order,
      items: validatedItems
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error creating order'
    });
  }
}

  // Get all orders
  static async getAllOrders(req, res) {
    try {
      const filters = {
        status: req.query.status,
        table_id: req.query.table_id,
        waiter_id: req.query.waiter_id,
        payment_status: req.query.payment_status,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        limit: req.query.limit ? parseInt(req.query.limit) : null
      };

      const orders = await Order.getAll(filters);

      res.json({
        success: true,
        orders,
        count: orders.length
      });
    } catch (error) {
      console.error('Get all orders error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting orders'
      });
    }
  }

  // Get order by ID
  static async getOrder(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.json({
        success: true,
        order
      });
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting order'
      });
    }
  }

  // Get order by order number
  static async getOrderByNumber(req, res) {
    try {
      const { order_number } = req.params;
      const order = await Order.findByOrderNumber(order_number);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const fullOrder = await Order.findById(order.id);

      res.json({
        success: true,
        order: fullOrder
      });
    } catch (error) {
      console.error('Get order by number error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting order'
      });
    }
  }

  // Update order status
  static async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Validate status
      const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Valid status required: ${validStatuses.join(', ')}`
        });
      }

      // Check order exists
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Role-based permissions
      if (userRole === 'chef' && !['preparing', 'ready'].includes(status)) {
        return res.status(403).json({
          success: false,
          error: 'Chefs can only update status to preparing or ready'
        });
      }

      if (userRole === 'waiter' && !['completed'].includes(status)) {
        return res.status(403).json({
          success: false,
          error: 'Waiters can only mark orders as completed'
        });
      }

      // Update status
      const updatedOrder = await Order.updateStatus(id, status, userId, userRole);

      res.json({
        success: true,
        message: `Order status updated to ${status}`,
        order: updatedOrder
      });
    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating order status'
      });
    }
  }

  // Update order payment status
  static async updatePaymentStatus(req, res) {
    try {
      const { id } = req.params;
      const paymentData = req.body;
      const userId = req.user.id;

      // Check order exists
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Validate payment data
      if (!paymentData.payment_method) {
        return res.status(400).json({
          success: false,
          error: 'Payment method is required'
        });
      }

      const validMethods = ['cash', 'card', 'mobile'];
      if (!validMethods.includes(paymentData.payment_method)) {
        return res.status(400).json({
          success: false,
          error: `Valid payment method required: ${validMethods.join(', ')}`
        });
      }

      // Update payment status
      const updatedOrder = await Order.updatePaymentStatus(id, paymentData, userId);

      res.json({
        success: true,
        message: 'Payment processed successfully',
        order: updatedOrder
      });
    } catch (error) {
      console.error('Update payment status error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating payment status'
      });
    }
  }

  // Get kitchen orders
  static async getKitchenOrders(req, res) {
    try {
      const orders = await Order.getKitchenOrders();

      res.json({
        success: true,
        orders,
        count: orders.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get kitchen orders error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting kitchen orders'
      });
    }
  }
static async updateStatus(id, status, userId = null, role = null) {
  try {
    console.log('=== UPDATING ORDER STATUS ===');
    console.log('Order ID:', id);
    console.log('New Status:', status);
    
    const updates = ['status = ?'];
    const params = [status];
    
    // Set timestamps based on status
    if (status === 'preparing') {
      updates.push('estimated_ready_time = DATE_ADD(NOW(), INTERVAL 30 MINUTE)');
      console.log('Set estimated ready time');
    }
    
    if (status === 'ready') {
      updates.push('actual_ready_time = NOW()');
      console.log('Set actual ready time');
      
      // Optional: Also update all items to "ready" if you want
      // await db.execute('UPDATE order_items SET status = "ready" WHERE order_id = ?', [id]);
    }
    
    if (status === 'completed') {
      updates.push('completed_time = NOW()');
      console.log('Set completed time');
      
      // Free the table
      const order = await this.findById(id);
      if (order && order.table_id) {
        await db.execute(
          'UPDATE tables SET status = "available", customer_count = 0 WHERE id = ?',
          [order.table_id]
        );
        console.log('Freed table:', order.table_id);
      }
    }
    
    const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;
    console.log('Executing SQL:', sql);
    console.log('With params:', [...params, id]);
    
    const result = await db.execute(sql, [...params, id]);
    console.log('Update result:', result.affectedRows, 'rows affected');
    
    // Get and return updated order
    const updatedOrder = await this.findById(id);
    console.log('Updated order:', updatedOrder);
    
    return updatedOrder;
    
  } catch (error) {
    console.error('Error in Order.updateStatus:', error.message);
    throw new Error(`Error updating order status: ${error.message}`);
  }
}

  // Cancel order
  static async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Only admin/manager can cancel orders
      if (!['admin', 'manager'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Only admin or manager can cancel orders'
        });
      }

      const result = await Order.cancel(id, reason);

      res.json({
        success: true,
        message: result.message,
        reason: result.reason
      });
    } catch (error) {
      console.error('Cancel order error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error cancelling order'
      });
    }
  }

  // Add item to existing order
  static async addItemToOrder(req, res) {
    try {
      const { id } = req.params;
      const itemData = req.body;

      // Check order exists
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.status === 'completed' || order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: `Cannot add items to ${order.status} order`
        });
      }

      // Validate menu item
      const menuItem = await MenuItem.findById(itemData.menu_item_id);
      if (!menuItem) {
        return res.status(404).json({
          success: false,
          error: 'Menu item not found'
        });
      }

      if (!menuItem.available) {
        return res.status(400).json({
          success: false,
          error: 'Menu item is not available'
        });
      }

      // Add item
      const orderItem = await OrderItem.create(id, {
        menu_item_id: itemData.menu_item_id,
        quantity: itemData.quantity || 1,
        price: menuItem.price,
        special_instructions: itemData.special_instructions || ''
      });

      // Update order total
      const newTotal = parseFloat(order.total_amount) + (menuItem.price * (itemData.quantity || 1));
      await Order.update(id, { total_amount: newTotal });

      res.json({
        success: true,
        message: 'Item added to order successfully',
        item: orderItem,
        order_total: newTotal
      });
    } catch (error) {
      console.error('Add item to order error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error adding item to order'
      });
    }
  }

  // Remove item from order
  static async removeItemFromOrder(req, res) {
    try {
      const { id, item_id } = req.params;

      // Check order exists
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.status === 'completed' || order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: `Cannot remove items from ${order.status} order`
        });
      }

      // Get item details
      const item = await OrderItem.findById(item_id);
      if (!item || item.order_id !== parseInt(id)) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found'
        });
      }

      // Remove item
      const result = await OrderItem.delete(item_id);

      // Update order total
      const itemValue = parseFloat(item.price) * item.quantity;
      const newTotal = Math.max(0, parseFloat(order.total_amount) - itemValue);
      await Order.update(id, { total_amount: newTotal });

      res.json({
        success: true,
        message: 'Item removed from order successfully',
        removed_item: item,
        order_total: newTotal
      });
    } catch (error) {
      console.error('Remove item from order error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error removing item from order'
      });
    }
  }

  // Get order statistics
  static async getOrderStats(req, res) {
    try {
      const { time_range } = req.query;
      const stats = await Order.getStats(time_range || 'today');

      res.json({
        success: true,
        stats,
        time_range: time_range || 'today'
      });
    } catch (error) {
      console.error('Get order stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting order stats'
      });
    }
  }

  // Search orders
  static async searchOrders(req, res) {
    try {
      const { q } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters'
        });
      }

      const orders = await Order.search(q);

      res.json({
        success: true,
        orders,
        count: orders.length,
        query: q
      });
    } catch (error) {
      console.error('Search orders error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error searching orders'
      });
    }
  }

  // Get waiter's active orders
  static async getWaiterOrders(req, res) {
    try {
      const waiterId = req.user.id;
      const filters = {
        waiter_id: waiterId,
        status: req.query.status
      };

      const orders = await Order.getAll(filters);

      res.json({
        success: true,
        orders,
        count: orders.length,
        waiter_id: waiterId
      });
    } catch (error) {
      console.error('Get waiter orders error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting waiter orders'
      });
    }
  }
  // Get waiter's daily orders
static async getDailyOrders(req, res) {
  try {
    const waiterId = req.user.id;
    const date = req.params.date || null;
    
    // Use the model method
    const dailyData = await Order.getWaiterDailyOrders(waiterId, date);
    
    res.json({
      success: true,
      ...dailyData,
      waiterId
    });
    
  } catch (error) {
    console.error('Get daily orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting daily orders'
    });
  }
}
  
}

module.exports = OrderController;