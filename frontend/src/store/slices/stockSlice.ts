/**
 * src/store/slices/stockSlice.ts
 * Asella Organic — Redux Toolkit slice for Inventory Management
 *
 * Fix: 401 Unauthorized on all stock API calls
 *   Root cause: apiFetch() called localStorage.getItem("token") which is null
 *   after the auth migration to HttpOnly cookies.
 *
 *   Fix: Add credentials: "include" to every fetch so the browser sends
 *   the access_token cookie automatically. Also keep the Bearer header
 *   fallback for API clients / Postman that still use localStorage.
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

// ─── Types ────────────────────────────────────────────────────────────────

export type StockStatus = "ok" | "low" | "critical" | "out_of_stock";

export interface StockItem {
  id:                   string;
  name:                 string;
  package_size:         string;
  price:                number;
  current_quantity:     number;
  low_stock_threshold:  number;
  stock_status:         StockStatus;
  stock_value:          number;
  last_movement_at:     string | null;
  last_movement_type:   string | null;
  tag:                  string | null;
  image_url:            string | null;
}

export interface InventorySummary {
  total_products:      number;
  total_units:         number;
  total_stock_value:   number;
  out_of_stock_count:  number;
  critical_count:      number;
  low_count:           number;
  ok_count:            number;
  movements_30d:       number;
  units_sold_30d:      number;
  units_received_30d:  number;
}

export interface InventoryMovement {
  id:                    string;
  movement_type:         string;
  change_amount:         number;
  reason:                string;
  quantity_after:        number;
  notes:                 string | null;
  reference_id:          string | null;
  reference_type:        string | null;
  created_at:            string;
  product_id:            string;
  product_name:          string;
  package_size:          string;
  performed_by_name:     string | null;
  performed_by_username: string | null;
}

export interface MovementsMeta {
  total:  number;
  page:   number;
  limit:  number;
  pages:  number;
}

export interface StockRequest {
  id:                    string;
  product_id:            string | null;
  item:                  string;
  package_size:          string | null;
  stock_available:       number;
  qty_needed:            number;
  delivery_date:         string | null;
  requested_by:          string | null;
  requested_by_username: string | null;
  requested_by_name:     string | null;
  product_name:          string | null;
  current_stock:         number | null;
  status:                "pending" | "ordered" | "received" | "cancelled";
  notes:                 string | null;
  created_at:            string;
  updated_at:            string;
}

interface StockState {
  // Overview
  items:          StockItem[];
  itemsLoading:   boolean;
  itemsError:     string | null;
  itemsFilter:    { search: string; status: StockStatus | "" };

  // Summary KPIs
  summary:        InventorySummary | null;
  summaryLoading: boolean;

  // Global movements log
  movements:      InventoryMovement[];
  movementsMeta:  MovementsMeta | null;
  movementsLoading: boolean;
  movementsFilter: {
    product_id:     string;
    type:           string;
    reference_type: string;
    from:           string;
    to:             string;
    page:           number;
  };

  // Stock requests
  requests:        StockRequest[];
  requestsLoading: boolean;

  // Adjustment modal
  adjustmentLoading: boolean;
  adjustmentError:   string | null;
}

// ─── API helper ───────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Central fetch helper.
 *
 * FIX: credentials: "include" sends the HttpOnly access_token cookie
 * automatically on every request. localStorage token kept as fallback
 * so Postman / CLI callers still work.
 */
