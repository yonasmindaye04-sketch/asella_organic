import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../services/api';
import type { RootState } from '../store';
import DashboardLayout from '../layouts/DashboardLayout';
import KPICards from '../components/dashboard/KPICards';
import { RevenueChart, SalesDistribution, TopProducts } from '../components/dashboard/ChartsRow';
import SalesByLocation from '../components/dashboard/SalesByLocation';
import { Heatmap, Pipeline } from '../components/dashboard/HeatmapAndPipeline';
import AffiliateLeaderboard from '../components/dashboard/AffiliateLeaderboard';
import LowStockTable from '../components/dashboard/LowStockTable';
import EmployeePerformance from '../components/dashboard/EmployeePerformance';

const getOrderTotal = (o: any) => {
  let items = [];
  if (typeof o.items === 'string') {
    try { items = JSON.parse(o.items); } catch { items = []; }
  } else if (Array.isArray(o.items)) {
    items = o.items;
  }
  const itemsTotal = items.reduce((sum: number, item: any) => sum + (Number(item.quantity || item.qty || 1) * Number(item.unit_price || item.price || 0)), 0);
  return Number(o.total) || itemsTotal;
};

const Dashboard: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);

  const isManager = user?.role === 'manager';
  const isStaff = user?.role === 'staff' || user?.role === 'employee' || user?.role === 'driver' || user?.role === 'delivery';
  const [orders, setOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  
  // Default to previous month to capture dummy data
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0],
    };
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        let queryParams = '?limit=1000';
        if (dateRange.from && dateRange.to) {
          queryParams += `&from=${dateRange.from}&to=${dateRange.to}`;
        }
        const [ordRes, expRes] = await Promise.all([
          api.get<any[]>(`/api/orders${queryParams}`),
          api.get<any>(`/api/expenses${queryParams}`), // needed for profit plot
        ]);
        if (ordRes.success && ordRes.data) {
          const withTotals = ordRes.data.map(o => ({ ...o, total: getOrderTotal(o) }));
          setOrders(withTotals);
        }
        if (expRes.success && expRes.data) {
          setExpenses(expRes.data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [dateRange]);

  const filteredOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');

  return (
    <DashboardLayout>
      <main className="p-6 space-y-5 max-w-[1440px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
            <input 
              type="date" 
              className="text-sm outline-none text-gray-700 bg-transparent"
              value={dateRange.from}
              onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
            />
            <span className="text-gray-400">to</span>
            <input 
              type="date" 
              className="text-sm outline-none text-gray-700 bg-transparent"
              value={dateRange.to}
              onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>

        {!isManager && <KPICards from={dateRange.from} to={dateRange.to} />}

        {/* Row 1: Heatmap + Pipeline (2 cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <Heatmap orders={orders} />
          <Pipeline orders={orders} />
        </div>

        {/* Row 2: Sales by Location + Top Products (2 cards) */}
        <div className={`grid grid-cols-1 ${!isStaff ? 'lg:grid-cols-2' : ''} gap-3 mb-6`}>
          <SalesByLocation orders={filteredOrders} />
          {!isStaff && <TopProducts orders={filteredOrders} />}
        </div>

        {/* Row 3: Revenue Overview + Sales Distribution (Hidden for managers and staff) */}
        {(!isManager && !isStaff) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
            <div className="lg:col-span-2">
              <RevenueChart orders={orders} expenses={expenses} />
            </div>
            <div className="lg:col-span-1">
              <SalesDistribution orders={orders} />
            </div>
          </div>
        )}

        {/* Row 4: Employee Performance + Affiliate Leaderboard (2 cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <EmployeePerformance />
          <AffiliateLeaderboard />
        </div>

        {/* Row 5: Low Stock Table (1 wide card) */}
        <div className="mb-6">
          <LowStockTable />
        </div>

      </main>
    </DashboardLayout>
  );
};

export default Dashboard;
