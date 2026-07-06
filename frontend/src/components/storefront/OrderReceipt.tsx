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
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', Courier, monospace; background: #fff; padding: 4px 6px; width: 100%; }
          .receipt { width: 100%; max-width: 100%; margin: 0 auto; }
          .no-break { page-break-inside: avoid; break-inside: avoid; }
          @media print {
            body { padding: 2px 4px; }
            @page { margin: 3mm; size: 80mm auto; }
            .receipt { page-break-inside: avoid; break-inside: avoid; max-width: 100%; }
            .no-break { page-break-inside: avoid; break-inside: avoid; }
            img { max-width: 100% !important; height: auto !important; }
          }
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
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={handleOverlay}
    >
      <div className="flex flex-col items-center">
        <div className="bg-white rounded shadow-2xl w-full max-w-[420px] max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200 mb-4 flex flex-col">

          {/* Receipt body */}
          <div className="overflow-y-auto flex-1 py-4 pb-6 bg-white w-full px-1.5">
            <div ref={receiptRef} className="w-full">
              <div
                  className="receipt w-full no-break"
                  style={{
                    width: '100%',
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: '#000',
                    background: '#fff',
                    fontWeight: 600,
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
              >
                {/* Header */}
                <div className="no-break" style={{ textAlign: 'center', marginBottom: 4, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <p style={{ fontSize: 16, fontWeight: 800 }}>Asella Organic Enterprise</p>
                  <p style={{ fontSize: 11, fontWeight: 500, marginTop: 2 }}>
                    Addis Ababa, Piazza Giorgis, Ethel Appartment<br />
                    <span style={{ whiteSpace: 'nowrap' }}>Tel: +251 909 122 623 or +251 942 223 999</span><br />
                   
                    <b style={{ whiteSpace: 'nowrap' }}>TIN: 0093291109</b>
                  </p>
                </div>

                {/* First Bold Line */}
                <div style={{ borderTop: '2px solid #000', margin: '4px 0' }}></div>

                {/* Order info */}
                <div style={{ margin: '2px 0', fontSize: 11 }}>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Date</span>
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{dateStr} {timeStr}</span>
                  </div>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Order ID</span>
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{data.orderId}</span>
                  </div>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Customer</span>
                    <span style={{ fontWeight: 500 }}>{data.customerName}</span>
                  </div>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Phone</span>
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{data.phone}</span>
                  </div>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Location</span>
                    <span style={{ fontWeight: 500 }}>{data.location || data.city}</span>
                  </div>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Order Type</span>
                    <span style={{ fontWeight: 500 }}>{data.orderType}</span>
                  </div>
                  <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 800 }}>Cashier</span>
                    <span style={{ fontWeight: 500 }}>manager</span>
                  </div>
                </div>

                {/* Thin Dashed Line */}
                <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

                {/* Items header */}
                <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, paddingBottom: 2, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <span style={{ flex: 2 }}>ITEM</span>
                  <span style={{ width: 40, textAlign: 'center' }}>PKG</span>
                  <span style={{ width: 30, textAlign: 'center' }}>QTY</span>
                  <span style={{ width: 70, textAlign: 'right' }}>PRICE</span>
                </div>

                {/* Thin Dashed Line */}
                <div style={{ borderTop: '1px dashed #000', margin: '2px 0 4px' }}></div>

                {/* Items */}
                {data.items.map((item, i) => {
                  const amount = item.quantity * item.unit_price;
                  return (
                    <div
                      key={i}
                      className="no-break"
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '1px 0', alignItems: 'flex-start', pageBreakInside: 'avoid', breakInside: 'avoid' }}
                    >
                      <span style={{ flex: 2, wordBreak: 'break-word', paddingRight: 4, fontWeight: 500 }}>
                        {item.name}
                      </span>
                      <span style={{ width: 40, textAlign: 'center', fontWeight: 500 }}>{item.package_size}</span>
                      <span style={{ width: 30, textAlign: 'center', fontWeight: 500 }}>{item.quantity}</span>
                      <span style={{ width: 70, textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{amount.toLocaleString()} ETB</span>
                    </div>
                  );
                })}

                {/* Bold Line Above Total */}
                <div style={{ borderTop: '2px solid #000', margin: '4px 0 2px' }}></div>

                <div className="no-break" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, padding: '2px 0', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <span>TOTAL</span>
                  <span style={{ whiteSpace: 'nowrap' }}>{Number(data.total).toLocaleString()} ETB</span>
                </div>

                {/* Thin Dashed Line */}
                <div style={{ borderTop: '1px dashed #000', margin: '2px 0 6px' }}></div>

                {/* Scan to pay — placed above the QR code */}
                <p style={{ textAlign: 'center', fontSize: 11, color: '#000', fontWeight: 800, margin: '6px 0 2px' }}>
                  Scan to pay
                </p>

                {/* QR Code */}
                <div className="no-break" style={{ textAlign: 'center', margin: '4px 0 2px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <img
                    src="/image/receipt/Payment Qr Code_.png"
                    alt="Receipt QR Code"
                    loading="lazy" decoding="async"
                    style={{
                      margin: '0 auto',
                      display: 'block',
                      width: 190,
                      height: 170,
                      maxWidth: '60%',
                      imageRendering: 'pixelated',
                    }}
                  />
                </div>

                {/* EthQR Section */}
                <div className="no-break" style={{ textAlign: 'center', margin: '2px 0 6px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <img
                    src="/image/receipt/image_2026-05-31_21-04-10.png"
                    alt="EthQR"
                    loading="lazy" decoding="async"
                    style={{
                      margin: '0 auto',
                      display: 'block',
                      width: '55%',
                      maxWidth: 180,
                      height: 'auto',
                    }}
                  />
                </div>

                {/* Order Tracking Box */}
                <div className="no-break" style={{
                  border: '1px dashed #000',
                  borderRadius: 4,
                  padding: '4px 6px',
                  textAlign: 'center',
                  margin: '6px 0',
                  background: '#fff',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                }}>
                  <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#000', marginBottom: 2 }}>
                    Track Your Order
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#000', margin: '2px 0' }}>
                    {data.orderId}
                  </p>
                  <p style={{ fontSize: 10, color: '#000', fontWeight: 500, marginTop: 2, lineHeight: 1.2 }}>
                    Visit asellaorganic.com/track<br />
                    and enter this ID to track your order
                  </p>
                </div>

                {/* Footer Box */}
                <div className="no-break" style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 10, fontStyle: 'italic', margin: '6px 0', fontWeight: 500, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  This receipt is valid only for Asella Organic orders.
                </div>

                <div className="no-break" style={{ textAlign: 'center', fontSize: 11, marginTop: 8, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <p style={{ fontWeight: 500 }}>Thank you for your order!</p>
                  <p style={{ color: '#000', fontWeight: 500, marginTop: 2 }}>asellaorganic.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Below Receipt */}
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handlePrint}
            className="px-6 py-2.5 bg-[#0D4026] text-white rounded-lg text-sm font-semibold hover:bg-[#092a18] transition-colors"
          >
            Print (80mm)
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#e2e6eb] text-[#333] rounded-lg text-sm font-semibold hover:bg-[#d0d4d9] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderReceipt;