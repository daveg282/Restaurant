const Order = require('../models/order');
const OrderItem = require('../models/orderItem');
const Table = require('../models/table');
const Pager = require('../models/pager');
const MenuItem = require('../models/menuItem');

class OrderController {
  
// ==================== FIXED: createOrder with better validation ====================
static async createOrder(req, res) {
  try {
    const { table_id, customer_name, items, customer_count, notes, order_type } = req.body;

    const userId = req.user.id;
    const isTakeaway = order_type === 'takeaway';

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one menu item is required'
      });
    }

    // Validate item quantities
    for (const item of items) {
      if (item.quantity && (item.quantity < 1 || item.quantity > 100)) {
        return res.status(400).json({
          success: false,
          error: 'Item quantity must be between 1 and 100'
        });
      }
    }

    // Handle table logic safely
    let table = null;
    let finalTableId = null;

    if (!isTakeaway) {
      const parsedTableId = parseInt(table_id);

      if (!parsedTableId || isNaN(parsedTableId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid table ID is required for dine-in orders'
        });
      }

      table = await Table.findById(parsedTableId);

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

      finalTableId = parsedTableId;
    }

    // Batch validate menu items (single query instead of loop)
    const menuItemIds = items.map(item => item.menu_item_id);
    const menuItems = await MenuItem.findByIds(menuItemIds); // You'll need to add this method
    
    // Create lookup map
    const menuItemMap = new Map();
    menuItems.forEach(item => menuItemMap.set(item.id, item));

    const validatedItems = [];
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menu_item_id);

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

    // Prepare order data
    const orderData = {
      table_id: finalTableId,
      customer_name:
        customer_name ||
        (isTakeaway ? 'Takeaway Customer' : `Table ${table ? table.table_number : ''}`),
      customer_count: customer_count || (table ? table.capacity : 1),
      order_type: order_type || 'dine-in',
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

// ==================== FIXED: getAllOrders with pagination ====================
static async getAllOrders(req, res) {
  try {
    // Add pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const filters = {
      status: req.query.status,
      table_id: req.query.table_id,
      waiter_id: req.query.waiter_id,
      payment_status: req.query.payment_status,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      limit: limit,
      offset: offset
    };

    // Get orders with items (now using optimized model)
    const orders = await Order.getAll(filters);
    
    // Get total count for pagination
    const totalCount = await Order.getCount(filters); // Add this method

    res.json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
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
    
    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
      });
    }
    
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
    
    if (!order_number) {
      return res.status(400).json({
        success: false,
        error: 'Order number is required'
      });
    }
    
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

// ==================== FIXED: updateOrderStatus with better validation ====================
static async updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
      });
    }

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

    // Prevent invalid status transitions
    if (order.status === 'completed' && status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot change status of completed order'
      });
    }
    
    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot change status of cancelled order'
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

    // Clear new items flag whenever chef acknowledges by changing status
    if (['preparing', 'ready'].includes(status)) {
      const db = require('../config/db');
      await db.execute('UPDATE orders SET has_new_items = 0 WHERE id = ?', [id]);
    }

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

// ==================== FIXED: updatePaymentStatus with better validation ====================
static async updatePaymentStatus(req, res) {
  try {
    const { id } = req.params;
    const paymentData = req.body;
    const userId = req.user.id;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
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

    // Check if already paid
    if (order.payment_status === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Order is already paid'
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

    // Validate tip if provided
    if (paymentData.tip && (paymentData.tip < 0 || paymentData.tip > 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Tip must be between 0 and 1000'
      });
    }

    // Validate discount if provided
    if (paymentData.discount && (paymentData.discount < 0 || paymentData.discount > order.total_amount)) {
      return res.status(400).json({
        success: false,
        error: 'Discount cannot exceed order total'
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

// ==================== FIXED: getKitchenOrders with caching headers ====================
static async getKitchenOrders(req, res) {
  try {
    // Add cache control for kitchen display (short polling)
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
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

// Cancel order
static async cancelOrder(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
      });
    }

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

// ==================== FIXED: addItemToOrder with transaction ====================
static async addItemToOrder(req, res) {
  const db = require('../config/db');
  const connection = await db.beginTransaction();
  
  try {
    const { id } = req.params;
    const itemData = req.body;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
      });
    }

    // Check order exists
    const order = await Order.findById(id);
    if (!order) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot add items to ${order.status} order`
      });
    }

    // Validate quantity
    if (itemData.quantity && (itemData.quantity < 1 || itemData.quantity > 100)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Quantity must be between 1 and 100'
      });
    }

    // Validate menu item
    const menuItem = await MenuItem.findById(itemData.menu_item_id);
    if (!menuItem) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Menu item not found'
      });
    }

    if (!menuItem.available) {
      await connection.rollback();
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

    // Update total and flag kitchen that new items were added
    const newTotal = parseFloat(order.total_amount) + (menuItem.price * (itemData.quantity || 1));
    
    await connection.execute(
      'UPDATE orders SET total_amount = ?, has_new_items = 1 WHERE id = ?',
      [parseFloat(newTotal).toFixed(2), id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Item added to order successfully',
      item: orderItem,
      order_total: newTotal,
      has_new_items: true
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add item to order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error adding item to order'
    });
  } finally {
    connection.release();
  }
}

// ==================== FIXED: removeItemFromOrder with transaction ====================
static async removeItemFromOrder(req, res) {
  const db = require('../config/db');
  const connection = await db.beginTransaction();
  
  try {
    const { id, item_id } = req.params;

    // Validate IDs
    if (!id || isNaN(parseInt(id)) || !item_id || isNaN(parseInt(item_id))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: 'Valid order ID and item ID are required'
      });
    }

    // Check order exists
    const order = await Order.findById(id);
    if (!order) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot remove items from ${order.status} order`
      });
    }

    // Get item details
    const item = await OrderItem.findById(item_id);
    if (!item || item.order_id !== parseInt(id)) {
      await connection.rollback();
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
    
    await connection.execute(
      'UPDATE orders SET total_amount = ? WHERE id = ?',
      [parseFloat(newTotal).toFixed(2), id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Item removed from order successfully',
      removed_item: item,
      order_total: newTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Remove item from order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error removing item from order'
    });
  } finally {
    connection.release();
  }
}

