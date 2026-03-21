const ReportModel = require('../models/Report');
const Ingredient = require('../models/Ingredient');

class ReportController {
  // ========== DASHBOARD ENDPOINTS ==========

static async getDashboardData(req, res) {
  try {
    const userRole = req.user.role;
    const { period = 'today' } = req.query;
    
    console.log('=== DASHBOARD REQUEST ===');
    console.log('Requested period:', period);
    console.log('User role:', userRole);
    
    // Get date ranges based on requested period
    let dateRange;
    let comparisonRange;
    
    switch(period) {
      case 'today':
        dateRange = ReportModel.getDateRange('today');
        comparisonRange = ReportModel.getDateRange('yesterday');
        break;
      case 'week':
        dateRange = ReportModel.getDateRange('week');
        comparisonRange = ReportModel.getDateRange('week');
        // Create new Date objects to avoid modifying the original
        comparisonRange = {
          startDate: new Date(comparisonRange.startDate),
          endDate: new Date(comparisonRange.endDate)
        };
        comparisonRange.startDate.setDate(comparisonRange.startDate.getDate() - 7);
        comparisonRange.endDate.setDate(comparisonRange.endDate.getDate() - 7);
        break;
      case 'month':
        dateRange = ReportModel.getDateRange('month');
        comparisonRange = ReportModel.getDateRange('month');
        // Create new Date objects to avoid modifying the original
        comparisonRange = {
          startDate: new Date(comparisonRange.startDate),
          endDate: new Date(comparisonRange.endDate)
        };
        comparisonRange.startDate.setMonth(comparisonRange.startDate.getMonth() - 1);
        comparisonRange.endDate.setMonth(comparisonRange.endDate.getMonth() - 1);
        break;
      default:
        dateRange = ReportModel.getDateRange('today');
        comparisonRange = ReportModel.getDateRange('yesterday');
    }
    
    // Ensure both ranges have valid Date objects
    dateRange = {
      startDate: dateRange.startDate instanceof Date ? dateRange.startDate : new Date(dateRange.startDate),
      endDate: dateRange.endDate instanceof Date ? dateRange.endDate : new Date(dateRange.endDate)
    };
    
    comparisonRange = {
      startDate: comparisonRange.startDate instanceof Date ? comparisonRange.startDate : new Date(comparisonRange.startDate),
      endDate: comparisonRange.endDate instanceof Date ? comparisonRange.endDate : new Date(comparisonRange.endDate)
    };
    
    // Validate dates
    if (isNaN(dateRange.startDate.getTime()) || isNaN(dateRange.endDate.getTime())) {
      console.error('Invalid date objects detected! Falling back to today');
      dateRange = ReportModel.getDateRange('today');
      comparisonRange = ReportModel.getDateRange('yesterday');
    }
    
    console.log('Selected period range:', dateRange.startDate.toISOString(), 'to', dateRange.endDate.toISOString());
    console.log('Comparison range:', comparisonRange.startDate.toISOString(), 'to', comparisonRange.endDate.toISOString());

    // Fetch data for selected period and comparison period
    const [currentStats, comparisonStats, staffPerformance, popularItems, recentOrders] = await Promise.all([
      ReportModel.getSalesSummary(dateRange.startDate, dateRange.endDate),
      ReportModel.getSalesSummary(comparisonRange.startDate, comparisonRange.endDate),
      ReportModel.getStaffPerformance(dateRange.startDate, dateRange.endDate),
      ReportModel.getTopSellingItems(dateRange.startDate, dateRange.endDate, 5),
      ReportModel.getRecentOrders(5)
    ]);

    console.log('=== DASHBOARD RESULTS ===');
    console.log('Current stats:', currentStats);
    console.log('Comparison stats:', comparisonStats);
    console.log('Staff count for period:', staffPerformance.length);
    console.log('Popular items for period:', popularItems.length);

    // Format performance stats for the selected period only
    const performanceStats = {
      [period]: ReportController.formatPerformanceStats(currentStats, comparisonStats)
    };

    // Only include staff with activity in the selected period
    const activeStaff = staffPerformance.filter(staff => staff.total_sales > 0);

    res.json({
      success: true,
      data: {
        performance_stats: performanceStats,
        staff_performance: activeStaff,
        popular_items: popularItems,
        recent_orders: recentOrders,
        user_role: userRole,
        generated_at: new Date().toISOString(),
        period: period
      }
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
  // ========== INVENTORY REPORT ENDPOINTS ==========

  static async getInventoryReport(req, res) {
    try {
      const { detailed } = req.query;
      
      // FIXED: Changed getLowStockAlerts() to getLowStock()
      const [inventoryMetrics, lowStockItems] = await Promise.all([
        ReportModel.getInventoryMetrics(),
        Ingredient.getLowStock()  // CHANGED HERE
      ]);

      const report = {
        summary: inventoryMetrics,
        low_stock_alerts: lowStockItems,  // CHANGED HERE
        generated_at: new Date().toISOString()
      };

      // Add detailed info if requested
      if (detailed === 'true') {
        const ingredients = await Ingredient.getAll({});
        report.detailed_ingredients = ingredients;
      }

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Inventory report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== HELPER METHODS ==========

  static formatAlerts(lowStockItems, userRole) {
    const alerts = [];

    // Add inventory alerts
    if (lowStockItems && lowStockItems.length > 0) {
      lowStockItems.slice(0, 3).forEach(item => {
        alerts.push({
          id: `stock-${item.id}`,
          type: 'inventory',
          severity: item.current_stock === 0 ? 'critical' : 'warning',
          title: 'Low Stock Alert',
          message: `${item.name} is ${item.current_stock === 0 ? 'out of stock' : 'low on stock'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      });
    }

    // Add system alerts for admin/manager
    if (['admin', 'manager'].includes(userRole)) {
      alerts.push({
        id: 'system-check',
        type: 'system',
        severity: 'info',
        title: 'Daily Report Ready',
        message: 'Daily sales report has been generated',
        time: 'Just now'
      });
    }

    return alerts;
  }

  // ========== SALES REPORT ENDPOINTS ==========

  static async getSalesReport(req, res) {
    try {
      const { start_date, end_date, group_by = 'day' } = req.query;
      
      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: 'Start date and end date are required'
        });
      }

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);

      const [summary, timeSeries, categoryBreakdown, topItems, paymentBreakdown] = await Promise.all([
        ReportModel.getSalesSummary(startDate, endDate),
        ReportModel.getSalesByTimePeriod(startDate, endDate, group_by),
        ReportModel.getCategoryBreakdown(startDate, endDate),
        ReportModel.getTopSellingItems(startDate, endDate, 10),
        ReportModel.getPaymentMethodBreakdown(startDate, endDate)
      ]);

      res.json({
        success: true,
        data: {
          period: { 
            start_date: start_date, 
            end_date: end_date, 
            group_by: group_by 
          },
          summary: summary,
          time_series: timeSeries,
          category_breakdown: categoryBreakdown,
          top_items: topItems,
          payment_methods: paymentBreakdown,
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Sales report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getDailySalesReport(req, res) {
    try {
      const { date } = req.query;
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);

      const [summary, hourlyData, topItems] = await Promise.all([
        ReportModel.getSalesSummary(startDate, endDate),
        ReportModel.getSalesByTimePeriod(startDate, endDate, 'hour'),
        ReportModel.getTopSellingItems(startDate, endDate, 5)
      ]);

      res.json({
        success: true,
        data: {
          date: targetDate,
          summary: summary,
          hourly_data: hourlyData,
          top_items: topItems,
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Daily sales report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getWeeklySalesReport(req, res) {
    try {
      const { week_start } = req.query;
      let dateRange;
      
      if (week_start) {
        const startDate = new Date(week_start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        dateRange = { startDate, endDate };
      } else {
        dateRange = ReportModel.getDateRange('week');
      }

      const report = await ReportController.getSalesReportForPeriod(
        dateRange.startDate,
        dateRange.endDate
      );

      res.json({
        success: true,
        data: {
          ...report,
          period_type: 'week',
          week_start: dateRange.startDate.toISOString().split('T')[0]
        }
      });
    } catch (error) {
      console.error('Weekly sales report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getMonthlySalesReport(req, res) {
    try {
      const { year, month } = req.query;
      const currentYear = year || new Date().getFullYear();
      const currentMonth = month || new Date().getMonth() + 1;

      const startDate = new Date(currentYear, currentMonth - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(currentYear, currentMonth, 0);
      endDate.setHours(23, 59, 59, 999);

      const report = await ReportController.getSalesReportForPeriod(
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: {
          ...report,
          period_type: 'month',
          year: currentYear,
          month: currentMonth,
          month_name: startDate.toLocaleString('default', { month: 'long' }),
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Monthly sales report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== STAFF REPORT ENDPOINTS ==========

  static async getStaffPerformanceReport(req, res) {
    try {
      const { period = 'week', start_date, end_date } = req.query;
      
      let dateRange;
      if (start_date && end_date) {
        dateRange = { 
          startDate: new Date(start_date),
          endDate: new Date(end_date) 
        };
        dateRange.endDate.setHours(23, 59, 59, 999);
      } else {
        dateRange = ReportModel.getDateRange(period);
      }

      const staffPerformance = await ReportModel.getStaffPerformance(
        dateRange.startDate,
        dateRange.endDate
      );

      // Add ranking
      const rankedStaff = staffPerformance.map((staff, index) => ({
        rank: index + 1,
        ...staff,
        rating: ReportController.calculateStaffRating(staff)
      }));

      res.json({
        success: true,
        data: {
          period: {
            start_date: dateRange.startDate.toISOString().split('T')[0],
            end_date: dateRange.endDate.toISOString().split('T')[0],
            type: start_date && end_date ? 'custom' : period
          },
          total_staff: staffPerformance.length,
          staff_performance: rankedStaff,
          top_performers: rankedStaff.slice(0, 3),
          summary: {
            total_sales: staffPerformance.reduce((sum, s) => sum + s.total_sales, 0),
            avg_sales_per_staff: staffPerformance.length > 0 
              ? staffPerformance.reduce((sum, s) => sum + s.total_sales, 0) / staffPerformance.length 
              : 0,
            best_performer: rankedStaff[0] || null
          },
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Staff performance report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

 
  // ========== HELPER METHODS ==========

  static async getSalesReportForPeriod(startDate, endDate) {
    const [summary, timeSeries, categories, topItems, paymentMethods] = await Promise.all([
      ReportModel.getSalesSummary(startDate, endDate),
      ReportModel.getSalesByTimePeriod(startDate, endDate, 'day'),
      ReportModel.getCategoryBreakdown(startDate, endDate),
      ReportModel.getTopSellingItems(startDate, endDate, 10),
      ReportModel.getPaymentMethodBreakdown(startDate, endDate)
    ]);

    return {
      summary,
      time_series: timeSeries,
      categories,
      top_items: topItems,
      payment_methods: paymentMethods,
      period: { 
        start_date: startDate.toISOString().split('T')[0], 
        end_date: endDate.toISOString().split('T')[0] 
      }
    };
  }

  static formatPerformanceStats(currentStats, previousStats) {
    const calculateChange = (current, previous) => {
      if (previous === 0) return { change: '0.0', trend: 'up' };
      const change = ((current - previous) / previous) * 100;
      return {
        change: change.toFixed(1),
        trend: change >= 0 ? 'up' : 'down'
      };
    };

    return {
      revenue: {
        current: currentStats.total_sales || 0,
        previous: previousStats.total_sales || 0,
        ...calculateChange(currentStats.total_sales || 0, previousStats.total_sales || 0)
      },
      customers: {
        current: currentStats.total_customers || 0,
        previous: previousStats.total_customers || 0,
        ...calculateChange(currentStats.total_customers || 0, previousStats.total_customers || 0)
      },
      averageOrder: {
        current: currentStats.average_order_value || 0,
        previous: previousStats.average_order_value || 0,
        ...calculateChange(currentStats.average_order_value || 0, previousStats.average_order_value || 0)
      },
      tableTurnover: {
        current: currentStats.tables_served || 0,
        previous: previousStats.tables_served || 0,
        ...calculateChange(currentStats.tables_served || 0, previousStats.tables_served || 0)
      }
    };
  }

  static getQuickStats() {
    // Return static quick stats for now
    return [
      { label: 'Occupancy Rate', value: '78%', color: 'blue' },
      { label: 'Food Cost', value: '28.3%', color: 'emerald' },
      { label: 'Labor Cost', value: '22.1%', color: 'purple' },
      { label: 'Waste', value: '4.2%', color: 'red' }
    ];
  }

  static calculateStaffRating(staff) {
    // Calculate rating based on performance metrics
    let rating = 3.5; // Base rating
    
    // Adjust based on sales
    if (staff.total_sales > 10000) rating += 1.0;
    else if (staff.total_sales > 5000) rating += 0.5;
    
    // Adjust based on orders handled
    if (staff.orders_handled > 50) rating += 0.5;
    
    // Adjust based on average order value
    if (staff.avg_order_value > 250) rating += 0.5;
    
    // Cap at 5.0
    return Math.min(5.0, rating).toFixed(1);
  }
  // ========== FINANCIAL REPORT ENDPOINTS ==========

static async getProfitLossReport(req, res) {
  try {
    const { start_date, end_date, period = 'month' } = req.query;
    
    let dateRange;
    if (start_date && end_date) {
      dateRange = { 
        startDate: new Date(start_date),
        endDate: new Date(end_date) 
      };
      dateRange.endDate.setHours(23, 59, 59, 999);
    } else {
      dateRange = ReportModel.getDateRange(period);
    }

    const plStatement = await ReportModel.getProfitLossStatement(
      dateRange.startDate,
      dateRange.endDate
    );

    res.json({
      success: true,
      data: {
        ...plStatement,
        generated_at: new Date().toISOString(),
        report_type: 'profit_loss_statement'
      }
    });
  } catch (error) {
    console.error('Profit loss report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

static async getVATReport(req, res) {
  try {
    const { start_date, end_date, period = 'month' } = req.query;
    
    let dateRange;
    if (start_date && end_date) {
      dateRange = { 
        startDate: new Date(start_date),
        endDate: new Date(end_date) 
      };
      dateRange.endDate.setHours(23, 59, 59, 999);
    } else {
      dateRange = ReportModel.getDateRange(period);
    }

    const vatReport = await ReportModel.getVATReport(
      dateRange.startDate,
      dateRange.endDate
    );

    res.json({
      success: true,
      data: {
        ...vatReport,
        generated_at: new Date().toISOString(),
        report_type: 'vat_tax_report'
      }
    });
  } catch (error) {
    console.error('VAT report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

static async getFinancialSummary(req, res) {
  try {
    const { start_date, end_date, period = 'today' } = req.query;
    
    let dateRange;
    if (start_date && end_date) {
      dateRange = { 
        startDate: new Date(start_date),
        endDate: new Date(end_date) 
      };
      dateRange.endDate.setHours(23, 59, 59, 999);
    } else {
      dateRange = ReportModel.getDateRange(period);
    }

    const financialSummary = await ReportModel.getFinancialSummary(
      dateRange.startDate,
      dateRange.endDate
    );

    res.json({
      success: true,
      data: {
        period: {
          start_date: dateRange.startDate.toISOString().split('T')[0],
          end_date: dateRange.endDate.toISOString().split('T')[0],
          type: start_date && end_date ? 'custom' : period
        },
        ...financialSummary,
        generated_at: new Date().toISOString(),
        report_type: 'financial_summary'
      }
    });
  } catch (error) {
    console.error('Financial summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

static async getExpenseReport(req, res) {
  try {
    const { start_date, end_date, period = 'month', detailed = 'false' } = req.query;
    
    let dateRange;
    if (start_date && end_date) {
      dateRange = { 
        startDate: new Date(start_date),
        endDate: new Date(end_date) 
      };
      dateRange.endDate.setHours(23, 59, 59, 999);
    } else {
      dateRange = ReportModel.getDateRange(period);
    }

    const expenseData = await ReportModel.getExpenseData(
      dateRange.startDate,
      dateRange.endDate
    );

    const report = {
      period: {
        start_date: dateRange.startDate.toISOString().split('T')[0],
        end_date: dateRange.endDate.toISOString().split('T')[0],
        type: start_date && end_date ? 'custom' : period
      },
      expense_summary: expenseData,
      generated_at: new Date().toISOString(),
      report_type: 'expense_report'
    };

    // Add detailed expense breakdown if requested
    if (detailed === 'true') {
      // You would need to implement this method in ReportModel
      // const detailedExpenses = await ReportModel.getDetailedExpenses(...);
      // report.detailed_expenses = detailedExpenses;
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Expense report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

static async getFinancialKPIs(req, res) {
  try {
    const { start_date, end_date, period = 'month' } = req.query;
    
    let dateRange;
    if (start_date && end_date) {
      dateRange = { 
        startDate: new Date(start_date),
        endDate: new Date(end_date) 
      };
      dateRange.endDate.setHours(23, 59, 59, 999);
    } else {
      dateRange = ReportModel.getDateRange(period);
    }

    const kpis = await ReportModel.getFinancialKPIs(
      dateRange.startDate,
      dateRange.endDate
    );

    res.json({
      success: true,
      data: {
        period: {
          start_date: dateRange.startDate.toISOString().split('T')[0],
          end_date: dateRange.endDate.toISOString().split('T')[0],
          type: start_date && end_date ? 'custom' : period
        },
        ...kpis,
        generated_at: new Date().toISOString(),
        report_type: 'financial_kpis'
      }
    });
  } catch (error) {
    console.error('Financial KPIs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

  // ========== ADVANCED REPORT GENERATOR ==========
  // Routes to existing report methods based on report_type.

  static async generateAdvancedReport(req, res) {
    try {
      const {
        report_type = 'sales',
        date_range  = 'custom',
        start_date,
        end_date,
        filters = {}
      } = req.body;

      // ── 1. Resolve date range ──────────────────────────────────
      let startDate, endDate;

      if (date_range === 'custom') {
        if (!start_date || !end_date) {
          return res.status(400).json({
            success: false,
            error: 'start_date and end_date are required for custom date range'
          });
        }
        startDate = new Date(start_date);
        endDate   = new Date(end_date);
      } else {
        const range = ReportModel.getDateRange(date_range);
        startDate = range.startDate;
        endDate   = range.endDate;
      }

      endDate.setHours(23, 59, 59, 999);

      const periodLabel = {
        start_date: startDate.toISOString().split('T')[0],
        end_date:   endDate.toISOString().split('T')[0],
        type:       date_range
      };

      // ── 2. Extract filters ─────────────────────────────────────
      const {
        payment_method,
        status,
        waiter_id,
        min_amount,
        max_amount,
        categories        = [],
        items             = [],   // specific menu_item_ids
        search            = null,
        include_vat       = true,
        include_tips      = true,
        include_discounts = true
      } = filters;

      // ── Pagination + sorting ───────────────────────────────────
      const page      = parseInt(req.body.pagination?.page      || 1);
      const pageSize  = parseInt(req.body.pagination?.page_size || 50);
      const sortField = req.body.sorting?.field     || null;
      const sortDir   = (req.body.sorting?.direction || 'asc').toLowerCase();

      // Helper: sort an array by a field
      const sortData = (arr, field, dir) => {
        if (!field || !arr || arr.length === 0) return arr;
        return [...arr].sort((a, b) => {
          const av = a[field] ?? '';
          const bv = b[field] ?? '';
          if (typeof av === 'number' && typeof bv === 'number') {
            return dir === 'asc' ? av - bv : bv - av;
          }
          return dir === 'asc'
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av));
        });
      };

      // Helper: paginate an array
      const paginate = (arr, pg, size) => {
        const start = (pg - 1) * size;
        return arr.slice(start, start + size);
      };

      // ── 3. Route by report_type ────────────────────────────────
      let reportData = {};
      const reportId = `RPT-${report_type.toUpperCase()}-${Date.now()}`;

      switch (report_type) {

        case 'sales': {
          // Build SQL filter object — passed to all model methods
          const sqlFilters = {};
          if (payment_method && payment_method !== 'all') sqlFilters.payment_method = payment_method;
          if (waiter_id      && waiter_id      !== 'all') sqlFilters.waiter_id      = parseInt(waiter_id);
          if (min_amount) sqlFilters.min_amount = min_amount;
          if (max_amount) sqlFilters.max_amount = max_amount;

          const [summary, timeSeries, categoryBreakdown, topItems, paymentBreakdown] =
            await Promise.all([
              ReportModel.getSalesSummary(startDate, endDate, sqlFilters),
              ReportModel.getSalesByTimePeriod(startDate, endDate, 'day', sqlFilters),
              ReportModel.getCategoryBreakdown(startDate, endDate, sqlFilters),
              ReportModel.getTopSellingItems(startDate, endDate, 10, sqlFilters),
              ReportModel.getPaymentMethodBreakdown(startDate, endDate, sqlFilters)
            ]);

          // Category filter — now we have category_id from the model
          const filteredCategories = categories.length > 0
            ? categoryBreakdown.filter(c =>
                categories.includes(c.category_id) || categories.includes(c.category_name))
            : categoryBreakdown;

          const totalSales = summary.total_sales || 0;
          reportData = {
            report_id:          reportId,
            report_type:        'sales',
            period:             periodLabel,
            summary: {
              total_amount:    totalSales,
              total_records:   summary.total_orders || 0,
              average_value:   summary.average_order_value || 0,
              net_amount:      totalSales / 1.15,
              vat_collected:   totalSales - totalSales / 1.15,
              tips_collected:  include_tips ? (summary.total_tips || 0) : 0,
              discounts_given: include_discounts ? (summary.total_discounts || 0) : 0
            },
            time_series:        timeSeries,
            category_breakdown: filteredCategories,
            top_items:          topItems,
            payment_methods:    paymentBreakdown,
            data:               paginate(sortData(timeSeries, sortField, sortDir), page, pageSize),
            total_records:      summary.total_orders || 0,
            generated_at:       new Date().toISOString()
          };
          break;
        }

        case 'items': {
          const sqlFiltersItems = {};
          if (waiter_id && waiter_id !== 'all') sqlFiltersItems.waiter_id = parseInt(waiter_id);
          if (status    && status    !== 'all') sqlFiltersItems.status    = status;
          // Pass a single category name to SQL if only one selected (multi handled post-fetch)
          const singleCatFilter = categories.length === 1
            ? { ...sqlFiltersItems, category_name: categories[0] }
            : sqlFiltersItems;

          const [topItems, categoryBreakdown] = await Promise.all([
            ReportModel.getTopSellingItems(startDate, endDate, 200, singleCatFilter),
            ReportModel.getCategoryBreakdown(startDate, endDate, sqlFiltersItems)
          ]);

          // Post-fetch: category filter — match by id OR name
          let filteredItems = categories.length > 0
            ? topItems.filter(i =>
                categories.includes(i.category_id) || categories.includes(i.category))
            : topItems;

          // Filter by specific menu item IDs
          if (items.length > 0) {
            filteredItems = filteredItems.filter(i => items.includes(i.id || i.menu_item_id));
          }

          // Search by name
          if (search) {
            const q = search.toLowerCase();
            filteredItems = filteredItems.filter(i => (i.name || '').toLowerCase().includes(q));
          }

          // Amount range on item revenue
          if (min_amount) filteredItems = filteredItems.filter(i => (i.total_revenue || 0) >= parseFloat(min_amount));
          if (max_amount) filteredItems = filteredItems.filter(i => (i.total_revenue || 0) <= parseFloat(max_amount));

          // FIX: use total_revenue not revenue
          const totalRevItems = filteredItems.reduce((s, i) => s + (i.total_revenue || 0), 0);
          const sortedItems   = sortData(filteredItems, sortField || 'total_quantity', sortDir || 'desc');

          reportData = {
            report_id:          reportId,
            report_type:        'items',
            period:             periodLabel,
            summary: {
              total_amount:  totalRevItems,
              total_records: filteredItems.length,
              average_value: filteredItems.length > 0 ? totalRevItems / filteredItems.length : 0
            },
            category_breakdown: categoryBreakdown,
            data:               paginate(sortedItems, page, pageSize),
            total_records:      filteredItems.length,
            generated_at:       new Date().toISOString()
          };
          break;
        }

        case 'orders': {
          const Order = require('../models/order');
          const orderFilters = {
            start_date: periodLabel.start_date,
            end_date:   periodLabel.end_date
          };
          if (status         && status         !== 'all') orderFilters.status         = status;
          if (payment_method && payment_method !== 'all') orderFilters.payment_method = payment_method;
          if (waiter_id      && waiter_id      !== 'all') orderFilters.waiter_id      = parseInt(waiter_id);

          const orders = await Order.getAll(orderFilters);

          let filtered = orders.filter(o => {
            const amt = parseFloat(o.total_amount || 0);
            if (min_amount && amt < parseFloat(min_amount)) return false;
            if (max_amount && amt > parseFloat(max_amount)) return false;
            return true;
          });

          // Search filter — order number or customer name
          if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(o =>
              (o.order_number || '').toLowerCase().includes(q) ||
              (o.customer_name || '').toLowerCase().includes(q) ||
              (o.table_number  || '').toLowerCase().includes(q)
            );
          }

          const totalRev = filtered.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

          // Map to display shape before sorting
          const mappedOrders = filtered.map(o => ({
            order_number:   o.order_number,
            date:           o.order_time,
            customer:       o.customer_name || 'Walk-in',
            table:          o.table_number  || 'Takeaway',
            items_count:    (o.items || []).length,
            total_amount:   parseFloat(o.total_amount || 0),
            payment_method: o.payment_method || '-',
            payment_status: o.payment_status || 'pending',
            waiter:         o.waiter_name    || '-',
            status:         o.status
          }));

          const sortedOrders = sortData(mappedOrders, sortField || 'date', sortDir);

          reportData = {
            report_id:   reportId,
            report_type: 'orders',
            period:      periodLabel,
            summary: {
              total_amount:  totalRev,
              total_records: filtered.length,
              average_value: filtered.length > 0 ? totalRev / filtered.length : 0,
              net_amount:    totalRev / 1.15,
              vat_collected: totalRev - totalRev / 1.15
            },
            data:          paginate(sortedOrders, page, pageSize),
            total_records: filtered.length,
            generated_at:  new Date().toISOString()
          };
          break;
        }

        case 'payments': {
          const sqlFiltersPay = {};
          if (payment_method && payment_method !== 'all') sqlFiltersPay.payment_method = payment_method;
          if (waiter_id      && waiter_id      !== 'all') sqlFiltersPay.waiter_id      = parseInt(waiter_id);
          if (min_amount) sqlFiltersPay.min_amount = min_amount;
          if (max_amount) sqlFiltersPay.max_amount = max_amount;

          const [financialSummary, paymentBreakdown] = await Promise.all([
            ReportModel.getFinancialSummary(startDate, endDate),   // uses payment_time — separate logic
            ReportModel.getPaymentMethodBreakdown(startDate, endDate, sqlFiltersPay)
          ]);

          const filteredPayments = paymentBreakdown; // already filtered by SQL

          reportData = {
            report_id:   reportId,
            report_type: 'payments',
            period:      periodLabel,
            summary: {
              total_amount:    financialSummary.total_revenue    || 0,
              total_records:   financialSummary.transaction_count || 0,
              average_value:   financialSummary.avg_transaction_value || 0,
              net_amount:      financialSummary.net_revenue      || 0,
              vat_collected:   financialSummary.vat_collected    || 0,
              tips_collected:  include_tips      ? (financialSummary.tips_collected  || 0) : 0,
              discounts_given: include_discounts ? (financialSummary.discounts_given || 0) : 0,
              total_collected: financialSummary.total_collected  || 0,
              cash:            financialSummary.payment_methods?.cash   || 0,
              card:            financialSummary.payment_methods?.card   || 0,
              mobile:          financialSummary.payment_methods?.mobile || 0
            },
            data:          paginate(sortData(filteredPayments, sortField, sortDir), page, pageSize),
            total_records: filteredPayments.length,
            generated_at:  new Date().toISOString()
          };
          break;
        }

        case 'staff': {
          const staffPerformance = await ReportModel.getStaffPerformance(startDate, endDate);

          const filteredStaff = waiter_id && waiter_id !== 'all'
            ? staffPerformance.filter(s => String(s.waiter_id) === String(waiter_id))
            : staffPerformance;

          const ranked = filteredStaff.map((s, i) => ({
            rank: i + 1,
            ...s,
            rating: ReportController.calculateStaffRating(s)
          }));

          // Search by staff name
          const searchedStaff = search
            ? ranked.filter(r => (r.waiter_name || r.username || '').toLowerCase().includes(search.toLowerCase()))
            : ranked;

          const totalStaffSales = searchedStaff.reduce((s, r) => s + (r.total_sales || 0), 0);
          reportData = {
            report_id:   reportId,
            report_type: 'staff',
            period:      periodLabel,
            summary: {
              total_amount:  totalStaffSales,
              total_records: searchedStaff.length,
              average_value: searchedStaff.length > 0 ? totalStaffSales / searchedStaff.length : 0
            },
            data:          paginate(sortData(searchedStaff, sortField, sortDir), page, pageSize),
            total_records: searchedStaff.length,
            generated_at:  new Date().toISOString()
          };
          break;
        }

        case 'custom':
        default: {
          const report = await ReportController.getSalesReportForPeriod(startDate, endDate);
          const totalCustom = report.summary?.total_sales || 0;
          reportData = {
            report_id:    reportId,
            report_type:  'custom',
            period:       periodLabel,
            summary: {
              total_amount:  totalCustom,
              total_records: report.summary?.total_orders || 0,
              average_value: report.summary?.average_order_value || 0,
              net_amount:    totalCustom / 1.15,
              vat_collected: totalCustom - totalCustom / 1.15
            },
            ...report,
            data:          paginate(sortData(report.time_series || [], sortField, sortDir), page, pageSize),
            total_records: report.summary?.total_orders || 0,
            generated_at:  new Date().toISOString()
          };
          break;
        }
      }

      return res.json({ success: true, data: reportData });

    } catch (error) {
      console.error('Advanced report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = ReportController;