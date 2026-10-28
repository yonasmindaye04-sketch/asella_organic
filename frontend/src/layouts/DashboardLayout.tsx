import React, { useState } from 'react';
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

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayoutInner: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
  const { user } = useSelector((state: RootState) => state.auth);
  const { open, range, closePanel } = useTeamPerformance();

  // Matches the guard on GET /api/performance/teams.
  const canViewTeamPerformance = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="flex h-screen overflow-hidden antialiased bg-[#f8fafc] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(!isSidebarOpen)} />

      <div className="flex flex-1 flex-col overflow-hidden relative z-[1] min-w-0">
        <TopHeader isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 flex flex-col overflow-hidden relative z-[1] min-w-0">
          <div className="flex-1 overflow-y-auto min-w-0">
            {children}
          </div>
        </main>
      </div>

      {canViewTeamPerformance && (
        <TeamPerformancePanel
          open={open}
          onClose={closePanel}
          from={range.from}
          to={range.to}
        />
      )}
    </div>
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
