const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseOrderItem = require('../models/PurchaseOrderItem');

class PurchaseOrderController {
  // Get all purchase orders
  static async getPurchaseOrders(req, res) {
    try {
      const { status, supplier_id, start_date, end_date, limit } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (supplier_id) filters.supplier_id = supplier_id;
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (limit) filters.limit = limit;
      
      const purchaseOrders = await PurchaseOrder.getAll(filters);
      
      res.json({
        success: true,
        data: purchaseOrders,
        count: purchaseOrders.length
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get purchase order by ID
  static async getPurchaseOrder(req, res) {
    try {
      const { id } = req.params;
      const purchaseOrder = await PurchaseOrder.findById(id);
      
      res.json({
        success: true,
        data: purchaseOrder
      });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  }

  // Create new purchase order
  static async createPurchaseOrder(req, res) {
    try {
      const { supplier_id, expected_delivery, notes, items } = req.body;
      const userId = req.user.id;
      
      // Validate required fields
      if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'supplier_id and items array are required' 
        });
      }
      
      // Validate each item
      for (const item of items) {
        if (!item.ingredient_id || !item.quantity || !item.unit_price) {
          return res.status(400).json({ 
            success: false, 
            error: 'Each item must have ingredient_id, quantity, and unit_price' 
          });
        }
      }
      
      const purchaseOrderData = { supplier_id, expected_delivery, notes };
      const purchaseOrder = await PurchaseOrder.create(purchaseOrderData, items, userId);
      
      res.status(201).json({
        success: true,
        message: 'Purchase order created successfully',
        data: purchaseOrder
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update purchase order status
  static async updatePurchaseOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.id;
      
      if (!status) {
        return res.status(400).json({ 
          success: false, 
          error: 'status is required' 
        });
      }
      
      const validStatuses = ['pending', 'ordered', 'received', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: `Status must be one of: ${validStatuses.join(', ')}` 
        });
      }
      
      const purchaseOrder = await PurchaseOrder.updateStatus(id, status, userId);
      
      res.json({
        success: true,
        message: `Purchase order status updated to ${status}`,
        data: purchaseOrder
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add item to purchase order
  static async addItemToPurchaseOrder(req, res) {
    try {
      const { id } = req.params;
      const itemData = req.body;
      
      if (!itemData.ingredient_id || !itemData.quantity || !itemData.unit_price) {
        return res.status(400).json({ 
          success: false, 
          error: 'ingredient_id, quantity, and unit_price are required' 
        });
      }
      
      const items = await PurchaseOrderItem.addToPurchaseOrder(id, itemData);
      
      res.json({
        success: true,
        message: 'Item added to purchase order',
        data: items
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Remove item from purchase order
  static async removeItemFromPurchaseOrder(req, res) {
    try {
      const { id, item_id } = req.params;
      
      const result = await PurchaseOrderItem.removeFromPurchaseOrder(id, item_id);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Receive partial shipment
  static async receivePartialShipment(req, res) {
    try {
      const { id } = req.params;
      const { items } = req.body;
      const userId = req.user.id;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'items array is required' 
        });
      }
      
      // Validate each item
      for (const item of items) {
        if (!item.item_id || !item.received_quantity || !item.ingredient_id) {
          return res.status(400).json({ 
            success: false, 
            error: 'Each item must have item_id, received_quantity, and ingredient_id' 
          });
        }
      }
      
      const purchaseOrder = await PurchaseOrder.receivePartialShipment(id, items, userId);
      
      res.json({
        success: true,
        message: 'Partial shipment received',
        data: purchaseOrder
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get pending purchase orders
  static async getPendingPurchaseOrders(req, res) {
    try {
      const pendingOrders = await PurchaseOrder.getPendingOrders();
      
      res.json({
        success: true,
        data: pendingOrders,
        count: pendingOrders.length
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get purchase order statistics
  static async getPurchaseOrderStatistics(req, res) {
    try {
      const { timeframe } = req.query;
      const statistics = await PurchaseOrder.getStatistics(timeframe || 'month');
      
      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get items needed for low stock (suggested purchase)
  static async getSuggestedPurchases(req, res) {
    try {
      const { supplier_id } = req.query;
      const suggestedItems = await PurchaseOrderItem.getItemsForLowStock(supplier_id || null);
      
      // Group by supplier
      const groupedBySupplier = suggestedItems.reduce((acc, item) => {
        const supplierKey = item.supplier_id || 'no_supplier';
        if (!acc[supplierKey]) {
          acc[supplierKey] = {
            supplier_id: item.supplier_id,
            supplier_name: item.supplier_name || 'No Supplier Assigned',
            contact_person: item.contact_person,
            phone: item.phone,
            items: [],
            total_estimated_cost: 0
          };
        }
        
        const itemCost = item.quantity_needed * item.suggested_price;
        acc[supplierKey].items.push({
          ingredient_id: item.ingredient_id,
          ingredient_name: item.ingredient_name,
          unit: item.unit,
          current_stock: item.current_stock,
          minimum_stock: item.minimum_stock,
          quantity_needed: item.quantity_needed,
          suggested_price: item.suggested_price,
          estimated_cost: itemCost
        });
        
        acc[supplierKey].total_estimated_cost += itemCost;
        
        return acc;
      }, {});
      
      res.json({
        success: true,
        data: {
          suggested_items: suggestedItems,
          grouped_by_supplier: Object.values(groupedBySupplier),
          total_items: suggestedItems.length,
          total_suppliers: Object.keys(groupedBySupplier).length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = PurchaseOrderController;