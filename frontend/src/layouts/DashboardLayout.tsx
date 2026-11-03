import React, { useState, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import Sidebar from '../components/dashboard/Sidebar';
import TopHeader from '../components/dashboard/TopHeader';
import TeamPerformancePanel from '../components/dashboard/TeamPerformancePanel';
import { DashboardToastProvider } from '../components/dashboard/DashboardToastProvider';
import {
  TeamPerformanceProvider,
  useTeamPerformance,
} from '../context/TeamPerformanceContext';

export interface DashboardSidebarContextValue {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setIsSidebarOpen: (open: boolean) => void;
}

export const DashboardSidebarContext = createContext<DashboardSidebarContextValue>({
  isSidebarOpen: false,
  toggleSidebar: () => {},
  setIsSidebarOpen: () => {},
});

export const useDashboardSidebar = () => useContext(DashboardSidebarContext);

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayoutInner: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const { user } = useSelector((state: RootState) => state.auth);
  const { open, range, closePanel } = useTeamPerformance();
  const location = useLocation();
  const isPosTerminal = location.pathname === '/dashboard/pos';

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  // Matches the guard on GET /api/performance/teams.
  const canViewTeamPerformance = user?.role === 'admin' || user?.role === 'manager';

  return (
    <DashboardSidebarContext.Provider
      value={{ isSidebarOpen, toggleSidebar, setIsSidebarOpen }}
    >
      <div className="flex h-screen overflow-hidden antialiased bg-[#f8fafc] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 relative print:h-auto print:overflow-visible print:bg-white print:block">
        {/* On smaller windows (< 1024px), sidebar container takes zero width when hidden so content never squishes */}
        <div
          className={`print:hidden h-full flex flex-col shrink-0 transition-[width] duration-250 ease-in-out ${
            isSidebarOpen ? 'lg:w-[260px] w-0' : 'lg:w-[60px] w-0 overflow-hidden'
          }`}
        >
          <Sidebar isOpen={isSidebarOpen} onClose={toggleSidebar} />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden relative z-[1] min-w-0 print:h-auto print:overflow-visible print:block">
          {!isPosTerminal && (
            <div className="print:hidden">
              <TopHeader
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={toggleSidebar}
              />
            </div>
          )}
          <main className="flex-1 flex flex-col overflow-hidden relative z-[1] min-w-0 print:h-auto print:overflow-visible print:block h-full">
            <div
              className={`flex-1 ${
                isPosTerminal ? 'overflow-hidden flex flex-col h-full' : 'overflow-y-auto'
              } min-w-0 print:h-auto print:overflow-visible print:block`}
            >
              {children}
            </div>
          </main>
        </div>

        {canViewTeamPerformance && (
          <div className="print:hidden">
            <TeamPerformancePanel
              open={open}
              onClose={closePanel}
              from={range.from}
              to={range.to}
            />
          </div>
        )}
      </div>
    </DashboardSidebarContext.Provider>
  );
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => (
  <DashboardToastProvider>
    <TeamPerformanceProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </TeamPerformanceProvider>
  </DashboardToastProvider>
);

export default DashboardLayout;
