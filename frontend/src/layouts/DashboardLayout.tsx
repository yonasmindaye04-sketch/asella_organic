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
        <div className="flex h-screen overflow-hidden antialiased font-body-md bg-[var(--bg)] text-[var(--fg)] relative">
        {/* Ambient background blobs for premium feel - updated to organic greens */}
        <div className="ambient-blob" style={{ width: 500, height: 500, background: "#4caf50", top: "-180px", left: "-100px" }} />
        <div className="ambient-blob" style={{ width: 400, height: 400, background: "#81c784", bottom: "-120px", right: "-80px", animationDelay: "-8s" }} />
        <div className="ambient-blob" style={{ width: 300, height: 300, background: "#aed581", top: "40%", left: "55%", animationDelay: "-16s" }} />

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
