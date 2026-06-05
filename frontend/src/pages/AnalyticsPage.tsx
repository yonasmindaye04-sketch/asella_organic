import React from 'react';
import DashboardLayout from '../layouts/DashboardLayout';

const AnalyticsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics & Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Detailed business metrics and sales performance.</p>
        </div>
        <button className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">download</span> Export CSV
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
        <span className="material-symbols-outlined text-4xl mb-3 text-slate-300">pie_chart</span>
        <h3 className="text-lg font-medium text-slate-800 mb-2">Data Aggregation in Progress</h3>
        <p className="max-w-md mx-auto">Charts and revenue metrics will be displayed here as sufficient data is gathered over time.</p>
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;
