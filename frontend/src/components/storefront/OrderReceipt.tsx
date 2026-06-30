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
      <div className="bg-white dark:bg-[#121212] rounded-2xl shadow-2xl w-full max-w-[420px] overflow-hidden animate-in zoom-in-95 duration-200 my-4 flex flex-col max-h-[94vh]">
        
        {/* Action buttons at the top */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-border bg-gray-50/80 dark:bg-[#1A1A1A]">
          <h3 className="text-sm font-bold text-gray-700 dark:text-white flex items-center gap-2">
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
                maxWidth: 300,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 11,
                lineHeight: 1.3,
                color: '#000',
                background: '#fff',
                padding: '8px 8px',
                borderRadius: 4,
              }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 800 }}>
                  Asella Organic Enterprise
                </p>
                <p style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                  TIN: 0093291109
                </p>
                <p style={{ fontSize: 10, color: '#000', marginTop: 2, lineHeight: 1.2, fontWeight: 600 }}>
                  Addis Ababa, Piazza Giorgis, Ethel<br />Appartment
                </p>
                <p style={{ fontSize: 10, color: '#000', marginTop: 2, fontWeight: 600 }}>
                  Tel: +251 909 122 623 / +251 942 223 999
                </p>
                <p style={{ fontSize: 10, fontWeight: 800, marginTop: 4 }}>
                  DATE: {dateStr} {timeStr}
                </p>
              </div>

              {/* Divider */}
              <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, margin: '6px 0' }}>
                == CASH INVOICE ==
              </p>

              {/* Order info */}
              <div style={{ margin: '6px 0', fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span style={{ fontWeight: 600 }}>Order ID</span>
                  <span style={{ fontWeight: 800 }}>{data.orderId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span style={{ fontWeight: 600 }}>Customer</span>
                  <span style={{ fontWeight: 800 }}>{data.customerName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span style={{ fontWeight: 600 }}>Phone</span>
                  <span style={{ fontWeight: 800 }}>{data.phone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span style={{ fontWeight: 600 }}>Location</span>
                  <span style={{ fontWeight: 800 }}>{data.location || data.city}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span style={{ fontWeight: 600 }}>Order Type</span>
                  <span style={{ fontWeight: 800 }}>{data.orderType}</span>
                </div>
              </div>

              {/* Items header dashes */}
              <p style={{ fontSize: 9, color: '#000', letterSpacing: -0.5, overflow: 'hidden', margin: '4px 0 2px', fontWeight: 800 }}>
                {dashes}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, borderBottom: '1px dashed #000', paddingBottom: 2, marginBottom: 2 }}>
                <span style={{ flex: 2 }}>DESCRIPTION</span>
                <span style={{ width: 30, textAlign: 'center' }}>QTY</span>
                <span style={{ width: 54, textAlign: 'right' }}>PRICE</span>
                <span style={{ width: 62, textAlign: 'right' }}>AMOUNT</span>
              </div>

              {/* Items */}
              {data.items.map((item, i) => {
                const amount = item.quantity * item.unit_price;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0', alignItems: 'flex-start' }}>
                    <span style={{ flex: 2, wordBreak: 'break-word', paddingRight: 4, fontWeight: 700 }}>
                      {item.name} ({item.package_size})
                    </span>
                    <span style={{ width: 30, textAlign: 'center', fontWeight: 700 }}>{item.quantity}</span>
                    <span style={{ width: 54, textAlign: 'right', fontWeight: 700 }}>{item.unit_price.toLocaleString()}</span>
                    <span style={{ width: 62, textAlign: 'right', fontWeight: 800 }}>{amount.toLocaleString()}</span>
                  </div>
                );
              })}

              {/* Totals */}
              <p style={{ fontSize: 9, color: '#000', letterSpacing: -0.5, overflow: 'hidden', margin: '4px 0', fontWeight: 800 }}>
                {dashes}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '1px 0', fontWeight: 700 }}>
                <span>TXBL1</span>
                <span>{Number(data.total).toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, padding: '2px 0', margin: '2px 0' }}>
                <span>TOTAL</span>
                <span>{Number(data.total).toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '1px 0', fontWeight: 700 }}>
                <span>CASH</span>
                <span>{Number(data.total).toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '1px 0', fontWeight: 700 }}>
                <span>ITEM#</span>
                <span>{itemCount}</span>
              </div>

              {/* QR Code */}
              <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
                <img
                  src="/image/receipt/Payment Qr Code_.png"
                  alt="Payment QR Code"
                  style={{ width: 140, height: 140, margin: '0 auto', display: 'block', imageRendering: 'pixelated' }}
                />
              </div>

              <p style={{ textAlign: 'center', fontSize: 9, color: '#000', fontWeight: 800, margin: '2px 0 6px' }}>
                Scan to view receipt online
              </p>

              {/* EthQR Logo */}
              <div style={{ textAlign: 'center', margin: '2px 0 6px' }}>
                <img
                  src="/image/receipt/image_2026-05-31_21-04-10.png"
                  alt="Ethiopian Interoperable Payment QR Code"
                  style={{ width: 110, height: 'auto', margin: '0 auto', display: 'block' }}
                />
              </div>

              {/* Order Tracking Box */}
              <div style={{
                border: '1px dashed #000',
                borderRadius: 4,
                padding: '6px 8px',
                textAlign: 'center',
                margin: '6px 0',
                background: '#fff',
              }}>
                <p style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#000', marginBottom: 2 }}>
                  Track Your Order
                </p>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#000', margin: '2px 0' }}>
                  {data.orderId}
                </p>
                <p style={{ fontSize: 8, color: '#000', fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>
                  Visit asellaorganic.com/track<br />
                  and enter this ID to track your order
                </p>
              </div>

              {/* Footer */}
              <div style={{ border: '1px solid #000', borderRadius: 4, padding: '4px 6px', textAlign: 'center', fontSize: 9, fontStyle: 'italic', margin: '6px 0', fontWeight: 800 }}>
                This receipt is valid only for Asella Organic orders.
              </div>

              <div style={{ textAlign: 'center', fontSize: 10, marginTop: 6 }}>
                <p style={{ fontWeight: 800 }}>Thank you for your order!</p>
                <p style={{ fontSize: 9, color: '#000', fontWeight: 800, marginTop: 2 }}>asellaorganic.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderReceipt;



