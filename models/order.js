const db = require('../config/db');

class Order {

static async generateOrderNumber() {
  try {
    // Get the highest order number that follows ORD-XXXX format
    const sql = `
      SELECT order_number 
      FROM orders 
      WHERE order_number LIKE 'ORD-%'
        AND LENGTH(order_number) <= 10  -- Only properly formatted ones
      ORDER BY CAST(SUBSTRING(order_number, 5) AS UNSIGNED) DESC
      LIMIT 1
    `;
    
    const result = await db.queryOne(sql);
    
    let nextNum = 1000; // Start from 1000
    
    if (result && result.order_number) {
      const match = result.order_number.match(/ORD-(\d+)/);
      if (match && match[1]) {
        const lastNum = parseInt(match[1]);
        if (!isNaN(lastNum) && lastNum >= 1000 && lastNum < 9999) {
          nextNum = lastNum + 1;
        }
      }
    }
    
    return `ORD-${nextNum}`; // This will be max 8 characters (ORD-9999)
    
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback: use timestamp but keep it short
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits
    return `ORD-T${timestamp}`; // Max 7 characters
  }
}

  // Create new order
static async create(orderData, items, userId) {
  const connection = await db.beginTransaction();
  
  try {
    // 1. Generate order number
    const orderNumber = `ORD-${Date.now()}`;
    
    // 2. Calculate total
    let totalAmount = 0;
    for (const item of items) {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 1;
      totalAmount += price * quantity;
    }
    
    // 3. Insert order
    const insertSql = `
      INSERT INTO orders 
      (order_number, table_id, customer_name, status, payment_status, total_amount, waiter_id, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      orderNumber,
      parseInt(orderData.table_id),
      orderData.customer_name || '',
      'pending',
      'pending',
      parseFloat(totalAmount.toFixed(2)),
      parseInt(userId),
      orderData.notes || ''
    ];
    
    // FIX: Destructure the result array
    const [result] = await connection.execute(insertSql, params);
    const orderId = result.insertId;
    
    if (!orderId) {
      throw new Error('Insert failed');
    }
    
    // 4. Insert order items
    for (const item of items) {
      const itemSql = `
        INSERT INTO order_items 
        (order_id, menu_item_id, quantity, price, special_instructions, status) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      await connection.execute(itemSql, [
        orderId,
        item.menu_item_id,
        parseInt(item.quantity) || 1,
        parseFloat(item.price) || 0,
        item.special_instructions || '',
        'pending'
      ]);
    }
    
    // 5. Update table
    if (orderData.table_id) {
      await connection.execute(
        'UPDATE tables SET status = "occupied" WHERE id = ?',
        [orderData.table_id]
      );
    }
    
    await connection.commit();
    
    return {
      id: orderId,
      order_number: orderNumber,
      table_id: orderData.table_id,
      customer_name: orderData.customer_name,
      total_amount: totalAmount,
      waiter_id: userId,
      items
    };
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

  // Get all orders with filters
  static async getAll(filters = {}) {
    try {
      let sql = `
        SELECT o.*, t.table_number, u.username as waiter_name
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN users u ON o.waiter_id = u.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (filters.status) {
        sql += ' AND o.status = ?';
        params.push(filters.status);
      }
      
      if (filters.table_id) {
        sql += ' AND o.table_id = ?';
        params.push(filters.table_id);
      }
      
      if (filters.waiter_id) {
        sql += ' AND o.waiter_id = ?';
        params.push(filters.waiter_id);
      }
      
      if (filters.payment_status) {
        sql += ' AND o.payment_status = ?';
        params.push(filters.payment_status);
      }
      
      if (filters.start_date) {
        sql += ' AND DATE(o.order_time) >= ?';
        params.push(filters.start_date);
      }
      
      if (filters.end_date) {
        sql += ' AND DATE(o.order_time) <= ?';
        params.push(filters.end_date);
      }
      
      sql += ' ORDER BY o.order_time DESC';
      
      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }
      
      return await db.query(sql, params);
    } catch (error) {
      throw new Error(`Error getting orders: ${error.message}`);
    }
  }

  // Get order by ID with items
  static async findById(id) {
    try {
      // Get order details
      const orderSql = `
        SELECT o.*, t.table_number, 
               u1.username as waiter_name, 
               u2.username as cashier_name
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN users u1 ON o.waiter_id = u1.id
        LEFT JOIN users u2 ON o.cashier_id = u2.id
        WHERE o.id = ?
      `;
      
      const order = await db.queryOne(orderSql, [id]);
      
      if (!order) return null;
      
      // Get order items
      const itemsSql = `
        SELECT oi.*, mi.name as menu_item_name, mi.image
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `;
      
      const items = await db.query(itemsSql, [id]);
      
      return {
        ...order,
        items
      };
    } catch (error) {
      throw new Error(`Error finding order: ${error.message}`);
    }
  }

  // Get order by order number
  static async findByOrderNumber(orderNumber) {
    try {
      const sql = 'SELECT * FROM orders WHERE order_number = ?';
      return await db.queryOne(sql, [orderNumber]);
    } catch (error) {
      throw new Error(`Error finding order: ${error.message}`);
    }
  }

  // Update order status
  static async updateStatus(id, status, userId = null, role = null) {
    try {
      const updates = ['status = ?'];
      const params = [status, id];
      
      if (status === 'preparing') {
        updates.push('estimated_ready_time = DATE_ADD(NOW(), INTERVAL 30 MINUTE)');
      }
      
      if (status === 'ready') {
        updates.push('actual_ready_time = NOW()');
        
        // Buzz pager if assigned
        const order = await this.findById(id);
        if (order && order.pager_number) {
          console.log(`🛎️ Buzzing pager #${order.pager_number} for order ${order.order_number}`);
          // In real system, trigger physical pager
        }
      }
      
      if (status === 'completed') {
        updates.push('completed_time = NOW()');
        
        // Free the table
        const order = await this.findById(id);
        if (order && order.table_id) {
          await db.execute(
            'UPDATE tables SET status = "available", customer_count = 0 WHERE id = ?',
            [order.table_id]
          );
        }
        
        // Release pager if assigned
        if (order && order.pager_number) {
          await db.execute(
            'UPDATE pagers SET status = "available", order_id = NULL, assigned_at = NULL WHERE pager_number = ?',
            [order.pager_number]
          );
        }
      }
      
      const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Error updating order status: ${error.message}`);
    }
  }

  // Update order payment status
  static async updatePaymentStatus(id, paymentData, cashierId) {
    try {
      const updates = ['payment_status = ?', 'payment_method = ?', 'cashier_id = ?'];
      const params = [
        paymentData.payment_status || 'paid',
        paymentData.payment_method || 'cash',
        cashierId,
        id
      ];
      
      if (paymentData.tip !== undefined) {
        updates.push('tip = ?');
        params.splice(3, 0, paymentData.tip);
      }
      
      if (paymentData.discount !== undefined) {
        updates.push('discount = ?');
        params.splice(4, 0, paymentData.discount);
      }
      
      if (paymentData.split_count !== undefined) {
        updates.push('split_count = ?');
        params.splice(5, 0, paymentData.split_count);
      }
      
      const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Error updating payment status: ${error.message}`);
    }
  }

  // Get kitchen orders (preparing/ready)
  static async getKitchenOrders() {
    try {
      const sql = `
        SELECT o.*, t.table_number,
               JSON_ARRAYAGG(
                 JSON_OBJECT(
                   'id', oi.id,
                   'menu_item_id', oi.menu_item_id,
                   'name', mi.name,
                   'quantity', oi.quantity,
                   'special_instructions', oi.special_instructions,
                   'status', oi.status
                 )
               ) as items
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.status IN ('pending', 'preparing', 'ready')
        AND oi.status IN ('pending', 'preparing')
        GROUP BY o.id
        ORDER BY 
          CASE o.status 
            WHEN 'ready' THEN 1
            WHEN 'preparing' THEN 2
            WHEN 'pending' THEN 3
          END,
          o.order_time
      `;
      
      return await db.query(sql);
    } catch (error) {
      throw new Error(`Error getting kitchen orders: ${error.message}`);
    }
  }

  // Update order item status (for kitchen)
 static async updateOrderStatus(orderId, status) {
  try {
    // Update the order status in orders table
    const sql = 'UPDATE orders SET status = ? WHERE id = ?';
    await db.execute(sql, [status, orderId]);
    
    // Also update all order items to match the new order status
    const updateItemsSql = 'UPDATE order_items SET status = ? WHERE order_id = ?';
    await db.execute(updateItemsSql, [status, orderId]);
    
    return { 
      success: true,
      message: `Order ${orderId} status updated to ${status}`,
      order_id: orderId,
      status: status
    };
  } catch (error) {
    throw new Error(`Error updating order status: ${error.message}`);
  }
}

  // Cancel order
  static async cancel(id, reason = '') {
    try {
      const order = await this.findById(id);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      if (order.status === 'completed') {
        throw new Error('Cannot cancel completed order');
      }
      
      // Update order status
      await this.updateStatus(id, 'cancelled');
      
      // Free table if occupied
      if (order.table_id) {
        await db.execute(
          'UPDATE tables SET status = "available", customer_count = 0 WHERE id = ?',
          [order.table_id]
        );
      }
      
      // Release pager if assigned
      if (order.pager_number) {
        await db.execute(
          'UPDATE pagers SET status = "available", order_id = NULL, assigned_at = NULL WHERE pager_number = ?',
          [order.pager_number]
        );
      }
      
      return { 
        message: 'Order cancelled successfully',
        reason: reason || 'No reason provided'
      };
    } catch (error) {
      throw new Error(`Error cancelling order: ${error.message}`);
    }
  }

  // Get order statistics
  static async getStats(timeRange = 'today') {
    try {
      let dateFilter = '';
      const params = [];
      
      switch (timeRange) {
        case 'today':
          dateFilter = 'DATE(order_time) = CURDATE()';
          break;
        case 'week':
          dateFilter = 'order_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
          break;
        case 'month':
          dateFilter = 'order_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
          break;
        default:
          dateFilter = '1=1';
      }
      
      const sql = `
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
          SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing_orders,
          SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as average_order_value,
          MIN(total_amount) as min_order_value,
          MAX(total_amount) as max_order_value,
          SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as paid_orders,
          SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending_payment_orders
        FROM orders
        WHERE ${dateFilter}
      `;
      
      return await db.queryOne(sql, params);
    } catch (error) {
      throw new Error(`Error getting order stats: ${error.message}`);
    }
  }

  // Search orders
  static async search(query) {
    try {
      const sql = `
        SELECT o.*, t.table_number, u.username as waiter_name
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN users u ON o.waiter_id = u.id
        WHERE o.order_number LIKE ? 
           OR o.customer_name LIKE ?
           OR t.table_number LIKE ?
        ORDER BY o.order_time DESC
        LIMIT 50
      `;
      const searchTerm = `%${query}%`;
      return await db.query(sql, [searchTerm, searchTerm, searchTerm]);
    } catch (error) {
      throw new Error(`Error searching orders: ${error.message}`);
    }
  }
  // Get all orders for kitchen display
