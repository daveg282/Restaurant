const db = require('../config/db');

class OrderItem {
  // Get order items by order ID
  static async findByOrderId(orderId) {
    try {
      const sql = `
        SELECT oi.*, mi.name, mi.description, mi.image, 
               mi.preparation_time, c.name as category_name
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN categories c ON mi.category_id = c.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `;
      return await db.query(sql, [orderId]);
    } catch (error) {
      throw new Error(`Error getting order items: ${error.message}`);
    }
  }

  // Get order item by ID
  static async findById(id) {
    try {
      const sql = `
        SELECT oi.*, mi.name, mi.description
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.id = ?
      `;
      return await db.queryOne(sql, [id]);
    } catch (error) {
      throw new Error(`Error finding order item: ${error.message}`);
    }
  }

  // Create order item
  static async create(orderId, itemData) {
    try {
      const sql = `
        INSERT INTO order_items 
        (order_id, menu_item_id, quantity, price, special_instructions) 
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const params = [
        orderId,
        itemData.menu_item_id,
        itemData.quantity || 1,
        itemData.price,
        itemData.special_instructions || ''
      ];
      
      const result = await db.execute(sql, params);
      
      return {
        id: result.insertId,
        order_id: orderId,
        ...itemData
      };
    } catch (error) {
      throw new Error(`Error creating order item: ${error.message}`);
    }
  }

  // Update order item
  static async update(id, itemData) {
    try {
      const updates = [];
      const params = [];
      
      if (itemData.quantity !== undefined) {
        updates.push('quantity = ?');
        params.push(itemData.quantity);
      }
      if (itemData.price !== undefined) {
        updates.push('price = ?');
        params.push(itemData.price);
      }
      if (itemData.special_instructions !== undefined) {
        updates.push('special_instructions = ?');
        params.push(itemData.special_instructions);
      }
      if (itemData.status !== undefined) {
        updates.push('status = ?');
        params.push(itemData.status);
      }
      
      if (updates.length === 0) {
        return { message: 'No updates provided' };
      }
      
      params.push(id);
      const sql = `UPDATE order_items SET ${updates.join(', ')} WHERE id = ?`;
      
      await db.execute(sql, params);
      
      return await this.findById(id);
    } catch (error) {
      throw new Error(`Error updating order item: ${error.message}`);
    }
  }

  // Delete order item
  static async delete(id) {
    try {
      // Get the item first to get order ID
      const item = await this.findById(id);
      if (!item) {
        return { message: 'Order item not found' };
      }
      
      const sql = 'DELETE FROM order_items WHERE id = ?';
      await db.execute(sql, [id]);
      
      return { 
        message: 'Order item deleted successfully',
        order_id: item.order_id
      };
    } catch (error) {
      throw new Error(`Error deleting order item: ${error.message}`);
    }
  }

  // Update item status (for kitchen)
  static async updateStatus(id, status) {
    try {
      const sql = 'UPDATE order_items SET status = ? WHERE id = ?';
      await db.execute(sql, [status, id]);
      
      const item = await this.findById(id);
      return { 
        message: `Item status updated to ${status}`,
        item
      };
    } catch (error) {
      throw new Error(`Error updating item status: ${error.message}`);
    }
  }

  // Get items by status (for kitchen display)
  static async getByStatus(status) {
    try {
      const sql = `
        SELECT oi.*, mi.name, o.order_number, o.table_id, t.table_number
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN orders o ON oi.order_id = o.id
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE oi.status = ?
        ORDER BY oi.created_at
      `;
      return await db.query(sql, [status]);
    } catch (error) {
      throw new Error(`Error getting items by status: ${error.message}`);
    }
  }

  // Get items being prepared
  static async getPreparingItems() {
    try {
      const sql = `
        SELECT oi.*, mi.name, o.order_number, t.table_number
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN orders o ON oi.order_id = o.id
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE oi.status IN ('pending', 'preparing')
        AND o.status NOT IN ('completed', 'cancelled')
        ORDER BY oi.created_at
      `;
      return await db.query(sql);
    } catch (error) {
      throw new Error(`Error getting preparing items: ${error.message}`);
    }
  }

  // Get popular menu items from orders
  static async getPopularItems(limit = 10) {
    try {
      const sql = `
        SELECT 
          mi.id,
          mi.name,
          mi.price,
          COUNT(oi.id) as order_count,
          SUM(oi.quantity) as total_quantity
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY mi.id, mi.name, mi.price
        ORDER BY total_quantity DESC
        LIMIT ?
      `;
      return await db.query(sql, [limit]);
    } catch (error) {
      throw new Error(`Error getting popular items: ${error.message}`);
    }
  }

  // Get order item statistics
  static async getStats(orderId = null) {
    try {
      let sql = `
        SELECT 
          COUNT(*) as total_items,
          SUM(quantity) as total_quantity,
          SUM(price * quantity) as total_value,
          AVG(price) as average_price,
          MIN(price) as min_price,
          MAX(price) as max_price
        FROM order_items
      `;
      
      const params = [];
      
      if (orderId) {
        sql += ' WHERE order_id = ?';
        params.push(orderId);
      }
      
      return await db.queryOne(sql, params);
    } catch (error) {
      throw new Error(`Error getting order item stats: ${error.message}`);
    }
  }
}

module.exports = OrderItem;