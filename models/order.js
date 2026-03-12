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

static async create(orderData, items, userId) {
  const connection = await db.beginTransaction();

  try {
    // 1. Generate safer order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 2. Calculate total
    let totalAmount = 0;
    for (const item of items) {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 1;
      totalAmount += price * quantity;
    }

    // 3. Ensure proper table_id handling
    const tableId = orderData.table_id ? parseInt(orderData.table_id) : null;

    // 4. Insert order
    const insertSql = `
      INSERT INTO orders 
      (order_number, table_id, customer_name, status, payment_status, total_amount, waiter_id, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      orderNumber,
      tableId, // NULL for takeaway orders
      orderData.customer_name || '',
      'pending',
      'pending',
      parseFloat(totalAmount.toFixed(2)),
      parseInt(userId),
      orderData.notes || ''
    ];

    const [result] = await connection.execute(insertSql, params);
    const orderId = result.insertId;

    if (!orderId) {
      throw new Error('Insert failed');
    }

    // 5. Insert order items
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

    // 6. Update table status ONLY for dine-in orders
    if (tableId) {
      await connection.execute(
        'UPDATE tables SET status = "occupied" WHERE id = ?',
        [tableId]
      );
    }

    await connection.commit();

    return {
      id: orderId,
      order_number: orderNumber,
      table_id: tableId,
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

// ==================== FIXED: getAll() with single query ====================
static async getAll(filters = {}) {
  try {
    // Base query with all joins - single query eliminates N+1 problem
    let sql = `
      SELECT 
        o.*, 
        t.table_number, 
        u.username as waiter_name,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'item_name', mi.name,
              'quantity', oi.quantity,
              'price', oi.price,
              'status', oi.status,
              'special_instructions', oi.special_instructions,
              'preparation_time', mi.preparation_time,
              'category_name', c.name
            )
          )
          FROM order_items oi
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          LEFT JOIN categories c ON mi.category_id = c.id
          WHERE oi.order_id = o.id
        ) as items_json
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Apply filters
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
    
    // Add pagination
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
    
    const orders = await db.query(sql, params);
    
    // Parse JSON items for each order
    return orders.map(order => ({
      ...order,
      items: order.items_json ? JSON.parse(order.items_json) : []
    }));
    
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
      
      // Buzz pager if assigned
      const order = await this.findById(id);
      if (order && order.pager_number) {
        console.log(`🛎️ Buzzing pager #${order.pager_number} for order ${order.order_number}`);
      }
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

