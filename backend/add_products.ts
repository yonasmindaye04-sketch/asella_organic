import pool from './src/config/db';
import crypto from 'crypto';

const products = [
  {name: 'Moringa Seed', size: '500g', price: 1000},
  {name: 'Moringa Seed', size: '200g', price: 450},
  {name: 'Ashewagenda powder', size: '220g', price: 2000},
  {name: 'Ashewagenda powder', size: '250g', price: 2500},
  {name: 'Ashewagenda (Himalya) Tablet', size: '120 Tablet', price: 4500},
  {name: 'Ashewagenda (Himalya) Tablet', size: '60 Tablet', price: 2500},
  {name: 'Shilajit Gummies', size: '30 Gummies', price: 4000},
  {name: 'Shilajit Tablet', size: '60 Tablet', price: 4500},
  {name: 'Shilajit Oil', size: '30 ml', price: 5000},
  {name: 'Chia Seed', size: '250 g', price: 800},
  {name: 'Chia Seed', size: '1 kg', price: 3000},
  {name: 'Kerbe Powder', size: '100 g', price: 800},
  {name: 'Asella Kerbe Raw', size: '100 g', price: 800},
  {name: 'Kerkede Leafe', size: '100 g', price: 500},
  {name: 'Kerkede Leafe', size: '200 g', price: 1000},
  {name: 'Chebe Powder', size: '100 g', price: 1000},
  {name: 'Erde', size: '200 g', price: 450},
  {name: 'Coffee', size: '500 g', price: 800},
  {name: 'Kesil Powder', size: '200 g', price: 450},
  {name: 'Kerebe (Myrrh) Oil', size: '30 ml', price: 1500},
  {name: 'Kerebe (Myrrh) Oil', size: '60 ml', price: 2900},
  {name: 'Frankincense Oil', size: '30 ml', price: 1500},
  {name: 'Frankincense Oil', size: '60 ml', price: 2900},
  {name: 'Cloves', size: '100g', price: 400},
  {name: 'Pumpkin Seed', size: '100g', price: 250},
  {name: 'Blackseed Oil', size: '30 ml', price: 800},
  {name: 'Nila powder', size: '100g', price: 1000},
  {name: 'Asella Frankincense Raw', size: '100 g', price: 800},
  {name: 'Cinnamon', size: '100g', price: 600}
];

async function run() {
  for (const p of products) {
    // Check if it already exists roughly
    const [rows] = await pool.query('SELECT id FROM products WHERE name = ? AND package_size = ?', [p.name, p.size]) as any;
    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO products (id, name, package_size, price, description, active) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), p.name, p.size, p.price, 'Premium organic supplement.', true]
      );
    }
  }
  console.log('Products added');
  process.exit(0);
}
run();
