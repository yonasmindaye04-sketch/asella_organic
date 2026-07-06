import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import ReceiptPrinter from '../components/tracking/ReceiptPrinter';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

interface OrderItem {
  id?: string;
  order_id?: string;
  item_name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
  delivery_date?: string;
}

interface OrderHistory {
  id: string;
  order_id: string;
  status: string;
  new_status?: string;
  changed_by?: string;
  notes?: string;
  created_at: string;
}

interface Order {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  location: string;
  order_type?: string;
  status: string;
  source: string;
  total_amount?: number;
  total: number;
  notes?: string;
  delivery_date?: string;
  created_at: string;
  updated_at?: string;
  employee_id?: string;
  items?: OrderItem[];
  history?: OrderHistory[];
}

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Packed', 'In Transit', 'Delivered', 'Cancelled', 'Issue'];
const LEGACY_STATUS_MAP: Record<string, string> = {
  Processing: 'Confirmed',
  'Out for Delivery': 'In Transit',
  Returned: 'Issue',
};
// Status colors and source labels for better UI representation
const STATUS_COLORS: Record<string, string> = {
  'Pending': '#f59e0b',
  'Confirmed': '#3b82f6',
  'Packed': '#8b5cf6',
  'In Transit': '#06b6d4',
  'Delivered': '#22c55e',
  'Cancelled': '#ef4444',
  'Issue': '#f97316'
};
const SOURCE_LABELS: Record<string, string> = {
  Sales_DB: 'Sales',
  Order_DB: 'Online/Guest',
  Franchise_DB: 'Franchise',
  website: 'Website',
  telegram: 'Telegram',
  instagram: 'Instagram',
  facebook: 'Facebook',
  phone: 'Phone',
  'walk-in': 'Walk-in',
  other: 'Other',
  _franchise: 'Franchise',
};

const SOURCE_BADGES: Record<string, string> = {
  Sales_DB: 'bg-[#dbeafe] text-[#1e40af]',
  Order_DB: 'bg-[#fce7f3] text-[#9d174d]',
  Franchise_DB: 'bg-[#ede9fe] text-[#5b21b6]',
  website: 'bg-[#fce7f3] text-[#9d174d]',
  telegram: 'bg-[#cffafe] text-[#155e75]',
  instagram: 'bg-[#fce7f3] text-[#9d174d]',
  facebook: 'bg-[#dbeafe] text-[#1e40af]',
  phone: 'bg-[#fef3c7] text-[#92400e]',
  'walk-in': 'bg-[#dcfce7] text-[#166534]',
  other: 'bg-[#e5e7eb] text-[#374151]',
  _franchise: 'bg-[#ede9fe] text-[#5b21b6]',
};

const normalizeStatus = (status?: string) => LEGACY_STATUS_MAP[status || ''] || status || 'Pending';
const isFranchiseOrder = (order: Order) =>
  order.source === 'Franchise_DB' || (order.order_type || '').toLowerCase() === 'franchise' || (order.notes || '').includes('Franchise Type:');
const getSourceKey = (order: Order) => isFranchiseOrder(order) ? '_franchise' : (order.source || 'other');
const getSourceLabel = (order: Order) => SOURCE_LABELS[getSourceKey(order)] || order.source || 'Other';
const getSourceBadge = (order: Order) => SOURCE_BADGES[getSourceKey(order)] || SOURCE_BADGES.other;
const isSocialSource = (order: Order) => ['telegram', 'instagram', 'facebook'].includes(getSourceKey(order));

