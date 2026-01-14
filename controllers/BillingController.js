const Order = require('../models/order');
const db = require('../config/db');

class BillingController {
  // Get orders ready for payment (Cashier Dashboard)
  static async getPendingPayments(req, res) {
    try {
      const orders = await Order.getPendingPayments();
      
      res.json({
        success: true,
        orders,
        count: orders.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get pending payments error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting pending payments'
      });
    }
  }

  // Process payment for an order
  static async processPayment(req, res) {
    try {
      const { id } = req.params;
      const paymentData = req.body;
      const cashierId = req.user.id;

      // Validate payment data
      if (!paymentData.payment_method) {
        return res.status(400).json({
          success: false,
          error: 'Payment method is required'
        });
      }

      const validMethods = ['cash', 'card', 'mobile', 'split'];
      if (!validMethods.includes(paymentData.payment_method)) {
        return res.status(400).json({
          success: false,
          error: `Valid payment method required: ${validMethods.join(', ')}`
        });
      }

      // Process payment
      const updatedOrder = await Order.processPayment(id, paymentData, cashierId);

      res.json({
        success: true,
        message: 'Payment processed successfully',
        order: updatedOrder
      });
    } catch (error) {
      console.error('Process payment error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error processing payment'
      });
    }
  }

  // Generate receipt for order
  static async generateReceipt(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Generate receipt number
      const receiptNumber = `RCPT-${Date.now().toString().slice(-8)}`;

      const receipt = {
        receipt_number: receiptNumber,
        order_number: order.order_number,
        date: order.order_time,
        customer_name: order.customer_name,
        table_number: order.table_number,
        items: order.items,
        subtotal: parseFloat(order.total_amount),
        tax: parseFloat(order.tax || 0),
        tip: parseFloat(order.tip || 0),
        discount: parseFloat(order.discount || 0),
        total: parseFloat(
          (parseFloat(order.total_amount) + 
           parseFloat(order.tax || 0) + 
           parseFloat(order.tip || 0) - 
           parseFloat(order.discount || 0)).toFixed(2)
        ),
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        cashier: order.cashier_name || 'System'
      };

      res.json({
        success: true,
        receipt
      });
    } catch (error) {
      console.error('Generate receipt error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error generating receipt'
      });
    }
  }

  // Apply discount to order
  static async applyDiscount(req, res) {
    try {
      const { id } = req.params;
      const { discount_amount, discount_reason } = req.body;

      if (!discount_amount || discount_amount < 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid discount amount required'
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const sql = 'UPDATE orders SET discount = ?, notes = CONCAT(notes, ?) WHERE id = ?';
      await db.execute(sql, [
        parseFloat(discount_amount),
        ` | Discount: ${discount_amount} (${discount_reason || 'No reason'})`,
        id
      ]);

      const updatedOrder = await Order.findById(id);

      res.json({
        success: true,
        message: `Discount of ${discount_amount} applied`,
        order: updatedOrder
      });
    } catch (error) {
      console.error('Apply discount error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error applying discount'
      });
    }
  }

  // Get today's sales summary
 // Get sales summary
