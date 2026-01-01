const db = require('../config/db');

class PurchaseOrderItem {
  // Get all items for a purchase order
  static async getByPurchaseOrder(poId) {
    const sql = `
      SELECT 
        poi.*,
        i.name as ingredient_name,
        i.unit,
        i.current_stock,
        i.minimum_stock,
        s.name as supplier_name,
        (poi.quantity - poi.received_quantity) as pending_quantity
      FROM purchase_order_items poi
      JOIN ingredients i ON poi.ingredient_id = i.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE poi.purchase_order_id = ?
      ORDER BY i.name
    `;
    
    return await db.query(sql, [poId]);
  }

  // Add item to purchase order
  static async addToPurchaseOrder(poId, itemData) {
    const connection = await db.beginTransaction();
    
    try {
      // Check if PO exists and is editable
      const poSql = 'SELECT status FROM purchase_orders WHERE id = ?';
      const po = await connection.queryOne(poSql, [poId]);
      
      if (!po) throw new Error(`Purchase order with ID ${poId} not found`);
      if (po.status === 'received' || po.status === 'cancelled') {
        throw new Error(`Cannot add items to a ${po.status} purchase order`);
      }
      
      // Check if item already exists in PO
      const existingSql = 'SELECT id FROM purchase_order_items WHERE purchase_order_id = ? AND ingredient_id = ?';
      const existing = await connection.queryOne(existingSql, [poId, itemData.ingredient_id]);
      
      if (existing) {
        // Update existing item
        const updateSql = `
          UPDATE purchase_order_items 
          SET quantity = quantity + ?, 
              unit_price = ?, 
              total_price = total_price + (? * ?)
          WHERE id = ?
        `;
        
        await connection.execute(updateSql, [
          itemData.quantity,
          itemData.unit_price,
          itemData.quantity,
          itemData.unit_price,
          existing.id
        ]);
      } else {
        // Add new item
        const insertSql = `
          INSERT INTO purchase_order_items 
          (purchase_order_id, ingredient_id, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        const itemTotal = parseFloat(itemData.quantity) * parseFloat(itemData.unit_price);
        
        await connection.execute(insertSql, [
          poId,
          itemData.ingredient_id,
          itemData.quantity,
          itemData.unit_price,
          itemTotal
        ]);
      }
      
      // Update PO total amount
      const updatePoSql = `
        UPDATE purchase_orders 
        SET total_amount = (
          SELECT SUM(total_price) 
          FROM purchase_order_items 
          WHERE purchase_order_id = ?
        )
        WHERE id = ?
      `;
      
      await connection.execute(updatePoSql, [poId, poId]);
      
      await connection.commit();
      
      return await this.getByPurchaseOrder(poId);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  // Remove item from purchase order
  static async removeFromPurchaseOrder(poId, itemId) {
    const connection = await db.beginTransaction();
    
    try {
      // Check if PO exists and is editable
      const poSql = 'SELECT status FROM purchase_orders WHERE id = ?';
      const po = await connection.queryOne(poSql, [poId]);
      
      if (!po) throw new Error(`Purchase order with ID ${poId} not found`);
      if (po.status === 'received' || po.status === 'cancelled') {
        throw new Error(`Cannot remove items from a ${po.status} purchase order`);
      }
      
      // Remove item
      await connection.execute(
        'DELETE FROM purchase_order_items WHERE id = ? AND purchase_order_id = ?',
        [itemId, poId]
      );
      
      // Update PO total amount
      await connection.execute(
        `UPDATE purchase_orders 
         SET total_amount = (
           SELECT COALESCE(SUM(total_price), 0) 
           FROM purchase_order_items 
           WHERE purchase_order_id = ?
         )
         WHERE id = ?`,
        [poId, poId]
      );
      
      await connection.commit();
      
      return { success: true, message: 'Item removed from purchase order' };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  // Update item quantity
  static async updateItemQuantity(itemId, quantity) {
    const connection = await db.beginTransaction();
    
    try {
      // Get current item details
      const itemSql = 'SELECT * FROM purchase_order_items WHERE id = ?';
      const item = await connection.queryOne(itemSql, [itemId]);
      
      if (!item) throw new Error(`Purchase order item with ID ${itemId} not found`);
      
      // Check if PO is editable
      const poSql = 'SELECT status FROM purchase_orders WHERE id = ?';
      const po = await connection.queryOne(poSql, [item.purchase_order_id]);
      
      if (po.status === 'received' || po.status === 'cancelled') {
        throw new Error(`Cannot update items in a ${po.status} purchase order`);
      }
      
      // Update item quantity and total price
      const newTotal = parseFloat(quantity) * parseFloat(item.unit_price);
      
      await connection.execute(
        'UPDATE purchase_order_items SET quantity = ?, total_price = ? WHERE id = ?',
        [quantity, newTotal, itemId]
      );
      
      // Update PO total amount
      await connection.execute(
        `UPDATE purchase_orders 
         SET total_amount = (
           SELECT SUM(total_price) 
           FROM purchase_order_items 
           WHERE purchase_order_id = ?
         )
         WHERE id = ?`,
        [item.purchase_order_id, item.purchase_order_id]
      );
      
      await connection.commit();
      
      return await this.getByPurchaseOrder(item.purchase_order_id);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  // Get items needed for low stock
  static async getItemsForLowStock(supplierId = null) {
    let sql = `
      SELECT 
        i.id as ingredient_id,
        i.name as ingredient_name,
        i.unit,
        i.current_stock,
        i.minimum_stock,
        i.cost_per_unit,
        (i.minimum_stock - i.current_stock) as quantity_needed,
        s.id as supplier_id,
        s.name as supplier_name,
        s.contact_person,
        s.phone,
        IFNULL(poi.avg_price, i.cost_per_unit * 1.1) as suggested_price
      FROM ingredients i
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      LEFT JOIN (
        SELECT ingredient_id, AVG(unit_price) as avg_price
        FROM purchase_order_items
        GROUP BY ingredient_id
      ) poi ON i.id = poi.ingredient_id
      WHERE i.current_stock <= i.minimum_stock
        AND i.current_stock > 0
        AND (i.minimum_stock - i.current_stock) > 0
    `;
    
    const params = [];
    
    if (supplierId) {
      sql += ' AND s.id = ?';
      params.push(supplierId);
    }
    
    sql += ' ORDER BY s.name, i.name';
    
    return await db.query(sql, params);
  }
}

module.exports = PurchaseOrderItem;