/**
 * frontend/tests/utils/renderWithProviders.tsx
 *
 * RTL's `render` cannot mount a component that calls `useSelector` — it throws
 * "could not find react-redux context value". Components under test must be
 * wrapped in the store's <Provider>.
 *
 * Previously the tests called bare `render(<KPICards />)`, so every case in
 * tests/components/KPICards.test.tsx and tests/components/OrderTracking.test.tsx
 * failed for a harness reason rather than a product one.
 *
 * Each call builds its own store via createAppStore() so seeded state (e.g. a
 * role) never leaks between test files.
 */
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { Provider } from "react-redux";
import { createAppStore, type RootState } from "../../src/store";

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & {
    preloadedState?: Partial<RootState>;
  },
): RenderResult {
  const { preloadedState, ...renderOptions } = options ?? {};
  const testStore = createAppStore(preloadedState);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={testStore}>{children}</Provider>;
  }
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export * from "@testing-library/react";