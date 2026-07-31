import pool from '../src/config/db.js';

async function migrateCOGS() {
  const connection = await pool.getConnection();
  try {
    console.log("Starting COGS migration...");
    
    // 1. Fetch all products
    const [products] = await connection.query(`SELECT id, price, unit_cost FROM products`) as [any[], any];
    console.log(`Found ${products.length} products.`);

    for (const prod of products) {
      if (Number(prod.unit_cost) === 0) {
        // Try to find the most recent vendor purchase for this product
        const [voRows] = await connection.query(
          `SELECT price, amount FROM vendor_orders WHERE product_id = ? AND status = 'received' ORDER BY created_at DESC LIMIT 1`,
          [prod.id]
        ) as [any[], any];

        let newUnitCost = 0;
        if (voRows.length > 0) {
          const vo = voRows[0];
          const parsedQty = parseInt(String(vo.amount).replace(/\\D/g, ""), 10);
          if (parsedQty && parsedQty > 0) {
            newUnitCost = Number(vo.price) / parsedQty;
          }
        }

        // Fallback: 50% of selling price
        if (newUnitCost === 0) {
          newUnitCost = Number(prod.price) * 0.5;
        }

        console.log(`Setting unit_cost of product ${prod.id} to ${newUnitCost.toFixed(2)}`);
        await connection.query(`UPDATE products SET unit_cost = ? WHERE id = ?`, [newUnitCost, prod.id]);
        
        // Update all order_items for this product that have 0 unit cost
        await connection.query(
          `UPDATE order_items 
           SET unit_cost = ? 
           WHERE product_id = ? OR (item_name = (SELECT name FROM products WHERE id = ?) AND package_size = (SELECT package_size FROM products WHERE id = ?)) AND unit_cost = 0`,
          [newUnitCost, prod.id, prod.id, prod.id]
        );
      }
    }

    // 2. Fallback for any order_items that didn't match a product ID (e.g. custom items)
    await connection.query(
      `UPDATE order_items SET unit_cost = unit_price * 0.5 WHERE unit_cost = 0`
    );

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrateCOGS();
