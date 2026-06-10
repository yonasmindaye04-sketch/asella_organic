import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export type OrderFormMode = 'buy_now' | 'sales' | 'franchise';
export type ThemeMode = 'light' | 'dark' | 'system';

interface UiState {
  orderModalOpen: boolean;
  orderFormMode: OrderFormMode;
  selectedProductId: string | null;
  selectedProductName: string | null;
  selectedProductPrice: number | null;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
}

const getInitialTheme = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme') as ThemeMode | null;
    if (stored) return stored;
  }
  return 'system';
};

const getResolvedTheme = (theme: ThemeMode): 'light' | 'dark' => {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return theme;
};

const initialState: UiState = {
  orderModalOpen: false,
  orderFormMode: 'buy_now',
  selectedProductId: null,
  selectedProductName: null,
  selectedProductPrice: null,
  theme: getInitialTheme(),
  resolvedTheme: getResolvedTheme(getInitialTheme()),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openOrderModal: (
      state,
      action: PayloadAction<{ id?: string; name?: string; price?: number; mode?: OrderFormMode }>
    ) => {
      state.orderModalOpen = true;
      state.orderFormMode = action.payload.mode || 'buy_now';
      state.selectedProductId = action.payload.id || null;
      state.selectedProductName = action.payload.name || null;
      state.selectedProductPrice = action.payload.price || null;
    },

    closeOrderModal: (state) => {
      state.orderModalOpen = false;
      state.orderFormMode = 'buy_now';
      state.selectedProductId = null;
      state.selectedProductName = null;
      state.selectedProductPrice = null;
    },

    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.theme = action.payload;
      state.resolvedTheme = getResolvedTheme(action.payload);
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', action.payload);
      }
    },

    setResolvedTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.resolvedTheme = action.payload;
    },

    initializeTheme: (state) => {
      const theme = getInitialTheme();
      state.theme = theme;
      state.resolvedTheme = getResolvedTheme(theme);
    },
  },
});

export const { openOrderModal, closeOrderModal, setTheme, setResolvedTheme, initializeTheme } = uiSlice.actions;
export default uiSlice.reducer;
