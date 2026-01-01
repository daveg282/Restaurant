const db = require('../config/db');

class PurchaseOrder {
  // Generate unique PO number
  static generatePONumber() {
    const prefix = 'PO';
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${year}${month}-${random}`;
  }

  // Get all purchase orders
  static async getAll(filters = {}) {
    let sql = `
      SELECT 
        po.*,
        s.name as supplier_name,
        s.contact_person,
        s.phone,
        u.username as created_by_name,
        COUNT(poi.id) as item_count,
        SUM(poi.received_quantity) as total_received
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.status) {
      sql += ' AND po.status = ?';
      params.push(filters.status);
    }
    
    if (filters.supplier_id) {
      sql += ' AND po.supplier_id = ?';
      params.push(filters.supplier_id);
    }
    
    if (filters.start_date) {
      sql += ' AND DATE(po.created_at) >= ?';
      params.push(filters.start_date);
    }
    
    if (filters.end_date) {
      sql += ' AND DATE(po.created_at) <= ?';
      params.push(filters.end_date);
    }
    
    sql += ' GROUP BY po.id ORDER BY po.created_at DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }
    
    return await db.query(sql, params);
  }

  // Get purchase order by ID with items
  static async findById(id) {
    // Get PO details
    const poSql = `
      SELECT po.*, s.name as supplier_name, s.contact_person, s.phone, s.email, s.address,
             u.username as created_by_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?
    `;
    
    const po = await db.queryOne(poSql, [id]);
    if (!po) throw new Error(`Purchase order with ID ${id} not found`);
    
    // Get PO items
    const itemsSql = `
      SELECT 
        poi.*,
        i.name as ingredient_name,
        i.unit,
        i.current_stock,
        (poi.quantity * poi.unit_price) as item_total,
        (poi.received_quantity * poi.unit_price) as received_total
      FROM purchase_order_items poi
      LEFT JOIN ingredients i ON poi.ingredient_id = i.id
      WHERE poi.purchase_order_id = ?
      ORDER BY i.name
    `;
    
    const items = await db.query(itemsSql, [id]);
    
    return { ...po, items };
  }

  // Create new purchase order
  static async create(purchaseOrderData, items, userId) {
    const connection = await db.beginTransaction();
    
    try {
      // Generate PO number
      const orderNumber = this.generatePONumber();
      
      // Create PO
      const poSql = `
        INSERT INTO purchase_orders 
        (supplier_id, order_number, status, expected_delivery, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const poResult = await connection.execute(poSql, [
        purchaseOrderData.supplier_id,
        orderNumber,
        'pending',
        purchaseOrderData.expected_delivery || null,
        purchaseOrderData.notes || '',
        userId
      ]);
      
      const poId = poResult.insertId;
      let totalAmount = 0;
      
      // Add PO items
      for (const item of items) {
        const itemSql = `
          INSERT INTO purchase_order_items 
          (purchase_order_id, ingredient_id, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
        totalAmount += itemTotal;
        
        await connection.execute(itemSql, [
          poId,
          item.ingredient_id,
          item.quantity,
          item.unit_price,
          itemTotal
        ]);
      }
      
      // Update PO total amount
      await connection.execute(
        'UPDATE purchase_orders SET total_amount = ? WHERE id = ?',
        [totalAmount, poId]
      );
      
      await connection.commit();
      
      return await this.findById(poId);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  // Update purchase order status
  static async updateStatus(id, status, userId = null) {
    const connection = await db.beginTransaction();
    
    try {
      const currentPo = await this.findById(id);
      
      // Update PO status
      let updateSql = 'UPDATE purchase_orders SET status = ?';
      const params = [status, id];
      
      if (status === 'received') {
        updateSql += ', received_date = CURDATE()';
      }
      
      updateSql += ' WHERE id = ?';
      
      await connection.execute(updateSql, params);
      
      // If status is 'received', update ingredient stock
      if (status === 'received') {
        const itemsSql = 'SELECT * FROM purchase_order_items WHERE purchase_order_id = ?';
        const items = await connection.query(itemsSql, [id]);
        
        for (const item of items) {
          // Update received quantity
          await connection.execute(
            'UPDATE purchase_order_items SET received_quantity = quantity WHERE id = ?',
            [item.id]
          );
          
          // Update ingredient stock
          const ingredientSql = `
            UPDATE ingredients 
            SET current_stock = current_stock + ?, updated_at = NOW() 
            WHERE id = ?
          `;
          
          await connection.execute(ingredientSql, [item.quantity, item.ingredient_id]);
          
          // Record stock transaction
          const transactionSql = `
            INSERT INTO stock_transactions 
            (ingredient_id, transaction_type, quantity, previous_stock, new_stock, 
             reference_id, reference_type, notes, user_id) 
            VALUES (?, 'purchase', ?, 
                    (SELECT current_stock - ? FROM ingredients WHERE id = ?), 
                    (SELECT current_stock FROM ingredients WHERE id = ?), 
                    ?, 'purchase', ?, ?)
          `;
          
          await connection.execute(transactionSql, [
            item.ingredient_id,
            item.quantity,
            item.quantity,
            item.ingredient_id,
            item.ingredient_id,
            id,
            `Purchase Order #${currentPo.order_number}`,
            userId
          ]);
        }
      }
      
      await connection.commit();
      
      return await this.findById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  // Receive partial shipment
  static async receivePartialShipment(poId, items, userId) {
    const connection = await db.beginTransaction();
    
    try {
      for (const item of items) {
        // Update received quantity
        await connection.execute(
          'UPDATE purchase_order_items SET received_quantity = received_quantity + ? WHERE id = ? AND purchase_order_id = ?',
          [item.received_quantity, item.item_id, poId]
        );
        
        // Update ingredient stock
        await connection.execute(
          'UPDATE ingredients SET current_stock = current_stock + ?, updated_at = NOW() WHERE id = ?',
          [item.received_quantity, item.ingredient_id]
        );
        
        // Record stock transaction
        await connection.execute(
          `INSERT INTO stock_transactions 
           (ingredient_id, transaction_type, quantity, reference_id, reference_type, notes, user_id) 
           VALUES (?, 'purchase', ?, ?, 'purchase', 'Partial receipt', ?)`,
          [item.ingredient_id, item.received_quantity, poId, userId]
        );
      }
      
      // Check if all items are fully received
      const po = await this.findById(poId);
      const allReceived = po.items.every(item => 
        parseFloat(item.received_quantity) >= parseFloat(item.quantity)
      );
      
      if (allReceived) {
        await connection.execute(
          'UPDATE purchase_orders SET status = "received", received_date = CURDATE() WHERE id = ?',
          [poId]
        );
      } else {
        await connection.execute(
          'UPDATE purchase_orders SET status = "ordered" WHERE id = ?',
          [poId]
        );
      }
      
      await connection.commit();
      
      return await this.findById(poId);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  // Get pending purchase orders
  static async getPendingOrders() {
    const sql = `
      SELECT po.*, s.name as supplier_name, s.contact_person, s.phone
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.status IN ('pending', 'ordered')
        AND (po.expected_delivery IS NULL OR po.expected_delivery <= DATE_ADD(CURDATE(), INTERVAL 3 DAY))
      ORDER BY po.expected_delivery ASC, po.created_at ASC
    `;
    
    return await db.query(sql);
  }

  // Get purchase order statistics
  static async getStatistics(timeframe = 'month') {
    let dateFilter = '';
    switch (timeframe) {
      case 'week': dateFilter = 'AND po.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)'; break;
      case 'month': dateFilter = 'AND po.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)'; break;
      case 'quarter': dateFilter = 'AND po.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)'; break;
      case 'year': dateFilter = 'AND po.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)'; break;
    }
    
    const sql = `
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_value,
        AVG(total_amount) as avg_order_value,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'ordered' THEN 1 END) as ordered_count,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        GROUP_CONCAT(DISTINCT s.name) as suppliers
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE 1=1 ${dateFilter}
    `;
    
    return await db.queryOne(sql);
  }
}

module.exports = PurchaseOrder;