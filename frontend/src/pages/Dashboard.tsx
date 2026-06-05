import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../layouts/DashboardLayout';
import KPICards from '../components/dashboard/KPICards';
import ChartsRow from '../components/dashboard/ChartsRow';
import LogisticsTable from '../components/dashboard/LogisticsTable';
import SalesByLocation from '../components/dashboard/SalesByLocation';

const Dashboard: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState('all'); // 'all', '7d', '30d', 'thisMonth', 'lastMonth'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordRes] = await Promise.all([
          axios.get('/api/orders'),
          axios.get('/api/products'),
        ]);
        if (ordRes.data.success) setOrders(ordRes.data.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const filteredOrders = orders.filter(o => {
    if (dateRange === 'all') return true;
    if (!o.created_at) return false;
    const d = new Date(o.created_at);
    const now = new Date();
    
    if (dateRange === '7d') return (now.getTime() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    if (dateRange === '30d') return (now.getTime() - d.getTime()) <= 30 * 24 * 60 * 60 * 1000;
    if (dateRange === 'thisMonth') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (dateRange === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    return true;
  }).filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary font-data-mono cursor-pointer shadow-sm">
          <option value="all">All Time</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="thisMonth">This Month</option>
          <option value="lastMonth">Last Month</option>
        </select>
      </div>
      
      <KPICards />
      <ChartsRow />
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6 mt-6">
        <LogisticsTable orders={filteredOrders} />
        <SalesByLocation orders={filteredOrders} />
      </section>
    </DashboardLayout>
  );
};

export default Dashboard;