// Get kitchen orders - SIMPLE VERSION
static async getKitchenOrders() {
  try {
    // 1. Get basic order info
    const ordersSql = `
      SELECT 
        o.id,
        o.order_number,
        o.order_time,
        o.table_id,
        t.table_number
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.status IN ('pending', 'preparing', 'ready')
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(ordersSql);
    
    // 2. Get items for each order
    for (let order of orders) {
      const itemsSql = `
        SELECT 
          oi.id,
          oi.menu_item_id,
          mi.name as item_name,
          oi.quantity,
          oi.status,
          oi.special_instructions,
          mi.preparation_time,
          c.name as category_name
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE oi.order_id = ?
          AND oi.status IN ('pending', 'preparing', 'ready')
        ORDER BY oi.status ASC
      `;
      
      order.items = await db.query(itemsSql, [order.id]);
    }
    
    return orders;
    
  } catch (error) {
    // If even simple queries fail, MariaDB needs fixing
    console.error('Kitchen orders error - MariaDB needs mysql_upgrade:', error.message);
    
    // Provide helpful error
    throw new Error(
      'MariaDB system tables corrupted. Please run: sudo mariadb-upgrade --force -u root -p\n' +
      'Or contact your server administrator to fix mysql.proc table.'
    );
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
// Get orders by station/category
static async getOrdersByStation(stationName) {
  try {
    // First, get the category ID for this station
    const categorySql = 'SELECT id FROM categories WHERE name LIKE ?';
    const category = await db.queryOne(categorySql, [`%${stationName}%`]);
    
    if (!category) {
      return []; // No such station/category
    }
    
    // Get orders with items from this category
    const ordersSql = `
      SELECT DISTINCT
        o.id,
        o.order_number,
        t.table_number,
        o.order_time
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE o.status IN ('pending', 'preparing', 'ready')
        AND oi.status IN ('pending', 'preparing')
        AND mi.category_id = ?
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(ordersSql, [category.id]);
    
    // Get ALL items for each order (not filtered by station)
    for (let order of orders) {
      const itemsSql = `
        SELECT 
          oi.id,
          oi.menu_item_id,
          mi.name,
          oi.quantity,
          oi.status,
          oi.special_instructions,
          c.name as category_name,
          c.id as category_id
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE oi.order_id = ?
          AND oi.status IN ('pending', 'preparing')
        ORDER BY oi.id
      `;
      
      const allItems = await db.query(itemsSql, [order.id]);
      
      // Filter items to show only this station's items FIRST
      order.items = allItems.filter(item => 
        item.category_id === category.id
      );
      
      // Also include other station's items but mark them
      order.other_items = allItems.filter(item => 
        item.category_id !== category.id
      );
    }
    
    return orders;
    
  } catch (error) {
    throw new Error(`Error getting station orders: ${error.message}`);
  }
}
// Get orders ready for payment
static async getPendingPayments() {
  try {
    const sql = `
      SELECT o.*, t.table_number, u.username as waiter_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      WHERE o.status = 'completed'  
        AND o.payment_status = 'pending'
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(sql);
    
    // Get items for each order
    for (let order of orders) {
      const itemsSql = `
        SELECT oi.*, mi.name as menu_item_name
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `;
      
      order.items = await db.query(itemsSql, [order.id]);
    }
    
    return orders;
  } catch (error) {
    throw new Error(`Error getting pending payments: ${error.message}`);
  }
}

// Process payment
static async processPayment(orderId, paymentData, cashierId) {
  const connection = await db.beginTransaction();
  
  try {
    console.log(`Processing payment for order ${orderId}`);
    
    // Update order with payment info (WITHOUT payment_time)
    const updateSql = `
      UPDATE orders 
      SET payment_status = ?,
          payment_method = ?,
          tip = ?,
          discount = ?,
          split_count = ?,
          cashier_id = ?,
          status = 'completed',
          completed_time = NOW()
      WHERE id = ?
    `;
    
    await connection.execute(updateSql, [
      paymentData.payment_status || 'paid',
      paymentData.payment_method,
      parseFloat(paymentData.tip) || 0.00,
      parseFloat(paymentData.discount) || 0.00,
      parseInt(paymentData.split_count) || 1,
      cashierId,
      orderId
    ]);
    
    // Free up the table
    const order = await this.findById(orderId);
    if (order && order.table_id) {
      await connection.execute(
        'UPDATE tables SET status = "available", customer_count = 0 WHERE id = ?',
        [order.table_id]
      );
      console.log(`Freed table ${order.table_id}`);
    }
    
    await connection.commit();
    
    // Return updated order
    return await this.findById(orderId);
    
  } catch (error) {
    await connection.rollback();
    throw new Error(`Error processing payment: ${error.message}`);
  }
}
// Get urgent orders (older than 20 minutes)
static async getUrgentOrders() {
  try {
    const sql = `
      SELECT 
        o.*,
        t.table_number,
        TIMESTAMPDIFF(MINUTE, o.order_time, NOW()) as minutes_old
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.status IN ('pending', 'preparing')
        AND TIMESTAMPDIFF(MINUTE, o.order_time, NOW()) > 20
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(sql);
    
    // Get items for each order
    for (let order of orders) {
      const itemsSql = `
        SELECT oi.*, mi.name as menu_item_name
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ?
          AND oi.status IN ('pending', 'preparing')
        ORDER BY oi.id
      `;
      
      order.items = await db.query(itemsSql, [order.id]);
    }
    
    return orders;
  } catch (error) {
    throw new Error(`Error getting urgent orders: ${error.message}`);
  }
}

