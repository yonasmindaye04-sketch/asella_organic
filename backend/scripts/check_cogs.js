import pool from '../src/config/db.js';

async function main() {
  const [products] = await pool.query(`SELECT id, name, price, unit_cost FROM products WHERE unit_cost > 0`);
  console.log("PRODUCTS:");
  console.table(products);

  const [orderItems] = await pool.query(`SELECT item_name, quantity, unit_price, unit_cost FROM order_items`);
  console.log("ORDER ITEMS:");
  console.table(orderItems);

  process.exit(0);
}
main();