async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  // Prefer cookie auth (browser). Fall back to localStorage for API clients.
  const localToken = localStorage.getItem("token");

  const res = await fetch(`${API}${path}`, {
    credentials: "include",                          // ← THE FIX
    headers: {
      "Content-Type": "application/json",
      ...(localToken ? { Authorization: `Bearer ${localToken}` } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data;
}

// ─── Thunks ───────────────────────────────────────────────────────────────

export const fetchStock = createAsyncThunk(
  "stock/fetchStock",
  async (params: { search?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.status) qs.set("status", params.status);
    const query = qs.toString() ? `?${qs}` : "";
    return apiFetch(`/stock${query}`) as Promise<StockItem[]>;
  }
);

export const fetchStockSummary = createAsyncThunk(
  "stock/fetchSummary",
  async () => apiFetch("/stock/summary") as Promise<InventorySummary>
);

export const fetchMovements = createAsyncThunk(
  "stock/fetchMovements",
  async (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== "" && v !== undefined)
          .map(([k, v]) => [k, String(v)])
      )
    );
    const query = qs.toString() ? `?${qs}` : "";
    const localToken = localStorage.getItem("token");
    const res = await fetch(`${API}/stock/movements${query}`, {
      credentials: "include",                        // ← THE FIX
      headers: {
        "Content-Type": "application/json",
        ...(localToken ? { Authorization: `Bearer ${localToken}` } : {}),
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return { data: json.data as InventoryMovement[], meta: json.meta as MovementsMeta };
  }
);

export const fetchStockRequests = createAsyncThunk(
  "stock/fetchRequests",
  async (params: { status?: string; item?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.item)   qs.set("item", params.item);
    const query = qs.toString() ? `?${qs}` : "";
    return apiFetch(`/stock/requests${query}`) as Promise<StockRequest[]>;
  }
);

export const submitAdjustment = createAsyncThunk(
  "stock/submitAdjustment",
  async (payload: {
    product_id:    string;
    movement_type: string;
    change_amount: number;
    reason:        string;
    notes?:        string;
  }, { rejectWithValue }) => {
    try {
      return await apiFetch("/stock/adjustment", {
        method: "POST",
        body:   JSON.stringify(payload),
      });
    } catch (err: any) {
      return rejectWithValue(err.message ?? "Adjustment failed");
    }
  }
);

export const receiveVendorOrder = createAsyncThunk(
  "stock/receiveVendorOrder",
  async (payload: { vendorOrderId: string; notes?: string }, { rejectWithValue }) => {
    try {
      return await apiFetch(`/stock/receive/${payload.vendorOrderId}`, {
        method: "POST",
        body:   JSON.stringify({ notes: payload.notes }),
      });
    } catch (err: any) {
      return rejectWithValue(err.message ?? "Receive failed");
    }
  }
);

export const updateRequestStatus = createAsyncThunk(
  "stock/updateRequestStatus",
  async (payload: { id: string; status: string; notes?: string }) => {
    return apiFetch(`/stock/requests/${payload.id}/status`, {
      method: "PATCH",
      body:   JSON.stringify({ status: payload.status, notes: payload.notes }),
    });
  }
);

// ─── Initial state ────────────────────────────────────────────────────────

const initialState: StockState = {
  items:          [],
  itemsLoading:   false,
  itemsError:     null,
  itemsFilter:    { search: "", status: "" },

  summary:        null,
  summaryLoading: false,

  movements:        [],
  movementsMeta:    null,
  movementsLoading: false,
  movementsFilter: {
    product_id: "", type: "", reference_type: "", from: "", to: "", page: 1,
  },

  requests:        [],
  requestsLoading: false,

  adjustmentLoading: false,
  adjustmentError:   null,
};

// ─── Slice ────────────────────────────────────────────────────────────────

const stockSlice = createSlice({
  name: "stock",
  initialState,
  reducers: {
    setItemsFilter(state, action: PayloadAction<Partial<StockState["itemsFilter"]>>) {
      state.itemsFilter = { ...state.itemsFilter, ...action.payload };
    },
    setMovementsFilter(state, action: PayloadAction<Partial<StockState["movementsFilter"]>>) {
      state.movementsFilter = { ...state.movementsFilter, ...action.payload };
    },
    clearAdjustmentError(state) {
      state.adjustmentError = null;
    },
  },
  extraReducers: (builder) => {
    // fetchStock
    builder
      .addCase(fetchStock.pending,   (s) => { s.itemsLoading = true;  s.itemsError = null; })
      .addCase(fetchStock.fulfilled, (s, a) => { s.itemsLoading = false; s.items = a.payload; })
      .addCase(fetchStock.rejected,  (s, a) => { s.itemsLoading = false; s.itemsError = a.error.message ?? "Failed"; });

    // fetchStockSummary
    builder
      .addCase(fetchStockSummary.pending,   (s) => { s.summaryLoading = true; })
      .addCase(fetchStockSummary.fulfilled, (s, a) => { s.summaryLoading = false; s.summary = a.payload; })
      .addCase(fetchStockSummary.rejected,  (s) => { s.summaryLoading = false; });

    // fetchMovements
    builder
      .addCase(fetchMovements.pending,   (s) => { s.movementsLoading = true; })
      .addCase(fetchMovements.fulfilled, (s, a) => {
        s.movementsLoading = false;
        s.movements        = a.payload.data;
        s.movementsMeta    = a.payload.meta;
      })
      .addCase(fetchMovements.rejected, (s) => { s.movementsLoading = false; });

    // fetchStockRequests
    builder
      .addCase(fetchStockRequests.pending,   (s) => { s.requestsLoading = true; })
      .addCase(fetchStockRequests.fulfilled, (s, a) => { s.requestsLoading = false; s.requests = a.payload; })
      .addCase(fetchStockRequests.rejected,  (s) => { s.requestsLoading = false; });

    // submitAdjustment
    builder
      .addCase(submitAdjustment.pending,   (s) => { s.adjustmentLoading = true;  s.adjustmentError = null; })
      .addCase(submitAdjustment.fulfilled, (s) => { s.adjustmentLoading = false; })
      .addCase(submitAdjustment.rejected,  (s, a) => {
        s.adjustmentLoading = false;
        s.adjustmentError   = (a.payload as string) ?? "Adjustment failed";
      });

    // updateRequestStatus — update in-place
    builder.addCase(updateRequestStatus.fulfilled, (s, a) => {
      const updated = a.payload as StockRequest;
      const idx = s.requests.findIndex((r) => r.id === updated.id);
      if (idx !== -1) s.requests[idx] = updated;
    });
  },
});

export const { setItemsFilter, setMovementsFilter, clearAdjustmentError } = stockSlice.actions;
export default stockSlice.reducer;
