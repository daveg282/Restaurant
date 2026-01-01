const Table = require('../models/Table');
const Pager = require('../models/Pager');

class TableController {
  // Get all tables
  static async getTables(req, res) {
    try {
      const filters = {
        status: req.query.status,
        section: req.query.section,
        min_capacity: req.query.min_capacity ? parseInt(req.query.min_capacity) : null
      };
      
      const tables = await Table.getAll(filters);
      
      res.json({
        success: true,
        tables,
        count: tables.length
      });
    } catch (error) {
      console.error('Get tables error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting tables'
      });
    }
  }

  // Get available tables
  static async getAvailableTables(req, res) {
    try {
      const customerCount = req.query.customer_count ? parseInt(req.query.customer_count) : null;
      const tables = await Table.getAvailable(customerCount);
      
      res.json({
        success: true,
        tables,
        count: tables.length,
        customer_count: customerCount
      });
    } catch (error) {
      console.error('Get available tables error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting available tables'
      });
    }
  }

  // Get single table
  static async getTable(req, res) {
    try {
      const { id } = req.params;
      const table = await Table.findById(id);
      
      if (!table) {
        return res.status(404).json({
          success: false,
          error: 'Table not found'
        });
      }
      
      res.json({
        success: true,
        table
      });
    } catch (error) {
      console.error('Get table error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting table'
      });
    }
  }

  // Create table (admin/manager only)
  static async createTable(req, res) {
    try {
      const tableData = req.body;
      
      // Validation
      if (!tableData.table_number) {
        return res.status(400).json({
          success: false,
          error: 'Table number is required'
        });
      }
      
      const table = await Table.create(tableData);
      
      res.status(201).json({
        success: true,
        message: 'Table created successfully',
        table
      });
    } catch (error) {
      console.error('Create table error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error creating table'
      });
    }
  }

  // Update table (admin/manager only)
  static async updateTable(req, res) {
    try {
      const { id } = req.params;
      const tableData = req.body;
      
      const table = await Table.findById(id);
      if (!table) {
        return res.status(404).json({
          success: false,
          error: 'Table not found'
        });
      }
      
      const updatedTable = await Table.update(id, tableData);
      
      res.json({
        success: true,
        message: 'Table updated successfully',
        table: updatedTable
      });
    } catch (error) {
      console.error('Update table error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating table'
      });
    }
  }

  // Delete table (admin only)
  static async deleteTable(req, res) {
    try {
      const { id } = req.params;
      
      const table = await Table.findById(id);
      if (!table) {
        return res.status(404).json({
          success: false,
          error: 'Table not found'
        });
      }
      
      await Table.delete(id);
      
      res.json({
        success: true,
        message: 'Table deleted successfully'
      });
    } catch (error) {
      console.error('Delete table error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error deleting table'
      });
    }
  }

  // Occupy table (waiter/cashier)
  static async occupyTable(req, res) {
    try {
      const { id } = req.params;
      const { customer_count } = req.body;
      
      if (!customer_count || customer_count < 1) {
        return res.status(400).json({
          success: false,
          error: 'Customer count is required and must be at least 1'
        });
      }
      
      const result = await Table.occupy(id, customer_count);
      
      res.json({
        success: true,
        message: result.message,
        table: result.table
      });
    } catch (error) {
      console.error('Occupy table error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Server error occupying table'
      });
    }
  }

  // Free table (waiter/cashier)
  static async freeTable(req, res) {
    try {
      const { id } = req.params;
      
      const result = await Table.free(id);
      
      res.json({
        success: true,
        message: result.message,
        table: result.table
      });
    } catch (error) {
      console.error('Free table error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Server error freeing table'
      });
    }
  }

  // Reserve table
  static async reserveTable(req, res) {
    try {
      const { id } = req.params;
      const { customer_count } = req.body;
      
      if (!customer_count || customer_count < 1) {
        return res.status(400).json({
          success: false,
          error: 'Customer count is required and must be at least 1'
        });
      }
      
      const result = await Table.reserve(id, customer_count);
      
      res.json({
        success: true,
        message: result.message,
        table: result.table
      });
    } catch (error) {
      console.error('Reserve table error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Server error reserving table'
      });
    }
  }

  // Update table status directly
  static async updateTableStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, customer_count } = req.body;
      
      if (!status || !['available', 'occupied', 'reserved'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Valid status (available, occupied, reserved) is required'
        });
      }
      
      const result = await Table.updateStatus(id, status, customer_count || 0);
      
      res.json({
        success: true,
        message: result.message,
        table: result.table
      });
    } catch (error) {
      console.error('Update table status error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating table status'
      });
    }
  }

  // Get table statistics
  static async getTableStats(req, res) {
    try {
      const stats = await Table.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get table stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting table stats'
      });
    }
  }

  // Search tables
  static async searchTables(req, res) {
    try {
      const { q } = req.query;
      
      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters'
        });
      }
      
      const tables = await Table.search(q);
      
      res.json({
        success: true,
        tables,
        count: tables.length,
        query: q
      });
    } catch (error) {
      console.error('Search tables error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error searching tables'
      });
    }
  }

  // ========== PAGER METHODS ==========

  // Get all pagers
  static async getPagers(req, res) {
    try {
      const filters = {
        status: req.query.status
      };
      
      const pagers = await Pager.getAll(filters);
      
      res.json({
        success: true,
        pagers,
        count: pagers.length
      });
    } catch (error) {
      console.error('Get pagers error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting pagers'
      });
    }
  }

  // Get available pager
  static async getAvailablePager(req, res) {
    try {
      const pager = await Pager.getAvailable();
      
      if (!pager) {
        return res.status(404).json({
          success: false,
          error: 'No available pagers'
        });
      }
      
      res.json({
        success: true,
        pager,
        message: `Pager #${pager.pager_number} is available`
      });
    } catch (error) {
      console.error('Get available pager error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting available pager'
      });
    }
  }

  // Assign pager to order
  static async assignPager(req, res) {
    try {
      const { pager_number } = req.params;
      const { order_id } = req.body;
      
      if (!order_id) {
        return res.status(400).json({
          success: false,
          error: 'Order ID is required'
        });
      }
      
      const pager = await Pager.assignToOrder(pager_number, order_id);
      
      res.json({
        success: true,
        message: `Pager #${pager_number} assigned to order ${order_id}`,
        pager
      });
    } catch (error) {
      console.error('Assign pager error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Server error assigning pager'
      });
    }
  }

  // Activate pager (when order is ready)
  static async activatePager(req, res) {
    try {
      const { pager_number } = req.params;
      
      const pager = await Pager.activate(pager_number);
      
      res.json({
        success: true,
        message: `Pager #${pager_number} activated`,
        pager
      });
    } catch (error) {
      console.error('Activate pager error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Server error activating pager'
      });
    }
  }

  // Release pager
  static async releasePager(req, res) {
    try {
      const { pager_number } = req.params;
      
      const result = await Pager.release(pager_number);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Release pager error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error releasing pager'
      });
    }
  }

  // Buzz pager
  static async buzzPager(req, res) {
    try {
      const { pager_number } = req.params;
      
      const result = await Pager.buzz(pager_number);
      
      res.json({
        success: true,
        message: result.message,
        pager_number: result.pager_number,
        order_id: result.order_id
      });
    } catch (error) {
      console.error('Buzz pager error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Server error buzzing pager'
      });
    }
  }

  // Get pager statistics
  static async getPagerStats(req, res) {
    try {
      const stats = await Pager.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get pager stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting pager stats'
      });
    }
  }
}

module.exports = TableController;