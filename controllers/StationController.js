const Station = require('../models/Station');
const Category = require('../models/category');
const MenuItem = require('../models/menuItem');

class StationController {
  // Get all stations
  static async getAllStations(req, res) {
    try {
      const stations = await Station.getAll();
      res.json({
        success: true,
        stations,
        count: stations.length
      });
    } catch (error) {
      console.error('Get stations error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting stations'
      });
    }
  }

  // Get station by ID
  static async getStation(req, res) {
    try {
      const { id } = req.params;
      const station = await Station.findById(id);
      
      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
      
      // Get categories assigned to this station
      const categories = await Category.getAll();
      const assignedCategories = categories.filter(cat => cat.station_id == id);
      
      // Get menu items assigned to this station
      const menuItems = await MenuItem.getAll();
      const assignedItems = menuItems.filter(item => item.station_id == id);
      
      // Get current workload
      const workload = await Station.getWorkload(id);
      
      res.json({
        success: true,
        station: {
          ...station,
          categories: assignedCategories,
          menu_items: assignedItems,
          workload
        }
      });
    } catch (error) {
      console.error('Get station error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting station'
      });
    }
  }

  // Create station (admin/manager only)
  static async createStation(req, res) {
    try {
      const { name, description, status, color } = req.body;
      
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Station name is required'
        });
      }
      
      const station = await Station.create({
        name,
        description,
        status: status || 'active',
        color: color || '#4CAF50'
      });
      
      res.status(201).json({
        success: true,
        message: 'Station created successfully',
        station
      });
    } catch (error) {
      console.error('Create station error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error creating station'
      });
    }
  }

  // Update station (admin/manager only)
  static async updateStation(req, res) {
    try {
      const { id } = req.params;
      const stationData = req.body;
      
      const station = await Station.findById(id);
      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
      
      const updatedStation = await Station.update(id, stationData);
      
      res.json({
        success: true,
        message: 'Station updated successfully',
        station: updatedStation
      });
    } catch (error) {
      console.error('Update station error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error updating station'
      });
    }
  }

  // Delete station (admin only)
  static async deleteStation(req, res) {
    try {
      const { id } = req.params;
      
      const station = await Station.findById(id);
      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
      
      // Check permissions
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only admin can delete stations'
        });
      }
      
      await Station.delete(id);
      
      res.json({
        success: true,
        message: 'Station deleted successfully'
      });
    } catch (error) {
      console.error('Delete station error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error deleting station'
      });
    }
  }

  // Assign categories to station
  static async assignCategories(req, res) {
    try {
      const { id } = req.params;
      const { category_ids } = req.body;
      
      if (!Array.isArray(category_ids)) {
        return res.status(400).json({
          success: false,
          error: 'category_ids must be an array'
        });
      }
      
      const station = await Station.findById(id);
      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
      
      // Update each category
      const results = [];
      for (const catId of category_ids) {
        await Category.update(catId, { station_id: id });
        results.push(catId);
      }
      
      res.json({
        success: true,
        message: `Assigned ${results.length} categories to station`,
        assigned_categories: results,
        station_id: id
      });
    } catch (error) {
      console.error('Assign categories error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error assigning categories'
      });
    }
  }

  // Get station statistics
  static async getStationStats(req, res) {
    try {
      const stats = await Station.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get station stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting station stats'
      });
    }
  }

  // Get available chefs for assignment
  static async getAvailableChefs(req, res) {
    try {
      const chefs = await Station.getAvailableChefs();
      
      res.json({
        success: true,
        chefs,
        count: chefs.length
      });
    } catch (error) {
      console.error('Get available chefs error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error getting available chefs'
      });
    }
  }

  // Assign chef to station
  static async assignChef(req, res) {
    try {
      const { id } = req.params;
      const { chef_id } = req.body;
      
      if (!chef_id) {
        return res.status(400).json({
          success: false,
          error: 'Chef ID is required'
        });
      }
      
      const station = await Station.findById(id);
      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
      
      // Update station with assigned chef
      await Station.update(id, { assigned_chef_id: chef_id });
      
      const updatedStation = await Station.findById(id);
      
      res.json({
        success: true,
        message: 'Chef assigned to station successfully',
        station: updatedStation
      });
    } catch (error) {
      console.error('Assign chef error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error assigning chef'
      });
    }
  }

  // Remove chef from station
  static async removeChef(req, res) {
    try {
      const { id } = req.params;
      
      const station = await Station.findById(id);
      if (!station) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
      
      await Station.update(id, { assigned_chef_id: null });
      
      const updatedStation = await Station.findById(id);
      
      res.json({
        success: true,
        message: 'Chef removed from station',
        station: updatedStation
      });
    } catch (error) {
      console.error('Remove chef error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Server error removing chef'
      });
    }
  }
}

module.exports = StationController;