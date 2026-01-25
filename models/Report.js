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
  // Add this method to ReportModel.js
static async getRecentOrders(limit = 5) {
  try {
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
        u.first_name AS waiter_first_name,
        u.last_name AS waiter_last_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      WHERE o.payment_status = 'paid'
      ORDER BY o.order_time DESC
      LIMIT ?
    `, [limit]);

    return results.map(row => ({
      id: row.id,
      order_number: row.order_number || `ORD-${row.id}`,
      customer_name: row.customer_name || 'Walk-in',
      table_number: row.table_number || row.table_id || 'Takeaway',
      total_amount: Number(row.total_amount || 0),
      status: row.status || 'pending',
      payment_status: row.payment_status || 'pending',
      payment_method: row.payment_method || 'cash',
      order_time: row.order_time,
      waiter_name: row.waiter_first_name
        ? `${row.waiter_first_name} ${row.waiter_last_name}`
        : 'Not assigned'
    }));
  } catch (error) {
    console.error('Get recent orders error:', error);
    return [];
  }
}
// ========== FINANCIAL REPORT QUERIES ==========

static async getFinancialSummary(startDate, endDate) {
  try {
    console.log('Getting financial summary from:', startDate, 'to', endDate);
    
    const result = await db.queryOne(`
      SELECT 
        -- Total Revenue (subtotal of all paid orders)
        COALESCE(SUM(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN total_amount 
          ELSE 0 
        END), 0) as total_revenue,
        
        -- VAT Collected (15% of revenue)
        COALESCE(SUM(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN tax 
          ELSE 0 
        END), 0) as vat_collected,
        
        -- Tips Collected
        COALESCE(SUM(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN tip 
          ELSE 0 
        END), 0) as tips_collected,
        
        -- Discounts Given
        COALESCE(SUM(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN discount 
          ELSE 0 
        END), 0) as discounts_given,
        
        -- Number of Paid Transactions
        COUNT(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN 1 
        END) as transaction_count,
        
        -- Average Transaction Value
        AVG(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN total_amount 
        END) as avg_transaction_value,
        
        -- Total Collected (revenue + vat + tips - discounts)
        COALESCE(SUM(CASE 
          WHEN payment_status = 'paid' 
          AND payment_time BETWEEN ? AND ? 
          THEN (total_amount + COALESCE(tax, 0) + COALESCE(tip, 0) - COALESCE(discount, 0))
          ELSE 0 
        END), 0) as total_collected,
        
        -- Payment Method Breakdown
        SUM(CASE WHEN payment_method = 'cash' AND payment_status = 'paid' AND payment_time BETWEEN ? AND ? THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' AND payment_status = 'paid' AND payment_time BETWEEN ? AND ? THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'mobile' AND payment_status = 'paid' AND payment_time BETWEEN ? AND ? THEN total_amount ELSE 0 END) as mobile_sales
        
      FROM orders
    `, [
      startDate, endDate,  // total_revenue
      startDate, endDate,  // vat_collected
      startDate, endDate,  // tips_collected
      startDate, endDate,  // discounts_given
      startDate, endDate,  // transaction_count
      startDate, endDate,  // avg_transaction_value
      startDate, endDate,  // total_collected
      startDate, endDate,  // cash_sales
      startDate, endDate,  // card_sales
      startDate, endDate   // mobile_sales
    ]);
    
    console.log('Financial summary result:', result);
    
    return {
      total_revenue: parseFloat(result.total_revenue || 0),
      vat_collected: parseFloat(result.vat_collected || 0),
      net_revenue: parseFloat((result.total_revenue || 0) - (result.vat_collected || 0)),
      tips_collected: parseFloat(result.tips_collected || 0),
      discounts_given: parseFloat(result.discounts_given || 0),
      transaction_count: parseInt(result.transaction_count || 0),
      avg_transaction_value: parseFloat(result.avg_transaction_value || 0),
      total_collected: parseFloat(result.total_collected || 0),
      payment_methods: {
        cash: parseFloat(result.cash_sales || 0),
        card: parseFloat(result.card_sales || 0),
        mobile: parseFloat(result.mobile_sales || 0)
      }
    };
  } catch (error) {
    console.error('Get financial summary error:', error);
    return this.getEmptyFinancialSummary();
  }
}

static async getProfitLossStatement(startDate, endDate) {
  try {
    console.log('Getting P&L statement from:', startDate, 'to', endDate);
    
    // Get revenue data
    const revenueData = await this.getFinancialSummary(startDate, endDate);
    
    // Get expense data (you'll need to implement this based on your expenses table)
    const expenseData = await this.getExpenseData(startDate, endDate);
    
    // Calculate profit metrics
    const grossProfit = revenueData.total_revenue - expenseData.total_cogs;
    const operatingProfit = grossProfit - expenseData.total_operating_expenses;
    const netProfit = operatingProfit - expenseData.total_other_expenses;
    
    return {
      period: { startDate, endDate },
      revenue: {
        total_revenue: revenueData.total_revenue,
        vat_collected: revenueData.vat_collected,
        net_revenue: revenueData.net_revenue,
        tips_collected: revenueData.tips_collected,
        discounts_given: revenueData.discounts_given,
        transaction_count: revenueData.transaction_count,
        avg_transaction_value: revenueData.avg_transaction_value
      },
      cost_of_goods_sold: {
        total_cogs: expenseData.total_cogs,
        food_cost: expenseData.food_cost,
        beverage_cost: expenseData.beverage_cost,
        packaging_cost: expenseData.packaging_cost,
        cogs_percentage: revenueData.total_revenue > 0 ? 
          (expenseData.total_cogs / revenueData.total_revenue) * 100 : 0
      },
      gross_profit: {
        amount: grossProfit,
        margin: revenueData.total_revenue > 0 ? (grossProfit / revenueData.total_revenue) * 100 : 0
      },
      operating_expenses: {
        total: expenseData.total_operating_expenses,
        labor: expenseData.labor_cost,
        rent: expenseData.rent,
        utilities: expenseData.utilities,
        marketing: expenseData.marketing,
        maintenance: expenseData.maintenance,
        other_operating: expenseData.other_operating,
        percentage_of_revenue: revenueData.total_revenue > 0 ? 
          (expenseData.total_operating_expenses / revenueData.total_revenue) * 100 : 0
      },
      operating_profit: {
        amount: operatingProfit,
        margin: revenueData.total_revenue > 0 ? (operatingProfit / revenueData.total_revenue) * 100 : 0
      },
      other_income_expenses: {
        total: expenseData.total_other_expenses,
        interest: expenseData.interest,
        depreciation: expenseData.depreciation,
        other: expenseData.other_expenses
      },
      net_profit: {
        amount: netProfit,
        margin: revenueData.total_revenue > 0 ? (netProfit / revenueData.total_revenue) * 100 : 0,
        is_profitable: netProfit > 0
      }
    };
  } catch (error) {
    console.error('Get P&L statement error:', error);
    return this.getEmptyP&LStatement();
  }
}

static async getExpenseData(startDate, endDate) {
  try {
    // This assumes you have an expenses table
    // You'll need to create this table or modify based on your actual database structure
    const result = await db.queryOne(`
      SELECT 
        COALESCE(SUM(CASE WHEN category = 'ingredients' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as food_cost,
        COALESCE(SUM(CASE WHEN category = 'beverages' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as beverage_cost,
        COALESCE(SUM(CASE WHEN category = 'packaging' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as packaging_cost,
        COALESCE(SUM(CASE WHEN category IN ('ingredients', 'beverages', 'packaging') AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as total_cogs,
        
        COALESCE(SUM(CASE WHEN category = 'labor' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as labor_cost,
        COALESCE(SUM(CASE WHEN category = 'rent' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as rent,
        COALESCE(SUM(CASE WHEN category = 'utilities' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as utilities,
        COALESCE(SUM(CASE WHEN category = 'marketing' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as marketing,
        COALESCE(SUM(CASE WHEN category = 'maintenance' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as maintenance,
        COALESCE(SUM(CASE WHEN category = 'other_operating' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as other_operating,
        COALESCE(SUM(CASE WHEN category IN ('labor', 'rent', 'utilities', 'marketing', 'maintenance', 'other_operating') AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as total_operating_expenses,
        
        COALESCE(SUM(CASE WHEN category = 'interest' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as interest,
        COALESCE(SUM(CASE WHEN category = 'depreciation' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as depreciation,
        COALESCE(SUM(CASE WHEN category = 'other' AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as other_expenses,
        COALESCE(SUM(CASE WHEN category IN ('interest', 'depreciation', 'other') AND date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) as total_other_expenses
        
      FROM expenses
      WHERE date BETWEEN ? AND ?
    `, [
      startDate, endDate,  // food_cost
      startDate, endDate,  // beverage_cost
      startDate, endDate,  // packaging_cost
      startDate, endDate,  // total_cogs
      startDate, endDate,  // labor_cost
      startDate, endDate,  // rent
      startDate, endDate,  // utilities
      startDate, endDate,  // marketing
      startDate, endDate,  // maintenance
      startDate, endDate,  // other_operating
      startDate, endDate,  // total_operating_expenses
      startDate, endDate,  // interest
      startDate, endDate,  // depreciation
      startDate, endDate,  // other_expenses
      startDate, endDate,  // total_other_expenses
      startDate, endDate   // WHERE clause
    ]);
    
    return {
      food_cost: parseFloat(result.food_cost || 0),
      beverage_cost: parseFloat(result.beverage_cost || 0),
      packaging_cost: parseFloat(result.packaging_cost || 0),
      total_cogs: parseFloat(result.total_cogs || 0),
      labor_cost: parseFloat(result.labor_cost || 0),
      rent: parseFloat(result.rent || 0),
      utilities: parseFloat(result.utilities || 0),
      marketing: parseFloat(result.marketing || 0),
      maintenance: parseFloat(result.maintenance || 0),
      other_operating: parseFloat(result.other_operating || 0),
      total_operating_expenses: parseFloat(result.total_operating_expenses || 0),
      interest: parseFloat(result.interest || 0),
      depreciation: parseFloat(result.depreciation || 0),
      other_expenses: parseFloat(result.other_expenses || 0),
      total_other_expenses: parseFloat(result.total_other_expenses || 0)
    };
  } catch (error) {
    console.error('Get expense data error:', error);
    // If expenses table doesn't exist, return empty structure
    return this.getEmptyExpenseData();
  }
}

static async getVATReport(startDate, endDate) {
  try {
    const result = await db.query(`
      SELECT 
        DATE(payment_time) as date,
        COUNT(*) as transactions,
        COALESCE(SUM(total_amount), 0) as taxable_amount,
        COALESCE(SUM(tax), 0) as vat_amount,
        COALESCE(AVG(tax), 0) as avg_vat_per_transaction
      FROM orders
      WHERE payment_status = 'paid'
        AND payment_time IS NOT NULL
        AND tax > 0
        AND payment_time BETWEEN ? AND ?
      GROUP BY DATE(payment_time)
      ORDER BY date
    `, [startDate, endDate]);
    
    // Calculate summary
    const summary = {
      total_transactions: result.reduce((sum, row) => sum + parseInt(row.transactions || 0), 0),
      total_taxable_amount: result.reduce((sum, row) => sum + parseFloat(row.taxable_amount || 0), 0),
      total_vat_collected: result.reduce((sum, row) => sum + parseFloat(row.vat_amount || 0), 0),
      vat_rate_applied: '15%'
    };
    
    return {
      period: { startDate, endDate },
      summary,
      daily_breakdown: result.map(row => ({
        date: row.date,
        transactions: parseInt(row.transactions || 0),
        taxable_amount: parseFloat(row.taxable_amount || 0),
        vat_amount: parseFloat(row.vat_amount || 0),
        avg_vat_per_transaction: parseFloat(row.avg_vat_per_transaction || 0)
      })),
      vat_calculation: {
        formula: 'VAT = Subtotal × 15%',
        example: 'For 100 ETB subtotal, VAT = 100 × 0.15 = 15 ETB',
        total_including_vat: 'Subtotal + 15% VAT'
      }
    };
  } catch (error) {
    console.error('Get VAT report error:', error);
    return this.getEmptyVATReport();
  }
}

static async getFinancialKPIs(startDate, endDate) {
  try {
    const [revenueData, expenseData] = await Promise.all([
      this.getFinancialSummary(startDate, endDate),
      this.getExpenseData(startDate, endDate)
    ]);
    
    const grossProfit = revenueData.total_revenue - expenseData.total_cogs;
    const operatingProfit = grossProfit - expenseData.total_operating_expenses;
    const netProfit = operatingProfit - expenseData.total_other_expenses;
    
    return {
      profitability: {
        gross_profit_margin: revenueData.total_revenue > 0 ? 
          (grossProfit / revenueData.total_revenue) * 100 : 0,
        operating_profit_margin: revenueData.total_revenue > 0 ? 
          (operatingProfit / revenueData.total_revenue) * 100 : 0,
        net_profit_margin: revenueData.total_revenue > 0 ? 
          (netProfit / revenueData.total_revenue) * 100 : 0,
        is_profitable: netProfit > 0
      },
      efficiency: {
        revenue_per_transaction: revenueData.avg_transaction_value,
        labor_cost_percentage: revenueData.total_revenue > 0 ? 
          (expenseData.labor_cost / revenueData.total_revenue) * 100 : 0,
        food_cost_percentage: revenueData.total_revenue > 0 ? 
          (expenseData.total_cogs / revenueData.total_revenue) * 100 : 0,
        table_turnover_rate: await this.getTableTurnoverRate(startDate, endDate)
      },
      liquidity: {
        current_ratio: 2.5, // This would come from balance sheet data
        quick_ratio: 1.8,
        cash_conversion_cycle: 15 // days
      },
      growth: {
        revenue_growth: await this.getRevenueGrowth(startDate, endDate),
        transaction_growth: await this.getTransactionGrowth(startDate, endDate),
        customer_growth: await this.getCustomerGrowth(startDate, endDate)
      }
    };
  } catch (error) {
    console.error('Get financial KPIs error:', error);
  }
}

// ========== HELPER METHODS ==========

static getEmptyFinancialSummary() {
  return {
    total_revenue: 0,
    vat_collected: 0,
    net_revenue: 0,
    tips_collected: 0,
    discounts_given: 0,
    transaction_count: 0,
    avg_transaction_value: 0,
    total_collected: 0,
    payment_methods: {
      cash: 0,
      card: 0,
      mobile: 0
    }
  };
}

static getEmptyExpenseData() {
  return {
    food_cost: 0,
    beverage_cost: 0,
    packaging_cost: 0,
    total_cogs: 0,
    labor_cost: 0,
    rent: 0,
    utilities: 0,
    marketing: 0,
    maintenance: 0,
    other_operating: 0,
    total_operating_expenses: 0,
    interest: 0,
    depreciation: 0,
    other_expenses: 0,
    total_other_expenses: 0
  };
}
}


module.exports = ReportModel;