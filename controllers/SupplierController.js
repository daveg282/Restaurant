const Supplier = require('../models/Supplier');

class SupplierController {
  // Get all suppliers
  static async getSuppliers(req, res) {
    try {
      const { status, search } = req.query;
      const filters = {};
      
      if (status) filters.status = status;
      if (search) filters.search = search;
      
      const suppliers = await Supplier.getAll(filters);
      
      res.json({
        success: true,
        data: suppliers,
        count: suppliers.length
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get supplier by ID
  static async getSupplier(req, res) {
    try {
      const { id } = req.params;
      const supplier = await Supplier.findById(id);
      
      res.json({
        success: true,
        data: supplier
      });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  }

  // Create new supplier
  static async createSupplier(req, res) {
    try {
      const supplierData = req.body;
      
      // Validate required fields
      if (!supplierData.name) {
        return res.status(400).json({ 
          success: false, 
          error: 'Supplier name is required' 
        });
      }
      
      const supplier = await Supplier.create(supplierData);
      
      res.status(201).json({
        success: true,
        message: 'Supplier created successfully',
        data: supplier
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update supplier
  static async updateSupplier(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const supplier = await Supplier.update(id, updateData);
      
      res.json({
        success: true,
        message: 'Supplier updated successfully',
        data: supplier
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete supplier
  static async deleteSupplier(req, res) {
    try {
      const { id } = req.params;
      
      const result = await Supplier.delete(id);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get suppliers with their ingredients
  static async getSuppliersWithIngredients(req, res) {
    try {
      const { id } = req.params;
      const suppliers = await Supplier.getWithIngredients(id || null);
      
      res.json({
        success: true,
        data: suppliers,
        count: suppliers.length
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get supplier performance report
  static async getSupplierPerformance(req, res) {
    try {
      const { start_date, end_date } = req.query;
      
      const performance = await Supplier.getPerformanceReport(start_date, end_date);
      
      res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = SupplierController;