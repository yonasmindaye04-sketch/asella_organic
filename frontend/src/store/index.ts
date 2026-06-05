import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import stockReducer from './slices/stockSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    stock: stockReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;