import React from 'react';
import DashboardLayout from '../layouts/DashboardLayout';

const AccessDatabasePage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#112415]">Access Database</h1>
              <p className="text-sm text-gray-500 mt-1">Direct read-only access to system tables and logs.</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-[#e8f5e9] text-[#112415] flex items-center justify-center">
              <span className="material-symbols-outlined">database</span>
            </div>
          </div>
          <div className="p-16 text-center text-gray-500">
            <span className="material-symbols-outlined text-5xl mb-4 text-gray-300">dns</span>
            <h3 className="text-xl font-bold text-[#112415] mb-2">Direct DB Viewer</h3>
            <p className="max-w-md mx-auto text-sm">
              Use this panel to view raw MySQL database tables (e.g. users, products, orders, stock_logs).
              Direct queries should be run safely.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button className="px-6 py-2.5 rounded-lg border-2 border-[#112415] text-[#112415] font-bold hover:bg-gray-50 transition">
                View Logs
              </button>
              <button className="px-6 py-2.5 rounded-lg bg-[#112415] text-white font-bold hover:bg-[#1a3821] transition">
                Connect DB
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AccessDatabasePage;