const OrderTracking: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const isAdmin = user?.role === 'admin';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('');

  // Selection & Bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Sorting
  const [sortCol, setSortCol] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Drawer
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTwoFaCode, setDeleteTwoFaCode] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  
  // Modify Items
  const [editingItems, setEditingItems] = useState<boolean>(false);
  const [editedItems, setEditedItems] = useState<Array<OrderItem & { id?: string }>>([]); 
  const [savingItems, setSavingItems] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: string; name: string; package_size: string; price: number }>>([])
  
  const [staffId, setStaffId] = useState(() => {
    try { 
      return localStorage.getItem('asella_staff_id') || ''; 
    }
    catch {
      return ''; 
    }
  });

  const handleStaffIdChange = (val: string) => {
    setStaffId(val);
    try { 
      localStorage.setItem('asella_staff_id', val); 
    } catch {
      // Silent fail for localStorage
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const first = await api.get<Order[]>('/api/orders?page=1&limit=100');
      if (first.success) {
        let all = first.data || [];
        const pages = first.meta?.pages || 1;
        if (pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) => api.get<Order[]>(`/api/orders?page=${i + 2}&limit=100`))
          );
          all = all.concat(...rest.filter(r => r.success && r.data).flatMap(r => r.data || []));
        }
        setOrders(all);
      } else {
        setError(first.error || 'Failed to fetch orders');
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Error connecting to database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
    const interval = setInterval(() => {
      void fetchOrders();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredOrders = useMemo(() => {
    const result = orders.filter(o => {
      const matchSearch = !searchTerm || 
        o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.phone.includes(searchTerm) ||
        (o.city || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = !statusFilter || normalizeStatus(o.status) === statusFilter;
      const matchSource = !sourceFilter || getSourceKey(o) === sourceFilter;
      const matchFrom = !dateFrom || new Date(o.created_at) >= new Date(dateFrom);
      const matchTo = !dateTo || new Date(o.created_at) <= new Date(dateTo + 'T23:59:59');
      const matchType = !orderTypeFilter || (orderTypeFilter === 'bulk' ? isFranchiseOrder(o) : !isFranchiseOrder(o));
      
      return matchSearch && matchStatus && matchSource && matchFrom && matchTo && matchType;
    });

    result.sort((a: Order, b: Order) => {
      let valA = a[sortCol as keyof Order];
      let valB = b[sortCol as keyof Order];

      if (sortCol === 'created_at') {
        valA = valA ? new Date(valA as string).getTime() : 0;
        valB = valB ? new Date(valB as string).getTime() : 0;
      } else if (sortCol === 'status') {
        valA = normalizeStatus(valA as string).toLowerCase();
        valB = normalizeStatus(valB as string).toLowerCase();
      } else if (sortCol === 'source') {
        valA = getSourceLabel(a).toLowerCase();
        valB = getSourceLabel(b).toLowerCase();
      } else if (sortCol === 'total') {
        valA = Number(valA || a.total_amount) || 0;
        valB = Number(valB || b.total_amount) || 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [orders, searchTerm, statusFilter, sourceFilter, dateFrom, dateTo, sortCol, sortDir, orderTypeFilter]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'created_at' || col === 'total' ? 'desc' : 'asc');
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filteredOrders]);

  const stats = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'CANCELLED');
    const s: Record<string, number> = { 'All Orders': activeOrders.length };
    ORDER_STATUSES.forEach(status => { s[status] = 0; });
    orders.forEach(o => {
      const status = normalizeStatus(o.status);
      if (status in s) s[status]++;
    });
    return s;
  }, [orders]);

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const paginatedIds = paginatedOrders.map(o => o.id);
      const newSet = new Set(selectedIds);
      paginatedIds.forEach(id => newSet.add(id));
      setSelectedIds(newSet);
    } else {
      const paginatedIds = paginatedOrders.map(o => o.id);
      const newSet = new Set(selectedIds);
      paginatedIds.forEach(id => newSet.delete(id));
      setSelectedIds(newSet);
    }
  };

  const toggleOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkStatus('');
  };

  const handleBulkApply = async () => {
    if (selectedIds.size === 0 || !bulkStatus) return;
    try {
      setLoading(true);
      const currentStaff = staffId || 'staff';
      await Promise.all(Array.from(selectedIds).map(id => api.patch(`/api/orders/${id}/status`, {
        status: bulkStatus,
        note: `Bulk update by ${currentStaff}`
      })));
      clearSelection();
      await fetchOrders();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Error updating orders');
    } finally {
      setLoading(false);
    }
  };

  const getNextStatus = (current: string) => {
    const idx = ORDER_STATUSES.indexOf(normalizeStatus(current));
    return ORDER_STATUSES[Math.min(idx + 1, ORDER_STATUSES.length - 1)] || 'Delivered';
  };

  const handleQuickAdvance = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    const nextSt = getNextStatus(order.status);
    if (nextSt === order.status) return;
    try {
      const currentStaff = staffId || 'staff';
      const res = await api.patch(`/api/orders/${order.id}/status`, {
        status: nextSt,
        note: `Quick advance by ${currentStaff}`
      });
      if (!res.success) throw new Error(res.error || 'Failed to update');
      void fetchOrders();
      if (selectedOrder && selectedOrder.id === order.id) {
        openDrawer({ ...selectedOrder, status: nextSt });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert(error.message || 'Failed to update');
    }
  };

  const openDrawer = async (order: Order) => {
    setSelectedOrder(order);
    setUpdateStatus(normalizeStatus(order.status));
    setUpdateNote('');
    
    setDrawerLoading(true);
    try {
      const res = await api.get<Order>(`/api/orders/${order.id}`);
      if (res.success && res.data) {
        setSelectedOrder(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder) return;
    setUpdating(true);
    try {
      const currentStaff = staffId || 'staff';
      const changeTag = `[Status → ${updateStatus} by ${currentStaff}]`;
      const fullNote = updateNote ? `${updateNote} ${changeTag}` : changeTag;
      
      const res = await api.patch(`/api/orders/${selectedOrder.id}/status`, {
        status: updateStatus,
        note: fullNote
      });
      if (res.success) {
        fetchOrders();
        setSelectedOrder(prev => prev ? { ...prev, status: updateStatus } : null);
        setUpdateNote('');
      } else {
        throw new Error(res.error || 'Failed to update');
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      alert(error.message || 'Failed to update');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrder || !deleteTwoFaCode) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await api.delete(`/api/orders/${selectedOrder.id}`, { "x-2fa-token": deleteTwoFaCode });
      if (res.success) {
        setShowDeleteModal(false);
        setDeleteTwoFaCode('');
        setSelectedOrder(null);
        fetchOrders();
      } else {
        setDeleteError(res.error || 'Deletion failed. Check your 2FA code.');
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setDeleteError(error.message || 'An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  const initializeEditMode = async (order: Order) => {
    setEditingItems(true);
    setEditedItems(order.items || []);
    
    try {
      const res = await api.get<any[]>('/api/products?limit=200&active=true');
      if (res.success && res.data) {
        setAvailableProducts(res.data.map(p => ({
          id: p.id,
          name: p.name,
          package_size: p.package_size,
          price: p.price
        })));
      }
    } catch (err) {
      console.error('Failed to fetch products', err);
    }
  };

  const updateItemQty = (index: number, qty: number) => {
    const updated = [...editedItems];
    updated[index] = { ...updated[index], quantity: Math.max(1, qty) };
    setEditedItems(updated);
  };

  const removeItem = (index: number) => {
    setEditedItems(editedItems.filter((_, i) => i !== index));
  };

  const addNewItem = () => {
    if (availableProducts.length === 0) {
      alert('No products available. Please add products first.');
      return;
    }
    const firstProduct = availableProducts[0];
    setEditedItems([
      ...editedItems,
      {
        item_name: firstProduct.name,
        package_size: firstProduct.package_size,
        quantity: 1,
        unit_price: firstProduct.price
      }
    ]);
  };

  const saveItemChanges = async () => {
    if (!selectedOrder) return;
    if (editedItems.length === 0) {
      alert('Order must have at least one item.');
      return;
    }
    
    setSavingItems(true);
    try {
      const itemsToSave = editedItems
        .filter(item => item.item_name && item.item_name.trim() !== '')
        .map(item => ({
          name: item.item_name,
          package_size: item.package_size,
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0
        }));

      const res = await api.patch(`/api/orders/${selectedOrder.id}/items`, { items: itemsToSave });
      if (res.success) {
        setEditingItems(false);
        await fetchOrders();
        const updatedOrder = (await api.get<Order>(`/api/orders/${selectedOrder.id}`)).data;
        if (updatedOrder) {
          setSelectedOrder(updatedOrder);
        }
      } else {
        alert('Failed to save items: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error(err);
      const details = err.response?.data?.details ? ` - ${JSON.stringify(err.response.data.details)}` : '';
      alert((err.response?.data?.error || 'Failed to save items') + details);
    } finally {
      setSavingItems(false);
    }
  };

  const doExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Order ID,Customer,Phone,City,Source,Total,Status,Date\n"
      + filteredOrders.map(o => `${o.id},${o.customer_name},${o.phone},${o.city},${getSourceLabel(o)},${o.total},${normalizeStatus(o.status)},${o.created_at}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `orders_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const paginatedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;

  const renderSkeletons = () => {
    return Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="animate-pulse">
        <td className="px-4 py-3"><div className="w-4 h-4 bg-gray-200 rounded"></div></td>
        <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-24"></div></td>
        <td className="px-4 py-3">
          <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
          <div className="h-2 bg-gray-100 rounded w-20"></div>
        </td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
        <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20"></div></td>
        <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-32"></div></td>
        <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16"></div></td>
        <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
        <td className="px-4 py-3"></td>
      </tr>
    ));
  };

  return (
    <DashboardLayout>
    <div className="flex flex-col h-full bg-[#f7faf7] font-sans overflow-hidden">
      
      {/* Dark Green Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-[#1b3d1e] shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#2e7d32] flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[16px]">eco</span>
          </div>
          <h1 className="text-white font-black text-[15px] tracking-wide">Asella — Order Tracking</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-white/50 font-medium mr-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse shadow-[0_0_0_3px_rgba(74,222,128,0.25)]"></div>
            Live
          </div>
          <button onClick={fetchOrders} className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-[1.5px] border-white/20 text-white rounded-md text-[12px] font-bold hover:bg-white/10 hover:border-white/50 transition whitespace-nowrap">
            <span className="material-symbols-outlined text-[14px]">refresh</span> Refresh
          </button>
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-[1.5px] border-white/20 text-white rounded-md text-[12px] font-bold hover:bg-white/10 hover:border-white/50 transition whitespace-nowrap">
            <span className="material-symbols-outlined text-[14px]">bar_chart</span> Analytics
          </button>
          <button onClick={doExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#388e3c] border-[1.5px] border-[#388e3c] text-white rounded-md text-[12px] font-bold hover:bg-[#43a047] transition whitespace-nowrap">
            <span className="material-symbols-outlined text-[14px]">download</span> Export CSV
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="flex bg-white border-b-2 border-[#ddeedd] shrink-0 overflow-x-auto select-none">
        {Object.entries(stats).map(([label, val]) => (
          <div 
            key={label} 
            className={`flex-1 min-w-[105px] px-3.5 py-2.5 border-r border-[#ddeedd] cursor-pointer relative transition-colors ${statusFilter === label || (label==='All Orders' && !statusFilter) ? 'bg-[#f1f8f1]' : 'hover:bg-[#f1f8f1]'}`}
            onClick={() => setStatusFilter(label === 'All Orders' ? '' : label)}
          >
            {(statusFilter === label || (label==='All Orders' && !statusFilter)) && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#2e7d32]"></div>}
            <div className="text-[10px] font-extrabold text-[#607d66] uppercase tracking-wider mb-1">{label}</div>
            <div className="text-[23px] font-medium text-[#141c15] font-mono">{val}</div>
            <div className="mt-1 w-1.5 h-1.5 rounded-full" style={{ background: label === 'All Orders' ? '#94a3b8' : STATUS_COLORS[label] }}></div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3.5 py-2 bg-white border-b border-[#ddeedd] shrink-0 overflow-x-auto flex-wrap">
        <div className="relative min-w-[210px] shrink-0">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#607d66] text-[15px]">search</span>
          <input 
            type="text" 
            placeholder="Order ID, customer, phone..." 
            className="w-full pl-8 pr-2 py-2 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs focus:outline-none focus:border-[#2e7d32] focus:bg-white transition"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select className="px-2 py-2 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs font-semibold text-[#141c15] min-w-[125px] shrink-0 focus:outline-none focus:border-[#2e7d32]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="px-2 py-2 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs font-semibold text-[#141c15] min-w-[125px] shrink-0 focus:outline-none focus:border-[#2e7d32]" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">All Sources</option>
          <option value="website">Website</option>
          <option value="telegram">Telegram</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="phone">Phone</option>
          <option value="walk-in">Walk-in</option>
          <option value="_franchise">Franchise</option>
          <option value="Sales_DB">Sales</option>
          <option value="Order_DB">Online/Guest</option>
        </select>
        <select className="px-2 py-2 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs font-semibold text-[#141c15] min-w-[125px] shrink-0 focus:outline-none focus:border-[#2e7d32]" value={orderTypeFilter} onChange={(e) => setOrderTypeFilter(e.target.value)}>
          <option value="">All Orders</option>
          <option value="single">Single Orders</option>
          <option value="bulk">Bulk/Franchise</option>
        </select>
        <input type="date" title="From date" className="px-2 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs text-[#141c15] shrink-0 focus:outline-none focus:border-[#2e7d32]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" title="To date" className="px-2 py-1.5 bg-[#f7faf7] border-[1.5px] border-[#ddeedd] rounded-lg text-xs text-[#141c15] shrink-0 focus:outline-none focus:border-[#2e7d32]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        
        <div className="w-[1px] h-[26px] bg-[#ddeedd] shrink-0 mx-1"></div>
        
        <button onClick={() => { setSearchTerm(''); setStatusFilter(''); setSourceFilter(''); setDateFrom(''); setDateTo(''); setOrderTypeFilter(''); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-[1.5px] border-[#ddeedd] bg-white text-xs font-bold text-[#607d66] shrink-0 hover:border-red-500 hover:text-red-500 transition">
          <span className="material-symbols-outlined text-[14px]">close</span> Clear
        </button>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#e8f5e9] border-[1.5px] border-[#2e7d32] rounded-lg text-xs font-bold text-[#2e7d32] shrink-0 whitespace-nowrap animate-[mpop_0.2s_ease]">
            <span className="material-symbols-outlined text-[14px]">check_box</span> <span>{selectedIds.size}</span> selected
            <select className="ml-1 border-[1.5px] border-[#2e7d32] rounded-md px-1.5 py-0.5 text-[11px] bg-white focus:outline-none" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
              <option value="">Set status...</option>
              {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={handleBulkApply} className="px-2 py-1 bg-[#2e7d32] text-white rounded-md text-[11px] font-extrabold ml-1 hover:bg-[#1b3d1e]">Apply</button>
            <button onClick={clearSelection} className="px-2 py-1 bg-red-500 text-white rounded-md text-[11px] font-extrabold ml-1 hover:bg-red-600">✕</button>
          </div>
        )}
      </div>

      {error && <div className="m-3 p-3 bg-red-100 border-[1.5px] border-red-500 rounded-lg text-red-800 text-xs font-bold shrink-0 flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">error</span> {error}</div>}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        
        {/* Table View */}
        <div className="flex-1 overflow-auto bg-[#f7faf7]">
          <table className="w-full min-w-[840px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sticky top-0 bg-white p-2 border-b-2 border-[#ddeedd] z-10 w-[34px] px-2.5">
                  <input type="checkbox" onChange={toggleAll} checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o.id))} />
                </th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap cursor-pointer hover:text-[#2e7d32]" onClick={() => handleSort('id')}>Order ID {sortCol === 'id' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap cursor-pointer hover:text-[#2e7d32]" onClick={() => handleSort('customer_name')}>Customer {sortCol === 'customer_name' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap cursor-pointer hover:text-[#2e7d32]" onClick={() => handleSort('source')}>Source {sortCol === 'source' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap cursor-pointer hover:text-[#2e7d32]" onClick={() => handleSort('created_at')}>Date {sortCol === 'created_at' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap">Items</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap cursor-pointer hover:text-[#2e7d32]" onClick={() => handleSort('total')}>Value ETB {sortCol === 'total' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap cursor-pointer hover:text-[#2e7d32]" onClick={() => handleSort('status')}>Status {sortCol === 'status' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                <th className="sticky top-0 bg-white py-2 px-3 text-right text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] border-b-2 border-[#ddeedd] z-10 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? renderSkeletons() : paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center justify-center p-16 gap-2 text-[#607d66]">
                      <span className="material-symbols-outlined text-[35px] opacity-20">inbox</span>
                      <p className="text-sm">No orders match the current filters.</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedOrders.map(o => {
                const isSelected = selectedIds.has(o.id);
                const itemsStr = (o.items || []).slice(0, 2).map(i => `${i.item_name} ×${i.quantity}`).join(', ') + ((o.items?.length || 0) > 2 ? ` +${(o.items?.length || 0) - 2}` : '');
                const displayStatus = normalizeStatus(o.status);
                
                return (
                  <tr key={o.id} className={`bg-white border-b border-[#ddeedd] cursor-pointer transition-colors ${isSelected ? 'bg-[#e8f5e9]' : 'hover:bg-[#f1f8f1]'}`} onClick={() => openDrawer(o)}>
                    <td className="w-[34px] px-2.5 py-2 align-middle" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(o.id)} />
                    </td>
                    <td className="px-3 py-2 align-middle font-mono text-[12px] text-[#2e7d32] font-medium whitespace-nowrap">{o.id}</td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap">
                      <strong className="block font-bold text-[13px]">{o.customer_name || '—'}</strong>
                      <span className="text-[11px] text-[#607d66]">{o.phone} {o.city ? `· ${o.city}` : ''}</span>
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${getSourceBadge(o)}`}
                        title={isSocialSource(o) ? 'This order was tagged by the order form as a social-media source.' : undefined}
                      >
                        {getSourceLabel(o)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap text-[12px] text-[#607d66]">
                      {o.created_at ? new Date(o.created_at).toLocaleString('en-GB') : '—'}
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap text-[12px] text-[#607d66] max-w-[165px] overflow-hidden text-ellipsis">
                      {itemsStr || '—'}
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap font-mono font-semibold text-[#2d3e2f]">
                      {Number(o.total || o.total_amount).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider" style={{ backgroundColor: `${STATUS_COLORS[displayStatus]}20`, color: STATUS_COLORS[displayStatus] }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[displayStatus] }}></div>
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => handleQuickAdvance(e, o)} title="Advance" className="w-[27px] h-[27px] rounded-md border-[1.5px] border-[#ddeedd] bg-white inline-flex items-center justify-center text-[11px] text-[#607d66] ml-1 transition-colors hover:bg-[#2e7d32] hover:text-white hover:border-[#2e7d32]">
                        <span className="material-symbols-outlined text-[14px]">fast_forward</span>
                      </button>
                      <button onClick={() => openDrawer(o)} title="Details" className="w-[27px] h-[27px] rounded-md border-[1.5px] border-[#ddeedd] bg-white inline-flex items-center justify-center text-[11px] text-[#607d66] ml-1 transition-colors hover:bg-[#2e7d32] hover:text-white hover:border-[#2e7d32]">
                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* DRAWER */}
        <div className={`flex flex-col bg-white border-l border-[#ddeedd] shrink-0 overflow-hidden transition-all duration-[270ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${selectedOrder ? 'w-full fixed inset-0 z-[200] md:relative md:w-[420px]' : 'w-0'}`}>
          {selectedOrder && (
            <>
              <div className="flex items-center justify-between p-4 border-b border-[#ddeedd] shrink-0 gap-2">
                <h3 className="text-[14px] font-black text-[#141c15] font-mono">{selectedOrder.id}</h3>
                <button onClick={() => setSelectedOrder(null)} className="w-[25px] h-[25px] rounded-md border-[1.5px] border-[#ddeedd] bg-white flex items-center justify-center text-[11px] text-[#607d66] transition-colors hover:bg-red-100 hover:border-red-500 hover:text-red-500">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
                
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-extrabold uppercase tracking-wider" style={{ backgroundColor: `${STATUS_COLORS[normalizeStatus(selectedOrder.status)]}20`, color: STATUS_COLORS[normalizeStatus(selectedOrder.status)] }}>
                    {normalizeStatus(selectedOrder.status)}
                  </span>
                  <span className="text-[12px] text-[#607d66]">
                    Source: <strong>{getSourceLabel(selectedOrder)}</strong>
                    {isSocialSource(selectedOrder) ? <span className="ml-1 text-[11px] text-[#607d66]">(from order source)</span> : null}
                  </span>
                </div>

                {/* Customer Section */}
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] flex items-center gap-1.5 mb-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#ddeedd]">
                    <span className="material-symbols-outlined text-[#2e7d32] text-[14px]">person</span> Customer
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Name</label><span className="text-[13px] text-[#141c15] font-medium block overflow-hidden text-ellipsis whitespace-nowrap">{selectedOrder.customer_name || '—'}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Phone</label><span className="text-[13px] text-[#141c15] font-medium font-mono block">{selectedOrder.phone || '—'}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Location</label><span className="text-[13px] text-[#141c15] font-medium block">{selectedOrder.location || '—'}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">City</label><span className="text-[13px] text-[#141c15] font-medium block">{selectedOrder.city || '—'}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Order Type</label><span className="text-[13px] text-[#141c15] font-medium block">{selectedOrder.order_type || '—'}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Submitted</label><span className="text-[12px] text-[#141c15] font-medium block">{new Date(selectedOrder.created_at).toLocaleString('en-GB')}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Delivery</label><span className="text-[12px] text-[#141c15] font-medium block">{selectedOrder.delivery_date ? new Date(selectedOrder.delivery_date).toLocaleDateString('en-GB') : '—'}</span></div>
                  </div>
                </div>

                {/* Items Section */}
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] flex items-center gap-1.5 mb-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#ddeedd]">
                    <span className="material-symbols-outlined text-[#2e7d32] text-[14px]">inventory_2</span> Items
                  </div>
                  {drawerLoading ? (
                    <div className="text-[12px] text-[#607d66]">Loading...</div>
                  ) : (
                    <>
                      <table className="w-full border-collapse text-[12px]">
                        <thead>
                          <tr>
                            <th className="text-left py-1 px-1.5 bg-[#f1f8f1] text-[10px] font-extrabold uppercase tracking-wide text-[#607d66]">Item</th>
                            <th className="text-left py-1 px-1.5 bg-[#f1f8f1] text-[10px] font-extrabold uppercase tracking-wide text-[#607d66]">Qty</th>
                            <th className="text-left py-1 px-1.5 bg-[#f1f8f1] text-[10px] font-extrabold uppercase tracking-wide text-[#607d66]">Package</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedOrder.items || []).map((it, i) => (
                            <tr key={i}>
                              <td className="py-1.5 px-1.5 border-b border-[#ddeedd]">{it.item_name}</td>
                              <td className="py-1.5 px-1.5 border-b border-[#ddeedd] font-bold text-center">{it.quantity}</td>
                              <td className="py-1.5 px-1.5 border-b border-[#ddeedd]">{it.package_size}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-between p-2 bg-[#f1f8f1] rounded-lg font-extrabold text-[14px] mt-2">
                        <span>Total</span>
                        <span className="font-mono text-[#2e7d32]">{Number(selectedOrder.total || selectedOrder.total_amount).toLocaleString()} ETB</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Timeline Section */}
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] flex items-center gap-1.5 mb-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#ddeedd]">
                    <span className="material-symbols-outlined text-[#2e7d32] text-[14px]">history</span> Activity
                  </div>
                  <div className="pl-[18px] relative">
                    <div className="absolute left-[5px] top-0 bottom-0 w-[2px] bg-[#ddeedd] rounded"></div>
                    {drawerLoading ? (
                      <div className="text-[12px] text-[#607d66]">Loading...</div>
                    ) : (
                      <>
                        <div className="relative mb-3">
                          <div className="absolute -left-[18px] top-1 w-[11px] h-[11px] rounded-full bg-[#ddeedd] border-2 border-white shadow-[0_0_0_2px_#ddeedd]"></div>
                          <div className="text-[12px] font-bold text-[#141c15]">Order placed</div>
                          <div className="text-[11px] text-[#607d66] mt-px">{new Date(selectedOrder.created_at).toLocaleString('en-GB')}</div>
                        </div>
                        {selectedOrder.notes && selectedOrder.notes.split('\n').filter(n => n.trim()).map((note, i) => (
                          <div key={`note-${i}`} className="relative mb-3">
                            <div className="absolute -left-[18px] top-[4px] w-[11px] h-[11px] rounded-full bg-[#ddeedd] border-2 border-white shadow-[0_0_0_2px_#ddeedd]"></div>
                            <div className="text-[13px] font-bold text-[#141c15]">Note</div>
                            <div className="text-[11px] text-[#2d3e2f] mt-[3px] py-1 px-2 bg-[#f1f8f1] rounded-[5px] border-l-[3px] border-[#43a047] whitespace-pre-wrap">{note}</div>
                          </div>
                        ))}
                        {(selectedOrder.history || []).map((h, i) => (
                          <div key={i} className="relative mb-3">
                            <div className="absolute -left-[18px] top-1 w-[11px] h-[11px] rounded-full bg-[#2e7d32] border-2 border-white shadow-[0_0_0_2px_#2e7d32]"></div>
                            <div className="text-[12px] font-bold text-[#141c15]">Status: {h.new_status || h.status}</div>
                            <div className="text-[11px] text-[#607d66] mt-px">{new Date(h.created_at).toLocaleString('en-GB')} {h.changed_by ? `by ${h.changed_by}` : ''}</div>
                            {h.notes && <div className="text-[11px] text-[#2d3e2f] mt-1 p-1.5 bg-[#f1f8f1] rounded border-l-[3px] border-[#43a047] whitespace-pre-wrap">{h.notes}</div>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Audit Section */}
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] flex items-center gap-1.5 mb-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#ddeedd]">
                    <span className="material-symbols-outlined text-[#2e7d32] text-[14px]">info</span> Audit
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Updated By</label><span className="text-[13px] text-[#141c15] font-medium block">{(selectedOrder.history && selectedOrder.history.length > 0 && selectedOrder.history[selectedOrder.history.length - 1].changed_by) ? selectedOrder.history[selectedOrder.history.length - 1].changed_by : '—'}</span></div>
                    <div><label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-px">Last Update</label><span className="text-[12px] text-[#141c15] font-medium block">{selectedOrder.updated_at ? new Date(selectedOrder.updated_at).toLocaleString('en-GB') : '—'}</span></div>
                  </div>
                </div>

                {/* Update Form */}
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#607d66] flex items-center gap-1.5 mb-2 after:content-[''] after:flex-1 after:h-[1px] after:bg-[#ddeedd]">
                    <span className="material-symbols-outlined text-[#2e7d32] text-[14px]">edit_note</span> Update
                  </div>
                  <div className="flex flex-col gap-2">
                    <div style={{ background: '#f0fdf4', border: '1px solid #c3e6cb', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="material-symbols-outlined text-[#2e7d32] text-[16px]">how_to_reg</span>
                      <span className="text-[#2e7d32]">Editing as:</span>
                      <input 
                        placeholder="Your staff ID" 
                        className="flex-1 border-none bg-transparent font-semibold text-[#065f46] outline-none placeholder:text-[#065f46]/50" 
                        value={staffId} 
                        onChange={e => handleStaffIdChange(e.target.value)} 
                      />
                      <span className="text-[0.7rem] text-[#6b7280]">auto-saved</span>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-[3px]">New Status</label>
                      <select value={normalizeStatus(updateStatus)} onChange={e => setUpdateStatus(e.target.value)} className="w-full p-2 border-[1.5px] border-[#ddeedd] rounded-lg text-[13px] bg-[#f7faf7] text-[#141c15] focus:outline-none focus:border-[#2e7d32] focus:bg-white transition">
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-[#607d66] mb-[3px]">Note (optional)</label>
                      <textarea value={updateNote} onChange={e => setUpdateNote(e.target.value)} placeholder="Add a note..." className="w-full p-2 border-[1.5px] border-[#ddeedd] rounded-lg text-[13px] bg-[#f7faf7] text-[#141c15] focus:outline-none focus:border-[#2e7d32] focus:bg-white transition min-h-[60px] resize-y"></textarea>
                    </div>
                    <button onClick={handleUpdateStatus} disabled={updating} className="p-2.5 rounded-lg border-none bg-[#2e7d32] text-white text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition hover:bg-[#1b3d1e] disabled:opacity-50">
                      <span className="material-symbols-outlined text-[16px]">check</span> {updating ? 'Saving...' : 'Save Update'}
                    </button>
                    <button onClick={(e) => handleQuickAdvance(e, selectedOrder)} className="p-2 rounded-lg border-[1.5px] border-[#ddeedd] bg-white text-[#2d3e2f] text-[12px] font-bold flex items-center justify-center gap-1.5 transition hover:bg-[#f1f8f1] hover:border-[#2e7d32] hover:text-[#2e7d32]">
                      <span className="material-symbols-outlined text-[16px]">fast_forward</span> Quick Advance → {getNextStatus(selectedOrder.status)}
                    </button>
                  </div>
                </div>

                {/* Modify Order Items Section */}
                {!editingItems ? (
                  <button 
                    onClick={() => initializeEditMode(selectedOrder)}
                    className="w-full p-2.5 rounded-lg border-[1.5px] border-[#2e7d32] bg-white text-[#2e7d32] text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition hover:bg-[#f1f8f1]"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span> Modify Order Items
                  </button>
                ) : (
                  <div className="bg-[#f1f8f1] border-[1.5px] border-[#2e7d32] rounded-lg p-4">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#2e7d32] flex items-center gap-1.5 mb-3">
                      <span className="material-symbols-outlined text-[14px]">inventory_2</span> Modify Order Items
                    </div>

                    <div className="space-y-2 mb-3 max-h-[300px] overflow-y-auto">
                      {editedItems.map((item, idx) => {
                        const itemProductVariants = availableProducts.filter(p => p.name === item.item_name);
                        const availableSizes = Array.from(new Set(itemProductVariants.map(p => p.package_size)));
                        const uniqueProductNames = Array.from(new Set(availableProducts.map(p => p.name)));

                        return (
                        <div key={idx} className="flex gap-2 items-end bg-white p-2 rounded border-[1px] border-[#ddeedd]">
                          <select 
                            value={item.item_name} 
                            onChange={e => {
                              const newName = e.target.value;
                              const variants = availableProducts.filter(p => p.name === newName);
                              if (variants.length > 0) {
                                const firstVariant = variants[0];
                                const updated = [...editedItems];
                                updated[idx] = { 
                                  ...updated[idx], 
                                  item_name: firstVariant.name,
                                  package_size: firstVariant.package_size,
                                  unit_price: firstVariant.price
                                };
                                setEditedItems(updated);
                              }
                            }}
                            className="flex-1 px-1.5 py-1 border-[1px] border-[#ddeedd] rounded text-[11px] bg-white focus:outline-none focus:border-[#2e7d32]"
                          >
                            <option value="">Select item...</option>
                            {uniqueProductNames.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>

                          <select 
                            value={item.package_size} 
                            onChange={e => {
                              const newSize = e.target.value;
                              const variant = availableProducts.find(p => p.name === item.item_name && p.package_size === newSize);
                              if (variant) {
                                const updated = [...editedItems];
                                updated[idx] = { 
                                  ...updated[idx], 
                                  package_size: variant.package_size,
                                  unit_price: variant.price 
                                };
                                setEditedItems(updated);
                              }
                            }}
                            className="flex-1 px-1.5 py-1 border-[1px] border-[#ddeedd] rounded text-[11px] bg-white focus:outline-none focus:border-[#2e7d32]"
                          >
                            <option value="">Select size...</option>
                            {availableSizes.map(size => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>

                          <input 
                            type="number" 
                            min="1" 
                            value={item.quantity} 
                            onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                            className="w-16 px-1.5 py-1 border-[1px] border-[#ddeedd] rounded text-[11px] focus:outline-none focus:border-[#2e7d32]"
                          />

                          {isAdmin && (
                            <input 
                              type="number" 
                              min="0" 
                              step="0.01"
                              value={item.unit_price} 
                              onChange={e => {
                                const updated = [...editedItems];
                                updated[idx] = { ...updated[idx], unit_price: parseFloat(e.target.value) || 0 };
                                setEditedItems(updated);
                              }}
                              className="w-20 px-1.5 py-1 border-[1px] border-[#ddeedd] rounded text-[11px] focus:outline-none focus:border-[#2e7d32]"
                              placeholder="Price"
                              title="Unit Price"
                            />
                          )}

                          <button 
                            onClick={() => removeItem(idx)}
                            className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                        );
                      })}
                    </div>

                    <button 
                      onClick={addNewItem}
                      className="w-full p-2 mb-3 border-[1.5px] border-dashed border-[#2e7d32] text-[#2e7d32] rounded-lg text-[12px] font-bold hover:bg-[#e8f5e9] transition"
                    >
                      <span className="material-symbols-outlined text-[14px] inline mr-1">add</span> Add Another Product
                    </button>

                    <div className="flex gap-2">
                      <button 
                        onClick={saveItemChanges}
                        disabled={savingItems}
                        className="flex-1 p-2 bg-[#2e7d32] text-white rounded-lg text-[12px] font-extrabold hover:bg-[#1b3d1e] disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">check</span>
                        {savingItems ? 'Saving...' : 'Save Item Changes'}
                      </button>
                      <button 
                        onClick={() => {
                          setEditingItems(false);
                          setEditedItems([]);
                        }}
                        className="flex-1 p-2 border-[1.5px] border-[#ddeedd] bg-white text-[#607d66] rounded-lg text-[12px] font-bold hover:bg-[#f1f8f1] transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 mt-2">
                  <button onClick={() => setReceiptOrder(selectedOrder)} className="bg-[#065f46] text-white border-none py-2.5 px-[22px] rounded-lg cursor-pointer text-[14px] font-bold inline-flex items-center gap-2 hover:bg-[#044e3a] transition shadow-md">
                    <span className="material-symbols-outlined text-[18px]">print</span> Print Receipt (80mm)
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setShowDeleteModal(true); setDeleteTwoFaCode(''); setDeleteError(''); }} className="bg-red-600 text-white border-none py-2 px-5 rounded-lg cursor-pointer text-[13px] font-bold inline-flex items-center gap-1.5 hover:bg-red-700 transition shadow-md">
                      <span className="material-symbols-outlined text-[17px]">delete</span> Delete Order
                    </button>
                  )}
                </div>
                
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Pager */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap px-3.5 py-2 bg-white border-t border-[#ddeedd] shrink-0">
        <div className="text-[12px] text-[#607d66] order-1 md:order-none w-full md:w-auto text-center md:text-left">
          {filteredOrders.length === 0 ? 'No orders' : `Showing ${(page-1)*pageSize + 1}–${Math.min(page*pageSize, filteredOrders.length)} of ${filteredOrders.length}`}
        </div>
        <div className="w-full md:w-auto order-3 md:order-none text-center">
          <span className="text-[12px] text-[#607d66] mr-2">Show</span>
          <select value={pageSize} onChange={e => {setPageSize(Number(e.target.value)); setPage(1);}} className="border-[1.5px] border-[#ddeedd] rounded-md px-1.5 py-1 text-[12px] bg-white">
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-[12px] text-[#607d66] ml-2">per page</span>
        </div>
        <div className="flex gap-1 justify-center w-full md:w-auto order-2 md:order-none">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-[29px] h-[29px] rounded-md border-[1.5px] border-[#ddeedd] bg-white flex items-center justify-center text-[12px] text-[#141c15] transition hover:bg-[#2e7d32] hover:text-white hover:border-[#2e7d32] disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-[#141c15] disabled:hover:border-[#ddeedd]">
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) {
              return (
                <button key={p} onClick={() => setPage(p)} className={`w-[29px] h-[29px] rounded-md border-[1.5px] flex items-center justify-center text-[12px] transition ${page === p ? 'bg-[#2e7d32] text-white border-[#2e7d32] font-extrabold' : 'border-[#ddeedd] bg-white text-[#141c15] hover:bg-[#2e7d32] hover:text-white hover:border-[#2e7d32]'}`}>
                  {p}
                </button>
              );
            } else if (Math.abs(p - page) === 3) {
              return <span key={p} className="inline-flex items-center w-[26px] justify-center text-[13px] text-[#607d66]">...</span>;
            }
            return null;
          })}

          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-[29px] h-[29px] rounded-md border-[1.5px] border-[#ddeedd] bg-white flex items-center justify-center text-[12px] text-[#141c15] transition hover:bg-[#2e7d32] hover:text-white hover:border-[#2e7d32] disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-[#141c15] disabled:hover:border-[#ddeedd]">
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOrder && <ReceiptPrinter order={receiptOrder} onClose={() => setReceiptOrder(null)} />}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white dark:bg-[#121212] border border-red-200 rounded-2xl w-full max-w-md shadow-2xl p-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-xl">warning</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-obsidian dark:text-white">Delete Order</h3>
                <p className="text-sm text-slate-500">Order #{selectedOrder?.id?.slice(0, 8)}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              This will soft-delete the order. Enter your <strong>6-digit authenticator code</strong> to confirm.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={deleteTwoFaCode}
              onChange={e => setDeleteTwoFaCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 text-center text-2xl font-mono font-bold tracking-[0.5em] rounded-xl bg-white dark:bg-obsidian border border-[#d4ecd4] dark:border-border focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300 transition-all mb-4"
            />

            {deleteError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 rounded-xl border border-[#d4ecd4] dark:border-border text-sm font-bold text-obsidian dark:text-white hover:bg-parchment-mid dark:hover:bg-[#1A301D] transition-all">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting || deleteTwoFaCode.length < 6} className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {deleting ? (
                  <>Deleting...</>
                ) : (
                  <>Delete Order</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
};

export default OrderTracking;