// Get order statistics
static async getOrderStats(req, res) {
  try {
    const { time_range } = req.query;
    
    // Validate time_range
    const validRanges = ['today', 'week', 'month', 'year'];
    if (time_range && !validRanges.includes(time_range)) {
      return res.status(400).json({
        success: false,
        error: `Valid time_range required: ${validRanges.join(', ')}`
      });
    }
    
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

// ==================== FIXED: searchOrders with minimum length ====================
static async searchOrders(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Limit search to 100 results for performance
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const filters = {
      waiter_id: waiterId,
      status: req.query.status,
      limit: limit,
      offset: offset
    };

    const orders = await Order.getAll(filters);
    
    // Get total count
    const totalCount = await Order.getCount(filters);

    res.json({
      success: true,
      orders,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
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
    
    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format'
      });
    }
    
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

// ==================== NEW: Get sales summary ====================
static async getSalesSummary(req, res) {
  try {
    const filters = {
      period: req.query.period,
      date: req.query.date,
      start_date: req.query.start_date,
      end_date: req.query.end_date
    };
    
    // Validate date formats
    if (filters.date && !/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format'
      });
    }
    
    if (filters.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(filters.start_date)) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be in YYYY-MM-DD format'
      });
    }
    
    if (filters.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(filters.end_date)) {
      return res.status(400).json({
        success: false,
        error: 'End date must be in YYYY-MM-DD format'
      });
    }
    
    const summary = await Order.getSalesSummary(filters);
    
    res.json(summary);
    
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting sales summary'
    });
  }
}

// ==================== NEW: Get daily sales report ====================
static async getDailySalesReport(req, res) {
  try {
    const date = req.query.date || null;
    
    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format'
      });
    }
    
    const report = await Order.getDailySalesReport(date);
    
    res.json(report);
    
  } catch (error) {
    console.error('Get daily sales report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting daily sales report'
    });
  }
}

// ==================== NEW: Get urgent orders ====================
static async getUrgentOrders(req, res) {
  try {
    const orders = await Order.getUrgentOrders();
    
    res.json({
      success: true,
      orders,
      count: orders.length
    });
    
  } catch (error) {
    console.error('Get urgent orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting urgent orders'
    });
  }
}

// ==================== NEW: Get pending payments ====================
static async getPendingPayments(req, res) {
  try {
    const orders = await Order.getPendingPayments();
    
    res.json({
      success: true,
      orders,
      count: orders.length
    });
    
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting pending payments'
    });
  }
}

// ==================== NEW: Process payment ====================
static async processPayment(req, res) {
  try {
    const { id } = req.params;
    const paymentData = req.body;
    const cashierId = req.user.id;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
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

    const result = await Order.processPayment(id, paymentData, cashierId);

    res.json({
      success: true,
      message: 'Payment processed successfully',
      order: result
    });

  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error processing payment'
    });
  }
}

// ==================== NEW: Get kitchen stats ====================
static async getKitchenStats(req, res) {
  try {
    const stats = await Order.getKitchenStats();
    const popularItems = await Order.getPopularItems(5);
    
    res.json({
      success: true,
      stats,
      popular_items: popularItems
    });
    
  } catch (error) {
    console.error('Get kitchen stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting kitchen stats'
    });
  }
}

// ==================== NEW: Mark order ready ====================
static async markOrderReady(req, res) {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: 'Valid order ID is required'
      });
    }
    
    const result = await Order.markOrderReady(id);
    
    res.json({
      success: true,
      message: result.message,
      affected_items: result.affected_items
    });
    
  } catch (error) {
    console.error('Mark order ready error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error marking order ready'
    });
  }
}

// ==================== NEW: Export orders ====================
static async exportOrders(req, res) {
  try {
    const filters = {
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      status: req.query.status,
      payment_status: 'paid' // Only export paid orders
    };
    
    // Validate date range
    if (!filters.start_date || !filters.end_date) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required for export'
      });
    }
    
    // Get all orders in range (no pagination for export)
    filters.limit = 10000; // Reasonable limit
    const orders = await Order.getAll(filters);
    
    // Format for CSV export
    const exportData = orders.map(order => ({
      order_number: order.order_number,
      date: order.payment_time || order.order_time,
      customer: order.customer_name,
      table: order.table_number || 'Takeaway',
      waiter: order.waiter_name,
      total: order.total_amount,
      tax: order.tax || 0,
      tip: order.tip || 0,
      payment_method: order.payment_method,
      items_count: order.items ? order.items.length : 0
    }));
    
    res.json({
      success: true,
      export_data: exportData,
      count: exportData.length,
      filters
    });
    
  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error exporting orders'
    });
  }
}

}

module.exports = OrderController;