// Mark all items in order as ready
static async markOrderReady(orderId) {
  try {
    const sql = `
      UPDATE order_items 
      SET status = 'ready', completed_at = NOW() 
      WHERE order_id = ? AND status IN ('pending', 'preparing')
    `;
    
    const result = await db.execute(sql, [orderId]);
    
    // Update order status
    await this.updateStatus(orderId, 'ready');
    
    return { 
      success: true, 
      message: `Order ${orderId} marked as ready`,
      affected_items: result.affectedRows 
    };
  } catch (error) {
    throw new Error(`Error marking order ready: ${error.message}`);
  }
}

// Get kitchen statistics
static async getKitchenStats() {
  try {
    const sql = `
      SELECT 
        COUNT(*) as total_orders_today,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing_orders,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_orders
      FROM orders
      WHERE DATE(order_time) = CURDATE()
    `;
    
    const stats = await db.queryOne(sql);
    
    return stats;
  } catch (error) {
    throw new Error(`Error getting kitchen stats: ${error.message}`);
  }
}

// Get popular items
static async getPopularItems(limit = 5) {
  try {
    const sql = `
      SELECT 
        mi.name,
        SUM(oi.quantity) as total_quantity
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE DATE(oi.created_at) = CURDATE()
      GROUP BY mi.id, mi.name
      ORDER BY total_quantity DESC
      LIMIT ?
    `;
    
    return await db.query(sql, [limit]);
  } catch (error) {
    throw new Error(`Error getting popular items: ${error.message}`);
  }
}
// Get waiter's daily orders with statistics
static async getWaiterDailyOrders(waiterId, date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`Getting daily orders for waiter ${waiterId}, date: ${targetDate}`);
    
    // Get orders for this waiter on the specified date
    const ordersSql = `
      SELECT o.*, t.table_number
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.waiter_id = ?
        AND DATE(o.order_time) = ?
      ORDER BY o.order_time DESC
    `;
    
    const orders = await db.query(ordersSql, [waiterId, targetDate]);
    
    // Get summary statistics
    const statsSql = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_revenue,
        COUNT(DISTINCT table_id) as tables_served,
        AVG(total_amount) as average_order_value,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_orders
      FROM orders
      WHERE waiter_id = ?
        AND DATE(order_time) = ?
    `;
    
    const stats = await db.queryOne(statsSql, [waiterId, targetDate]) || {};
    
    // Get item count (items sold)
    const itemsSql = `
      SELECT SUM(oi.quantity) as items_sold
      FROM order_items oi
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.waiter_id = ?
        AND DATE(o.order_time) = ?
    `;
    
    const itemsResult = await db.queryOne(itemsSql, [waiterId, targetDate]) || {};
    
    // Get top items
    const topItemsSql = `
      SELECT 
        mi.name,
        SUM(oi.quantity) as quantity_sold,
        SUM(oi.price * oi.quantity) as revenue
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.waiter_id = ?
        AND DATE(o.order_time) = ?
      GROUP BY mi.id, mi.name
      ORDER BY quantity_sold DESC
      LIMIT 5
    `;
    
    const topItems = await db.query(topItemsSql, [waiterId, targetDate]);
    
    // Get detailed items for each order
    for (let order of orders) {
      const itemsSql = `
        SELECT oi.*, mi.name as menu_item_name
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `;
      
      order.items = await db.query(itemsSql, [order.id]);
    }
    
    return {
      date: targetDate,
      orders,
      summary: {
        totalOrders: parseInt(stats.total_orders) || 0,
        totalRevenue: parseFloat(stats.total_revenue || 0).toFixed(2),
        itemsSold: parseInt(itemsResult.items_sold) || 0,
        averageOrderValue: parseFloat(stats.average_order_value || 0).toFixed(2),
        tablesServed: parseInt(stats.tables_served) || 0,
        completedOrders: parseInt(stats.completed_orders) || 0,
        cancelledOrders: parseInt(stats.cancelled_orders) || 0,
        paidOrders: parseInt(stats.paid_orders) || 0
      },
      topItems: topItems.map(item => ({
        name: item.name,
        quantitySold: parseInt(item.quantity_sold) || 0,
        revenue: parseFloat(item.revenue || 0).toFixed(2)
      }))
    };
    
  } catch (error) {
    console.error('Error in getWaiterDailyOrders:', error);
    throw new Error(`Error getting daily orders: ${error.message}`);
  }
}
static async getSalesSummary(filters = {}) {
  try {
    console.log('Getting sales summary with filters:', filters);
    
    let dateCondition = '1=1';
    const params = [];
    
    // Handle simple date filtering
    if (filters.period === 'today') {
      dateCondition = 'DATE(order_time) = CURDATE()';
    } else if (filters.period === 'week') {
      dateCondition = 'order_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (filters.period === 'month') {
      dateCondition = 'order_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    } else if (filters.date) {
      dateCondition = 'DATE(order_time) = ?';
      params.push(filters.date);
    } else if (filters.start_date && filters.end_date) {
      dateCondition = 'DATE(order_time) BETWEEN ? AND ?';
      params.push(filters.start_date, filters.end_date);
    }
    
    // SIMPLE summary query without subqueries
    const summarySql = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(SUM(tip), 0) as total_tips,
        COALESCE(SUM(discount), 0) as total_discounts,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        
        -- Payment method breakdown
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'mobile' THEN total_amount ELSE 0 END), 0) as mobile_sales,
        
        -- Simple counts
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payment_orders
        
      FROM orders
      WHERE payment_status = 'paid'
        AND ${dateCondition}
    `;
    
    console.log('Summary SQL:', summarySql);
    console.log('Params:', params);
    
    const summary = await db.queryOne(summarySql, params);
    console.log('Summary result:', summary);
    
    // Get payment methods separately
    const paymentMethodsSql = `
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_amount
      FROM orders
      WHERE payment_status = 'paid'
        AND ${dateCondition}
      GROUP BY payment_method
      ORDER BY count DESC
    `;
    
    const paymentMethods = await db.query(paymentMethodsSql, params);
    console.log('Payment methods:', paymentMethods);
    
    // Get top items separately
    const topItemsSql = `
      SELECT 
        mi.name,
        COALESCE(SUM(oi.quantity), 0) as quantity_sold,
        COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'
        AND ${dateCondition}
      GROUP BY mi.id, mi.name
      ORDER BY quantity_sold DESC
      LIMIT 5
    `;
    
    const topItems = await db.query(topItemsSql, params);
    console.log('Top items:', topItems);
    
    // Get detailed data for export
    const detailedSql = `
      SELECT 
        o.order_number,
        o.total_amount as amount,
        o.payment_method,
        DATE_FORMAT(o.order_time, '%Y-%m-%d %H:%i') as time,
        COALESCE(t.table_number, 'Takeaway') as table_number,
        COALESCE(o.customer_name, 'Walk-in') as customer_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.payment_status = 'paid'
        AND ${dateCondition}
      ORDER BY o.order_time DESC
    `;
    
    const detailedData = await db.query(detailedSql, params);
    
    return {
      success: true,
      summary: {
        total_orders: parseInt(summary.total_orders) || 0,
        total_sales: parseFloat(summary.total_sales) || 0,
        total_tax: parseFloat(summary.total_tax) || 0,
        total_tips: parseFloat(summary.total_tips) || 0,
        total_discounts: parseFloat(summary.total_discounts) || 0,
        cash_sales: parseFloat(summary.cash_sales) || 0,
        card_sales: parseFloat(summary.card_sales) || 0,
        mobile_sales: parseFloat(summary.mobile_sales) || 0,
        average_order_value: parseFloat(summary.average_order_value) || 0,
        completed_orders: parseInt(summary.completed_orders) || 0,
        cancelled_orders: parseInt(summary.cancelled_orders) || 0,
        paid_orders: parseInt(summary.paid_orders) || 0,
        pending_payment_orders: parseInt(summary.pending_payment_orders) || 0
      },
      payment_methods: paymentMethods.map(method => ({
        payment_method: method.payment_method,
        count: parseInt(method.count) || 0,
        total_amount: parseFloat(method.total_amount) || 0,
        percentage: paymentMethods.length > 0 ? 
          Math.round((parseInt(method.count) / parseInt(summary.total_orders)) * 100) || 0 : 0
      })),
      top_items: topItems.map(item => ({
        name: item.name || 'Unknown Item',
        quantity_sold: parseInt(item.quantity_sold) || 0,
        revenue: parseFloat(item.revenue) || 0
      })),
      detailed_data: detailedData,
      filters: filters
    };
    
  } catch (error) {
    console.error('Error in getSalesSummary:', error);
    throw new Error(`Error getting sales summary: ${error.message}`);
  }
}

