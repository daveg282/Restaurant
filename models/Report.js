const db = require('../config/db');

class ReportModel {
  // ========== SALES QUERIES ==========
  
 static async getSalesSummary(startDate, endDate) {
  try {
    console.log('Sales summary query dates:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const result = await db.queryOne(`
      SELECT 
        COUNT(DISTINCT id) as total_orders,
        COUNT(DISTINCT customer_name) as total_customers,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(AVG(total_amount), 0) as average_order_value,
        COALESCE(COUNT(DISTINCT table_id), 0) as tables_served
      FROM orders 
      WHERE payment_status = 'paid'  -- CHANGED FROM status = 'completed'
        AND order_time BETWEEN ? AND ?
    `, [startDate, endDate]);

    console.log('Sales summary result:', result);
    
    return {
      total_orders: parseInt(result.total_orders || 0),
      total_customers: parseInt(result.total_customers || 0),
      total_sales: parseFloat(result.total_sales || 0),
      average_order_value: parseFloat(result.average_order_value || 0),
      tables_served: parseInt(result.tables_served || 0)
    };
  } catch (error) {
    console.error('Get sales summary error:', error);
    return this.getEmptySalesSummary();
  }
}

  static async getSalesByTimePeriod(startDate, endDate, groupBy = 'day') {
    let groupByClause;
    switch (groupBy) {
      case 'hour':
        groupByClause = 'DATE_FORMAT(order_time, "%Y-%m-%d %H:00")';
        break;
      case 'day':
        groupByClause = 'DATE(order_time)';
        break;
      case 'week':
        groupByClause = 'YEARWEEK(order_time)';
        break;
      case 'month':
        groupByClause = 'DATE_FORMAT(order_time, "%Y-%m")';
        break;
      default:
        groupByClause = 'DATE(order_time)';
    }

    try {
      const results = await db.query(`
        SELECT 
          ${groupByClause} as period,
          COUNT(DISTINCT id) as order_count,
          COUNT(DISTINCT customer_name) as customer_count,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COALESCE(AVG(total_amount), 0) as avg_order_value
        FROM orders 
        WHERE status = 'completed'
          AND order_time BETWEEN ? AND ?
        GROUP BY ${groupByClause}
        ORDER BY period
      `, [startDate, endDate]);

      return results.map(row => ({
        period: row.period,
        order_count: parseInt(row.order_count || 0),
        customer_count: parseInt(row.customer_count || 0),
        total_sales: parseFloat(row.total_sales || 0),
        avg_order_value: parseFloat(row.avg_order_value || 0)
      }));
    } catch (error) {
      console.error('Get sales by time period error:', error);
      return [];
    }
  }

  static async getCategoryBreakdown(startDate, endDate) {
    try {
      const results = await db.query(`
        SELECT 
          c.name as category_name,
          COUNT(oi.id) as item_count,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.quantity * mi.price) as total_revenue
        FROM order_items oi
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN categories c ON mi.category_id = c.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'completed'
          AND o.order_time BETWEEN ? AND ?
        GROUP BY c.id, c.name
        ORDER BY total_revenue DESC
      `, [startDate, endDate]);

      return results.map(row => ({
        category_name: row.category_name || 'Uncategorized',
        item_count: parseInt(row.item_count || 0),
        total_quantity: parseInt(row.total_quantity || 0),
        total_revenue: parseFloat(row.total_revenue || 0)
      }));
    } catch (error) {
      console.error('Get category breakdown error:', error);
      return [];
    }
  }

  static async getTopSellingItems(startDate, endDate, limit = 10) {
  try {
    console.log('Popular items query dates:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const results = await db.query(`
      SELECT 
        mi.id,
        mi.name,
        c.name as category_name,
        COUNT(oi.id) as order_count,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.quantity * mi.price) as total_revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN categories c ON mi.category_id = c.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'  -- CHANGED FROM status = 'completed'
        AND o.order_time BETWEEN ? AND ?
      GROUP BY mi.id, mi.name, c.name
      ORDER BY total_quantity DESC
      LIMIT ?
    `, [startDate, endDate, limit]);

    console.log('Popular items found:', results.length);
    
    return results.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category_name,
      order_count: parseInt(row.order_count || 0),
      total_quantity: parseInt(row.total_quantity || 0),
      total_revenue: parseFloat(row.total_revenue || 0)
    }));
  } catch (error) {
    console.error('Get top selling items error:', error);
    return [];
  }
}

  static async getPaymentMethodBreakdown(startDate, endDate) {
    try {
      const results = await db.query(`
        SELECT 
          payment_method,
          COUNT(DISTINCT id) as order_count,
          COALESCE(SUM(total_amount), 0) as total_sales
        FROM orders 
        WHERE status = 'completed'
          AND order_time BETWEEN ? AND ?
        GROUP BY payment_method
        ORDER BY total_sales DESC
      `, [startDate, endDate]);

      return results.map(row => ({
        payment_method: row.payment_method || 'unknown',
        order_count: parseInt(row.order_count || 0),
        total_sales: parseFloat(row.total_sales || 0)
      }));
    } catch (error) {
      console.error('Get payment method breakdown error:', error);
      return [];
    }
  }

  // ========== STAFF PERFORMANCE QUERIES ==========

  static async getStaffPerformance(startDate, endDate) {
  try {
    console.log('Staff performance query dates:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const results = await db.query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(DISTINCT o.id) as orders_handled,
        COALESCE(SUM(o.total_amount), 0) as total_sales,
        COUNT(DISTINCT o.table_id) as tables_served,
        COUNT(DISTINCT o.customer_name) as customers_served,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value
      FROM users u
      LEFT JOIN orders o ON u.id = o.waiter_id 
        AND o.payment_status = 'paid'  -- CHANGED FROM status = 'completed'
        AND o.order_time BETWEEN ? AND ?
      WHERE u.role IN ('waiter', 'chef', 'cashier', 'manager')
        AND u.status = 'active'
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY total_sales DESC
    `, [startDate, endDate]);