static async getSalesSummary(req, res) {
  try {
    const { date } = req.query; // Optional date parameter
    
    console.log('Sales summary requested for date:', date);
    
    // If date is undefined, use null for SQL
    const dateParam = date || null;
    
    const sql = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_sales,
        SUM(tax) as total_tax,
        SUM(tip) as total_tips,
        SUM(discount) as total_discounts,
        SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'mobile' THEN total_amount ELSE 0 END) as mobile_sales,
        AVG(total_amount) as average_order_value
      FROM orders
      WHERE payment_status = 'paid'
        AND DATE(order_time) = COALESCE(?, CURDATE())
    `;

    console.log('Executing SQL with date param:', dateParam);
    const summary = await db.queryOne(sql, [dateParam]);

    // Handle case when no orders found
    if (!summary) {
      return res.json({
        success: true,
        summary: {
          total_orders: 0,
          total_sales: 0,
          total_tax: 0,
          total_tips: 0,
          total_discounts: 0,
          cash_sales: 0,
          card_sales: 0,
          mobile_sales: 0,
          average_order_value: 0
        },
        date: date || new Date().toISOString().split('T')[0]
      });
    }

    // Convert nulls to 0 for cleaner response
    const cleanedSummary = {
      total_orders: parseInt(summary.total_orders) || 0,
      total_sales: parseFloat(summary.total_sales) || 0,
      total_tax: parseFloat(summary.total_tax) || 0,
      total_tips: parseFloat(summary.total_tips) || 0,
      total_discounts: parseFloat(summary.total_discounts) || 0,
      cash_sales: parseFloat(summary.cash_sales) || 0,
      card_sales: parseFloat(summary.card_sales) || 0,
      mobile_sales: parseFloat(summary.mobile_sales) || 0,
      average_order_value: parseFloat(summary.average_order_value) || 0
    };

    res.json({
      success: true,
      summary: cleanedSummary,
      date: date || new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting sales summary'
    });
  }
}
  // In BillingController.js - Add this method
static async generateReceiptHTML(req, res) {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Calculate totals with VAT
    const subtotal = parseFloat(order.total_amount);
    const VAT_RATE = 0.15;
    const vatAmount = subtotal * VAT_RATE;
    const totalWithVAT = subtotal + vatAmount;
    const tip = parseFloat(order.tip || 0);
    const discount = parseFloat(order.discount || 0);
    const finalTotal = totalWithVAT + tip - discount;

    // Get table information
    let tableInfo = 'Takeaway';
    if (order.table) {
      if (typeof order.table === 'object') {
        tableInfo = order.table.name || order.table.number || JSON.stringify(order.table);
      } else {
        tableInfo = order.table;
      }
    } else if (order.table_number) {
      tableInfo = order.table_number;
    }

    // Generate HTML receipt matching frontend format
    const htmlReceipt = `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt #${order.order_number}</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            padding: 20px;
            max-width: 400px;
            margin: 0 auto;
            background: white;
        }
        .receipt {
            border: 2px solid #000;
            padding: 20px;
            border-radius: 5px;
        }
        .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .restaurant-name {
            font-size: 24px;
            font-weight: bold;
            margin: 0;
            text-transform: uppercase;
        }
        .restaurant-address {
            font-size: 14px;
            margin: 5px 0;
            text-transform: uppercase;
        }
        .row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 4px 0;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        .items-table th {
            text-align: left;
            border-bottom: 1px solid #000;
            padding: 8px 0;
            font-weight: bold;
        }
        .items-table td {
            padding: 6px 0;
            border-bottom: 1px dashed #ccc;
        }
        .items-table tr:last-child td {
            border-bottom: none;
        }
        .total-section {
            border-top: 2px solid #000;
            margin-top: 20px;
            padding-top: 15px;
        }
        .highlight {
            font-weight: bold;
            font-size: 18px;
        }
        .payment-info {
            background-color: #f5f5f5;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            color: #666;
        }
        .vat-note {
            font-size: 10px;
            color: #666;
            text-align: center;
            margin-top: 10px;
        }
        .section-title {
            font-weight: bold;
            margin: 15px 0 8px 0;
            font-size: 16px;
        }
        .amount-positive {
            color: #28a745;
        }
        .amount-negative {
            color: #dc3545;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <h1 class="restaurant-name">KUKU CHICKEN</h1>
            <p class="restaurant-address">DIRE DIWA ADDIS ABABA</p>
            <p>Phone: (555) 123-4567</p>
            <p><strong>RECEIPT #${order.order_number}</strong></p>
            <p>Date: ${new Date(order.order_time || Date.now()).toLocaleString()}</p>
        </div>
        
        <div class="section-title">ORDER DETAILS</div>
        <div class="row">
            <span>Customer:</span>
            <span><strong>${order.customer_name || 'Walk-in Customer'}</strong></span>
        </div>
        <div class="row">
            <span>Table:</span>
            <span><strong>${tableInfo}</strong></span>
        </div>
        <div class="row">
            <span>Cashier:</span>
            <span>${order.cashier_name || 'System'}</span>
        </div>
        
        <div class="section-title">ORDER ITEMS</div>
        <table class="items-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${order.items && order.items.length > 0 ? 
                  order.items.map(item => `
                    <tr>
                        <td>${item.menu_item_name || item.name || 'Item'}</td>
                        <td>${item.quantity || 1}</td>
                        <td>${(item.price || 0).toFixed(2)} ETB</td>
                        <td>${((item.price || 0) * (item.quantity || 1)).toFixed(2)} ETB</td>
                    </tr>
                  `).join('') : 
                  '<tr><td colspan="4" style="text-align: center;">No items found</td></tr>'
                }
            </tbody>
        </table>
        
        <div class="total-section">
            <div class="row">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)} ETB</span>
            </div>
            <div class="row">
                <span>VAT (15%):</span>
                <span>${vatAmount.toFixed(2)} ETB</span>
            </div>
            ${tip > 0 ? `
                <div class="row">
                    <span>Tip:</span>
                    <span class="amount-positive">+${tip.toFixed(2)} ETB</span>
                </div>
            ` : ''}
            ${discount > 0 ? `
                <div class="row">
                    <span>Discount:</span>
                    <span class="amount-negative">-${discount.toFixed(2)} ETB</span>
                </div>
            ` : ''}
            <div class="row highlight">
                <span>FINAL TOTAL:</span>
                <span>${finalTotal.toFixed(2)} ETB</span>
            </div>
        </div>
        
        <div class="payment-info">
            <div class="section-title">PAYMENT INFORMATION</div>
            <div class="row">
                <span>Payment Method:</span>
                <span><strong>${(order.payment_method || 'CASH').toUpperCase()}</strong></span>
            </div>
            <div class="row">
                <span>Payment Status:</span>
                <span style="color: #28a745; font-weight: bold;">${(order.payment_status || 'PAID').toUpperCase()}</span>
            </div>
            <div class="row">
                <span>Transaction Time:</span>
                <span>${new Date(order.payment_time || Date.now()).toLocaleTimeString()}</span>
            </div>
        </div>
        
        <div class="footer">
            <p>Thank you for dining with us!</p>
            <p class="vat-note">VAT included at 15% | TIN: 0000000</p>
        </div>
    </div>
    
    <script>
        // Auto-print after loading
        setTimeout(() => {
            window.print();
        }, 500);
    </script>
