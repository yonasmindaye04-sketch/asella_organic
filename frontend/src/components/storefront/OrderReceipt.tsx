import React, { useRef } from 'react';

export interface ReceiptData {
  orderId: string;
  customerName: string;
  phone: string;
  city: string;
  location: string;
  orderType: string;
  total: number;
  items: { name: string; package_size: string; quantity: number; unit_price: number }[];
  date: string;
}

interface OrderReceiptProps {
  data: ReceiptData;
  onClose: () => void;
}

const OrderReceipt: React.FC<OrderReceiptProps> = ({ data, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'width=420,height=800');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${data.orderId}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'JetBrains Mono', 'Courier New', monospace; background: #fff; display:flex; justify-content:center; padding: 10px; }
          .receipt { max-width: 340px; width: 100%; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const handleOverlay = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const now = new Date(data.date);
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const itemCount = data.items.reduce((sum, item) => sum + item.quantity, 0);

  const dashes = '- '.repeat(24);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlay}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] overflow-hidden animate-in zoom-in-95 duration-200 my-4 flex flex-col max-h-[94vh]">
        
        {/* Action buttons at the top */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/80">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-green-700">receipt_long</span>
            Order Receipt
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0D2E10] text-white rounded-lg text-xs font-bold hover:bg-[#1a4a1f] transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Print
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Receipt body — scrollable */}
        <div className="overflow-y-auto flex-1 p-5">
          <div ref={receiptRef}>
            <div
              className="receipt mx-auto"
              style={{
                maxWidth: 340,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 12,
                lineHeight: 1.55,
                color: '#1a1a1a',
                background: '#fff',
                padding: '20px 16px',
                border: '1px solid #e5e5e5',
                borderRadius: 12,
              }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>
                  Asella Organic Enterprise
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                  TIN: 0093291109
                </p>
                <p style={{ fontSize: 10, color: '#555', marginTop: 4, lineHeight: 1.4 }}>
                  Addis Ababa, Piazza Giorgis, Ethel<br />Appartment
                </p>
                <p style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                  Tel: +251 909 122 623 / +251 942 223 999
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, marginTop: 6 }}>
                  DATE: {dateStr} {timeStr}
                </p>
              </div>

              {/* Divider */}
              <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, margin: '10px 0', letterSpacing: 2 }}>
                == CASH INVOICE ==
              </p>

              {/* Order info */}
              <div style={{ margin: '10px 0', fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span>Order ID</span>
                  <span style={{ fontWeight: 700 }}>{data.orderId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span>Customer</span>
                  <span style={{ fontWeight: 700 }}>{data.customerName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span>Phone</span>
                  <span style={{ fontWeight: 700 }}>{data.phone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span>Location</span>
                  <span style={{ fontWeight: 700 }}>{data.location || data.city}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span>Order Type</span>
                  <span style={{ fontWeight: 700 }}>{data.orderType}</span>
                </div>
              </div>

              {/* Items header dashes */}
              <p style={{ fontSize: 9, color: '#999', letterSpacing: -0.5, overflow: 'hidden', margin: '8px 0 4px' }}>
                {dashes}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, textDecoration: 'underline', marginBottom: 2 }}>
                <span style={{ flex: 2 }}>DESCRIPTION</span>
                <span style={{ width: 30, textAlign: 'center' }}>QTY</span>
                <span style={{ width: 54, textAlign: 'right' }}>PRICE</span>
                <span style={{ width: 62, textAlign: 'right' }}>AMOUNT</span>
              </div>
              <p style={{ fontSize: 9, color: '#999', letterSpacing: -0.5, overflow: 'hidden', margin: '2px 0 6px' }}>
                {dashes}
              </p>

              {/* Items */}
              {data.items.map((item, i) => {
                const amount = item.quantity * item.unit_price;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', alignItems: 'flex-start' }}>
                    <span style={{ flex: 2, wordBreak: 'break-word', paddingRight: 4 }}>
                      {item.name} ({item.package_size})
                    </span>
                    <span style={{ width: 30, textAlign: 'center' }}>{item.quantity}</span>
                    <span style={{ width: 54, textAlign: 'right' }}>{item.unit_price.toLocaleString()}</span>
                    <span style={{ width: 62, textAlign: 'right', fontWeight: 700 }}>{amount.toLocaleString()}</span>
                  </div>
                );
              })}

              {/* Totals */}
              <p style={{ fontSize: 9, color: '#999', letterSpacing: -0.5, overflow: 'hidden', margin: '8px 0' }}>
                {dashes}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0' }}>
                <span>TXBL1</span>
                <span>{Number(data.total).toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, padding: '4px 0', margin: '4px 0' }}>
                <span>TOTAL</span>
                <span>{Number(data.total).toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0' }}>
                <span>CASH</span>
                <span>{Number(data.total).toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0' }}>
                <span>ITEM#</span>
                <span>{itemCount}</span>
              </div>

              {/* QR Code */}
              <div style={{ textAlign: 'center', margin: '18px 0 6px' }}>
                <img
                  src="/image/receipt/Payment Qr Code_.png"
                  alt="Payment QR Code"
                  style={{ width: 220, height: 220, margin: '0 auto', display: 'block', imageRendering: 'pixelated' }}
                />
              </div>

              <p style={{ textAlign: 'center', fontSize: 10, color: '#555', margin: '6px 0 10px' }}>
                Scan to view receipt online
              </p>

              {/* EthQR Logo */}
              <div style={{ textAlign: 'center', margin: '4px 0 16px' }}>
                <img
                  src="/image/receipt/image_2026-05-31_21-04-10.png"
                  alt="Ethiopian Interoperable Payment QR Code"
                  style={{ width: 180, height: 'auto', margin: '0 auto', display: 'block' }}
                />
              </div>

              {/* Order Tracking Box */}
              <div style={{
                border: '2px dashed #0D2E10',
                borderRadius: 8,
                padding: '12px 14px',
                textAlign: 'center',
                margin: '12px 0',
                background: '#f0f7f1',
              }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: '#555', marginBottom: 4 }}>
                  Track Your Order
                </p>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#0D2E10', letterSpacing: 1, margin: '4px 0' }}>
                  {data.orderId}
                </p>
                <p style={{ fontSize: 9, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                  Visit <span style={{ fontWeight: 700 }}>asella-organic.com/track</span><br />
                  and enter this ID to track your order
                </p>
              </div>

              {/* Footer */}
              <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: '8px 12px', textAlign: 'center', fontSize: 10, fontStyle: 'italic', margin: '10px 0' }}>
                This receipt is valid only for Asella<br />Organic orders.
              </div>

              <div style={{ textAlign: 'center', fontSize: 11, marginTop: 10 }}>
                <p style={{ fontWeight: 700 }}>Thank you for your order!</p>
                <p style={{ fontSize: 10, color: '#666', marginTop: 2 }}>asella-organic.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderReceipt;
