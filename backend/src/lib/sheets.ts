/**
 * src/lib/sheets.ts
 * Asella Organic — Google Sheets Integration (MySQL Compatible)
 *
 * Handles real-time order mirroring, bulk backups, and full database syncing.
 * Automatically provisions missing tabs and headers to prevent parsing errors.
 */

import { google } from "googleapis";
import pool from "../config/db.js";

// ─── Auth singleton ───────────────────────────────────────────────

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");

  const credentials = JSON.parse(json);
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

// ─── Schema Definitions ───────────────────────────────────────────

const ORDER_HEADERS = [
  "ID", "Date", "Source", "Customer Name", "Phone", "City", 
  "Location", "Gender", "Age Group", "Order Type", "Franchise Type", 
  "Items Summary", "Total", "Payment Method", "Status", "Notes"
];

// ─── Initialization Helper ────────────────────────────────────────

async function ensureSheetAndHeaders(sheetName: string, headers: string[]): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = SPREADSHEET_ID();

  const doc = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = doc.data.sheets?.some(s => s.properties?.title === sheetName);

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName }
            }
          }
        ]
      }
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

// ─── Application Functions ────────────────────────────────────────

function mapOrderToRow(order: Record<string, any>): any[] {
  const dateValue = order.created_at 
    ? new Date(order.created_at).toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" })
    : new Date().toLocaleString("en-ET", { timeZone: "Africa/Addis_Ababa" });

  const itemsSummary = Array.isArray(order.items)
    ? order.items
        .map((i: any) => `${i.name || i.item_name} x${i.quantity}`)
        .join(", ")
    : order.items_summary ?? "";

  return [
    order.id,
    dateValue,
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
  try {
    const sheets = getSheets();
    const sheetName = "Orders";
    
    await ensureSheetAndHeaders(sheetName, ORDER_HEADERS);
    const row = mapOrderToRow(order);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID(),
      range: `${sheetName}!A:R`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    console.log(`[sheets] Order ${order.id} mirrored`);
  } catch (err: any) {
    console.error("[sheets] mirrorToSheets failed:", err?.message);
  }
}

export async function syncAllOrdersToSheets(): Promise<void> {
  try {
    const sheets = getSheets();
    const sheetName = "Orders";

    await ensureSheetAndHeaders(sheetName, ORDER_HEADERS);

    // MySQL Array destructuring update
    const [dbOrders] = await pool.query(
      `SELECT * FROM orders ORDER BY created_at ASC`
    ) as [any[], any];

    if (dbOrders.length === 0) {
      console.log("[sheets] No order records found in the database to sync.");
      return;
    }

    const dataRows = dbOrders.map(order => mapOrderToRow(order));

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID(),
      range: `${sheetName}!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: dataRows },
    });

    console.log(`[sheets] Successfully synced all historical records (${dbOrders.length} rows) to Google Sheets.`);
  } catch (err: any) {
    console.error("[sheets] Full database sync failed:", err?.message);
  }
}