</body>
</html>`;

    // Set content type and send HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlReceipt);

  } catch (error) {
    console.error('Error generating receipt HTML:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate receipt',
      details: error.message 
    });
  }
}
static async getSalesSummary(req, res) {
  try {
    const filters = {
      period: req.query.period || 'today',
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      date: req.query.date
    };
    
    console.log('BillingController: Getting sales summary with filters:', filters);
    
    const summary = await Order.getSalesSummary(filters);
    
    res.json(summary);
  } catch (error) {
    console.error('BillingController Error in getSalesSummary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Get daily sales report
static async getDailySalesReport(req, res) {
  try {
    const date = req.query.date || null;
    console.log('BillingController: Getting daily report for date:', date);
    
    const report = await Order.getDailySalesReport(date);
    
    res.json(report);
  } catch (error) {
    console.error('BillingController Error in getDailySalesReport:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
// In BillingController.js - Add new method
static async getPaymentReport(req, res) {
  try {
    const { 
      start_date, 
      end_date,
      payment_method,
      cashier_id,
      min_amount,
      max_amount
    } = req.query;
    
    let whereClause = 'WHERE payment_status = "paid" AND payment_time IS NOT NULL';
    const params = [];
    
    if (start_date && end_date) {
      whereClause += ' AND DATE(payment_time) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      whereClause += ' AND DATE(payment_time) >= ?';
      params.push(start_date);
    }
    
    if (payment_method) {
      whereClause += ' AND payment_method = ?';
      params.push(payment_method);
    }
    
    if (cashier_id) {
      whereClause += ' AND cashier_id = ?';
      params.push(cashier_id);
    }
    
    if (min_amount) {
      whereClause += ' AND total_amount >= ?';
      params.push(parseFloat(min_amount));
    }
    
    if (max_amount) {
      whereClause += ' AND total_amount <= ?';
      params.push(parseFloat(max_amount));
    }
    
    const sql = `
      SELECT 
        o.id,
        o.order_number,
        o.total_amount,
        o.tax,
        o.tip,
        o.discount,
        o.payment_method,
        DATE_FORMAT(o.order_time, '%Y-%m-%d %H:%i') as order_time,
        DATE_FORMAT(o.payment_time, '%Y-%m-%d %H:%i') as payment_time,
        TIMESTAMPDIFF(MINUTE, o.order_time, o.payment_time) as minutes_to_pay,
        COALESCE(t.table_number, 'Takeaway') as table_number,
        o.customer_name,
        w.username as waiter_name,
        c.username as cashier_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users w ON o.waiter_id = w.id
      LEFT JOIN users c ON o.cashier_id = c.id
      ${whereClause}
      ORDER BY o.payment_time DESC
    `;
    
    const payments = await db.query(sql, params);
    
    // Calculate summary
    const summary = {
      total_payments: payments.length,
      total_amount: payments.reduce((sum, p) => sum + parseFloat(p.total_amount), 0),
      total_tax: payments.reduce((sum, p) => sum + parseFloat(p.tax || 0), 0),
      total_tip: payments.reduce((sum, p) => sum + parseFloat(p.tip || 0), 0),
      total_discount: payments.reduce((sum, p) => sum + parseFloat(p.discount || 0), 0),
      avg_minutes_to_pay: payments.length > 0 ? 
        payments.reduce((sum, p) => sum + (p.minutes_to_pay || 0), 0) / payments.length : 0
    };
    
    res.json({
      success: true,
      summary,
      payments,
      filters: {
        start_date,
        end_date,
        payment_method,
        cashier_id,
        min_amount,
        max_amount
      }
    });
    
  } catch (error) {
    console.error('Get payment report error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error getting payment report'
    });
  }
}
}

module.exports = BillingController;