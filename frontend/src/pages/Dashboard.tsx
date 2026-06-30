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
  const [orders, setOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordRes, expRes] = await Promise.all([
          api.get<any[]>('/api/orders?limit=1000'),
          api.get<any>('/api/expenses?limit=10000'), // needed for profit plot
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
  }, []);

  const filteredOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');

  return (
    <DashboardLayout>
      <main className="p-6 space-y-5 max-w-[1440px] mx-auto">
        {!isManager && <KPICards />}

        {/* Row 1: Heatmap + Pipeline (2 cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <Heatmap orders={orders} />
          <Pipeline orders={orders} />
        </div>

        {/* Row 2: Sales by Location + Top Products (2 cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
          <SalesByLocation orders={filteredOrders} />
          <TopProducts orders={filteredOrders} isManager={isManager} />
        </div>

        {/* Row 3: Revenue Overview + Sales Distribution (Hidden for managers) */}
        {!isManager && (
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
