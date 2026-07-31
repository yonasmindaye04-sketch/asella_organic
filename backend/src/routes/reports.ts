import { Router, Request, Response } from "express";
import { authenticate, authorise } from "../middleware/auth.js";
import pool from "../config/db.js";
import { createLogger } from "../lib/logger.js";


const router = Router();

// ─── GET /api/reports/pl ──────────────────────────────────────────────
router.get(
  "/pl",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { from, to } = req.query as Record<string, string | undefined>;
      
      let dateWhereOrders = "deleted_at IS NULL AND status NOT IN ('Cancelled', 'CANCELLED')";
      let dateWhereExpenses = "voided_at IS NULL AND category != 'vendor_purchase'";
      
      const paramsOrders: unknown[] = [];
      const paramsExpenses: unknown[] = [];
      
      if (from) {
        dateWhereOrders += " AND created_at >= ?";
        dateWhereExpenses += " AND created_at >= ?";
        paramsOrders.push(from);
        paramsExpenses.push(from);
      }
      
      if (to) {
        dateWhereOrders += " AND created_at <= ?";
        dateWhereExpenses += " AND created_at <= ?";
        paramsOrders.push(`${to} 23:59:59`);
        paramsExpenses.push(`${to} 23:59:59`);
      }

      // 1. Get Revenue & COGS
      const [orderRows] = await pool.query(
        `SELECT id, total FROM orders WHERE ${dateWhereOrders}`,
        paramsOrders
      ) as [any[], any];
      
      let revenue = 0;
      let cogs = 0;
      const orderIds = orderRows.map(o => o.id);
      
      revenue = orderRows.reduce((sum, o) => sum + Number(o.total || 0), 0);
      
      if (orderIds.length > 0) {
        const [itemRows] = await pool.query(
          `SELECT quantity, unit_cost FROM order_items WHERE order_id IN (?)`,
          [orderIds]
        ) as [any[], any];
        
        cogs = itemRows.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_cost || 0)), 0);
      }
      
      const gross_profit = revenue - cogs;
      const gross_margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;
      
      // 2. Get Operating Expenses
      const [expenseRows] = await pool.query(
        `SELECT category, SUM(amount) as total 
         FROM expenses 
         WHERE ${dateWhereExpenses}
         GROUP BY category`,
        paramsExpenses
      ) as [any[], any];
      
      const operating_expenses = {
        operational: 0,
        salary: 0,
        affiliate_payout: 0,
        other: 0,
        total: 0
      };
      
      expenseRows.forEach(row => {
        const cat = row.category as keyof typeof operating_expenses;
        if (operating_expenses[cat] !== undefined) {
          operating_expenses[cat] = Number(row.total);
          operating_expenses.total += Number(row.total);
        }
      });
      
      const net_profit = gross_profit - operating_expenses.total;
      const net_margin_pct = revenue > 0 ? (net_profit / revenue) * 100 : 0;
      
      res.json({
        success: true,
        data: {
          period: { from: from || null, to: to || null },
          revenue,
          cogs,
          gross_profit,
          gross_margin_pct: Number(gross_margin_pct.toFixed(2)),
          operating_expenses,
          net_profit,
          net_margin_pct: Number(net_margin_pct.toFixed(2)),
          total_orders: orderRows.length,
          avg_order_value: orderRows.length > 0 ? revenue / orderRows.length : 0
        }
      });
      
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to generate P&L report", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── GET /api/reports/pl/export ───────────────────────────────────────
router.get(
  "/pl/export",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { from, to } = req.query as Record<string, string | undefined>;
      
      // Fetch the JSON payload first by re-using the logic (we just fetch from our own DB)
      let dateWhereOrders = "deleted_at IS NULL AND status NOT IN ('Cancelled', 'CANCELLED')";
      let dateWhereExpenses = "voided_at IS NULL AND category != 'vendor_purchase'";
      const paramsOrders: unknown[] = [];
      const paramsExpenses: unknown[] = [];
      if (from) { dateWhereOrders += " AND created_at >= ?"; dateWhereExpenses += " AND created_at >= ?"; paramsOrders.push(from); paramsExpenses.push(from); }
      if (to) { dateWhereOrders += " AND created_at <= ?"; dateWhereExpenses += " AND created_at <= ?"; paramsOrders.push(`${to} 23:59:59`); paramsExpenses.push(`${to} 23:59:59`); }

      const [orderRows] = await pool.query(`SELECT id, total FROM orders WHERE ${dateWhereOrders}`, paramsOrders) as [any[], any];
      const revenue = orderRows.reduce((sum, o) => sum + Number(o.total || 0), 0);
      let cogs = 0;
      if (orderRows.length > 0) {
        const orderIds = orderRows.map(o => o.id);
        const [itemRows] = await pool.query(`SELECT quantity, unit_cost FROM order_items WHERE order_id IN (?)`, [orderIds]) as [any[], any];
        cogs = itemRows.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_cost || 0)), 0);
      }
      const gross_profit = revenue - cogs;
      
      const [expenseRows] = await pool.query(`SELECT category, SUM(amount) as total FROM expenses WHERE ${dateWhereExpenses} GROUP BY category`, paramsExpenses) as [any[], any];
      const opEx = { operational: 0, salary: 0, affiliate_payout: 0, other: 0, total: 0 };
      expenseRows.forEach(row => {
        const cat = row.category as keyof typeof opEx;
        if (opEx[cat] !== undefined) { opEx[cat] = Number(row.total); opEx.total += Number(row.total); }
      });
      const net_profit = gross_profit - opEx.total;
      
      // Generate CSV
      let csv = "Category,Amount (ETB)\n";
      csv += `Revenue,${revenue}\n`;
      csv += `Cost of Goods Sold (COGS),${cogs}\n`;
      csv += `Gross Profit,${gross_profit}\n`;
      csv += `\n`;
      csv += `Operating Expenses,\n`;
      csv += ` - Operational,${opEx.operational}\n`;
      csv += ` - Salary,${opEx.salary}\n`;
      csv += ` - Affiliate Payouts,${opEx.affiliate_payout}\n`;
      csv += ` - Other,${opEx.other}\n`;
      csv += `Total Operating Expenses,${opEx.total}\n`;
      csv += `\n`;
      csv += `Net Profit,${net_profit}\n`;
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="pl_report_${from || 'all'}_to_${to || 'all'}.csv"`);
      res.send(csv);
    } catch (err) {
      const log = createLogger(req);
      log.error("Failed to export P&L report", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
