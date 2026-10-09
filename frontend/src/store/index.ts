import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import stockReducer from './slices/stockSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  stock: stockReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Builds a store with optional preloaded state.
 *
 * Tests need this: the singleton `store` below carries state between test
 * files, so a role seeded for one case leaks into the next. Pass
 * `preloadedState` to build an isolated store per test.
 */
export function createAppStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export const store = createAppStore();

export type AppDispatch = typeof store.dispatch;