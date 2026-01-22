const ReportModel = require('../models/Report');
const Ingredient = require('../models/Ingredient');

class ReportController {
  // ========== DASHBOARD ENDPOINTS ==========

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
        comparisonRange.startDate.setDate(comparisonRange.startDate.getDate() - 7);
        comparisonRange.endDate.setDate(comparisonRange.endDate.getDate() - 7);
        break;
      case 'month':
        dateRange = ReportModel.getDateRange('month');
        comparisonRange = ReportModel.getDateRange('month');
        comparisonRange.startDate.setMonth(comparisonRange.startDate.getMonth() - 1);
        comparisonRange.endDate.setMonth(comparisonRange.endDate.getMonth() - 1);
        break;
      default:
        dateRange = ReportModel.getDateRange('today');
        comparisonRange = ReportModel.getDateRange('yesterday');
    }
    
    console.log('Selected period range:', dateRange.startDate, 'to', dateRange.endDate);
    console.log('Comparison range:', comparisonRange.startDate, 'to', comparisonRange.endDate);

    // Fetch data - FIXED: Pass dateRange to getRecentOrders
    const [currentStats, comparisonStats, staffPerformance, popularItems, recentOrders] = await Promise.all([
      ReportModel.getSalesSummary(dateRange.startDate, dateRange.endDate),
      ReportModel.getSalesSummary(comparisonRange.startDate, comparisonRange.endDate),
      ReportModel.getStaffPerformance(dateRange.startDate, dateRange.endDate),
      ReportModel.getTopSellingItems(dateRange.startDate, dateRange.endDate, 5),
      ReportModel.getRecentOrders(dateRange.startDate, dateRange.endDate, 5) // ← FIXED: Added date parameters
    ]);

    console.log('=== DASHBOARD RESULTS ===');
    console.log('Current stats:', currentStats);
    console.log('Comparison stats:', comparisonStats);
    console.log('Staff count for period:', staffPerformance.length);
    console.log('Popular items for period:', popularItems.length);
    console.log('Recent orders count:', recentOrders.length); // Add this for debugging

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
        recent_orders: recentOrders, // This should now work
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
}

module.exports = ReportController;