require('dotenv').config();
const mysql = require('mysql2/promise');

async function seedInventory() {
  console.log('🌱 Starting inventory seed (INSERT ONLY)...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restaurant_erp',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true
  });

  try {
    console.log('✅ Connected to database');
    
    // ========== 1. CLEAR EXISTING DATA ==========
    console.log('🗑️  Clearing existing inventory data...');
    await connection.query('DELETE FROM purchase_order_items');
    await connection.query('DELETE FROM purchase_orders');
    await connection.query('DELETE FROM stock_transactions');
    await connection.query('DELETE FROM menu_item_ingredients');
    await connection.query('DELETE FROM ingredients');
    await connection.query('DELETE FROM suppliers');
    console.log('✅ Cleared existing data\n');
    
    // ========== 2. SEED SUPPLIERS ==========
    console.log('🏢 Seeding suppliers...');
    await connection.query(`
      INSERT INTO suppliers (name, contact_person, phone, email, address, payment_terms) VALUES
      ('Ethio Food Distributors', 'Mr. Alemayehu', '+251911223344', 'alem@ethiofood.com', 'Addis Ababa, Bole', 'Net 30 Days'),
      ('Fresh Produce Co.', 'Ms. Selam', '+251922334455', 'selam@freshproduce.com', 'Addis Ababa, Merkato', 'Cash on Delivery'),
      ('Dairy Farmers Association', 'Mr. Teshome', '+251933445566', 'teshome@dairyfa.com', 'Debre Zeit', 'Net 15 Days')
    `);
    console.log('✅ 3 suppliers seeded\n');
    
    // ========== 3. SEED INGREDIENTS ==========
    console.log('🥩 Seeding ingredients...');
    await connection.query(`
      INSERT INTO ingredients (name, unit, current_stock, minimum_stock, cost_per_unit, category, supplier_id) VALUES
      ('Wheat Flour', 'kg', 100.0, 20.0, 45.50, 'Dry Goods', 1),
      ('Sugar', 'kg', 50.0, 10.0, 85.00, 'Dry Goods', 1),
      ('Butter', 'kg', 25.0, 5.0, 320.00, 'Dairy', 3),
      ('Chicken Breast', 'kg', 30.0, 8.0, 280.00, 'Meat', NULL),
      ('Beef', 'kg', 20.0, 5.0, 350.00, 'Meat', NULL),
      ('Tomatoes', 'kg', 40.0, 10.0, 45.00, 'Vegetables', 2),
      ('Onions', 'kg', 35.0, 8.0, 35.00, 'Vegetables', 2),
      ('Garlic', 'kg', 10.0, 2.0, 120.00, 'Vegetables', 2),
      ('Potatoes', 'kg', 60.0, 15.0, 25.00, 'Vegetables', NULL),
      ('Rice', 'kg', 80.0, 20.0, 65.00, 'Grains', 1),
      ('Pasta', 'kg', 45.0, 10.0, 95.00, 'Grains', 1),
      ('Cooking Oil', 'liter', 40.0, 8.0, 180.00, 'Oils', NULL),
      ('Milk', 'liter', 30.0, 6.0, 65.00, 'Dairy', 3),
      ('Eggs', 'piece', 200.0, 50.0, 8.50, 'Dairy', 3),
      ('Cheese', 'kg', 15.0, 3.0, 420.00, 'Dairy', 3),
      ('Lettuce', 'kg', 12.0, 3.0, 55.00, 'Vegetables', 2),
      ('Bread', 'piece', 100.0, 25.0, 15.00, 'Bakery', NULL),
      ('Coffee Beans', 'kg', 25.0, 5.0, 550.00, 'Beverages', NULL),
      ('Tea Leaves', 'kg', 10.0, 2.0, 380.00, 'Beverages', NULL),
      ('Salt', 'kg', 20.0, 5.0, 25.00, 'Spices', NULL),
      ('Black Pepper', 'kg', 5.0, 1.0, 680.00, 'Spices', NULL)
    `);
    console.log('✅ 21 ingredients seeded\n');
    
    // ========== 4. SEED RECIPES (Link to menu items) ==========
    console.log('🍳 Seeding recipes...');
    
    // First, let's check if menu_items table exists and has data
    const [menuItems] = await connection.query('SELECT id, name FROM menu_items ORDER BY id LIMIT 10');
    
    if (menuItems.length > 0) {
      console.log(`📋 Found ${menuItems.length} menu items, creating recipes...`);
      
      // Sample recipes for first 5 menu items
      const recipeData = [
        // Menu Item 1 (e.g., Garlic Bread)
        { menu_item_id: 1, ingredients: [
          { ingredient_id: 1, quantity: 0.15 },  // Flour
          { ingredient_id: 3, quantity: 0.08 },  // Butter
          { ingredient_id: 8, quantity: 0.02 }   // Garlic
        ]},
        // Menu Item 2 (e.g., Spaghetti)
        { menu_item_id: 2, ingredients: [
          { ingredient_id: 6, quantity: 0.20 },  // Tomatoes
          { ingredient_id: 7, quantity: 0.10 },  // Onions
          { ingredient_id: 11, quantity: 0.25 }, // Pasta
          { ingredient_id: 15, quantity: 0.05 }  // Cheese
        ]},
        // Menu Item 3 (e.g., Chicken Curry)
        { menu_item_id: 3, ingredients: [
          { ingredient_id: 4, quantity: 0.30 },  // Chicken
          { ingredient_id: 6, quantity: 0.15 },  // Tomatoes
          { ingredient_id: 7, quantity: 0.10 },  // Onions
          { ingredient_id: 12, quantity: 0.03 }  // Oil
        ]},
        // Menu Item 4 (e.g., Caesar Salad)
        { menu_item_id: 4, ingredients: [
          { ingredient_id: 16, quantity: 0.10 }, // Lettuce
          { ingredient_id: 15, quantity: 0.03 }, // Cheese
          { ingredient_id: 14, quantity: 0.50 }  // Eggs (half)
        ]},
        // Menu Item 5 (e.g., French Fries)
        { menu_item_id: 5, ingredients: [
          { ingredient_id: 9, quantity: 0.25 },  // Potatoes
          { ingredient_id: 12, quantity: 0.02 }  // Oil
        ]}
      ];
      
      for (const recipe of recipeData) {
        for (const ingredient of recipe.ingredients) {
          await connection.query(
            'INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, quantity_required) VALUES (?, ?, ?)',
            [recipe.menu_item_id, ingredient.ingredient_id, ingredient.quantity]
          );
        }
      }
      console.log(`✅ Recipes created for ${recipeData.length} menu items\n`);
    } else {
      console.log('⚠️  No menu items found. Please run menu seed first.\n');
    }
    
    // ========== 5. SEED SAMPLE STOCK TRANSACTIONS ==========
    console.log('📊 Seeding sample stock transactions...');
    
    // Create some sample transactions for the last 7 days
    const today = new Date();
    for (let i = 0; i < 20; i++) {
      const ingredientId = Math.floor(Math.random() * 21) + 1; // Random ingredient 1-21
      const quantity = (Math.random() * 5).toFixed(3); // Random quantity 0-5
      const daysAgo = Math.floor(Math.random() * 7); // Random day in last 7 days
      const transactionDate = new Date(today);
      transactionDate.setDate(today.getDate() - daysAgo);
      
      const formattedDate = transactionDate.toISOString().slice(0, 19).replace('T', ' ');
      
      await connection.query(`
        INSERT INTO stock_transactions 
        (ingredient_id, transaction_type, quantity, previous_stock, new_stock, reference_id, reference_type, notes, created_at) 
        VALUES (?, 'usage', ?, 
                (SELECT current_stock + ? FROM ingredients WHERE id = ?), 
                (SELECT current_stock FROM ingredients WHERE id = ?), 
                ?, 'order', 'Sample transaction for testing', ?)
      `, [ingredientId, -quantity, quantity, ingredientId, ingredientId, 1000 + i, formattedDate]);
    }
    console.log('✅ 20 sample stock transactions seeded\n');
    
    // ========== 6. VERIFY DATA ==========
    console.log('🔍 Verifying seeded data...\n');
    
    const [suppliers] = await connection.query('SELECT COUNT(*) as count FROM suppliers');
    const [ingredients] = await connection.query('SELECT COUNT(*) as count FROM ingredients');
    const [recipes] = await connection.query('SELECT COUNT(*) as count FROM menu_item_ingredients');
    const [transactions] = await connection.query('SELECT COUNT(*) as count FROM stock_transactions');
    
    console.log('📊 INVENTORY DATA SUMMARY:');
    console.log('   Suppliers:', suppliers[0].count);
    console.log('   Ingredients:', ingredients[0].count);
    console.log('   Recipes:', recipes[0].count);
    console.log('   Stock Transactions:', transactions[0].count);
    
    console.log('\n🎉 INVENTORY SEED COMPLETED SUCCESSFULLY!');
    console.log('\n📋 Test the inventory with these endpoints:');
    console.log('   GET    /api/inventory/ingredients');
    console.log('   GET    /api/inventory/alerts/low-stock');
    console.log('   GET    /api/inventory/dashboard');
    console.log('   POST   /api/inventory/stock-check');
    
  } catch (error) {
    console.error('❌ Inventory seed error:', error.message);
    console.error('Error code:', error.code);
    
    // If tables don't exist, suggest running migration first
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('\n⚠️  Inventory tables not found!');
      console.log('💡 Please run the inventory migration first:');
      console.log('   node migrations/002_inventory_tables.js');
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔒 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  seedInventory();
}

module.exports = seedInventory;