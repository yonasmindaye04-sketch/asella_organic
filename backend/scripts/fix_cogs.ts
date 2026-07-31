import pool from '../src/config/db.js';

async function fixCOGS() {
  const connection = await pool.getConnection();
  try {
    console.log("Fixing COGS...");
    
    // 1. Reset all product unit_cost to 50% of selling price
    await connection.query(`UPDATE products SET unit_cost = price * 0.5`);
    console.log("Reset product unit costs to 50% margin.");

    // 2. Reset all order_items unit_cost to 50% of the unit_price they were sold at
    await connection.query(`UPDATE order_items SET unit_cost = unit_price * 0.5`);
    console.log("Reset order items unit costs to 50% margin.");

    console.log("Fix complete! Net Profit should now show exactly 50% margin across the board.");
  } catch (error) {
    console.error("Fix failed:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

fixCOGS();