    console.log('Staff performance results count:', results.length);
    
    return results.map(row => {
      const fullName = `${row.first_name} ${row.last_name}`;
      const shortName = `${row.first_name} ${row.last_name.charAt(0)}.`;
      const avatar = `${row.first_name.charAt(0)}${row.last_name.charAt(0)}`;
      
      return {
        id: row.id,
        name: shortName,
        fullName: fullName,
        role: row.role,
        avatar: avatar,
        orders_handled: parseInt(row.orders_handled || 0),
        total_sales: parseFloat(row.total_sales || 0),
        tables_served: parseInt(row.tables_served || 0),
        customers_served: parseInt(row.customers_served || 0),
        avg_order_value: parseFloat(row.avg_order_value || 0)
      };
    });
  } catch (error) {
    console.error('Get staff performance error:', error);
    return [];
  }
}

  // ========== INVENTORY QUERIES ==========

  static async getInventoryMetrics() {
    try {
      const results = await db.queryOne(`
        SELECT 
          COUNT(DISTINCT i.id) as total_items,
          SUM(i.current_stock) as total_stock,
          SUM(i.current_stock * i.cost_per_unit) as total_value,
          SUM(CASE WHEN i.current_stock <= i.minimum_stock THEN 1 ELSE 0 END) as low_stock_items,
          SUM(CASE WHEN i.current_stock = 0 THEN 1 ELSE 0 END) as out_of_stock_items
        FROM ingredients i
        WHERE i.current_stock IS NOT NULL
      `);

      return {
        total_items: parseInt(results.total_items || 0),
        total_stock: parseFloat(results.total_stock || 0),
        total_value: parseFloat(results.total_value || 0),
        low_stock_items: parseInt(results.low_stock_items || 0),
        out_of_stock_items: parseInt(results.out_of_stock_items || 0)
      };
    } catch (error) {
      console.error('Get inventory metrics error:', error);
      return this.getEmptyInventoryMetrics();
    }
  }

  // ========== HELPER METHODS ==========

  static getEmptySalesSummary() {
    return {
      total_orders: 0,
      total_customers: 0,
      total_sales: 0,
      average_order_value: 0,
      tables_served: 0
    };
  }

  static getEmptyInventoryMetrics() {
    return {
      total_items: 0,
      total_stock: 0,
      total_value: 0,
      low_stock_items: 0,
      out_of_stock_items: 0
    };
  }

  // Get date ranges for different periods
  static getDateRange(period = 'today') {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      case 'yesterday':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      
      default:
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  }
 // In Report.js - make sure getRecentOrders accepts parameters
static async getRecentOrders(startDate, endDate, limit = 5) {
  try {
    console.log('Recent orders query - filtering by date:', 
      startDate.toISOString(), 'to', endDate.toISOString());
    
    const results = await db.query(`
      SELECT 
        o.id,
        o.order_number,
        o.customer_name,
        o.table_id,
        o.total_amount,
        o.status,
        o.payment_status,
        o.order_time,
        o.payment_method,
        t.table_number,
        u.first_name as waiter_first_name,
        u.last_name as waiter_last_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      WHERE o.order_time BETWEEN ? AND ?
      ORDER BY o.order_time DESC
      LIMIT ?
    `, [startDate, endDate, limit]);

    console.log('Recent orders found:', results.length);
    
    return results.map(row => ({
      id: row.id,
      order_number: row.order_number || `ORD-${row.id}`,
      customer_name: row.customer_name || 'Walk-in',
      table_number: row.table_number || row.table_id || 'Takeaway',
      total_amount: parseFloat(row.total_amount || 0),
      status: row.status || 'pending',
      payment_status: row.payment_status || 'pending',
      payment_method: row.payment_method || 'cash',
      order_time: row.order_time,
      waiter_name: row.waiter_first_name ? 
        `${row.waiter_first_name} ${row.waiter_last_name}` : 'Not assigned'
    }));
  } catch (error) {
    console.error('Get recent orders error:', error);
    return [];
  }
}
}


module.exports = ReportModel;