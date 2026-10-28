/**
 * src/config/mockDb.ts
 * Asella Organic — In-Memory Database Store & SQL Query Engine Fallback
 *
 * Used automatically when a live MySQL server is unreachable in the preview
 * environment. Seeded with the canonical 29-product Asella Organic catalog,
 * realistic orders, customers, staff accounts, affiliate profiles, expenses,
 * inventory movements, and SMS templates.
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";

const now = new Date();
const daysAgo = (days: number) => {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
};
const daysAgoAtHour = (days: number, hour: number, minute = 15) => {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};

// Pre-computed bcrypt hashes so module initialization is synchronous & fast
const ADMIN_HASH_1 = bcrypt.hashSync("admin123", 10);
const ADMIN_HASH_2 = bcrypt.hashSync("Admin1234!", 10);
const AFFILIATE_HASH = bcrypt.hashSync("affiliate123", 10);

export interface MockStore {
  products: any[];
  staff_users: any[];
  refresh_tokens: any[];
  session_blocklist: any[];
  customers: any[];
  orders: any[];
  order_items: any[];
  order_status_history: any[];
  customer_activity: any[];
  customer_ratings: any[];
  customer_notifications: any[];
  referral_configs: any[];
  affiliate_profiles: any[];
  affiliate_commission_rules: any[];
  commissions: any[];
  affiliate_report_logs: any[];
  affiliate_clicks: any[];
  expenses: any[];
  vendor_orders: any[];
  stock_requests: any[];
  inventory_movements: any[];
  community_videos: any[];
  site_assets: any[];
  audit_log: any[];
  idempotency_keys: any[];
  sms_templates: any[];
  sms_campaigns: any[];
  sms_messages: any[];
}

export const store: MockStore = {
  products: [
    {
      id: "11111111-0001-0001-0001-000000000001",
      name: "Moringa Seed",
      package_size: "500g",
      price: 1000,
      unit_cost: 550,
      tag: "Herbs",
      image_url: "/image/products/Moringa 200g,500g and 1kg.png",
      description: "Rich in antioxidants and nutrients that support immunity, energy, and overall wellness. Packed with essential vitamins and minerals to help support a healthy lifestyle.",
      featured: 1,
      active: 1,
      inventory_quantity: 250,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000002",
      name: "Moringa Seed",
      package_size: "200g",
      price: 450,
      unit_cost: 247.5,
      tag: "Herbs",
      image_url: "/image/products/Moringa 200g,500g and 1kg.png",
      description: "Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.",
      featured: 0,
      active: 1,
      inventory_quantity: 180,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000003",
      name: "Moringa powder",
      package_size: "500g",
      price: 1000,
      unit_cost: 550,
      tag: "Herbs",
      image_url: "/image/products/Moringa 200g,500g and 1kg.png",
      description: "Rich in antioxidants and nutrients that support immunity, energy, and overall wellness. Packed with essential vitamins and minerals to help support a healthy lifestyle.",
      featured: 1,
      active: 1,
      inventory_quantity: 95,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000004",
      name: "Moringa powder",
      package_size: "200g",
      price: 450,
      unit_cost: 247.5,
      tag: "Herbs",
      image_url: "/image/products/Moringa 200g,500g and 1kg.png",
      description: "Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.",
      featured: 0,
      active: 1,
      inventory_quantity: 20,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000031",
      name: "Moringa powder",
      package_size: "1kg",
      price: 1100,
      unit_cost: 605,
      tag: "Herbs",
      image_url: "/image/products/Moringa 200g,500g and 1kg.png",
      description: "Rich in antioxidants and nutrients that support immunity, energy, and overall wellness.",
      featured: 0,
      active: 1,
      inventory_quantity: 15,
      low_stock_threshold: 30,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000005",
      name: "Ashewagenda powder",
      package_size: "300g",
      price: 3500,
      unit_cost: 1925,
      tag: "Herbs",
      image_url: "/image/products/Ashwegdna Powder 250g.png",
      description: "Traditionally used to help reduce stress, improve focus, and support daily vitality.",
      featured: 1,
      active: 1,
      inventory_quantity: 60,
      low_stock_threshold: 15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000006",
      name: "Ashewagenda (Himalya) Tablet",
      package_size: "120 Tablet",
      price: 4500,
      unit_cost: 2475,
      tag: "Herbs",
      image_url: "/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png",
      description: "Supports a healthy stress response while promoting balance, energy, and well-being. 120 count.",
      featured: 0,
      active: 1,
      inventory_quantity: 14,
      low_stock_threshold: 15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000007",
      name: "Ashewagenda (Himalya) Tablet",
      package_size: "60 Tablet",
      price: 2500,
      unit_cost: 1375,
      tag: "Herbs",
      image_url: "/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png",
      description: "Helps maintain calmness, focus, and natural vitality throughout the day. 60 count.",
      featured: 0,
      active: 1,
      inventory_quantity: 32,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000008",
      name: "Shilajit Gummies",
      package_size: "30 Gummies",
      price: 4000,
      unit_cost: 2200,
      tag: "Superfood",
      image_url: "/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png",
      description: "Supports energy production, stamina, and mental performance with natural mineral compounds.",
      featured: 1,
      active: 1,
      inventory_quantity: 8,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000009",
      name: "Shilajit Tablet",
      package_size: "60 Tablet",
      price: 4500,
      unit_cost: 2475,
      tag: "Superfood",
      image_url: "/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png",
      description: "Traditionally valued for enhancing vitality, endurance, and overall wellness. 60 count.",
      featured: 1,
      active: 1,
      inventory_quantity: 40,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000010",
      name: "Shilajit Oil",
      package_size: "30ml",
      price: 5000,
      unit_cost: 2750,
      tag: "Oils",
      image_url: "/image/products/Shilajit Oil.png",
      description: "Provides concentrated mineral support for energy, strength, and cognitive function. 30ml.",
      featured: 0,
      active: 1,
      inventory_quantity: 22,
      low_stock_threshold: 12,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000011",
      name: "Chia Seed",
      package_size: "250g",
      price: 800,
      unit_cost: 440,
      tag: "Superfood",
      image_url: "/image/products/Chiaseed 250g and 1kg.png",
      description: "Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health.",
      featured: 1,
      active: 1,
      inventory_quantity: 300,
      low_stock_threshold: 25,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000012",
      name: "Chia Seed",
      package_size: "1kg",
      price: 3000,
      unit_cost: 1650,
      tag: "Superfood",
      image_url: "/image/products/Chiaseed 250g and 1kg.png",
      description: "Rich in fiber, protein, and omega-3 fatty acids that support heart and digestive health.",
      featured: 0,
      active: 1,
      inventory_quantity: 8,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000013",
      name: "Kerbe Powder",
      package_size: "100g",
      price: 800,
      unit_cost: 440,
      tag: "Traditional",
      image_url: "/image/products/Kerbe Powder ( 100g ).png",
      description: "Traditionally used to support digestive comfort and general well-being. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 130,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000014",
      name: "Asella Kerbe Raw",
      package_size: "100g",
      price: 800,
      unit_cost: 440,
      tag: "Traditional",
      image_url: "/image/products/Kerbe Powder ( 100g ).png",
      description: "Natural myrrh resin valued for its traditional wellness and aromatic benefits. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 45,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000015",
      name: "Kerkede Leafe",
      package_size: "100g",
      price: 500,
      unit_cost: 275,
      tag: "Traditional",
      image_url: "/image/products/Hibiscus ( 100g ).png",
      description: "Naturally rich in antioxidants and commonly enjoyed as a refreshing herbal tea. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 70,
      low_stock_threshold: 15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000016",
      name: "Kerkede Leafe",
      package_size: "200g",
      price: 1000,
      unit_cost: 550,
      tag: "Traditional",
      image_url: "/image/products/Hibiscus ( 100g ).png",
      description: "Supports hydration and wellness with naturally occurring antioxidant compounds. 200g.",
      featured: 0,
      active: 1,
      inventory_quantity: 35,
      low_stock_threshold: 15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000017",
      name: "Chebe Powder",
      package_size: "100g",
      price: 1000,
      unit_cost: 550,
      tag: "Traditional",
      image_url: "/image/products/Chebe powder  ( 100g ).png",
      description: "Traditionally used to nourish hair, improve moisture retention, and reduce breakage. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 45,
      low_stock_threshold: 12,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000018",
      name: "Erde",
      package_size: "200g",
      price: 450,
      unit_cost: 247.5,
      tag: "Traditional",
      image_url: "/image/products/Erid Turmeric ( 220g ).png",
      description: "Contains natural compounds that support overall wellness and antioxidant protection. 200g.",
      featured: 1,
      active: 1,
      inventory_quantity: 90,
      low_stock_threshold: 15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000019",
      name: "Coffee",
      package_size: "500g",
      price: 800,
      unit_cost: 440,
      tag: "Traditional",
      image_url: "/image/products/Coffee.png",
      description: "Premium Ethiopian coffee that delivers rich flavor, energy, and mental alertness. 500g.",
      featured: 0,
      active: 1,
      inventory_quantity: 55,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000020",
      name: "Kesil Powder",
      package_size: "200g",
      price: 450,
      unit_cost: 247.5,
      tag: "Traditional",
      image_url: "/image/products/Qasil Powder ( 200g ).png",
      description: "Traditionally used in natural beauty routines to support healthy-looking skin. 200g.",
      featured: 0,
      active: 1,
      inventory_quantity: 26,
      low_stock_threshold: 12,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000021",
      name: "Kerebe (Myrrh) Oil",
      package_size: "30ml",
      price: 1500,
      unit_cost: 825,
      tag: "Oils",
      image_url: "/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png",
      description: "Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 30ml.",
      featured: 1,
      active: 1,
      inventory_quantity: 33,
      low_stock_threshold: 12,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000022",
      name: "Kerebe (Myrrh) Oil",
      package_size: "60ml",
      price: 2900,
      unit_cost: 1595,
      tag: "Oils",
      image_url: "/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png",
      description: "Known for its soothing and skin-supporting properties in traditional wellness practices and providing a calming aroma. 60ml.",
      featured: 0,
      active: 1,
      inventory_quantity: 5,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000023",
      name: "Frankincense Oil",
      package_size: "30ml",
      price: 1500,
      unit_cost: 825,
      tag: "Oils",
      image_url: "/image/products/Frankincense Oil  30ml and 60 ml.jpeg",
      description: "Promotes healthy-looking skin and a relaxing aromatic experience; also promotes emotional well-being. 30ml.",
      featured: 1,
      active: 1,
      inventory_quantity: 48,
      low_stock_threshold: 12,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000024",
      name: "Frankincense Oil",
      package_size: "60ml",
      price: 2900,
      unit_cost: 1595,
      tag: "Oils",
      image_url: "/image/products/Frankincense Oil  30ml and 60 ml.jpeg",
      description: "Promotes healthy-looking skin and a relaxing aromatic experience; also promotes emotional well-being. 60ml.",
      featured: 0,
      active: 1,
      inventory_quantity: 29,
      low_stock_threshold: 12,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000025",
      name: "Cloves",
      package_size: "100g",
      price: 400,
      unit_cost: 220,
      tag: "Traditional",
      image_url: "/image/products/Cloves.png",
      description: "Rich in antioxidants and traditionally used to support oral and digestive health. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 210,
      low_stock_threshold: 25,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000026",
      name: "Pumpkin Seed",
      package_size: "100g",
      price: 250,
      unit_cost: 137.5,
      tag: "Superfood",
      image_url: "/image/products/Pumpkin Seed  100g.jpeg",
      description: "Packed with essential nutrients that support heart health and overall wellness. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 165,
      low_stock_threshold: 25,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000027",
      name: "Blackseed Oil",
      package_size: "30ml",
      price: 800,
      unit_cost: 440,
      tag: "Oils",
      image_url: "/image/products/Blackseed Oil ( 30ml ).JPG",
      description: "Traditionally used to support immunity, respiratory wellness, and daily health. 30ml.",
      featured: 1,
      active: 1,
      inventory_quantity: 11,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000028",
      name: "Nila Powder",
      package_size: "100g",
      price: 1000,
      unit_cost: 550,
      tag: "Traditional",
      image_url: "/image/products/Nila Powder 100g.jpeg",
      description: "Popular in natural skincare for promoting brighter and smoother-looking skin. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 35,
      low_stock_threshold: 10,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000029",
      name: "Asella Frankincense Raw",
      package_size: "100g",
      price: 800,
      unit_cost: 440,
      tag: "Traditional",
      image_url: "/image/products/Asella Frankincense Raw.jpeg",
      description: "Premium natural resin traditionally used for relaxation and aromatic wellness. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 75,
      low_stock_threshold: 20,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
    {
      id: "11111111-0001-0001-0001-000000000030",
      name: "Cinnamon",
      package_size: "100g",
      price: 600,
      unit_cost: 330,
      tag: "Traditional",
      image_url: "/image/products/Cinnamon.png",
      description: "Rich in antioxidants and commonly used to support metabolic wellness. 100g.",
      featured: 0,
      active: 1,
      inventory_quantity: 62,
      low_stock_threshold: 15,
      created_at: daysAgo(60),
      updated_at: daysAgo(2),
    },
  ],

  staff_users: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      username: "admin",
      email: "yonasmindaye04@gmail.com",
      password_hash: ADMIN_HASH_1,
      full_name: "Yonas Mindaye",
      role: "admin",
      phone: "+251911223344",
      telegram_username: "yonas_asella",
      active: 1,
      two_factor_enabled: 0,
      two_factor_secret: null,
      must_change_password: 0,
      created_at: daysAgo(90),
      updated_at: daysAgo(1),
      deleted_at: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      username: "asella_admin",
      email: "admin@asellaorganic.com",
      password_hash: ADMIN_HASH_2,
      full_name: "Asella Operations Admin",
      role: "admin",
      phone: "+251911000001",
      telegram_username: "asella_ops",
      active: 1,
      two_factor_enabled: 0,
      two_factor_secret: null,
      must_change_password: 0,
      created_at: daysAgo(90),
      updated_at: daysAgo(2),
      deleted_at: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      username: "meron_b",
      email: "meron@asellaorganic.com",
      password_hash: ADMIN_HASH_1,
      full_name: "Meron Bekele",
      role: "manager",
      phone: "+251922334455",
      telegram_username: "meron_asella",
      active: 1,
      two_factor_enabled: 0,
      two_factor_secret: null,
      must_change_password: 0,
      created_at: daysAgo(75),
      updated_at: daysAgo(5),
      deleted_at: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      username: "dawit_t",
      email: "dawit@asellaorganic.com",
      password_hash: ADMIN_HASH_1,
      full_name: "Dawit Tadesse",
      role: "employee",
      phone: "+251933445566",
      telegram_username: "dawit_sales",
      active: 1,
      two_factor_enabled: 0,
      two_factor_secret: null,
      must_change_password: 0,
      created_at: daysAgo(60),
      updated_at: daysAgo(3),
      deleted_at: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      username: "hana_g",
      email: "hana@asellaorganic.com",
      password_hash: ADMIN_HASH_1,
      full_name: "Hana Girma",
      role: "delivery",
      phone: "+251944556677",
      telegram_username: "hana_delivery",
      active: 1,
      two_factor_enabled: 0,
      two_factor_secret: null,
      must_change_password: 0,
      created_at: daysAgo(45),
      updated_at: daysAgo(4),
      deleted_at: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      username: "selam_aff",
      email: "selam@asellaorganic.com",
      password_hash: AFFILIATE_HASH,
      full_name: "Selamawit Tesfaye",
      role: "affiliate",
      phone: "+251955667788",
      telegram_username: "selam_wellness",
      active: 1,
      two_factor_enabled: 0,
      two_factor_secret: null,
      must_change_password: 0,
      created_at: daysAgo(50),
      updated_at: daysAgo(2),
      deleted_at: null,
    },
  ],

  refresh_tokens: [],
  session_blocklist: [],

  customers: [
    {
      id: "c0000000-0001-0001-0001-000000000001",
      name: "Abebe Bikila",
      phone: "+251911234567",
      email: "abebe.b@gmail.com",
      city: "Addis Ababa",
      location: "Bole Medhanialem",
      gender: "male",
      age_group: "35-44",
      referred_by_affiliate_id: "a0000000-0001-0001-0001-000000000001",
      referral_code_used: "SELAM10",
      telegram_chat_id: null,
      created_at: daysAgo(50),
      updated_at: daysAgo(2),
    },
    {
      id: "c0000000-0001-0001-0001-000000000002",
      name: "Tigist Haile",
      phone: "+251912345678",
      email: "tigist.h@yahoo.com",
      city: "Addis Ababa",
      location: "CMC Michael",
      gender: "female",
      age_group: "25-34",
      referred_by_affiliate_id: "a0000000-0001-0001-0001-000000000001",
      referral_code_used: "SELAM10",
      telegram_chat_id: null,
      created_at: daysAgo(45),
      updated_at: daysAgo(3),
    },
    {
      id: "c0000000-0001-0001-0001-000000000003",
      name: "Kebede Alemu",
      phone: "+251913456789",
      email: "kebede.alemu@gmail.com",
      city: "Adama",
      location: "Kebele 04 Post Office",
      gender: "male",
      age_group: "45-54",
      referred_by_affiliate_id: "a0000000-0001-0001-0001-000000000002",
      referral_code_used: "BEREKET15",
      telegram_chat_id: null,
      created_at: daysAgo(40),
      updated_at: daysAgo(5),
    },
    {
      id: "c0000000-0001-0001-0001-000000000004",
      name: "Bethlehem Tadesse",
      phone: "+251921556677",
      email: "betty.t@gmail.com",
      city: "Hawassa",
      location: "Piassa Lake View",
      gender: "female",
      age_group: "25-34",
      referred_by_affiliate_id: null,
      referral_code_used: null,
      telegram_chat_id: null,
      created_at: daysAgo(32),
      updated_at: daysAgo(1),
    },
    {
      id: "c0000000-0001-0001-0001-000000000005",
      name: "Yohannes Mekonnen",
      phone: "+251931889900",
      email: "yohannes.m@outlook.com",
      city: "Bahir Dar",
      location: "Tana Sub-city",
      gender: "male",
      age_group: "35-44",
      referred_by_affiliate_id: null,
      referral_code_used: null,
      telegram_chat_id: null,
      created_at: daysAgo(28),
      updated_at: daysAgo(4),
    },
  ],

  orders: [
    {
      id: "ORD-20261027-T001",
      source: "Website",
      customer_name: "Abebe Bikila",
      phone: "+251911234567",
      location: "Bole Medhanialem",
      city: "Addis Ababa",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 8500,
      notes: "Morning express delivery.",
      customer_id: "c0000000-0001-0001-0001-000000000001",
      delivery_date: daysAgo(0).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(0, 9, 20),
      updated_at: daysAgoAtHour(0, 11, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261027-T002",
      source: "Telegram_MiniApp",
      customer_name: "Tigist Haile",
      phone: "+251912345678",
      location: "CMC Michael",
      city: "Addis Ababa",
      gender: "female",
      age_group: "25-34",
      order_type: "delivery",
      status: "Processing",
      payment_status: "Paid",
      total: 6000,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000002",
      delivery_date: daysAgo(0).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgoAtHour(0, 12, 35),
      updated_at: daysAgoAtHour(0, 13, 10),
      deleted_at: null,
    },
    {
      id: "ORD-20261027-T003",
      source: "Instagram",
      customer_name: "Bethlehem Tadesse",
      phone: "+251921556677",
      location: "Piassa Lake View",
      city: "Hawassa",
      gender: "female",
      age_group: "25-34",
      order_type: "delivery",
      status: "Pending",
      payment_status: "Pending",
      total: 4900,
      notes: "Dispatch via afternoon courier.",
      customer_id: "c0000000-0001-0001-0001-000000000004",
      delivery_date: daysAgo(0).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(0, 15, 10),
      updated_at: daysAgoAtHour(0, 15, 10),
      deleted_at: null,
    },
    {
      id: "ORD-20261026-Y101",
      source: "Website",
      customer_name: "Yohannes Mekonnen",
      phone: "+251931889900",
      location: "Tana Sub-city",
      city: "Bahir Dar",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 9000,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000005",
      delivery_date: daysAgo(1).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgoAtHour(1, 11, 30),
      updated_at: daysAgoAtHour(1, 16, 45),
      deleted_at: null,
    },
    {
      id: "ORD-20261025-A101",
      source: "Website",
      customer_name: "Abebe Bikila",
      phone: "+251911234567",
      location: "Bole Medhanialem",
      city: "Addis Ababa",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 6500,
      notes: "Call upon arrival at gate.",
      customer_id: "c0000000-0001-0001-0001-000000000001",
      delivery_date: daysAgo(1).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(2, 10, 15),
      updated_at: daysAgoAtHour(1, 14, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261024-B202",
      source: "Telegram_MiniApp",
      customer_name: "Tigist Haile",
      phone: "+251912345678",
      location: "CMC Michael",
      city: "Addis Ababa",
      gender: "female",
      age_group: "25-34",
      order_type: "delivery",
      status: "In Transit",
      payment_status: "Paid",
      total: 5300,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000002",
      delivery_date: daysAgo(0).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgoAtHour(3, 14, 20),
      updated_at: daysAgoAtHour(1, 9, 30),
      deleted_at: null,
    },
    {
      id: "ORD-20261023-W104",
      source: "TikTok",
      customer_name: "Kebede Alemu",
      phone: "+251913456789",
      location: "Kebele 04 Post Office",
      city: "Adama",
      gender: "male",
      age_group: "45-54",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 7500,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000003",
      delivery_date: daysAgo(3).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(4, 13, 0),
      updated_at: daysAgoAtHour(3, 17, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261022-C303",
      source: "Website",
      customer_name: "Kebede Alemu",
      phone: "+251913456789",
      location: "Kebele 04 Post Office",
      city: "Adama",
      gender: "male",
      age_group: "45-54",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 4500,
      notes: "Express regional bus parcel.",
      customer_id: "c0000000-0001-0001-0001-000000000003",
      delivery_date: daysAgo(4).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(5, 11, 45),
      updated_at: daysAgoAtHour(4, 16, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261020-D404",
      source: "Phone",
      customer_name: "Bethlehem Tadesse",
      phone: "+251921556677",
      location: "Piassa Lake View",
      city: "Hawassa",
      gender: "female",
      age_group: "25-34",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 3800,
      notes: "Requested afternoon delivery.",
      customer_id: "c0000000-0001-0001-0001-000000000004",
      delivery_date: daysAgo(5).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(6, 15, 30),
      updated_at: daysAgoAtHour(5, 12, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261017-M101",
      source: "Website",
      customer_name: "Abebe Bikila",
      phone: "+251911234567",
      location: "Bole Medhanialem",
      city: "Addis Ababa",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 10500,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000001",
      delivery_date: daysAgo(9).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgoAtHour(10, 10, 30),
      updated_at: daysAgoAtHour(9, 15, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261012-M102",
      source: "Telegram_MiniApp",
      customer_name: "Tigist Haile",
      phone: "+251912345678",
      location: "CMC Michael",
      city: "Addis Ababa",
      gender: "female",
      age_group: "25-34",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 8200,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000002",
      delivery_date: daysAgo(14).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(15, 14, 0),
      updated_at: daysAgoAtHour(14, 16, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20261006-M103",
      source: "Instagram",
      customer_name: "Yohannes Mekonnen",
      phone: "+251931889900",
      location: "Tana Sub-city",
      city: "Bahir Dar",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 6800,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000005",
      delivery_date: daysAgo(20).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgoAtHour(21, 11, 0),
      updated_at: daysAgoAtHour(20, 14, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20260928-E505",
      source: "Website",
      customer_name: "Yohannes Mekonnen",
      phone: "+251931889900",
      location: "Tana Sub-city",
      city: "Bahir Dar",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 7900,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000005",
      delivery_date: daysAgo(26).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgoAtHour(27, 13, 20),
      updated_at: daysAgoAtHour(26, 17, 0),
      deleted_at: null,
    },
    {
      id: "ORD-20260918-F606",
      source: "Telegram_MiniApp",
      customer_name: "Abebe Bikila",
      phone: "+251911234567",
      location: "Bole Medhanialem",
      city: "Addis Ababa",
      gender: "male",
      age_group: "35-44",
      order_type: "delivery",
      status: "Delivered",
      payment_status: "Paid",
      total: 5500,
      notes: null,
      customer_id: "c0000000-0001-0001-0001-000000000001",
      delivery_date: daysAgo(28).slice(0, 10),
      created_by_staff_id: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgoAtHour(29, 10, 0),
      updated_at: daysAgoAtHour(28, 15, 0),
      deleted_at: null,
    },
  ],

  order_items: [
    {
      id: "oi-t01",
      order_id: "ORD-20261027-T001",
      product_id: "11111111-0001-0001-0001-000000000010",
      item_name: "Shilajit Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 5000,
      unit_cost: 2750,
    },
    {
      id: "oi-t02",
      order_id: "ORD-20261027-T001",
      product_id: "11111111-0001-0001-0001-000000000005",
      item_name: "Ashewagenda powder",
      package_size: "300g",
      quantity: 1,
      unit_price: 3500,
      unit_cost: 1925,
    },
    {
      id: "oi-t03",
      order_id: "ORD-20261027-T002",
      product_id: "11111111-0001-0001-0001-000000000009",
      item_name: "Shilajit Tablet",
      package_size: "60 Tablet",
      quantity: 1,
      unit_price: 4500,
      unit_cost: 2475,
    },
    {
      id: "oi-t04",
      order_id: "ORD-20261027-T002",
      product_id: "11111111-0001-0001-0001-000000000023",
      item_name: "Frankincense Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 1500,
      unit_cost: 825,
    },
    {
      id: "oi-t05",
      order_id: "ORD-20261027-T003",
      product_id: "11111111-0001-0001-0001-000000000003",
      item_name: "Moringa powder",
      package_size: "500g",
      quantity: 2,
      unit_price: 1000,
      unit_cost: 550,
    },
    {
      id: "oi-t06",
      order_id: "ORD-20261027-T003",
      product_id: "11111111-0001-0001-0001-000000000022",
      item_name: "Kerebe (Myrrh) Oil",
      package_size: "60ml",
      quantity: 1,
      unit_price: 2900,
      unit_cost: 1595,
    },
    {
      id: "oi-y01",
      order_id: "ORD-20261026-Y101",
      product_id: "11111111-0001-0001-0001-000000000009",
      item_name: "Shilajit Tablet",
      package_size: "60 Tablet",
      quantity: 2,
      unit_price: 4500,
      unit_cost: 2475,
    },
    {
      id: "oi-001",
      order_id: "ORD-20261025-A101",
      product_id: "11111111-0001-0001-0001-000000000003",
      item_name: "Moringa powder",
      package_size: "500g",
      quantity: 2,
      unit_price: 1000,
      unit_cost: 550,
    },
    {
      id: "oi-002",
      order_id: "ORD-20261025-A101",
      product_id: "11111111-0001-0001-0001-000000000009",
      item_name: "Shilajit Tablet",
      package_size: "60 Tablet",
      quantity: 1,
      unit_price: 4500,
      unit_cost: 2475,
    },
    {
      id: "oi-003",
      order_id: "ORD-20261024-B202",
      product_id: "11111111-0001-0001-0001-000000000005",
      item_name: "Ashewagenda powder",
      package_size: "300g",
      quantity: 1,
      unit_price: 3500,
      unit_cost: 1925,
    },
    {
      id: "oi-004",
      order_id: "ORD-20261024-B202",
      product_id: "11111111-0001-0001-0001-000000000027",
      item_name: "Blackseed Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 800,
      unit_cost: 440,
    },
    {
      id: "oi-005",
      order_id: "ORD-20261024-B202",
      product_id: "11111111-0001-0001-0001-000000000016",
      item_name: "Kerkede Leafe",
      package_size: "200g",
      quantity: 1,
      unit_price: 1000,
      unit_cost: 550,
    },
    {
      id: "oi-w01",
      order_id: "ORD-20261023-W104",
      product_id: "11111111-0001-0001-0001-000000000010",
      item_name: "Shilajit Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 5000,
      unit_cost: 2750,
    },
    {
      id: "oi-w02",
      order_id: "ORD-20261023-W104",
      product_id: "11111111-0001-0001-0001-000000000007",
      item_name: "Ashewagenda (Himalya) Tablet",
      package_size: "60 Tablet",
      quantity: 1,
      unit_price: 2500,
      unit_cost: 1375,
    },
    {
      id: "oi-006",
      order_id: "ORD-20261022-C303",
      product_id: "11111111-0001-0001-0001-000000000023",
      item_name: "Frankincense Oil",
      package_size: "30ml",
      quantity: 3,
      unit_price: 1500,
      unit_cost: 825,
    },
    {
      id: "oi-007",
      order_id: "ORD-20261020-D404",
      product_id: "11111111-0001-0001-0001-000000000012",
      item_name: "Chia Seed",
      package_size: "1kg",
      quantity: 1,
      unit_price: 3000,
      unit_cost: 1650,
    },
    {
      id: "oi-008",
      order_id: "ORD-20261020-D404",
      product_id: "11111111-0001-0001-0001-000000000019",
      item_name: "Coffee",
      package_size: "500g",
      quantity: 1,
      unit_price: 800,
      unit_cost: 440,
    },
    {
      id: "oi-m01",
      order_id: "ORD-20261017-M101",
      product_id: "11111111-0001-0001-0001-000000000010",
      item_name: "Shilajit Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 5000,
      unit_cost: 2750,
    },
    {
      id: "oi-m02",
      order_id: "ORD-20261017-M101",
      product_id: "11111111-0001-0001-0001-000000000009",
      item_name: "Shilajit Tablet",
      package_size: "60 Tablet",
      quantity: 1,
      unit_price: 4500,
      unit_cost: 2475,
    },
    {
      id: "oi-m03",
      order_id: "ORD-20261017-M101",
      product_id: "11111111-0001-0001-0001-000000000003",
      item_name: "Moringa powder",
      package_size: "500g",
      quantity: 1,
      unit_price: 1000,
      unit_cost: 550,
    },
    {
      id: "oi-m04",
      order_id: "ORD-20261012-M102",
      product_id: "11111111-0001-0001-0001-000000000005",
      item_name: "Ashewagenda powder",
      package_size: "300g",
      quantity: 2,
      unit_price: 3500,
      unit_cost: 1925,
    },
    {
      id: "oi-m05",
      order_id: "ORD-20261012-M102",
      product_id: "11111111-0001-0001-0001-000000000027",
      item_name: "Blackseed Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 800,
      unit_cost: 440,
    },
    {
      id: "oi-m06",
      order_id: "ORD-20261012-M102",
      product_id: "11111111-0001-0001-0001-000000000025",
      item_name: "Cloves",
      package_size: "100g",
      quantity: 1,
      unit_price: 400,
      unit_cost: 220,
    },
    {
      id: "oi-m07",
      order_id: "ORD-20261006-M103",
      product_id: "11111111-0001-0001-0001-000000000023",
      item_name: "Frankincense Oil",
      package_size: "30ml",
      quantity: 2,
      unit_price: 1500,
      unit_cost: 825,
    },
    {
      id: "oi-m08",
      order_id: "ORD-20261006-M103",
      product_id: "11111111-0001-0001-0001-000000000012",
      item_name: "Chia Seed",
      package_size: "1kg",
      quantity: 1,
      unit_price: 3000,
      unit_cost: 1650,
    },
    {
      id: "oi-m09",
      order_id: "ORD-20261006-M103",
      product_id: "11111111-0001-0001-0001-000000000019",
      item_name: "Coffee",
      package_size: "500g",
      quantity: 1,
      unit_price: 800,
      unit_cost: 440,
    },
    {
      id: "oi-009",
      order_id: "ORD-20260928-E505",
      product_id: "11111111-0001-0001-0001-000000000010",
      item_name: "Shilajit Oil",
      package_size: "30ml",
      quantity: 1,
      unit_price: 5000,
      unit_cost: 2750,
    },
    {
      id: "oi-010",
      order_id: "ORD-20260928-E505",
      product_id: "11111111-0001-0001-0001-000000000022",
      item_name: "Kerebe (Myrrh) Oil",
      package_size: "60ml",
      quantity: 1,
      unit_price: 2900,
      unit_cost: 1595,
    },
    {
      id: "oi-011",
      order_id: "ORD-20260918-F606",
      product_id: "11111111-0001-0001-0001-000000000006",
      item_name: "Ashewagenda (Himalya) Tablet",
      package_size: "120 Tablet",
      quantity: 1,
      unit_price: 4500,
      unit_cost: 2475,
    },
    {
      id: "oi-012",
      order_id: "ORD-20260918-F606",
      product_id: "11111111-0001-0001-0001-000000000001",
      item_name: "Moringa Seed",
      package_size: "500g",
      quantity: 1,
      unit_price: 1000,
      unit_cost: 550,
    },
  ],

  order_status_history: [
    {
      id: "osh-001",
      order_id: "ORD-20261025-A101",
      old_status: "Pending",
      new_status: "Delivered",
      note: "Delivered to customer at Bole Medhanialem.",
      changed_by: "Dawit Tadesse",
      created_at: daysAgo(1),
    },
    {
      id: "osh-002",
      order_id: "ORD-20261024-B202",
      old_status: "Pending",
      new_status: "In Transit",
      note: "Dispatched with rider Hana Girma.",
      changed_by: "Meron Bekele",
      created_at: daysAgo(1),
    },
  ],

  customer_activity: [
    {
      id: "ca-001",
      customer_id: "c0000000-0001-0001-0001-000000000001",
      order_id: "ORD-20261025-A101",
      activity_type: "sale",
      title: "Order ORD-20261025-A101 placed",
      detail: "Website • Addis Ababa",
      amount: 6500,
      status_from: null,
      status_to: "Pending",
      actor_name: "Dawit Tadesse",
      created_at: daysAgo(2),
    },
    {
      id: "ca-002",
      customer_id: "c0000000-0001-0001-0001-000000000002",
      order_id: "ORD-20261024-B202",
      activity_type: "sale",
      title: "Order ORD-20261024-B202 placed",
      detail: "Telegram_MiniApp • Addis Ababa",
      amount: 5300,
      status_from: null,
      status_to: "In Transit",
      actor_name: "Meron Bekele",
      created_at: daysAgo(3),
    },
  ],

  customer_ratings: [
    {
      id: "cr-001",
      customer_id: "c0000000-0001-0001-0001-000000000001",
      stars: 5,
      comment: "Prompt payment and regular repeat buyer.",
      rated_by_name: "Yonas Mindaye",
      created_at: daysAgo(5),
    },
  ],

  customer_notifications: [],

  referral_configs: [
    {
      id: "rc-001",
      commission_type: "percentage",
      commission_value: 10,
      min_order_amount: 500,
      max_commission: 2500,
      is_active: 1,
      created_at: daysAgo(60),
    },
  ],

  affiliate_profiles: [
    {
      id: "a0000000-0001-0001-0001-000000000001",
      user_id: "00000000-0000-0000-0000-000000000006",
      full_name: "Selamawit Tesfaye",
      email: "selam@asellaorganic.com",
      phone: "+251955667788",
      referral_code: "SELAM10",
      rule_type: "global",
      is_active: 1,
      clawback_balance: 0,
      created_at: daysAgo(50),
      deleted_at: null,
    },
    {
      id: "a0000000-0001-0001-0001-000000000002",
      user_id: null,
      full_name: "Bereket Wellness Hub",
      email: "bereket@wellnesset.com",
      phone: "+251966778899",
      referral_code: "BEREKET15",
      rule_type: "custom",
      is_active: 1,
      clawback_balance: 0,
      created_at: daysAgo(42),
      deleted_at: null,
    },
  ],

  affiliate_commission_rules: [
    {
      id: "acr-001",
      affiliate_id: "a0000000-0001-0001-0001-000000000002",
      commission_type: "percentage",
      commission_value: 15,
      min_order_amount: 1000,
      max_commission: 3000,
      is_active: 1,
      created_at: daysAgo(40),
    },
  ],

  commissions: [
    {
      id: "com-001",
      affiliate_id: "a0000000-0001-0001-0001-000000000001",
      order_id: "ORD-20261025-A101",
      order_total: 6500,
      commission_amount: 650,
      commission_type: "percentage",
      commission_value: 10,
      status: "pending",
      rule_source: "global",
      clawback_settled: 0,
      reversal_reason: null,
      reversed_at: null,
      calculated_at: daysAgo(1),
      paid_at: null,
    },
    {
      id: "com-002",
      affiliate_id: "a0000000-0001-0001-0001-000000000001",
      order_id: "ORD-20260918-F606",
      order_total: 5500,
      commission_amount: 550,
      commission_type: "percentage",
      commission_value: 10,
      status: "paid",
      rule_source: "global",
      clawback_settled: 0,
      reversal_reason: null,
      reversed_at: null,
      calculated_at: daysAgo(37),
      paid_at: daysAgo(30),
    },
    {
      id: "com-003",
      affiliate_id: "a0000000-0001-0001-0001-000000000002",
      order_id: "ORD-20261022-C303",
      order_total: 4500,
      commission_amount: 675,
      commission_type: "percentage",
      commission_value: 15,
      status: "pending",
      rule_source: "individual",
      clawback_settled: 0,
      reversal_reason: null,
      reversed_at: null,
      calculated_at: daysAgo(4),
      paid_at: null,
    },
  ],

  affiliate_report_logs: [],
  affiliate_clicks: [],

  expenses: [
    {
      id: "exp-001",
      category: "operational",
      description: "Cold-press extraction packaging & glass dropper bottles",
      amount: 3200,
      vendor_order_id: null,
      notes: "Monthly packaging restock",
      recorded_by: "00000000-0000-0000-0000-000000000001",
      created_at: daysAgo(6),
      voided_at: null,
    },
    {
      id: "exp-002",
      category: "affiliate_payout",
      description: "Affiliate commission payout — Selamawit Tesfaye (SELAM10)",
      amount: 550,
      vendor_order_id: null,
      notes: "Paid via Telebirr",
      recorded_by: "00000000-0000-0000-0000-000000000001",
      created_at: daysAgo(15),
      voided_at: null,
    },
    {
      id: "exp-003",
      category: "operational",
      description: "Addis Ababa & Adama courier dispatch fuel allowance",
      amount: 1850,
      vendor_order_id: null,
      notes: null,
      recorded_by: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgo(25),
      voided_at: null,
    },
  ],

  vendor_orders: [
    {
      id: "vo-001",
      order_id: "PO-20261015-01",
      vendor_name: "Arsi Highland Farmers Cooperative",
      item: "Moringa powder (Raw Leaf Harvest)",
      amount: 50,
      price: 27500,
      status: "Received",
      notes: "Grade A organic sun-dried leaves from Asella",
      created_at: daysAgo(1),
    },
    {
      id: "vo-002",
      order_id: "PO-20261022-02",
      vendor_name: "Bale Botanicals Supply",
      item: "Frankincense & Myrrh Resin Batch",
      amount: 30,
      price: 19500,
      status: "Ordered",
      notes: "Scheduled arrival this Friday",
      created_at: daysAgo(0),
    },
  ],

  stock_requests: [
    {
      id: "sr-001",
      product_id: "11111111-0001-0001-0001-000000000022",
      item: "Kerebe (Myrrh) Oil",
      package_size: "60ml",
      stock_available: 5,
      qty_needed: 30,
      status: "pending",
      requested_by: "Dawit Tadesse",
      delivery_date: daysAgo(-3).slice(0, 10),
      notes: "High customer demand in Addis Ababa branch",
      created_at: daysAgo(0),
    },
    {
      id: "sr-002",
      product_id: "11111111-0001-0001-0001-000000000008",
      item: "Shilajit Gummies",
      package_size: "30 Gummies",
      stock_available: 8,
      qty_needed: 40,
      status: "pending",
      requested_by: "Meron Bekele",
      delivery_date: daysAgo(-5).slice(0, 10),
      notes: "Restock order needed urgently",
      created_at: daysAgo(1),
    },
  ],

  inventory_movements: [
    {
      id: "im-001",
      product_id: "11111111-0001-0001-0001-000000000008",
      movement_type: "sale",
      change_amount: -2,
      quantity_before: 10,
      quantity_after: 8,
      reason: "Order Delivered",
      reference_id: "ORD-20261025-A101",
      notes: null,
      created_by: "00000000-0000-0000-0000-000000000004",
      created_at: daysAgo(0),
    },
    {
      id: "im-002",
      product_id: "11111111-0001-0001-0001-000000000022",
      movement_type: "sale",
      change_amount: -1,
      quantity_before: 6,
      quantity_after: 5,
      reason: "Order Delivered",
      reference_id: "ORD-20260928-E505",
      notes: null,
      created_by: "00000000-0000-0000-0000-000000000003",
      created_at: daysAgo(1),
    },
  ],

  community_videos: [
    {
      id: 1,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "How We Cold-Process Organic Moringa & Black Seed Oil in Asella",
      created_at: daysAgo(20),
    },
  ],

  site_assets: [],

  audit_log: [
    {
      id: 1,
      table_name: "orders",
      record_id: "ORD-20261025-A101",
      order_id: "ORD-20261025-A101",
      actor: "Dawit Tadesse",
      action: "ORDER_CREATED",
      old_values: null,
      new_values: JSON.stringify({ items_count: 2, total: 6500 }),
      created_at: daysAgo(2),
    },
    {
      id: 2,
      table_name: "products",
      record_id: "11111111-0001-0001-0001-000000000001",
      order_id: null,
      actor: "Yonas Mindaye",
      action: "STOCK_ADJUSTED",
      old_values: JSON.stringify({ inventory_quantity: 200 }),
      new_values: JSON.stringify({ inventory_quantity: 250 }),
      created_at: daysAgo(5),
    },
  ],

  idempotency_keys: [],

  sms_templates: [
    {
      id: "tpl-001",
      template_key: "order_confirmed",
      name: "Order Confirmed",
      body: "Selam {{name}}, your Asella Organic order {{orderId}} has been confirmed and is being prepared!",
      locale: "en",
      is_transactional: 1,
      requires_optout_footer: 0,
      is_active: 1,
    },
    {
      id: "tpl-002",
      template_key: "order_delivered",
      name: "Order Delivered",
      body: "Thank you {{name}}! Your Asella Organic order {{orderId}} has been delivered. Enjoy natural wellness!",
      locale: "en",
      is_transactional: 1,
      requires_optout_footer: 0,
      is_active: 1,
    },
  ],

  sms_campaigns: [],
  sms_messages: [],
};

function computeCustomerInsights() {
  return store.customers.map((c) => {
    const custOrders = store.orders.filter(
      (o) => !o.deleted_at && (o.customer_id === c.id || o.phone === c.phone)
    );
    const delivered = custOrders.filter((o) => o.status === "Delivered");
    const cancelled = custOrders.filter((o) => o.status === "Cancelled" || o.status === "CANCELLED");
    const open = custOrders.filter(
      (o) => o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "CANCELLED"
    );
    const lifetime_value = delivered.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const orderIds = new Set(custOrders.map((o) => o.id));
    const items = store.order_items.filter((i) => orderIds.has(i.order_id));
    const distinct_products = new Set(items.map((i) => i.item_name)).size;
    const total_units = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const ratings = store.customer_ratings.filter((r) => r.customer_id === c.id);
    const avg_stars =
      ratings.length > 0
        ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length
        : 5;
    const aff = store.affiliate_profiles.find((a) => a.id === c.referred_by_affiliate_id);
    const value_score = Math.min(100, Math.round(50 + delivered.length * 12 + lifetime_value / 500));
    const segment =
      lifetime_value >= 8000
        ? "VIP"
        : delivered.length >= 2
        ? "Loyal"
        : custOrders.length >= 1
        ? "Promising"
        : "Dormant";

    return {
      customer_id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      location: c.location,
      gender: c.gender,
      age_group: c.age_group,
      customer_since: c.created_at,
      order_count: custOrders.length,
      delivered_count: delivered.length,
      cancelled_count: cancelled.length,
      returned_count: 0,
      open_count: open.length,
      lifetime_value,
      refunded_value: 0,
      net_value: lifetime_value,
      distinct_products,
      total_units,
      last_order_at: custOrders[0]?.created_at ?? c.created_at,
      last_delivered_at: delivered[0]?.created_at ?? null,
      days_since_last_order: 2,
      value_score,
      segment,
      recency_score: 25,
      frequency_score: 20,
      monetary_score: 25,
      penalty_score: 0,
      avg_stars,
      rating_count: ratings.length,
      is_telegram: c.telegram_chat_id ? 1 : 0,
      affiliate_name: aff?.full_name ?? null,
      referred_by_affiliate_id: c.referred_by_affiliate_id,
    };
  });
}

export async function executeMockQuery(
  rawSql: string,
  params: any[] = []
): Promise<[any, any]> {
  const sql = rawSql.replace(/\s+/g, " ").trim();
  const sqlLower = sql.toLowerCase();

  // ── 0. Ping / Transaction no-ops ──────────────────────────────────────────
  if (
    sqlLower === "select 1" ||
    sqlLower.startsWith("begin") ||
    sqlLower.startsWith("start transaction") ||
    sqlLower.startsWith("commit") ||
    sqlLower.startsWith("rollback")
  ) {
    return [[{ "1": 1 }], []];
  }

  // ── 1. Idempotency keys ───────────────────────────────────────────────────
  if (sqlLower.includes("from idempotency_keys")) {
    const key = params[params.length - 1];
    const found = store.idempotency_keys.filter((k) => k.idem_key === key);
    return [found, []];
  }
  if (sqlLower.includes("into idempotency_keys")) {
    store.idempotency_keys.push({
      user_id: params[0],
      idem_key: params[1],
      method: params[2],
      path: params[3],
      request_hash: params[4],
      status: params[5],
      response_body: params[6],
      response_headers: params[7],
    });
    return [{ affectedRows: 1, insertId: store.idempotency_keys.length }, []];
  }

  // ── 2. Auth & Staff Users ─────────────────────────────────────────────────
  if (sqlLower.includes("from session_blocklist")) {
    const jti = params[0];
    const found = store.session_blocklist.filter((b) => b.jti === jti);
    return [found, []];
  }
  if (sqlLower.includes("into session_blocklist")) {
    store.session_blocklist.push({ jti: params[0], expires_at: params[1] });
    return [{ affectedRows: 1 }, []];
  }
  if (sqlLower.includes("into refresh_tokens")) {
    store.refresh_tokens.push({
      id: params[0],
      user_id: params[1],
      token_hash: params[2],
      expires_at: params[3],
    });
    return [{ affectedRows: 1 }, []];
  }
  if (sqlLower.includes("from refresh_tokens t")) {
    const hash = params[0];
    const rt = store.refresh_tokens.find((t) => t.token_hash === hash);
    if (!rt) return [[], []];
    const u = store.staff_users.find((s) => s.id === rt.user_id);
    if (!u) return [[], []];
    return [
      [
        {
          token_id: rt.id,
          user_id: rt.user_id,
          expires_at: rt.expires_at,
          username: u.username,
          full_name: u.full_name,
          role: u.role,
          active: u.active,
        },
      ],
      [],
    ];
  }
  if (sqlLower.includes("update refresh_tokens")) {
    const rt = store.refresh_tokens.find((t) => t.id === params[2]);
    if (rt) {
      rt.token_hash = params[0];
      rt.expires_at = params[1];
    }
    return [{ affectedRows: rt ? 1 : 0 }, []];
  }
  if (sqlLower.includes("delete from refresh_tokens")) {
    return [{ affectedRows: 1 }, []];
  }

  // ── 2a. Affiliates & Referrals (must run before staff_users / customers due to JOINs & subqueries) ──
  if (sqlLower.includes("as total_affiliates") && sqlLower.includes("as active_affiliates")) {
    const activeAffs = store.affiliate_profiles.filter((a) => !a.deleted_at);
    const enabledAffs = activeAffs.filter((a) => Boolean(a.is_active));
    const referredCusts = store.customers.filter((c) => Boolean(c.referred_by_affiliate_id)).length;
    const validComms = store.commissions.filter((c) => c.status !== "reversed");
    const paidComms = store.commissions.filter((c) => c.status === "paid");
    const pendingComms = store.commissions.filter((c) => c.status === "pending");
    const reversedComms = store.commissions.filter((c) => c.status === "reversed");
    return [
      [
        {
          total_affiliates: activeAffs.length,
          active_affiliates: enabledAffs.length,
          total_referred_customers: referredCusts,
          total_commissions_generated: validComms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          total_paid: paidComms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          total_pending: pendingComms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          pending_count: pendingComms.length,
          total_reversed: reversedComms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          clawback_pending: 0,
        },
      ],
      [],
    ];
  }

  if (sqlLower.includes("from referral_configs")) {
    return [store.referral_configs.filter((r) => r.is_active), []];
  }

  if (sqlLower.includes("from affiliate_commission_rules")) {
    const id = params[0];
    return [store.affiliate_commission_rules.filter((r) => r.affiliate_id === id), []];
  }

  if (sqlLower.includes("from affiliate_profiles")) {
    const activeAffs = store.affiliate_profiles
      .filter((a) => !a.deleted_at)
      .map((a) => {
        const custs = store.customers.filter((c) => c.referred_by_affiliate_id === a.id);
        const comms = store.commissions.filter((c) => c.affiliate_id === a.id && c.status !== "reversed");
        const paidComms = comms.filter((c) => c.status === "paid");
        const pendingComms = comms.filter((c) => c.status === "pending");
        return {
          ...a,
          full_name: a.full_name || "Affiliate Partner",
          identifier: a.email || a.referral_code,
          affiliate_type: a.user_id ? "staff" : "external",
          total_customers: custs.length,
          total_commissions_count: comms.length,
          total_commissions_amount: comms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          paid_commissions_amount: paidComms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          pending_commissions_amount: pendingComms.reduce((s, c) => s + Number(c.commission_amount || 0), 0),
          pending_count: pendingComms.length,
          paid_count: paidComms.length,
        };
      });
    if (sqlLower.includes("where ap.id = ?") || sqlLower.includes("where id = ?")) {
      return [activeAffs.filter((a) => a.id === params[0]), []];
    }
    if (sqlLower.includes("where ap.user_id = ?") || sqlLower.includes("where user_id = ?")) {
      return [activeAffs.filter((a) => a.user_id === params[0]), []];
    }
    return [activeAffs, []];
  }

  if (sqlLower.includes("from referral_commissions") || sqlLower.includes("from commissions")) {
    if (sqlLower.startsWith("select count(*)")) {
      return [[{ total: store.commissions.length, count: store.commissions.length }], []];
    }
    const enriched = store.commissions.map((c) => {
      const aff = store.affiliate_profiles.find((a) => a.id === c.affiliate_id);
      const ord = store.orders.find((o) => o.id === c.order_id);
      return {
        ...c,
        affiliate_name: aff?.full_name ?? "Affiliate",
        referral_code: aff?.referral_code ?? "SELAM10",
        customer_name: ord?.customer_name ?? "Customer",
        customer_phone: ord?.phone ?? "+251911234567",
      };
    });
    return [enriched, []];
  }

  // Staff login / lookup
  if (sqlLower.includes("from staff_users")) {
    if (sqlLower.startsWith("select count(*)")) {
      const activeStaff = store.staff_users.filter((u) => !u.deleted_at);
      return [[{ total: activeStaff.length, count: activeStaff.length }], []];
    }
    if (sqlLower.includes("where (email = ? or username = ?)")) {
      const identifier = String(params[0] || "").trim().toLowerCase();
      const user = store.staff_users.find(
        (u) =>
          u.active &&
          !u.deleted_at &&
          (String(u.username || "").toLowerCase() === identifier ||
            String(u.email || "").toLowerCase() === identifier)
      );
      return [user ? [user] : [], []];
    }
    if (sqlLower.includes("where id = ?")) {
      const id = params[0];
      const user = store.staff_users.find((u) => u.id === id && !u.deleted_at);
      return [user ? [user] : [], []];
    }
    if (sqlLower.includes("where username = ?")) {
      const username = String(params[0] || "").toLowerCase();
      const user = store.staff_users.find(
        (u) => String(u.username || "").toLowerCase() === username && !u.deleted_at
      );
      return [user ? [user] : [], []];
    }
    // Staff list with order metrics
    const hasDateWindow = sqlLower.includes("created_at between ? and ?");
    const fromDate = hasDateWindow && params[0] ? String(params[0]).slice(0, 10) : null;
    const toDate = hasDateWindow && params[1] ? String(params[1]).slice(0, 10) : null;

    const enriched = store.staff_users
      .filter((u) => !u.deleted_at)
      .map((u) => {
        const staffOrders = store.orders.filter((o) => {
          if (o.created_by_staff_id !== u.id || o.deleted_at) return false;
          if (fromDate && toDate) {
            const d = String(o.created_at || "").slice(0, 10);
            return d >= fromDate && d <= toDate;
          }
          return true;
        });
        const delivered = staffOrders.filter((o) => o.status === "Delivered");
        const valid = staffOrders.filter(
          (o) => !["Cancelled", "CANCELLED", "Returned", "Issue"].includes(o.status)
        );
        return {
          ...u,
          orders_placed_count: staffOrders.length,
          orders_delivered_count: delivered.length,
          revenue_generated: valid.reduce((s, o) => s + Number(o.total || 0), 0),
        };
      });
    return [enriched, []];
  }

  if (sqlLower.includes("update staff_users")) {
    const id = params[params.length - 1];
    const u = store.staff_users.find((s) => s.id === id && !s.deleted_at);
    if (u) {
      if (sqlLower.includes("deleted_at = now()")) {
        u.deleted_at = daysAgo(0);
        u.active = 0;
      } else {
        let pIdx = 0;
        if (sqlLower.includes("full_name = ?")) u.full_name = params[pIdx++];
        if (sqlLower.includes("role = ?")) u.role = params[pIdx++];
        if (sqlLower.includes("email = ?")) u.email = params[pIdx++];
        if (sqlLower.includes("phone = ?")) u.phone = params[pIdx++];
        if (sqlLower.includes("telegram_username = ?")) (u as any).telegram_username = params[pIdx++];
        if (sqlLower.includes("active = ?")) u.active = params[pIdx++] ? 1 : 0;
      }
      u.updated_at = daysAgo(0);
    }
    return [{ affectedRows: u ? 1 : 0 }, []];
  }

  if (sqlLower.includes("insert into staff_users")) {
    const newUser = {
      id: params[0] || crypto.randomUUID(),
      username: params[1],
      email: params[2] || null,
      password_hash: params[3] || ADMIN_HASH_1,
      full_name: params[4] || params[1],
      role: params[5] || "employee",
      active: 1,
      two_factor_enabled: 0,
      created_at: daysAgo(0),
      updated_at: daysAgo(0),
      deleted_at: null,
    };
    store.staff_users.push(newUser);
    return [{ affectedRows: 1, insertId: newUser.id }, []];
  }

  // ── 3. Products & Stock ───────────────────────────────────────────────────
  if (sqlLower.includes("from products")) {
    let list = [...store.products];

    if (sqlLower.includes("active = true") || (sqlLower.includes("active = ?") && params[0] === true)) {
      list = list.filter((p) => Boolean(p.active));
    } else if (sqlLower.includes("active = ?") && params[0] === false) {
      list = list.filter((p) => !p.active);
    }

    // Low stock query
    if (sqlLower.includes("inventory_quantity <= low_stock_threshold")) {
      list = list.filter((p) => Number(p.inventory_quantity) <= Number(p.low_stock_threshold));
      if (sqlLower.startsWith("select count(")) {
        return [[{ total: list.length }], []];
      }
      return [list, []];
    }

    // Stock summary query (GET /api/stock/summary)
    if (sqlLower.includes("total_stock_value") && sqlLower.includes("out_of_stock_count")) {
      const total_products = list.length;
      const total_units = list.reduce((s, p) => s + Number(p.inventory_quantity || 0), 0);
      const total_stock_value = list.reduce(
        (s, p) => s + Number(p.inventory_quantity || 0) * Number(p.unit_cost || 0),
        0
      );
      const out_of_stock_count = list.filter((p) => p.inventory_quantity === 0).length;
      const critical_count = list.filter(
        (p) => p.inventory_quantity > 0 && p.inventory_quantity <= p.low_stock_threshold / 2
      ).length;
      const low_count = list.filter(
        (p) =>
          p.inventory_quantity > p.low_stock_threshold / 2 &&
          p.inventory_quantity <= p.low_stock_threshold
      ).length;
      const ok_count = list.filter((p) => p.inventory_quantity > p.low_stock_threshold).length;
      return [
        [
          {
            total_products,
            total_units,
            total_stock_value,
            out_of_stock_count,
            critical_count,
            low_count,
            ok_count,
          },
        ],
        [],
      ];
    }

    // Stock overview list (GET /api/stock)
    if (sqlLower.includes("as current_quantity") && sqlLower.includes("as stock_status")) {
      const rows = list.map((p) => {
        const qty = Number(p.inventory_quantity || 0);
        const thr = Number(p.low_stock_threshold || 10);
        const stock_status =
          qty === 0
            ? "out_of_stock"
            : qty <= thr / 2
            ? "critical"
            : qty <= thr
            ? "low"
            : "ok";
        const lastMov = store.inventory_movements.find((m) => m.product_id === p.id);
        return {
          id: p.id,
          name: p.name,
          package_size: p.package_size,
          price: p.price,
          current_quantity: qty,
          low_stock_threshold: thr,
          tag: p.tag,
          image_url: p.image_url,
          stock_status,
          stock_value: qty * Number(p.unit_cost || 0),
          last_movement_at: lastMov?.created_at ?? p.updated_at,
          last_movement_type: lastMov?.movement_type ?? "initial_stock",
        };
      });
      return [rows, []];
    }

    // Single product lookup by id or name
    if (sqlLower.includes("where id = ?") || sqlLower.includes("where p.id = ?")) {
      const id = params[0];
      const found = store.products.filter((p) => p.id === id);
      return [found, []];
    }
    if (sqlLower.includes("lower(name) = lower(?)") && sqlLower.includes("package_size = ?")) {
      const name = String(params[0] || "").toLowerCase();
      const size = String(params[1] || "");
      const found = store.products.filter(
        (p) => p.name.toLowerCase() === name && p.package_size === size
      );
      return [found, []];
    }

    // Count query
    if (sqlLower.startsWith("select count(")) {
      return [[{ total: list.length, count: list.length }], []];
    }

    return [list, []];
  }

  if (sqlLower.includes("insert into products") || sqlLower.includes("insert ignore into products")) {
    const newProd = {
      id: params[0] || crypto.randomUUID(),
      name: params[1] || "New Supplement",
      package_size: params[2] || "100g",
      price: Number(params[3] || 500),
      unit_cost: Number(params[4] || 250),
      description: params[5] || "Premium Ethiopian organic supplement.",
      image_url: params[6] || "/image/products/Moringa 200g,500g and 1kg.png",
      featured: Boolean(params[7]) ? 1 : 0,
      tag: params[8] || "Herbs",
      inventory_quantity: Number(params[9] ?? 50),
      low_stock_threshold: Number(params[10] ?? 10),
      active: 1,
      created_at: daysAgo(0),
      updated_at: daysAgo(0),
    };
    store.products.unshift(newProd);
    return [{ affectedRows: 1, insertId: newProd.id }, []];
  }

  if (sqlLower.includes("update products")) {
    const id = params[params.length - 1];
    const prod = store.products.find((p) => p.id === id);
    if (prod) {
      if (sqlLower.includes("inventory_quantity = ?")) {
        prod.inventory_quantity = Number(params[0]);
      } else if (sqlLower.includes("active = false")) {
        prod.active = 0;
      }
      prod.updated_at = daysAgo(0);
    }
    return [{ affectedRows: prod ? 1 : 0 }, []];
  }

  // ── 4. Orders & Order Items ───────────────────────────────────────────────
  // Staff top products query (FROM order_items oi JOIN orders o)
  if (sqlLower.includes("from order_items oi") && sqlLower.includes("join orders o")) {
    const staffId = params[0];
    const staffOrderIds = new Set(
      store.orders
        .filter((o) => o.created_by_staff_id === staffId && !o.deleted_at && o.status !== "Cancelled")
        .map((o) => o.id)
    );
    const map = new Map<string, { item_name: string; package_size: string; qty: number; revenue: number; order_count: number }>();
    for (const item of store.order_items) {
      if (!staffOrderIds.has(item.order_id)) continue;
      const key = `${item.item_name}__${item.package_size}`;
      const cur = map.get(key) || {
        item_name: item.item_name,
        package_size: item.package_size,
        qty: 0,
        revenue: 0,
        order_count: 0,
      };
      cur.qty += Number(item.quantity || 1);
      cur.revenue += Number(item.quantity || 1) * Number(item.unit_price || 0);
      cur.order_count += 1;
      map.set(key, cur);
    }
    return [Array.from(map.values()).sort((a, b) => b.revenue - a.revenue), []];
  }

  if (sqlLower.includes("from orders")) {
    let list = store.orders.filter((o) => !o.deleted_at);

    if (sqlLower.includes("where o.id = ?") || sqlLower.includes("where id = ?")) {
      const id = params[0];
      const found = list
        .filter((o) => o.id === id)
        .map((o) => {
          const staff = store.staff_users.find((s) => s.id === o.created_by_staff_id);
          return { ...o, created_by_staff_name: staff?.full_name ?? "Admin" };
        });
      return [found, []];
    }

    if (sqlLower.includes("created_by_staff_id = ?")) {
      const staffId = params[0];
      const staffOrders = list.filter((o) => o.created_by_staff_id === staffId);
      if (sqlLower.includes("avg_order_value")) {
        const delivered = staffOrders.filter((o) => o.status === "Delivered").length;
        const cancelled = staffOrders.filter(
          (o) => o.status === "Cancelled" || o.status === "CANCELLED"
        ).length;
        const valid = staffOrders.filter(
          (o) => o.status !== "Cancelled" && o.status !== "CANCELLED"
        );
        const revenue = valid.reduce((s, o) => s + Number(o.total || 0), 0);
        return [
          [
            {
              total_orders: staffOrders.length,
              delivered,
              cancelled,
              pending: staffOrders.length - delivered - cancelled,
              revenue,
              avg_order_value: valid.length ? revenue / valid.length : 0,
              first_order_at: staffOrders[staffOrders.length - 1]?.created_at ?? null,
              last_order_at: staffOrders[0]?.created_at ?? null,
            },
          ],
          [],
        ];
      }
      if (sqlLower.includes("group by date(o.created_at)")) {
        const byDate = new Map<string, { date: string; orders: number; revenue: number }>();
        for (const o of staffOrders) {
          const d = String(o.created_at || "").slice(0, 10);
          const cur = byDate.get(d) || { date: d, orders: 0, revenue: 0 };
          cur.orders += 1;
          if (o.status !== "Cancelled" && o.status !== "CANCELLED") {
            cur.revenue += Number(o.total || 0);
          }
          byDate.set(d, cur);
        }
        return [Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)), []];
      }
      if (sqlLower.includes("group by o.source")) {
        const bySrc = new Map<string, { source: string; orders: number; revenue: number }>();
        for (const o of staffOrders) {
          const s = String(o.source || "Website");
          const cur = bySrc.get(s) || { source: s, orders: 0, revenue: 0 };
          cur.orders += 1;
          if (o.status !== "Cancelled" && o.status !== "CANCELLED") {
            cur.revenue += Number(o.total || 0);
          }
          bySrc.set(s, cur);
        }
        return [Array.from(bySrc.values()).sort((a, b) => b.revenue - a.revenue), []];
      }
      if (sqlLower.includes("group by o.city")) {
        const byCity = new Map<string, { city: string; orders: number; revenue: number }>();
        for (const o of staffOrders) {
          const c = String(o.city || "Addis Ababa");
          const cur = byCity.get(c) || { city: c, orders: 0, revenue: 0 };
          cur.orders += 1;
          if (o.status !== "Cancelled" && o.status !== "CANCELLED") {
            cur.revenue += Number(o.total || 0);
          }
          byCity.set(c, cur);
        }
        return [Array.from(byCity.values()).sort((a, b) => b.revenue - a.revenue), []];
      }
      if (sqlLower.includes("group by hour(o.created_at)")) {
        const byHour = new Map<number, { hour: number; orders: number }>();
        for (const o of staffOrders) {
          const h = new Date(o.created_at).getHours() || 10;
          const cur = byHour.get(h) || { hour: h, orders: 0 };
          cur.orders += 1;
          byHour.set(h, cur);
        }
        return [Array.from(byHour.values()).sort((a, b) => a.hour - b.hour), []];
      }
      return [staffOrders, []];
    }

    // Apply dynamic filters matching routes/orders.ts & routes/reports.ts
    let paramIdx = 0;
    if (sqlLower.includes("o.status = ?")) {
      const st = String(params[paramIdx++] || "");
      list = list.filter((o) => o.status === st);
    }
    if (sqlLower.includes("o.city like ?")) {
      const citySearch = String(params[paramIdx++] || "").replace(/%/g, "").toLowerCase();
      list = list.filter((o) => String(o.city || "").toLowerCase().includes(citySearch));
    }
    if (sqlLower.includes("o.source = ?")) {
      const src = String(params[paramIdx++] || "").toLowerCase();
      list = list.filter((o) => String(o.source || "").toLowerCase() === src);
    }
    if (sqlLower.includes("created_at >= ?")) {
      const fromVal = String(params[paramIdx++] || "");
      const fromDate = fromVal.slice(0, 10);
      list = list.filter((o) => String(o.created_at || "").slice(0, 10) >= fromDate);
    }
    if (sqlLower.includes("created_at <= ?")) {
      const toVal = String(params[paramIdx++] || "");
      const toDate = toVal.slice(0, 10);
      list = list.filter((o) => String(o.created_at || "").slice(0, 10) <= toDate);
    }

    if (sqlLower.includes("status not in ('cancelled', 'cancelled', 'returned', 'issue')") || sqlLower.includes("status not in ('cancelled','cancelled')")) {
      list = list.filter((o) => !["Cancelled", "CANCELLED", "Returned", "Issue"].includes(o.status));
    }

    if (sqlLower.includes("status = 'pending'")) {
      list = list.filter((o) => String(o.status || "").toLowerCase() === "pending");
    }

    if (sqlLower.startsWith("select count(*)")) {
      return [[{ count: list.length, total: list.length, cnt: list.length }], []];
    }

    if (sqlLower.includes("'new_order' as category")) {
      const notifOrders = list.map((o) => ({
        id: o.id,
        category: "new_order",
        title: `New Order from ${o.customer_name}`,
        body: `Source: ${o.source} | City: ${o.city || "N/A"} | Total: ${o.total || 0} ETB | Status: ${o.status}`,
        created_at: o.created_at,
        metadata: {
          order_id: o.id,
          customer_name: o.customer_name,
          phone: o.phone,
          city: o.city,
          source: o.source,
          status: o.status,
          total: o.total,
        },
      }));
      return [notifOrders, []];
    }

    const enriched = list.map((o) => {
      const staff = store.staff_users.find((s) => s.id === o.created_by_staff_id);
      return { ...o, created_by_staff_name: staff?.full_name ?? "Yonas Mindaye" };
    });
    return [enriched, []];
  }

  if (sqlLower.includes("from order_items")) {
    if (sqlLower.includes("where order_id in")) {
      const ids: string[] = Array.isArray(params[0]) ? params[0] : params;
      const items = store.order_items.filter((i) => ids.includes(i.order_id));
      return [items, []];
    }
    if (sqlLower.includes("where order_id = ?")) {
      const id = params[0];
      const items = store.order_items.filter((i) => i.order_id === id);
      return [items, []];
    }
    return [store.order_items, []];
  }

  if (sqlLower.includes("from order_status_history")) {
    const id = params[0];
    const hist = store.order_status_history
      .filter((h) => h.order_id === id)
      .map((h) => ({ ...h, timestamp: h.created_at }));
    return [hist, []];
  }

  if (sqlLower.includes("insert into orders")) {
    const newOrder = {
      id: params[0],
      source: params[1] || "Website",
      customer_name: params[2],
      phone: params[3],
      location: params[4] || "",
      city: params[5] || "Addis Ababa",
      gender: params[6],
      age_group: params[7],
      order_type: params[8] || "delivery",
      status: "Pending",
      payment_status: "Pending",
      total: Number(params[9] || 0),
      notes: params[10] || null,
      customer_id: params[11] || null,
      delivery_date: params[12] || null,
      created_by_staff_id: params[13] || null,
      created_at: daysAgo(0),
      updated_at: daysAgo(0),
      deleted_at: null,
    };
    store.orders.unshift(newOrder);
    return [{ affectedRows: 1, insertId: newOrder.id }, []];
  }

  if (sqlLower.includes("insert into order_items")) {
    const newItem = {
      id: params[0] || crypto.randomUUID(),
      order_id: params[1],
      item_name: params[2],
      package_size: params[3],
      quantity: Number(params[4] || 1),
      unit_price: Number(params[5] || 0),
      unit_cost: Number(params[6] || 0),
      product_id: params[7] || null,
    };
    store.order_items.push(newItem);
    return [{ affectedRows: 1, insertId: newItem.id }, []];
  }

  if (sqlLower.includes("update orders")) {
    const id = params[params.length - 1];
    const ord = store.orders.find((o) => o.id === id);
    if (ord) {
      if (sqlLower.includes("status = ?")) {
        ord.status = params[0];
      }
      if (sqlLower.includes("payment_status = ?")) {
        ord.payment_status = params[0];
      }
      ord.updated_at = daysAgo(0);
    }
    return [{ affectedRows: ord ? 1 : 0 }, []];
  }

  // ── 5. Customers & Customer Insights ──────────────────────────────────────
  if (sqlLower.includes("insert into customers")) {
    const existing = store.customers.find((c) => c.phone === params[1]);
    if (!existing) {
      store.customers.push({
        id: params[0] || crypto.randomUUID(),
        phone: params[1],
        name: params[2],
        city: params[3] || "Addis Ababa",
        location: params[4] || "",
        gender: params[5] || null,
        age_group: params[6] || null,
        referred_by_affiliate_id: null,
        referral_code_used: null,
        telegram_chat_id: null,
        created_at: daysAgo(0),
        updated_at: daysAgo(0),
      });
    }
    return [{ affectedRows: 1 }, []];
  }

  if (sqlLower.includes("vw_customer_insights")) {
    const insights = computeCustomerInsights();
    if (sqlLower.startsWith("select count(*)")) {
      return [[{ total: insights.length }], []];
    }
    if (sqlLower.includes("total_customers") && sqlLower.includes("total_net_value")) {
      const total_net_value = insights.reduce((s, c) => s + c.net_value, 0);
      const total_orders = insights.reduce((s, c) => s + c.order_count, 0);
      const delivered_orders = insights.reduce((s, c) => s + c.delivered_count, 0);
      return [
        [
          {
            total_customers: insights.length,
            total_orders,
            delivered_orders,
            returned_orders: 0,
            cancelled_orders: 0,
            total_net_value,
            avg_score: 78,
            churning: 0,
            never_ordered: 0,
          },
        ],
        [],
      ];
    }
    if (sqlLower.includes("group by segment")) {
      const segMap = new Map<string, { segment: string; customers: number; net_value: number; avg_score: number }>();
      for (const c of insights) {
        const cur = segMap.get(c.segment) || {
          segment: c.segment,
          customers: 0,
          net_value: 0,
          avg_score: c.value_score,
        };
        cur.customers += 1;
        cur.net_value += c.net_value;
        segMap.set(c.segment, cur);
      }
      return [Array.from(segMap.values()), []];
    }
    if (sqlLower.includes("where v.customer_id = ?") || sqlLower.includes("where customer_id = ?")) {
      const id = params[0];
      return [insights.filter((c) => c.customer_id === id), []];
    }
    return [insights, []];
  }

  if (sqlLower.includes("from customers")) {
    if (sqlLower.includes("where phone = ?")) {
      const phone = params[0];
      const found = store.customers.filter((c) => c.phone === phone);
      return [found.length ? found : [{ id: store.customers[0]?.id ?? "c-default" }], []];
    }
    if (sqlLower.includes("where id = ?")) {
      return [store.customers.filter((c) => c.id === params[0]), []];
    }
    return [store.customers, []];
  }

  if (sqlLower.includes("from customer_activity")) {
    if (sqlLower.startsWith("select count(*)")) {
      return [[{ total: store.customer_activity.length }], []];
    }
    const enriched = store.customer_activity.map((a) => {
      const c = store.customers.find((cust) => cust.id === a.customer_id);
      return {
        ...a,
        customer_name: c?.name ?? "Customer",
        customer_phone: c?.phone ?? "+251911000000",
      };
    });
    return [enriched, []];
  }

  if (sqlLower.includes("from customer_ratings")) {
    return [store.customer_ratings, []];
  }

  // ── 7. Expenses, Vendor Orders, Stock Movements & Requests ────────────────
  if (sqlLower.includes("from expenses")) {
    let activeExp = store.expenses.filter((e) => !e.voided_at);
    let expParamIdx = 0;
    if (sqlLower.includes("category = ?")) {
      const cat = String(params[expParamIdx++] || "");
      activeExp = activeExp.filter((e) => e.category === cat);
    }
    if (sqlLower.includes("created_at >= ?")) {
      const fromDate = String(params[expParamIdx++] || "").slice(0, 10);
      activeExp = activeExp.filter((e) => String(e.created_at || "").slice(0, 10) >= fromDate);
    }
    if (sqlLower.includes("created_at <= ?")) {
      const toDate = String(params[expParamIdx++] || "").slice(0, 10);
      activeExp = activeExp.filter((e) => String(e.created_at || "").slice(0, 10) <= toDate);
    }
    if (sqlLower.includes("total_expenses") && sqlLower.includes("total_vendor_purchases")) {
      const opTotal = activeExp
        .filter((e) => e.category !== "vendor_purchase")
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      const vpTotal = activeExp
        .filter((e) => e.category === "vendor_purchase")
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      return [
        [
          {
            total_expenses: opTotal,
            total_vendor_purchases: vpTotal,
            this_month: opTotal,
            last_30_days: opTotal,
            total_count: activeExp.length,
          },
        ],
        [],
      ];
    }
    if (sqlLower.includes("group by category")) {
      const byCat = new Map<string, { category: string; total: number; count: number }>();
      for (const e of activeExp) {
        const cur = byCat.get(e.category) || { category: e.category, total: 0, count: 0 };
        cur.total += Number(e.amount || 0);
        cur.count += 1;
        byCat.set(e.category, cur);
      }
      return [Array.from(byCat.values()), []];
    }
    if (sqlLower.includes("group by date_format")) {
      const month = now.toISOString().slice(0, 7);
      const total = activeExp.reduce((s, e) => s + Number(e.amount || 0), 0);
      return [[{ month, total, count: activeExp.length }], []];
    }
    if (sqlLower.includes("count(*)")) {
      return [[{ total: activeExp.length }], []];
    }
    return [
      activeExp.map((e) => ({
        ...e,
        recorded_by_name: "Yonas Mindaye",
        recorded_by_username: "admin",
      })),
      [],
    ];
  }

  if (sqlLower.includes("insert into expenses")) {
    const exp = {
      id: params[0] || crypto.randomUUID(),
      category: params[1] || "operational",
      description: params[2] || "Expense",
      amount: Number(params[3] || 0),
      vendor_order_id: params[4] || null,
      notes: params[5] || null,
      recorded_by: params[6] || "00000000-0000-0000-0000-000000000001",
      created_at: daysAgo(0),
      voided_at: null,
    };
    store.expenses.unshift(exp);
    return [{ affectedRows: 1, insertId: exp.id }, []];
  }

  if (sqlLower.includes("from vendor_orders")) {
    let list = [...store.vendor_orders];
    if (sqlLower.includes("created_at >= ?") && params[0]) {
      const sinceDate = String(params[0]).slice(0, 10);
      list = list.filter((vo) => String(vo.created_at || "").slice(0, 10) >= sinceDate);
    }
    if (sqlLower.includes("count(*)")) {
      return [[{ total: list.length, cnt: list.length, count: list.length }], []];
    }
    if (sqlLower.includes("'vendor' as category")) {
      return [
        list.map((vo) => ({
          id: vo.id,
          category: "vendor",
          title: `Vendor Purchase: ${vo.vendor_name}`,
          body: `Item: ${vo.item} | Amount: ${vo.amount} | Status: ${vo.status}`,
          created_at: vo.created_at,
          metadata: {
            vendor_order_id: vo.id,
            vendor_name: vo.vendor_name,
            item: vo.item,
            amount: vo.amount,
            price: vo.price,
            status: vo.status,
          },
        })),
        [],
      ];
    }
    return [list, []];
  }

  if (sqlLower.includes("from stock_requests")) {
    let list = [...store.stock_requests];
    if (sqlLower.includes("created_at >= ?") && params[0]) {
      const sinceDate = String(params[0]).slice(0, 10);
      list = list.filter((sr) => String(sr.created_at || "").slice(0, 10) >= sinceDate);
    }
    if (sqlLower.includes("status = 'pending'")) {
      list = list.filter((sr) => String(sr.status || "").toLowerCase() === "pending");
    }
    if (sqlLower.includes("count(*)")) {
      return [[{ total: list.length, cnt: list.length, count: list.length }], []];
    }
    if (sqlLower.includes("'stock_request' as category")) {
      return [
        list.map((sr) => ({
          id: sr.id,
          category: "stock_request",
          title: `Stock Request: ${sr.item}`,
          body: `${sr.requested_by || "Staff"} needs ${sr.qty_needed} units${
            sr.package_size ? ` of ${sr.package_size}` : ""
          }${sr.delivery_date ? ` by ${sr.delivery_date}` : ""} (current stock: ${sr.stock_available})`,
          created_at: sr.created_at,
          metadata: {
            request_id: sr.id,
            item: sr.item,
            package_size: sr.package_size,
            qty_needed: sr.qty_needed,
            stock_available: sr.stock_available,
            status: sr.status,
            requested_by: sr.requested_by,
            delivery_date: sr.delivery_date,
          },
        })),
        [],
      ];
    }
    return [list, []];
  }

  if (sqlLower.includes("from inventory_movements")) {
    if (sqlLower.includes("units_sold_30d")) {
      return [[{ units_sold_30d: 18, units_restocked_30d: 80, units_lost_30d: 0 }], []];
    }
    let list = [...store.inventory_movements];
    if (sqlLower.includes("created_at >= ?") && params[0]) {
      const sinceDate = String(params[0]).slice(0, 10);
      list = list.filter((m) => String(m.created_at || "").slice(0, 10) >= sinceDate);
    }
    if (sqlLower.includes("count(*)")) {
      return [[{ total: list.length, cnt: list.length, count: list.length }], []];
    }
    const enriched = list.map((m) => {
      const p = store.products.find((prod) => prod.id === m.product_id);
      return {
        ...m,
        product_name: p?.name ?? "Product",
        package_size: p?.package_size ?? "100g",
        title: `Low Stock: ${p?.name ?? "Product"} (${p?.package_size ?? ""})`,
        body: `Only ${m.quantity_after} units remaining (threshold: ${p?.low_stock_threshold ?? 10})`,
        category: "low_stock",
        metadata: {
          product_id: p?.id,
          product_name: p?.name,
          package_size: p?.package_size,
          quantity_after: m.quantity_after,
          threshold: p?.low_stock_threshold,
          order_id: m.reference_id,
        },
      };
    });
    return [enriched, []];
  }

  // ── 8. Videos, Media, Audit Log, SMS ──────────────────────────────────────
  if (sqlLower.includes("from community_videos")) {
    return [store.community_videos, []];
  }
  if (sqlLower.includes("from site_assets")) {
    return [store.site_assets, []];
  }
  if (sqlLower.includes("from audit_log")) {
    if (sqlLower.includes("count(*)")) {
      return [[{ total: store.audit_log.length }], []];
    }
    return [store.audit_log, []];
  }
  if (sqlLower.includes("insert into audit_log")) {
    store.audit_log.unshift({
      id: store.audit_log.length + 1,
      table_name: params[0] || "system",
      record_id: params[1] || null,
      order_id: null,
      actor: params[2] || "admin",
      action: params[3] || "ACTION",
      old_values: null,
      new_values: params[4] || null,
      created_at: daysAgo(0),
    });
    return [{ affectedRows: 1 }, []];
  }
  if (sqlLower.includes("from sms_templates")) {
    return [store.sms_templates, []];
  }
  if (sqlLower.includes("from sms_campaigns")) {
    if (sqlLower.includes("count(*)")) return [[{ total: store.sms_campaigns.length }], []];
    return [store.sms_campaigns, []];
  }
  if (sqlLower.includes("from sms_messages")) {
    if (sqlLower.includes("count(*)")) return [[{ total: 0, n: 0, depth: 0 }], []];
    return [store.sms_messages, []];
  }

  // Default fallback for any other SELECT / COUNT / INSERT / UPDATE
  if (sqlLower.includes("count(*)")) {
    return [[{ total: 0, count: 0, cnt: 0, n: 0 }], []];
  }
  if (sqlLower.startsWith("select")) {
    return [[], []];
  }
  return [{ affectedRows: 1, insertId: 1 }, []];
}
