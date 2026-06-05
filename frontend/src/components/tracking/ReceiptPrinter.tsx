import React from 'react';
import OrderReceipt from '../storefront/OrderReceipt';
import type { ReceiptData } from '../storefront/OrderReceipt';

interface OrderItem {
  id?: string;
  item_name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: string;
  customer_name: string;
  phone: string;
  city: string;
  location: string;
  status: string;
  source: string;
  total_amount?: number;
  total?: number;
  created_at: string;
  notes?: string;
  items?: OrderItem[];
}

interface ReceiptPrinterProps {
  order: Order;
  onClose: () => void;
}

const ReceiptPrinter: React.FC<ReceiptPrinterProps> = ({ order, onClose }) => {
  const receiptData: ReceiptData = {
    orderId: order.id,
    customerName: order.customer_name,
    phone: order.phone,
    city: order.city,
    location: order.location,
    orderType: order.source, // 'source' or 'order_type' is fine here
    total: Number(order.total || order.total_amount || 0),
    items: (order.items || []).map(item => ({
      name: item.item_name,
      package_size: item.package_size || '',
      quantity: item.quantity,
      unit_price: Number(item.unit_price)
    })),
    date: order.created_at,
  };

  return <OrderReceipt data={receiptData} onClose={onClose} />;
};

export default ReceiptPrinter;
