/**
 * frontend/tests/store/slices.test.ts
 * Asella Organic — Redux Slice Unit Tests
 *
 * Tests the slices that currently have zero coverage:
 *   • authSlice   — setCredentials, logout, persistence
 *   • stockSlice  — setItemsFilter, setMovementsFilter, clearAdjustmentError
 *   • uiSlice     — openOrderModal, closeOrderModal
 *
 * Pure reducer tests — no DOM, no network. Fastest possible feedback loop.
 * Run with:
 *   npx vitest tests/store/slices.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

import authReducer, { setCredentials, logout } from "../../src/store/slices/authSlice";
import stockReducer, {
  setItemsFilter,
  setMovementsFilter,
  clearAdjustmentError,
  submitAdjustment,
} from "../../src/store/slices/stockSlice";
import uiReducer, {
  openOrderModal,
  closeOrderModal,
} from "../../src/store/slices/uiSlice";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Spin up a fresh store for a given slice */
function makeStore() {
  return configureStore({
    reducer: {
      auth:  authReducer,
      stock: stockReducer,
      ui:    uiReducer,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// authSlice
// ═══════════════════════════════════════════════════════════════════════════

describe("authSlice", () => {
  beforeEach(() => {
    // Each test starts with a clean localStorage
    localStorage.clear();
  });

  it("returns the unauthenticated initial state when nothing is persisted", () => {
    const state = authReducer(undefined, { type: "@@INIT" });
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("setCredentials — stores user, sets isAuthenticated=true", () => {
    const user = { id: "u1", email: "yonas@asella.com", role: "admin" };
    const state = authReducer(undefined, setCredentials({ user }));

    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
  });

  it("setCredentials — persists user to localStorage", () => {
    const user = { id: "u1", email: "yonas@asella.com", role: "admin" };
    authReducer(undefined, setCredentials({ user }));

    expect(JSON.parse(localStorage.getItem("user")!)).toEqual(user);
  });

  it("logout — clears user and isAuthenticated", () => {
    // Start authenticated
    const user = { id: "u1", email: "y@asella.com", role: "admin" };
    let state = authReducer(undefined, setCredentials({ user }));
    expect(state.isAuthenticated).toBe(true);

    state = authReducer(state, logout());

    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("logout — removes user from localStorage", () => {
    const user = { id: "u1", email: "y@asella.com", role: "admin" };
    authReducer(undefined, setCredentials({ user }));
    authReducer(undefined, logout());

    expect(localStorage.getItem("user")).toBeNull();
  });

  it("setCredentials then logout leaves a clean state", () => {
    const store = makeStore();
    const user = { id: "u1", email: "y@asella.com", role: "admin" };

    store.dispatch(setCredentials({ user }));
    expect(store.getState().auth.isAuthenticated).toBe(true);

    store.dispatch(logout());
    expect(store.getState().auth.user).toBeNull();
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// stockSlice
// ═══════════════════════════════════════════════════════════════════════════

describe("stockSlice", () => {
  it("returns the initial state (empty items, no summary, no movements, no requests)", () => {
    const state = stockReducer(undefined, { type: "@@INIT" });
    expect(Array.isArray(state.items)).toBe(true);
    expect(state.items).toHaveLength(0);
    expect(state.summary).toBeNull();
    expect(Array.isArray(state.movements)).toBe(true);
    expect(Array.isArray(state.requests)).toBe(true);
    expect(state.requests).toHaveLength(0);
  });

  it("setItemsFilter — merges with the existing filter object", () => {
    let state = stockReducer(undefined, { type: "@@INIT" });
    state = stockReducer(state, setItemsFilter({ search: "Moringa" }));
    expect(state.itemsFilter.search).toBe("Moringa");
    expect(state.itemsFilter.status).toBe("");   // default value preserved

    state = stockReducer(state, setItemsFilter({ status: "low" }));
    expect(state.itemsFilter.search).toBe("Moringa"); // previous value preserved
    expect(state.itemsFilter.status).toBe("low");
  });

  it("setMovementsFilter — merges with the existing filter object", () => {
    let state = stockReducer(undefined, { type: "@@INIT" });
    state = stockReducer(state, setMovementsFilter({ type: "sale" }));
    expect(state.movementsFilter.type).toBe("sale");
    expect(state.movementsFilter.reference_type).toBe("");   // default preserved

    state = stockReducer(state, setMovementsFilter({ page: 3 }));
    expect(state.movementsFilter.type).toBe("sale"); // previous preserved
    expect(state.movementsFilter.page).toBe(3);
  });

  it("clearAdjustmentError — resets adjustmentError to null", () => {
    // Force an error into the state via a rejected thunk action
    let state = stockReducer(undefined, { type: "@@INIT" });
    state = stockReducer(state, {
      type: submitAdjustment.rejected.type,
      payload: "Insufficient stock",
    });
    expect(state.adjustmentError).toBe("Insufficient stock");

    state = stockReducer(state, clearAdjustmentError());
    expect(state.adjustmentError).toBeNull();
  });

  it("submitAdjustment.pending — sets loading true and clears any previous error", () => {
    let state = stockReducer(undefined, { type: "@@INIT" });
    state = stockReducer(state, { type: submitAdjustment.rejected.type, payload: "x" });
    state = stockReducer(state, { type: submitAdjustment.pending.type });
    expect(state.adjustmentLoading).toBe(true);
    expect(state.adjustmentError).toBeNull();
  });

  it("submitAdjustment.fulfilled — clears loading flag", () => {
    let state = stockReducer(undefined, { type: submitAdjustment.pending.type });
    state = stockReducer(state, { type: submitAdjustment.fulfilled.type, payload: {} });
    expect(state.adjustmentLoading).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// uiSlice
// ═══════════════════════════════════════════════════════════════════════════

describe("uiSlice", () => {
  it("returns the initial state (modal closed, mode=buy_now)", () => {
    const state = uiReducer(undefined, { type: "@@INIT" });
    expect(state.orderModalOpen).toBe(false);
    expect(state.orderFormMode).toBe("buy_now");
    expect(state.selectedProductId).toBeNull();
    expect(state.selectedProductName).toBeNull();
    expect(state.selectedProductPrice).toBeNull();
  });

  it("openOrderModal — opens the modal and stores product + mode", () => {
    const state = uiReducer(
      undefined,
      openOrderModal({ id: "p-1", name: "Moringa", price: 750, mode: "sales" })
    );
    expect(state.orderModalOpen).toBe(true);
    expect(state.orderFormMode).toBe("sales");
    expect(state.selectedProductId).toBe("p-1");
    expect(state.selectedProductName).toBe("Moringa");
    expect(state.selectedProductPrice).toBe(750);
  });

  it("openOrderModal — defaults mode to 'buy_now' when not provided", () => {
    const state = uiReducer(undefined, openOrderModal({ id: "p-1" }));
    expect(state.orderFormMode).toBe("buy_now");
  });

  it("closeOrderModal — closes the modal and clears the selected product", () => {
    let state = uiReducer(undefined, openOrderModal({ id: "p-1", name: "Moringa", price: 750 }));
    expect(state.orderModalOpen).toBe(true);

    state = uiReducer(state, closeOrderModal());
    expect(state.orderModalOpen).toBe(false);
    expect(state.selectedProductId).toBeNull();
    expect(state.selectedProductName).toBeNull();
    expect(state.selectedProductPrice).toBeNull();
  });

  it("openOrderModal followed by closeOrderModal leaves a clean state", () => {
    const store = makeStore();
    store.dispatch(openOrderModal({ id: "p-1", name: "Moringa", price: 750 }));
    expect(store.getState().ui.orderModalOpen).toBe(true);

    store.dispatch(closeOrderModal());
    expect(store.getState().ui.orderModalOpen).toBe(false);
    expect(store.getState().ui.selectedProductId).toBeNull();
  });

  it("opening for franchise mode preserves the franchise form mode", () => {
    const state = uiReducer(undefined, openOrderModal({ mode: "franchise" }));
    expect(state.orderFormMode).toBe("franchise");
  });
});
