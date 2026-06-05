import React from 'react';
import Sidebar from '../components/dashboard/Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen overflow-hidden antialiased font-body-md bg-background text-on-background">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background relative">
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
