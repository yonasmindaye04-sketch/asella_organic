import { google } from "googleapis";
import pool from "../config/db.js";
import fs from "fs";
import crypto from "crypto";

const IS_CONFIGURED = !!(process.env.GOOGLE_SPREADSHEET_ID && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_PATH));

function getAuth() {
  let credentials: object;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const raw = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_PATH, "utf8");
    credentials = JSON.parse(raw);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    throw new Error("Neither GOOGLE_SERVICE_ACCOUNT_PATH nor GOOGLE_SERVICE_ACCOUNT_JSON is set");
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

const SPREADSHEET_ID = () => {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID is not set");
  return id;
};

// ─── Tab Schemas ───────────────────────────────────────────────────────────

const TAB_SCHEMAS: Record<string, string[]> = {
  Orders: [
    "ID", "Date", "Source", "Customer Name", "Phone", "City",
    "Location", "Gender", "Age Group", "Order Type", "Franchise Type",
    "Items Summary", "Total", "Payment Method", "Status", "Notes",
  ],
  OrderStatusHistory: [
    "ID", "Order ID", "Old Status", "New Status", "Changed By", "Note", "Timestamp",
  ],
  Payments: [
    "ID", "Order ID", "Amount", "Payment Method", "Transaction ID",
    "Status", "Paid At", "Recorded By", "Notes", "Created At",
  ],
  StockMovements: [
    "ID", "Date", "Product Name", "Package Size", "Movement Type",
    "Change Amount", "Quantity After", "Reason", "Reference ID",
    "Reference Type", "Performed By", "Notes",
  ],
  VendorOrders: [
    "ID", "Order Ref", "Product", "Item", "Amount/Quantity", "Price",
    "Vendor Name", "Status", "Delivery Date", "Created At", "Updated At",
  ],
  VendorOrderStatusHistory: [
    "ID", "Vendor Order ID", "Old Status", "New Status", "Changed By", "Note", "Timestamp",
  ],
  Expenses: [
    "ID", "Category", "Description", "Amount", "Vendor Order ID",
    "Recorded By", "Notes", "Created At",
  ],
  DeliveryAssignments: [
    "Order ID", "Driver Username", "Claimed At", "Delivered At", "Message ID",
  ],
  OrderDeletions: [
    "Order ID", "Deleted At", "Deleted By", "Deleted By IP", "Reason",
  ],
};

// ─── Generic Helpers ───────────────────────────────────────────────────────

async function ensureSheetAndHeaders(sheetName: string, headers: string[]): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = SPREADSHEET_ID();

  const doc = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = doc.data.sheets?.some((s: any) => s.properties?.title === sheetName);

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    console.log(`[sheets] Created missing tab: ${sheetName}`);
  }

  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  });

  const hasData = headerCheck.data.values && headerCheck.data.values.length > 0;
  if (!hasData) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
    console.log(`[sheets] Initialized headers for tab: ${sheetName}`);
  }
}

