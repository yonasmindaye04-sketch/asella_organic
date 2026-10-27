import React, { useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import TopHeader from '../components/dashboard/TopHeader';
import { DashboardToastProvider } from '../components/dashboard/DashboardToastProvider';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);

  return (
    <DashboardToastProvider>
      <div className="flex h-screen overflow-hidden antialiased bg-[#f8fafc] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 relative">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(!isSidebarOpen)} />

        <div className="flex flex-1 flex-col overflow-hidden relative z-[1]">
          <TopHeader isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
          <main className="flex-1 flex flex-col overflow-hidden relative z-[1]">
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </DashboardToastProvider>
  );
};

export default DashboardLayout;
