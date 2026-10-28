/**
 * TeamPerformanceContext.tsx
 *
 * Global open/close state for the Team Performance drawer. The drawer used to
 * live inside the Dashboard page, which meant it could only be opened from
 * there. Moving the state up to the dashboard layout lets the sidebar open it
 * from any admin/manager page while keeping a single mounted instance.
 *
 * Callers may pass the date range they are currently looking at. When they
 * pass nothing, the panel falls back to the API's default range (this month).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface TeamPerformanceRange {
  from?: string;
  to?: string;
}

interface TeamPerformanceContextValue {
  open: boolean;
  range: TeamPerformanceRange;
  openPanel: (range?: TeamPerformanceRange) => void;
  closePanel: () => void;
}

const TeamPerformanceContext = createContext<TeamPerformanceContextValue | null>(null);

export const TeamPerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<TeamPerformanceRange>({});

  const openPanel = useCallback((next?: TeamPerformanceRange) => {
    setRange(next ?? {});
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, range, openPanel, closePanel }),
    [open, range, openPanel, closePanel]
  );

  return (
    <TeamPerformanceContext.Provider value={value}>
      {children}
    </TeamPerformanceContext.Provider>
  );
};

export function useTeamPerformance(): TeamPerformanceContextValue {
  const ctx = useContext(TeamPerformanceContext);
  if (!ctx) {
    throw new Error('useTeamPerformance must be used inside TeamPerformanceProvider');
  }
  return ctx;
}
