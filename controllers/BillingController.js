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

      res.json({ success: true, receipt });
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

  // Get sales summary
  // FIX: duplicate getSalesSummary method removed — the first definition was dead code
  // because JS class methods with the same name are silently overwritten by the last one
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

  // Generate printable HTML receipt
  static async generateReceiptHTML(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findById(id);

      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      // ─── VAT CALCULATION (prices are VAT-inclusive) ───────────────────────
      // Back-calculate net and VAT component — do NOT add VAT on top again
      const vatInclusiveTotal = parseFloat(order.total_amount);
      const netAmount         = vatInclusiveTotal / 1.15;           // pre-VAT base
      const vatAmount         = vatInclusiveTotal - netAmount;      // = total × 0.15/1.15
      const tip               = parseFloat(order.tip      || 0);
      const discount          = parseFloat(order.discount || 0);
      const finalTotal        = vatInclusiveTotal + tip - discount; // VAT already baked in
      // ─────────────────────────────────────────────────────────────────────

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

      const orderDate = new Date(order.order_time || Date.now());
      const payDate   = new Date(order.payment_time || Date.now());
      const fmtDate   = orderDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      const fmtTime   = orderDate.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      const fmtPay    = payDate.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

      const htmlReceipt = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt · ${order.order_number}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #e8e4dc;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px;
      font-family: 'IBM Plex Mono', monospace;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 100%;
      max-width: 420px;
    }

    /* ── Receipt card ── */
    .receipt {
      background: #faf8f4;
      border: 1px solid #c8bfaf;
      box-shadow: 0 2px 0 #bdb3a3, 0 6px 24px rgba(0,0,0,0.12);
      position: relative;
      overflow: hidden;
    }

    /* Subtle corner marks */
    .receipt::before, .receipt::after {
      content: '';
      position: absolute;
      width: 18px; height: 18px;
      border-color: #c0b49e;
      border-style: solid;
    }
    .receipt::before { top: 10px; left: 10px; border-width: 2px 0 0 2px; }
    .receipt::after  { bottom: 10px; right: 10px; border-width: 0 2px 2px 0; }

    /* ── Header ── */
    .header {
      background: #1a1a1a;
      color: #faf8f4;
      text-align: center;
      padding: 28px 24px 22px;
      position: relative;
    }
    .header-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9px;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 10px;
    }
    .restaurant-name {
      font-family: 'Playfair Display', serif;
      font-size: 30px;
      font-weight: 700;
      letter-spacing: 1px;
      line-height: 1.1;
      color: #ffffff;
    }
    .restaurant-sub {
      font-size: 9.5px;
      letter-spacing: 3.5px;
      text-transform: uppercase;
      color: #8a8a8a;
      margin-top: 6px;
    }
    .header-divider {
      width: 40px;
      height: 1px;
      background: #444;
      margin: 14px auto;
    }
    .receipt-meta {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #999;
      letter-spacing: 0.5px;
    }
    .receipt-number {
      color: #faf8f4;
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 1px;
    }

    /* ── Tear edge ── */
    .tear {
      height: 12px;
      background: repeating-linear-gradient(
        90deg,
        #faf8f4 0px, #faf8f4 8px,
        #1a1a1a 8px, #1a1a1a 12px
      );
      opacity: 0.15;
    }

    /* ── Body padding ── */
    .body { padding: 20px 24px; }

    /* ── Section label ── */
    .section-label {
      font-size: 8.5px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #9a9080;
      font-weight: 600;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e0d9ce;
    }

    /* ── Info grid ── */
    .info-grid { margin-bottom: 20px; }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 5px 0;
      font-size: 11px;
    }
    .info-label { color: #9a9080; }
    .info-value { color: #1a1a1a; font-weight: 500; text-align: right; max-width: 60%; }

    /* ── Items table ── */
    .items-section { margin-bottom: 4px; }
    .items-table { width: 100%; border-collapse: collapse; }
    .items-table thead tr th {
      font-size: 8.5px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #9a9080;
      font-weight: 600;
      padding: 0 0 8px;
      border-bottom: 1px dashed #c8bfaf;
    }
    .items-table thead tr th:last-child { text-align: right; }
    .items-table thead tr th:nth-child(2),
    .items-table thead tr th:nth-child(3) { text-align: center; }

    .items-table tbody tr td {
      padding: 9px 0;
      font-size: 11.5px;
      color: #1a1a1a;
      border-bottom: 1px dashed #e4ddd3;
      vertical-align: top;
    }
    .items-table tbody tr:last-child td { border-bottom: none; }
    .item-name { font-weight: 500; line-height: 1.35; }
    .item-qty  { text-align: center; color: #6a6055; }
    .item-unit { text-align: center; color: #6a6055; }
    .item-total { text-align: right; font-weight: 600; white-space: nowrap; }

    /* ── Totals block ── */
    .totals-block {
      background: #f0ece4;
      border: 1px solid #ddd6c8;
      border-radius: 2px;
      padding: 14px 16px;
      margin: 18px 0;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 4px 0;
      color: #4a4035;
    }
    .total-row.vat-row { color: #7a7065; font-size: 10.5px; font-style: italic; }
    .total-row.tip-row { color: #2a6a3a; }
    .total-row.disc-row { color: #8a2a1a; }
    .total-separator {
      border: none;
      border-top: 1px solid #c8bfaf;
      margin: 10px 0;
    }
    .total-row.grand {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
      padding-top: 6px;
      letter-spacing: 0.3px;
    }

    /* ── Payment pill ── */
    .payment-block {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border: 1px solid #c8bfaf;
      margin-bottom: 18px;
    }
    .payment-method-label {
      font-size: 8.5px;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #9a9080;
    }
    .payment-method-value {
      font-size: 13px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: 1px;
      margin-top: 2px;
    }
    .payment-status {
      font-size: 9px;
      letter-spacing: 2px;
      font-weight: 600;
      text-transform: uppercase;
      background: #1a1a1a;
      color: #faf8f4;
      padding: 5px 10px;
    }
    .payment-time {
      font-size: 9px;
      color: #9a9080;
      margin-top: 2px;
      text-align: right;
    }

    /* ── Footer ── */
    .footer-divider {
      border: none;
      border-top: 1px dashed #c0b49e;
      margin: 4px 0 16px;
    }
    .footer {
      text-align: center;
      padding-bottom: 24px;
    }
    .footer-thanks {
      font-family: 'Playfair Display', serif;
      font-size: 14px;
      color: #3a3530;
      margin-bottom: 10px;
    }
    .footer-tin {
      font-size: 9px;
      letter-spacing: 1.5px;
      color: #a09080;
      line-height: 1.8;
    }
    .footer-tin span { color: #6a6055; font-weight: 600; }

    /* ── Print styles ── */
    @media print {
      body { background: white; padding: 0; }
      .receipt { border: none; box-shadow: none; }
      .receipt::before, .receipt::after { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="receipt">

      <!-- ── HEADER ── -->
      <div class="header">
        <div class="header-badge">Official Tax Receipt</div>
        <div class="restaurant-name">KUKU CHICKEN</div>
        <div class="restaurant-sub">Dire Diwa · Addis Ababa</div>
        <div class="header-divider"></div>
        <div class="receipt-meta">
          <span class="receipt-number">#${order.order_number}</span>
          <span>${fmtDate} &nbsp;·&nbsp; ${fmtTime}</span>
        </div>
      </div>

      <div class="tear"></div>

      <!-- ── BODY ── -->
      <div class="body">

        <!-- Order info -->
        <div class="info-grid">
          <div class="section-label">Order Details</div>
          <div class="info-row">
            <span class="info-label">Customer</span>
            <span class="info-value">${order.customer_name || 'Walk-in'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Table</span>
            <span class="info-value">${tableInfo}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Served by</span>
            <span class="info-value">${order.cashier_name || 'System'}</span>
          </div>
        </div>

        <!-- Items -->
        <div class="items-section">
          <div class="section-label">Items Ordered</div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="text-align:left;width:45%">Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${order.items && order.items.length > 0
                ? order.items.map(item => {
                    const unitPrice = parseFloat(item.price || 0);
                    const qty       = item.quantity || 1;
                    const lineTotal = unitPrice * qty;
                    return `
                      <tr>
                        <td class="item-name">${item.menu_item_name || item.name || 'Item'}</td>
                        <td class="item-qty">${qty}</td>
                        <td class="item-unit">${unitPrice.toFixed(2)}</td>
                        <td class="item-total">${lineTotal.toFixed(2)} ETB</td>
                      </tr>`;
                  }).join('')
                : '<tr><td colspan="4" style="text-align:center;padding:12px 0;color:#9a9080">No items</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div class="totals-block">
          <div class="total-row">
            <span>Net Amount (excl. VAT)</span>
            <span>${netAmount.toFixed(2)} ETB</span>
          </div>
          <div class="total-row vat-row">
            <span>VAT @ 15% &nbsp;<em>(incl. in price)</em></span>
            <span>${vatAmount.toFixed(2)} ETB</span>
          </div>
          ${tip > 0 ? `
          <div class="total-row tip-row">
            <span>Tip / Service</span>
            <span>+ ${tip.toFixed(2)} ETB</span>
          </div>` : ''}
          ${discount > 0 ? `
          <div class="total-row disc-row">
            <span>Discount</span>
            <span>− ${discount.toFixed(2)} ETB</span>
          </div>` : ''}
          <hr class="total-separator">
          <div class="total-row grand">
            <span>TOTAL</span>
            <span>${finalTotal.toFixed(2)} ETB</span>
          </div>
        </div>

        <!-- Payment -->
        <div class="payment-block">
          <div>
            <div class="payment-method-label">Payment Method</div>
            <div class="payment-method-value">${(order.payment_method || 'CASH').toUpperCase()}</div>
          </div>
          <div style="text-align:right">
            <div class="payment-status">${(order.payment_status || 'PAID').toUpperCase()}</div>
            <div class="payment-time">${fmtPay}</div>
          </div>
        </div>

        <!-- Footer -->
        <hr class="footer-divider">
        <div class="footer">
          <div class="footer-thanks">Thank you for dining with us</div>
          <div class="footer-tin">
            VAT Registration No. &nbsp;<span>ETH-VAT-000000</span><br>
            TIN: <span>0000000</span> &nbsp;·&nbsp; VAT incl. at 15%<br>
            Kuku Chicken · Addis Ababa, Ethiopia
          </div>
        </div>

      </div><!-- /body -->
    </div><!-- /receipt -->
  </div>

  <script>setTimeout(() => { window.print(); }, 600);</script>
</body>
</html>`;

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

  // Get payment report with filters
  static async getPaymentReport(req, res) {
    try {
      const { start_date, end_date, payment_method, cashier_id, min_amount, max_amount } = req.query;
      
      let whereClause = 'WHERE payment_status = "paid" AND payment_time IS NOT NULL';
      const params = [];
      
      if (start_date && end_date) {
        whereClause += ' AND DATE(payment_time) BETWEEN ? AND ?';
        params.push(start_date, end_date);
      } else if (start_date) {
        whereClause += ' AND DATE(payment_time) >= ?';
        params.push(start_date);
      }
      
      if (payment_method) { whereClause += ' AND payment_method = ?'; params.push(payment_method); }
      if (cashier_id) { whereClause += ' AND cashier_id = ?'; params.push(cashier_id); }
      if (min_amount) { whereClause += ' AND total_amount >= ?'; params.push(parseFloat(min_amount)); }
      if (max_amount) { whereClause += ' AND total_amount <= ?'; params.push(parseFloat(max_amount)); }
      
      const sql = `
        SELECT 
          o.id, o.order_number, o.total_amount, o.tax, o.tip, o.discount, o.payment_method,
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
        filters: { start_date, end_date, payment_method, cashier_id, min_amount, max_amount }
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