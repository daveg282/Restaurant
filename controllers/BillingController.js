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

    // Calculate totals
    const subtotal = parseFloat(order.total_amount);
    const tax = parseFloat(order.tax || 0);
    const tip = parseFloat(order.tip || 0);
    const discount = parseFloat(order.discount || 0);
    const total = subtotal + tax + tip - discount;

    // Generate HTML receipt
    const htmlReceipt = `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt #${order.order_number}</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
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
        }
        .receipt-number {
            font-size: 18px;
            margin: 10px 0;
        }
        .details {
            margin: 20px 0;
        }
        .row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .items-table th {
            border-bottom: 1px solid #000;
            padding: 10px 0;
            text-align: left;
        }
        .items-table td {
            padding: 8px 0;
            border-bottom: 1px dashed #ccc;
        }
        .total-section {
            border-top: 2px solid #000;
            margin-top: 20px;
            padding-top: 15px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            color: #666;
        }
        .highlight {
            font-weight: bold;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <h1 class="restaurant-name">🍽️ RESTAURANT ERP</h1>
            <p>123 Restaurant Street</p>
            <p>Phone: (555) 123-4567</p>
            <div class="receipt-number">
                <strong>RECEIPT #${order.order_number}</strong>
            </div>
            <p>Date: ${new Date(order.order_time).toLocaleString()}</p>
        </div>
        
        <div class="details">
            <div class="row">
                <span>Customer:</span>
                <span><strong>${order.customer_name}</strong></span>
            </div>
            <div class="row">
                <span>Table:</span>
                <span>${order.table_number || 'N/A'}</span>
            </div>
            <div class="row">
                <span>Cashier:</span>
                <span>${order.cashier_name || 'System'}</span>
            </div>
        </div>
        
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
                ${order.items.map(item => `
                <tr>
                    <td>${item.menu_item_name}</td>
                    <td>${item.quantity}</td>
                    <td>$${parseFloat(item.price).toFixed(2)}</td>
                    <td>$${(item.quantity * item.price).toFixed(2)}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="total-section">
            <div class="row">
                <span>Subtotal:</span>
                <span>$${subtotal.toFixed(2)}</span>
            </div>
            <div class="row">
                <span>Tax:</span>
                <span>$${tax.toFixed(2)}</span>
            </div>
            <div class="row">
                <span>Tip:</span>
                <span>$${tip.toFixed(2)}</span>
            </div>
            <div class="row">
                <span>Discount:</span>
                <span>-$${discount.toFixed(2)}</span>
            </div>
            <div class="row highlight">
                <span>TOTAL:</span>
                <span>$${total.toFixed(2)}</span>
            </div>
            <div class="row">
                <span>Payment Method:</span>
                <span><strong>${order.payment_method.toUpperCase()}</strong></span>
            </div>
            <div class="row">
                <span>Payment Status:</span>
                <span><strong style="color: green;">${order.payment_status.toUpperCase()}</strong></span>
            </div>
        </div>
        
        <div class="footer">
            <p>Thank you for dining with us!</p>
            <p>Please keep this receipt for your records</p>
            <p>Order #${order.order_number}</p>
        </div>
    </div>
</body>
</html>`;

    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlReceipt);

  } catch (error) {
    console.error('Generate receipt HTML error:', error);
    res.status(500).send(`<h1>Error generating receipt</h1><p>${error.message}</p>`);
  }
}
}

module.exports = BillingController;