// ==================== FIXED: getKitchenOrders() with single query ====================
static async getKitchenOrders() {
  try {
    const sql = `
      SELECT 
        o.id,
        o.order_number,
        o.order_time,
        o.table_id,
        o.status,
        t.table_number,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'item_name', mi.name,
              'quantity', oi.quantity,
              'status', oi.status,
              'special_instructions', oi.special_instructions,
              'preparation_time', mi.preparation_time,
              'category_name', c.name
            )
          )
          FROM order_items oi
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          LEFT JOIN categories c ON mi.category_id = c.id
          WHERE oi.order_id = o.id
            AND oi.status IN ('pending', 'preparing', 'ready')
        ) as items_json
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.status IN ('pending', 'preparing', 'ready')
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(sql);
    
    // Parse JSON items and filter out nulls
    return orders.map(order => ({
      ...order,
      items: (JSON.parse(order.items_json || '[]')).filter(item => item.id)
    }));
    
  } catch (error) {
    console.error('Kitchen orders error:', error.message);
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

// ==================== FIXED: getStats() with optimized query ====================
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

// ==================== FIXED: searchOrders() with FULLTEXT search ====================
static async search(query) {
  try {
    // First, try FULLTEXT search if available (much faster)
    try {
      const fulltextSql = `
        SELECT o.*, t.table_number, u.username as waiter_name,
               MATCH(o.order_number, o.customer_name) AGAINST(?) as relevance
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN users u ON o.waiter_id = u.id
        WHERE MATCH(o.order_number, o.customer_name) AGAINST(? IN BOOLEAN MODE)
        ORDER BY relevance DESC
        LIMIT 50
      `;
      
      // Add wildcards for partial matching
      const searchTerm = `*${query}*`;
      const results = await db.query(fulltextSql, [query, searchTerm]);
      
      if (results.length > 0) {
        return results;
      }
    } catch (fulltextError) {
      // Fall back to LIKE if FULLTEXT not available
      console.log('FULLTEXT not available, using LIKE fallback');
    }
    
    // Fallback to LIKE search with indexes
    const likeSql = `
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
    return await db.query(likeSql, [searchTerm, searchTerm, searchTerm]);
    
  } catch (error) {
    throw new Error(`Error searching orders: ${error.message}`);
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
    
    // Optimized single query with JSON aggregation
    const sql = `
      SELECT 
        o.id,
        o.order_number,
        t.table_number,
        o.order_time,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'name', mi.name,
              'quantity', oi.quantity,
              'status', oi.status,
              'special_instructions', oi.special_instructions,
              'category_name', c.name,
              'category_id', c.id
            )
          )
          FROM order_items oi
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          LEFT JOIN categories c ON mi.category_id = c.id
          WHERE oi.order_id = o.id
            AND oi.status IN ('pending', 'preparing')
        ) as all_items_json
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE o.status IN ('pending', 'preparing', 'ready')
        AND oi.status IN ('pending', 'preparing')
        AND mi.category_id = ?
      GROUP BY o.id
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(sql, [category.id]);
    
    // Parse and split items
    return orders.map(order => {
      const allItems = JSON.parse(order.all_items_json || '[]');
      return {
        ...order,
        items: allItems.filter(item => item.category_id === category.id),
        other_items: allItems.filter(item => item.category_id !== category.id)
      };
    });
    
  } catch (error) {
    throw new Error(`Error getting station orders: ${error.message}`);
  }
}

// Get orders ready for payment
static async getPendingPayments() {
  try {
    const sql = `
      SELECT o.*, t.table_number, u.username as waiter_name,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'menu_item_name', mi.name,
              'quantity', oi.quantity,
              'price', oi.price
            )
          )
          FROM order_items oi
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE oi.order_id = o.id
        ) as items_json
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      WHERE o.status = 'completed'  
        AND o.payment_status = 'pending'
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(sql);
    
    return orders.map(order => ({
      ...order,
      items: JSON.parse(order.items_json || '[]')
    }));
    
  } catch (error) {
    throw new Error(`Error getting pending payments: ${error.message}`);
  }
}