async function appendRow(sheetName: string, row: any[]): Promise<void> {
  if (!IS_CONFIGURED) return;
  const sheets = getSheets();
  const headers = TAB_SCHEMAS[sheetName];
  if (!headers) throw new Error(`Unknown sheet tab: ${sheetName}`);

  await ensureSheetAndHeaders(sheetName, headers);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheetName}!A:ZZ`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

function safe(fn: () => Promise<void>, label: string): void {
  void (async () => {
    try {
      await fn();
    } catch (err: any) {
      console.error(`[sheets] ${label} failed:`, err?.message);
    }
  })();
}

function etDate(d?: string | Date | null): string {
  if (!d) return new Date().toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" });
  return new Date(d).toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" });
}

// ─── Orders Tab (existing, unchanged) ──────────────────────────────────────

function mapOrderToRow(order: Record<string, any>): any[] {
  const itemsSummary = Array.isArray(order.items)
    ? order.items.map((i: any) => `${i.name || i.item_name} x${i.quantity}`).join(", ")
    : order.items_summary ?? "";

  return [
    order.id,
    etDate(order.created_at),
    order.source         ?? "",
    order.customer_name  ?? "",
    order.phone          ?? "",
    order.city           ?? "",
    order.location       ?? "",
    order.gender         ?? "",
    order.age_group      ?? "",
    order.order_type     ?? "",
    order.franchise_type ?? "",
    itemsSummary,
    order.total          ?? 0,
    order.payment_method ?? "",
    order.status         ?? "",
    order.notes          ?? "",
  ];
}

export async function mirrorToSheets(order: Record<string, any>): Promise<void> {
  safe(async () => {
    await appendRow("Orders", mapOrderToRow(order));
    console.log(`[sheets] Order ${order.id} mirrored`);
  }, "mirrorToSheets");
}

// ─── Order Status History Tab ──────────────────────────────────────────────

export async function mirrorOrderStatusToSheets(data: {
  orderId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string;
  note?: string | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("OrderStatusHistory", [
      crypto.randomUUID(),
      data.orderId,
      data.oldStatus ?? "",
      data.newStatus,
      data.changedBy,
      data.note ?? "",
      etDate(),
    ]);
    console.log(`[sheets] Order status history: ${data.orderId} → ${data.newStatus}`);
  }, "mirrorOrderStatusToSheets");
}

// ─── Payments Tab ──────────────────────────────────────────────────────────

export async function mirrorPaymentToSheets(data: {
  id?: string;
  orderId: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string | null;
  status: string;
  paidAt?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("Payments", [
      data.id ?? crypto.randomUUID(),
      data.orderId,
      data.amount,
      data.paymentMethod,
      data.transactionId ?? "",
      data.status,
      data.paidAt ?? "",
      data.recordedBy ?? "",
      data.notes ?? "",
      etDate(),
    ]);
    console.log(`[sheets] Payment mirrored: ${data.orderId} (${data.amount})`);
  }, "mirrorPaymentToSheets");
}

// ─── Stock Movements Tab ───────────────────────────────────────────────────

export async function mirrorStockMovementToSheets(data: {
  id?: string;
  productName: string;
  packageSize?: string;
  movementType: string;
  changeAmount: number;
  quantityAfter: number;
  reason: string;
  referenceId?: string | null;
  referenceType?: string | null;
  performedBy?: string | null;
  notes?: string | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("StockMovements", [
      data.id ?? "",
      etDate(),
      data.productName,
      data.packageSize ?? "",
      data.movementType,
      data.changeAmount,
      data.quantityAfter,
      data.reason,
      data.referenceId ?? "",
      data.referenceType ?? "",
      data.performedBy ?? "",
      data.notes ?? "",
    ]);
  }, "mirrorStockMovementToSheets");
}

// ─── Vendor Orders Tab ─────────────────────────────────────────────────────

export async function mirrorVendorOrderToSheets(data: {
  id: string;
  orderId: string;
  productName?: string | null;
  item: string;
  amount: string;
  price: number;
  vendorName: string;
  status: string;
  deliveryDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): Promise<void> {
  safe(async () => {
    await appendRow("VendorOrders", [
      data.id,
      data.orderId,
      data.productName ?? "",
      data.item,
      data.amount,
      data.price,
      data.vendorName,
      data.status,
      data.deliveryDate ?? "",
      etDate(data.createdAt),
      data.updatedAt ? etDate(data.updatedAt) : "",
    ]);
    console.log(`[sheets] Vendor order mirrored: ${data.orderId}`);
  }, "mirrorVendorOrderToSheets");
}

// ─── Vendor Order Status History Tab ───────────────────────────────────────

export async function mirrorVendorOrderStatusToSheets(data: {
  vendorOrderId: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  note?: string | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("VendorOrderStatusHistory", [
      crypto.randomUUID(),
      data.vendorOrderId,
      data.oldStatus,
      data.newStatus,
      data.changedBy,
      data.note ?? "",
      etDate(),
    ]);
    console.log(`[sheets] Vendor order status: ${data.vendorOrderId} → ${data.newStatus}`);
  }, "mirrorVendorOrderStatusToSheets");
}

// ─── Expenses Tab ──────────────────────────────────────────────────────────

export async function mirrorExpenseToSheets(data: {
  id: string;
  category: string;
  description: string;
  amount: number;
  vendorOrderId?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("Expenses", [
      data.id,
      data.category,
      data.description,
      data.amount,
      data.vendorOrderId ?? "",
      data.recordedBy ?? "",
      data.notes ?? "",
      etDate(),
    ]);
    console.log(`[sheets] Expense mirrored: ${data.id} (${data.amount})`);
  }, "mirrorExpenseToSheets");
}

// ─── Delivery Assignments Tab ──────────────────────────────────────────────

export async function mirrorDeliveryAssignmentToSheets(data: {
  orderId: string;
  driverUsername: string;
  claimedAt?: string;
  deliveredAt?: string | null;
  messageId?: number | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("DeliveryAssignments", [
      data.orderId,
      data.driverUsername,
      data.claimedAt ? etDate(data.claimedAt) : etDate(),
      data.deliveredAt ? etDate(data.deliveredAt) : "",
      data.messageId ?? "",
    ]);
    console.log(`[sheets] Delivery assignment: ${data.orderId} → ${data.driverUsername}`);
  }, "mirrorDeliveryAssignmentToSheets");
}

// ─── Order Deletions Tab ──────────────────────────────────────────────────

export async function mirrorOrderDeletionToSheets(data: {
  orderId: string;
  deletedBy: string | null;
  ip: string | null;
  reason: string | null;
}): Promise<void> {
  safe(async () => {
    await appendRow("OrderDeletions", [
      data.orderId,
      etDate(),
      data.deletedBy ?? "",
      data.ip ?? "",
      data.reason ?? "",
    ]);
    console.log(`[sheets] Order deletion logged: ${data.orderId}`);
  }, "mirrorOrderDeletionToSheets");
}

// ─── Batch Sync: Backfill All Data ─────────────────────────────────────────

export async function syncAllToSheets(): Promise<{ orders: number; history: number; stock: number; vendorOrders: number; expenses: number }> {
  const result = { orders: 0, history: 0, stock: 0, vendorOrders: 0, expenses: 0 };

  try {
    // Orders
    const [orders] = await pool.query(`SELECT * FROM orders ORDER BY created_at ASC`) as [any[], any];
    if (orders.length) {
      for (const order of orders) {
        await appendRow("Orders", mapOrderToRow(order));
        result.orders++;
      }
    }

    // Order Status History
    const [history] = await pool.query(`SELECT * FROM order_status_history ORDER BY created_at ASC`) as [any[], any];
    for (const h of history) {
      await appendRow("OrderStatusHistory", [
        h.id, h.order_id, h.old_status ?? "", h.new_status, h.changed_by, h.note ?? "", etDate(h.created_at),
      ]);
      result.history++;
    }

    // Stock Movements
    const [stock] = await pool.query(
      `SELECT im.*, p.name AS product_name, p.package_size
       FROM inventory_movements im
       LEFT JOIN products p ON im.product_id = p.id
       ORDER BY im.created_at ASC`
    ) as [any[], any];
    for (const s of stock) {
      await appendRow("StockMovements", [
        s.id, etDate(s.created_at), s.product_name ?? "Unknown", s.package_size ?? "",
        s.movement_type, s.change_amount, s.quantity_after, s.reason,
        s.reference_id ?? "", s.reference_type ?? "", s.performed_by ?? "", s.notes ?? "",
      ]);
      result.stock++;
    }

    // Vendor Orders
    const [vo] = await pool.query(
      `SELECT vo.*, p.name AS product_name
       FROM vendor_orders vo
       LEFT JOIN products p ON vo.product_id = p.id
       ORDER BY vo.created_at ASC`
    ) as [any[], any];
    for (const v of vo) {
      await appendRow("VendorOrders", [
        v.id, v.order_id, v.product_name ?? "", v.item, v.amount, v.price,
        v.vendor_name, v.status, v.delivery_date ?? "", etDate(v.created_at), v.updated_at ? etDate(v.updated_at) : "",
      ]);
      result.vendorOrders++;
    }

    // Expenses
    const [exp] = await pool.query(`SELECT * FROM expenses ORDER BY created_at ASC`) as [any[], any];
    for (const e of exp) {
      await appendRow("Expenses", [
        e.id, e.category, e.description, e.amount,
        e.vendor_order_id ?? "", e.recorded_by ?? "", e.notes ?? "", etDate(e.created_at),
      ]);
      result.expenses++;
    }

    console.log(`[sheets] Sync complete: ${JSON.stringify(result)}`);
  } catch (err: any) {
    console.error("[sheets] syncAllToSheets failed:", err?.message);
  }

  return result;
}
