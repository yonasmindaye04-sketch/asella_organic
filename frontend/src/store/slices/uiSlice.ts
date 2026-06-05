import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export type OrderFormMode = 'buy_now' | 'sales' | 'franchise';

interface UiState {
  orderModalOpen: boolean;
  orderFormMode: OrderFormMode;
  selectedProductId: string | null;
  selectedProductName: string | null;
  selectedProductPrice: number | null;
}

const initialState: UiState = {
  orderModalOpen: false,
  orderFormMode: 'buy_now',
  selectedProductId: null,
  selectedProductName: null,
  selectedProductPrice: null,
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
  },
});

export const { openOrderModal, closeOrderModal } = uiSlice.actions;
export default uiSlice.reducer;