static async processPayment(orderId, paymentData, cashierId) {
  const connection = await db.beginTransaction();
  
  try {
    console.log(`Processing payment for order ${orderId}`);
    console.log('Payment data received:', paymentData);
    
    // Get the order total (this is the SUBTOTAL before VAT)
    const orderSql = 'SELECT total_amount FROM orders WHERE id = ?';
    const [orderResult] = await connection.execute(orderSql, [orderId]);
    
    if (!orderResult || orderResult.length === 0) {
      throw new Error('Order not found');
    }
    
    const subtotal = parseFloat(orderResult[0].total_amount);
    
    // ========== CORRECT VAT CALCULATION ==========
    const VAT_RATE = 0.15; // 15% VAT
    
    let vatAmount;
    if (paymentData.tax !== undefined && paymentData.tax !== null) {
      // Use provided tax amount
      vatAmount = parseFloat(paymentData.tax);
    } else {
      // CORRECT: Calculate VAT as 15% OF THE SUBTOTAL (price before VAT)
      // VAT = Subtotal × 0.15
      vatAmount = subtotal * VAT_RATE;
      vatAmount = Math.round(vatAmount * 100) / 100; // Round to 2 decimals
      
      console.log(`Calculated VAT (15% of ${subtotal}): ${vatAmount}`);
    }
    
    // Calculate final total that customer pays
    const finalTotal = subtotal + vatAmount;
    
    console.log(`Breakdown: Subtotal: ${subtotal.toFixed(2)} + VAT: ${vatAmount.toFixed(2)} = Final Total: ${finalTotal.toFixed(2)}`);
    
    // Update paymentData with calculated tax
    paymentData.tax = vatAmount;
    
    // Update order with payment info INCLUDING tax column
    const updateSql = `
      UPDATE orders 
      SET payment_status = ?,
          payment_method = ?,
          tip = ?,
          discount = ?,
          split_count = ?,
          tax = ?,           -- Store calculated VAT (15% of subtotal)
          cashier_id = ?,
          status = 'completed',
          completed_time = NOW(),
          payment_time = NOW()
      WHERE id = ?
    `;
    
    await connection.execute(updateSql, [
      paymentData.payment_status || 'paid',
      paymentData.payment_method,
      parseFloat(paymentData.tip) || 0.00,
      parseFloat(paymentData.discount) || 0.00,
      parseInt(paymentData.split_count) || 1,
      vatAmount,  // USE CALCULATED VAT AMOUNT (15% of subtotal)
      cashierId,
      orderId
    ]);
    
    console.log(`Tax (VAT) stored in database: ${vatAmount}`);
    
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
    
    // Return updated order with VAT info
    const updatedOrder = await this.findById(orderId);
    
    // Add VAT breakdown to response
    return {
      ...updatedOrder,
      vat_breakdown: {
        subtotal: subtotal,
        vat_rate: '15%',
        vat_amount: vatAmount,
        final_total: finalTotal
      }
    };
    
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
        TIMESTAMPDIFF(MINUTE, o.order_time, NOW()) as minutes_old,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'menu_item_name', mi.name,
              'quantity', oi.quantity,
              'status', oi.status
            )
          )
          FROM order_items oi
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE oi.order_id = o.id
            AND oi.status IN ('pending', 'preparing')
        ) as items_json
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.status IN ('pending', 'preparing')
        AND TIMESTAMPDIFF(MINUTE, o.order_time, NOW()) > 20
      ORDER BY o.order_time ASC
    `;
    
    const orders = await db.query(sql);
    
    return orders.map(order => ({
      ...order,
      items: JSON.parse(order.items_json || '[]')
    }));
    
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

// ==================== FIXED: getWaiterDailyOrders() with optimized queries ====================
static async getWaiterDailyOrders(waiterId, date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`Getting daily orders for waiter ${waiterId}, date: ${targetDate}`);
    
    // Single query to get orders with items using JSON aggregation
    const ordersSql = `
      SELECT 
        o.*, 
        t.table_number,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'menu_item_name', mi.name,
              'quantity', oi.quantity,
              'price', oi.price,
              'status', oi.status,
              'special_instructions', oi.special_instructions
            )
          )
          FROM order_items oi
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE oi.order_id = o.id
        ) as items_json
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.waiter_id = ?
        AND DATE(o.order_time) = ?
      ORDER BY o.order_time DESC
    `;
    
    const orders = await db.query(ordersSql, [waiterId, targetDate]);
    
    // Parse items for each order
    const parsedOrders = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items_json || '[]')
    }));
    
    // Get summary statistics in a single query
    const summarySql = `
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COUNT(DISTINCT table_id) as tables_served,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_orders,
        (
          SELECT COALESCE(SUM(oi.quantity), 0)
          FROM order_items oi
          WHERE oi.order_id IN (
            SELECT id FROM orders 
            WHERE waiter_id = ? AND DATE(order_time) = ?
          )
        ) as items_sold
      FROM orders
      WHERE waiter_id = ?
        AND DATE(order_time) = ?
    `;
    
    const summary = await db.queryOne(summarySql, [waiterId, targetDate, waiterId, targetDate]) || {};
    
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
    
    return {
      date: targetDate,
      orders: parsedOrders,
      summary: {
        totalOrders: parseInt(summary.total_orders) || 0,
        totalRevenue: parseFloat(summary.total_revenue || 0).toFixed(2),
        itemsSold: parseInt(summary.items_sold) || 0,
        averageOrderValue: parseFloat(summary.average_order_value || 0).toFixed(2),
        tablesServed: parseInt(summary.tables_served) || 0,
        completedOrders: parseInt(summary.completed_orders) || 0,
        cancelledOrders: parseInt(summary.cancelled_orders) || 0,
        paidOrders: parseInt(summary.paid_orders) || 0
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

// ==================== FIXED: getSalesSummary() with optimized queries ====================
static async getSalesSummary(filters = {}) {
  try {
    console.log('Getting sales summary with filters:', filters);
    
    let dateCondition = '1=1';
    const params = [];
    
    if (filters.period === 'today') {
      dateCondition = 'DATE(payment_time) = CURDATE()';
    } else if (filters.period === 'yesterday') {
      dateCondition = 'DATE(payment_time) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
    } else if (filters.period === 'week') {
      dateCondition = 'payment_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (filters.period === 'month') {
      dateCondition = 'payment_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    } else if (filters.date) {
      dateCondition = 'DATE(payment_time) = ?';
      params.push(filters.date);
    } else if (filters.start_date && filters.end_date) {
      dateCondition = 'DATE(payment_time) BETWEEN ? AND ?';
      params.push(filters.start_date, filters.end_date);
    }
    
    // Main summary query with all aggregations
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
        
        -- Counts
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        
        -- Payment method counts as JSON
        JSON_OBJECT(
          'cash', COUNT(CASE WHEN payment_method = 'cash' THEN 1 END),
          'card', COUNT(CASE WHEN payment_method = 'card' THEN 1 END),
          'mobile', COUNT(CASE WHEN payment_method = 'mobile' THEN 1 END)
        ) as payment_method_counts,
        
        MIN(payment_time) as first_payment,
        MAX(payment_time) as last_payment
        
      FROM orders
      WHERE payment_status = 'paid'
        AND payment_time IS NOT NULL
        AND ${dateCondition}
    `;
    
    const summary = await db.queryOne(summarySql, params);
    
    // Get top items
    const topItemsSql = `
      SELECT 
        mi.name,
        COALESCE(SUM(oi.quantity), 0) as quantity_sold,
        COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'
        AND o.payment_time IS NOT NULL
        AND ${dateCondition}
      GROUP BY mi.id, mi.name
      ORDER BY quantity_sold DESC
      LIMIT 5
    `;
    
    const topItems = await db.query(topItemsSql, params);
    
    // Get detailed data with pagination for large datasets
    const detailedSql = `
      SELECT 
        o.order_number,
        o.total_amount as amount,
        o.payment_method,
        DATE_FORMAT(o.payment_time, '%Y-%m-%d %H:%i') as payment_time,
        DATE_FORMAT(o.order_time, '%Y-%m-%d %H:%i') as order_time,
        COALESCE(t.table_number, 'Takeaway') as table_number,
        COALESCE(o.customer_name, 'Walk-in') as customer_name,
        o.tax,
        o.tip,
        o.discount,
        u1.username as waiter_name,
        u2.username as cashier_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u1 ON o.waiter_id = u1.id
      LEFT JOIN users u2 ON o.cashier_id = u2.id
      WHERE o.payment_status = 'paid'
        AND o.payment_time IS NOT NULL
        AND ${dateCondition}
      ORDER BY o.payment_time DESC
      LIMIT 1000  -- Prevent overwhelming response
    `;
    
    const detailedData = await db.query(detailedSql, params);
    
    // Parse payment method counts
    const paymentCounts = JSON.parse(summary.payment_method_counts || '{"cash":0,"card":0,"mobile":0}');
    
    // Build payment methods array
    const paymentMethods = ['cash', 'card', 'mobile'].map(method => ({
      payment_method: method,
      count: parseInt(paymentCounts[method]) || 0,
      total_amount: parseFloat(summary[`${method}_sales`]) || 0,
      percentage: summary.total_orders > 0 ? 
        Math.round((parseInt(paymentCounts[method]) / parseInt(summary.total_orders)) * 100) || 0 : 0
    }));
    
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
        first_payment: summary.first_payment || null,
        last_payment: summary.last_payment || null
      },
      payment_methods: paymentMethods,
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

