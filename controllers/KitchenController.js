const Order = require('../models/order');

class KitchenController {
  // Get all orders for kitchen display
  static async getKitchenOrders(req, res) {
    try {
      const orders = await Order.getKitchenOrders();
      res.json({ success: true, orders, count: orders.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update item status
  static async updateItemStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const validStatuses = ['pending', 'preparing', 'ready', 'served'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Valid status required: ${validStatuses.join(', ')}`
        });
      }
      
      const result = await Order.updateItemStatus(id, status);
      res.json({ success: true, message: result.message });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get urgent orders
  static async getUrgentOrders(req, res) {
    try {
      const orders = await Order.getUrgentOrders();
      res.json({ success: true, orders, urgent_count: orders.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Mark all items in order as ready
  static async markOrderReady(req, res) {
    try {
      const { id } = req.params;
      const result = await Order.markOrderReady(id);
      res.json({ success: true, message: result.message });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get orders by station
  static async getOrdersByStation(req, res) {
    try {
      const { station } = req.params;
      const orders = await Order.getOrdersByStation(station);
      res.json({ success: true, station, orders, count: orders.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Kitchen statistics
  static async getKitchenStats(req, res) {
    try {
      const stats = await Order.getKitchenStats();
      res.json({
        success: true,
        stats,
        date: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
  static async updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'preparing', 'ready', 'completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Valid status required: ${validStatuses.join(', ')}`
      });
    }
    
    const result = await Order.updateOrderStatus(id, status);
    
    res.json({ 
      success: true, 
      message: result.message,
      order_id: id,
      status: status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
}

module.exports = KitchenController;