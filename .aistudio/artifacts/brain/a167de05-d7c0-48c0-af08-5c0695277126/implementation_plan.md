# Asella Organic — Shadcn UI Kit Dashboard & Data Accuracy Plan

## 1. Overview & Goals
We will upgrade the Asella Organic Admin Dashboard (`/dashboard`) to match the clean **bundui/shadcn-ui-kit** aesthetic (Zinc/Slate surfaces with subtle emerald brand accents) and resolve all data accuracy, filtering, and visualization issues reported by the admin team.

---

## 2. Root Causes Identified & Fixes for Data Accuracy
1. **Charts Always Starting at `0` (`ChartsRow.tsx`)**:
   - **Cause**: `RevenueChart` and `TopProducts` previously generated 6 monthly buckets (`rangeMonths = 6`) regardless of the global date filter in `Dashboard.tsx` (which only fetched 1 month or 1 week of orders). As a result, the first 4–5 buckets on the X-axis had zero orders (`0, 0, 0, 0`) before the current month. Furthermore, choosing `1M` created only a single monthly bucket (1 data point).
   - **Fix**: Drive all chart time-bucketing directly from the global header filter (`day`, `week`, `month`, `custom`) and actual `from`/`to` dates:
     - **Day (`Today`)**: Hourly / 2-hour buckets across the day.
     - **Week (`7D`)**: Daily buckets for each of the 7 days (`EEE, MMM d`).
     - **1M (`30D`)**: Daily / 3-day buckets across the 30-day window.
     - **Custom (`from` → `to`)**: Adaptive bucketing based on day span ($\le 2$ days: hourly; $\le 14$ days: daily; $\le 90$ days: weekly/multi-day; $> 90$ days: monthly), trimming leading empty buckets before the first recorded activity when appropriate so trends start from real data rather than flat zeros.
2. **KPI Numbers Stuck at `0` (`KPICards.tsx`)**:
   - **Cause**: `AnimatedNumber` used a one-time `hasAnimated.current` ref guard that blocked updates whenever `target` changed after the initial render or when switching date ranges.
   - **Fix**: Update `AnimatedNumber` to animate from the previous value to the new `target` whenever `target` changes, and add period comparison / order count context on each KPI card.
3. **Order Query Truncation (`backend/src/routes/orders.ts` & `mockDb.ts`)**:
   - **Cause**: `Dashboard.tsx` requests `/api/orders?limit=1000`, but `backend/src/routes/orders.ts` clamped `limit` to `Math.min(100, ...)`, silently dropping orders in larger date windows.
   - **Fix**: Allow `limit` up to `2000` for authenticated dashboard queries and ensure mock database seed timestamps dynamically cover **Today**, **This Week**, and **This Month (`1M`)** so every filter preset shows realistic, non-zero Asella Organic data immediately.

---

## 3. Global Filtering System (`TimeRangeSelector.tsx` & `Dashboard.tsx`)
- **Single Global Filter in Dashboard Header**:
  - Replace the old `Today | This Week | This Month | 3 Months | 6 Months | All Time` selector and remove the duplicate per-card `1M | 3M | 6M | 12M` buttons.
  - Provide exactly the requested presets: **Day**, **Week**, **1M**, and **Custom**.
  - When **Custom** is selected, reveal a clean inline shadcn-style date range picker (`From` date input, `To` date input, and `Apply` / quick-reset control) right in the header bar.
  - Pass the active `activeRange`, `from`, and `to` props down to `KPICards`, `RevenueChart`, `TopProducts`, `SalesDistribution`, `SalesByLocation`, `Heatmap`, `Pipeline`, `EmployeePerformance`, and `AffiliateLeaderboard`.

---

## 4. Top Products Sales Trend (`ETB` & `Qty` Toggle + Breakdown)
- **Interactive Metric Toggle**:
  - Add a segmented control on the **Top Products Sales Trend** card to switch between **Birr Amount (`ETB`)** and **Items Sold (`Qty`)**.
  - Calculate product revenue accurately from `quantity * unit_price` on each order item and item count from `quantity`.
- **Dual Summary List + Multi-Series Trend Chart**:
  - Alongside the time-series trend chart, render a ranked Top Products summary table/list displaying each product's color indicator, **Units Sold (`Qty`)**, **Total Revenue (`ETB`)**, and **Share of Product Sales (`%`)**.

---

## 5. Shadcn UI Kit Layout & Visual Upgrade (`bundui/shadcn-ui-kit` Style)
- **Workspace Shell (`DashboardLayout.tsx`, `Sidebar.tsx`, `TopHeader.tsx`, `index.css`)**:
  - Remove the floating green background blobs (`ambient-blob`) in `DashboardLayout.tsx`.
  - Apply a crisp **Zinc/Slate** light & dark surface system (`#f8fafc` / `#09090b` canvas, `#ffffff` / `#18181b` cards, `1px` `#e4e4e7` / `#27272a` hairline borders) with subtle emerald (`#10b981` / `#059669`) brand accents.
  - Upgrade `Sidebar.tsx` and `TopHeader.tsx` to match the `bundui/shadcn-ui-kit` layout: clean brand header with Asella Organic emblem, grouped navigation with subtle active states and count indicators, breadcrumb trail in the top header, storefront shortcut, notifications button, and user profile menu.
- **Upgraded Charts & Data Cards**:
  - **KPI Cards Row**: 4-column metric grid (Total Revenue, Total Expenses & COGS, Net Profit & Margin %, Active Orders / Inventory Value) with tabular numerals and clear sub-metrics.
  - **Revenue & Profit Overview**: Smooth area/bar-line combination chart comparing **Revenue (ETB)**, **Expenses + COGS (ETB)**, and **Net Profit (ETB)** over the selected global time range, with summary totals in the card header.
  - **Sales Distribution by Channel**: Interactive Donut/Pie chart with center total revenue/share readout and a structured channel legend showing order count, ETB amount, and percentage share.
  - **Top Products Sales Trend**: Multi-series trend chart + ranked product breakdown with interactive **ETB / Qty** toggle.
  - **Sales by Location & Order Pipeline**: Horizontal bar / donut breakdown of regional sales (in both orders and ETB) and fulfillment stage pipeline (Delivered, Shipped/In Transit, Processing, Pending) with stage conversion metrics.
  - **Weekly Sales Heatmap, Employee Performance, Top Affiliates, and Low Stock Alerts**: Restyled into unified shadcn cards with tabular numerals.