// ==================== FIXED: getDailySalesReport() with optimized queries ====================
static async getDailySalesReport(date = null) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    console.log('Getting daily sales report for:', targetDate);
    
    // 1. Combined summary and hourly data query
    const mainQuery = `
      SELECT 
        -- Summary stats
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
        
        -- Payment method counts
        COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_count,
        COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_count,
        COUNT(CASE WHEN payment_method = 'mobile' THEN 1 END) as mobile_count,
        
        -- Hourly breakdown as JSON
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'hour', DATE_FORMAT(payment_time, '%H:00'),
              'order_count', COUNT(*),
              'total_sales', SUM(total_amount),
              'avg_order_value', AVG(total_amount)
            )
          )
          FROM orders
          WHERE payment_status = 'paid' 
            AND payment_time IS NOT NULL 
            AND DATE(payment_time) = ?
          GROUP BY DATE_FORMAT(payment_time, '%H')
          ORDER BY hour
        ) as hourly_json
        
      FROM orders
      WHERE payment_status = 'paid'
        AND payment_time IS NOT NULL
        AND DATE(payment_time) = ?
    `;
    
    const mainResult = await db.queryOne(mainQuery, [targetDate, targetDate]);
    
    // 2. Top items query
    const topItemsSql = `
      SELECT 
        mi.name,
        COALESCE(SUM(oi.quantity), 0) as quantity_sold,
        COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'
        AND o.payment_time IS NOT NULL
        AND DATE(o.payment_time) = ?
      GROUP BY mi.id, mi.name
      ORDER BY quantity_sold DESC
      LIMIT 5
    `;
    
    const topItems = await db.query(topItemsSql, [targetDate]);
    
    // 3. Tables performance query
    const tablesSql = `
      SELECT 
        COALESCE(t.table_number, 'Takeaway') as table_number,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        AVG(TIMESTAMPDIFF(MINUTE, o.order_time, o.payment_time)) as avg_payment_time_minutes
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.payment_status = 'paid'
        AND o.payment_time IS NOT NULL
        AND DATE(o.payment_time) = ?
      GROUP BY t.id, t.table_number
      ORDER BY total_revenue DESC
      LIMIT 10
    `;
    
    const topTables = await db.query(tablesSql, [targetDate]);
    
    // 4. Cashier performance query
    const cashiersSql = `
      SELECT 
        u.username as cashier_name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value
      FROM orders o
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE o.payment_status = 'paid'
        AND o.payment_time IS NOT NULL
        AND DATE(o.payment_time) = ?
        AND o.cashier_id IS NOT NULL
      GROUP BY u.id, u.username
      ORDER BY total_revenue DESC
    `;
    
    const cashierPerformance = await db.query(cashiersSql, [targetDate]);
    
    // Parse hourly data
    const hourlyData = JSON.parse(mainResult.hourly_json || '[]');
    
    // Build payment methods array
    const paymentMethods = [
      {
        payment_method: 'cash',
        count: parseInt(mainResult.cash_count) || 0,
        total_amount: parseFloat(mainResult.cash_sales) || 0,
        percentage: mainResult.total_orders > 0 ? 
          Math.round((parseInt(mainResult.cash_count) / parseInt(mainResult.total_orders)) * 100) : 0
      },
      {
        payment_method: 'card',
        count: parseInt(mainResult.card_count) || 0,
        total_amount: parseFloat(mainResult.card_sales) || 0,
        percentage: mainResult.total_orders > 0 ? 
          Math.round((parseInt(mainResult.card_count) / parseInt(mainResult.total_orders)) * 100) : 0
      },
      {
        payment_method: 'mobile',
        count: parseInt(mainResult.mobile_count) || 0,
        total_amount: parseFloat(mainResult.mobile_sales) || 0,
        percentage: mainResult.total_orders > 0 ? 
          Math.round((parseInt(mainResult.mobile_count) / parseInt(mainResult.total_orders)) * 100) : 0
      }
    ].filter(m => m.count > 0); // Only include methods that were used
    
    return {
      success: true,
      date: targetDate,
      summary: {
        total_orders: parseInt(mainResult.total_orders) || 0,
        total_sales: parseFloat(mainResult.total_sales) || 0,
        total_tax: parseFloat(mainResult.total_tax) || 0,
        total_tips: parseFloat(mainResult.total_tips) || 0,
        total_discounts: parseFloat(mainResult.total_discounts) || 0,
        cash_sales: parseFloat(mainResult.cash_sales) || 0,
        card_sales: parseFloat(mainResult.card_sales) || 0,
        mobile_sales: parseFloat(mainResult.mobile_sales) || 0,
        average_order_value: parseFloat(mainResult.average_order_value) || 0
      },
      hourly_breakdown: hourlyData.map(hour => ({
        hour: hour.hour || '00:00',
        order_count: parseInt(hour.order_count) || 0,
        total_sales: parseFloat(hour.total_sales) || 0,
        avg_order_value: parseFloat(hour.avg_order_value) || 0
      })),
      payment_methods: paymentMethods,
      top_items: topItems.map(item => ({
        name: item.name || 'Unknown Item',
        quantity_sold: parseInt(item.quantity_sold) || 0,
        revenue: parseFloat(item.revenue) || 0
      })),
      top_tables: topTables.map(table => ({
        table_number: table.table_number || 'Takeaway',
        order_count: parseInt(table.order_count) || 0,
        total_revenue: parseFloat(table.total_revenue) || 0,
        avg_payment_time_minutes: parseFloat(table.avg_payment_time_minutes) || 0
      })),
      cashier_performance: cashierPerformance.map(cashier => ({
        cashier_name: cashier.cashier_name || 'Unknown',
        order_count: parseInt(cashier.order_count) || 0,
        total_revenue: parseFloat(cashier.total_revenue) || 0,
        avg_order_value: parseFloat(cashier.avg_order_value) || 0
      }))
    };
    
  } catch (error) {
    console.error('Error in getDailySalesReport:', error);
    throw new Error(`Error getting daily sales report: ${error.message}`);
  }
}

}

module.exports = Order;