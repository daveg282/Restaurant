const db = require('../config/db');

class Supplier {
  // Get all suppliers
  static async getAll(filters = {}) {
    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.search) {
      sql += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    sql += ' ORDER BY name';
    return await db.query(sql, params);
  }

  // Get supplier by ID
  static async findById(id) {
    const sql = 'SELECT * FROM suppliers WHERE id = ?';
    const result = await db.queryOne(sql, [id]);
    if (!result) throw new Error(`Supplier with ID ${id} not found`);
    return result;
  }

  // Create new supplier
  static async create(supplierData) {
    const { name, contact_person, phone, email, address, payment_terms, status } = supplierData;
    
    const sql = `
      INSERT INTO suppliers (name, contact_person, phone, email, address, payment_terms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await db.execute(sql, [
      name, contact_person || '', phone || '', email || '', 
      address || '', payment_terms || '', status || 'active'
    ]);
    
    return { id: result.insertId, ...supplierData };
  }

  // Update supplier
  static async update(id, supplierData) {
    const fields = Object.keys(supplierData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(supplierData);
    values.push(id);
    
    const sql = `UPDATE suppliers SET ${fields} WHERE id = ?`;
    await db.execute(sql, values);
    
    return await this.findById(id);
  }

  // Delete supplier (soft delete by setting status to inactive)
  static async delete(id) {
    const sql = 'UPDATE suppliers SET status = "inactive" WHERE id = ?';
    await db.execute(sql, [id]);
    return { success: true, message: 'Supplier deactivated' };
  }

  // Get suppliers with their ingredients
  static async getWithIngredients(supplierId = null) {
    let sql = `
      SELECT 
        s.*,
        i.id as ingredient_id,
        i.name as ingredient_name,
        i.current_stock,
        i.minimum_stock,
        i.category
      FROM suppliers s
      LEFT JOIN ingredients i ON s.id = i.supplier_id
    `;
    
    const params = [];
    
    if (supplierId) {
      sql += ' WHERE s.id = ?';
      params.push(supplierId);
    }
    
    sql += ' ORDER BY s.name, i.name';
    
    const results = await db.query(sql, params);
    
    // Group ingredients by supplier
    const suppliers = {};
    results.forEach(row => {
      if (!suppliers[row.id]) {
        suppliers[row.id] = {
          id: row.id,
          name: row.name,
          contact_person: row.contact_person,
          phone: row.phone,
          email: row.email,
          address: row.address,
          payment_terms: row.payment_terms,
          status: row.status,
          ingredients: []
        };
      }
      
      if (row.ingredient_id) {
        suppliers[row.id].ingredients.push({
          id: row.ingredient_id,
          name: row.ingredient_name,
          current_stock: row.current_stock,
          minimum_stock: row.minimum_stock,
          category: row.category
        });
      }
    });
    
    return Object.values(suppliers);
  }

  // Get supplier performance report
  static async getPerformanceReport(startDate, endDate) {
    const sql = `
      SELECT 
        s.id,
        s.name,
        s.contact_person,
        s.phone,
        COUNT(DISTINCT po.id) as total_orders,
        SUM(po.total_amount) as total_spent,
        AVG(DATEDIFF(po.received_date, po.created_at)) as avg_delivery_days,
        COUNT(DISTINCT i.id) as ingredients_supplied,
        MAX(po.created_at) as last_order_date
      FROM suppliers s
      LEFT JOIN purchase_orders po ON s.id = po.supplier_id
      LEFT JOIN ingredients i ON s.id = i.supplier_id
      WHERE po.created_at BETWEEN ? AND ?
         OR po.created_at IS NULL
      GROUP BY s.id, s.name, s.contact_person, s.phone
      ORDER BY total_spent DESC
    `;
    
    return await db.query(sql, [startDate || '1970-01-01', endDate || '2030-12-31']);
  }
}

module.exports = Supplier;