// Get daily sales report - STANDALONE SIMPLE VERSION
static async getDailySalesReport(date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log('Getting daily sales report for:', targetDate);
    
    // 1. Get basic summary for the day
    const summarySql = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(SUM(tip), 0) as total_tips,
        COALESCE(SUM(discount), 0) as total_discounts,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'mobile' THEN total_amount ELSE 0 END), 0) as mobile_sales
        
      FROM orders
      WHERE payment_status = 'paid'
        AND DATE(order_time) = ?
    `;
    
    const summary = await db.queryOne(summarySql, [targetDate]);
    console.log('Daily summary:', summary);
    
    // 2. Get hourly breakdown
    const hourlySql = `
      SELECT 
        DATE_FORMAT(order_time, '%H:00') as hour,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders
      WHERE payment_status = 'paid'
        AND DATE(order_time) = ?
      GROUP BY DATE_FORMAT(order_time, '%H')
      ORDER BY hour
    `;
    
    const hourlyData = await db.query(hourlySql, [targetDate]);
    console.log('Hourly data count:', hourlyData.length);
    
    // 3. Get payment methods
    const paymentMethodsSql = `
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_amount
      FROM orders
      WHERE payment_status = 'paid'
        AND DATE(order_time) = ?
      GROUP BY payment_method
      ORDER BY count DESC
    `;
    
    const paymentMethods = await db.query(paymentMethodsSql, [targetDate]);
    
    // 4. Get top items for the day
    const topItemsSql = `
      SELECT 
        mi.name,
        COALESCE(SUM(oi.quantity), 0) as quantity_sold,
        COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'
        AND DATE(o.order_time) = ?
      GROUP BY mi.id, mi.name
      ORDER BY quantity_sold DESC
      LIMIT 5
    `;
    
    const topItems = await db.query(topItemsSql, [targetDate]);
    
    // 5. Get tables performance
    const tablesSql = `
      SELECT 
        COALESCE(t.table_number, 'Takeaway') as table_number,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_revenue
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.payment_status = 'paid'
        AND DATE(o.order_time) = ?
      GROUP BY t.id, t.table_number
      ORDER BY total_revenue DESC
      LIMIT 10
    `;
    
    const topTables = await db.query(tablesSql, [targetDate]);
    
    return {
      success: true,
      date: targetDate,
      summary: {
        total_orders: parseInt(summary.total_orders) || 0,
        total_sales: parseFloat(summary.total_sales) || 0,
        total_tax: parseFloat(summary.total_tax) || 0,
        total_tips: parseFloat(summary.total_tips) || 0,
        total_discounts: parseFloat(summary.total_discounts) || 0,
        cash_sales: parseFloat(summary.cash_sales) || 0,
        card_sales: parseFloat(summary.card_sales) || 0,
        mobile_sales: parseFloat(summary.mobile_sales) || 0,
        average_order_value: parseFloat(summary.average_order_value) || 0
      },
      hourly_breakdown: hourlyData.map(hour => ({
        hour: hour.hour || '00:00',
        order_count: parseInt(hour.order_count) || 0,
        total_sales: parseFloat(hour.total_sales) || 0,
        avg_order_value: parseFloat(hour.avg_order_value) || 0
      })),
      payment_methods: paymentMethods.map(method => ({
        payment_method: method.payment_method || 'unknown',
        count: parseInt(method.count) || 0,
        total_amount: parseFloat(method.total_amount) || 0,
        percentage: summary.total_orders > 0 ? 
          Math.round((parseInt(method.count) / parseInt(summary.total_orders)) * 100) : 0
      })),
      top_items: topItems.map(item => ({
        name: item.name || 'Unknown Item',
        quantity_sold: parseInt(item.quantity_sold) || 0,
        revenue: parseFloat(item.revenue) || 0
      })),
      top_tables: topTables.map(table => ({
        table_number: table.table_number || 'Takeaway',
        order_count: parseInt(table.order_count) || 0,
        total_revenue: parseFloat(table.total_revenue) || 0
      }))
    };
    
  } catch (error) {
    console.error('Error in getDailySalesReport:', error);
    throw new Error(`Error getting daily sales report: ${error.message}`);
  }
}

}

module.exports = Order;