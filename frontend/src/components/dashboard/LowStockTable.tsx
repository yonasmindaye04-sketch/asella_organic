import { useState, useEffect } from "react";
import { api } from "../../services/api";
import type { Product } from "../../services/api";

export default function LowStockTable() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLowStock = async () => {
      try {
        setLoading(true);
        // Using the low-stock endpoint from our api.ts
        const res = await api.get<any>("/api/products/low-stock?limit=10");
        const items = res.data?.data || res.data;
        setProducts(Array.isArray(items) ? items : []);
      } catch (err) {
        console.error("Failed to load low stock products", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLowStock();
  }, []);

  return (
    <div className="card animate-in h-full" style={{ animationDelay: "0.2s" }}>
      <div className="flex items-center justify-between p-5 pb-3 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold text-[var(--fg)]">Low Stock Alerts</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Products requiring immediate restocking</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Remaining Stock</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center py-8 text-[var(--muted)] text-sm">Checking inventory...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-8 text-[var(--muted)] text-sm">All products are well stocked!</td></tr>
            ) : products.map((p) => {
              const qty = Number(p.inventory_quantity ?? 0);
              const isCritical = qty === 0;
              return (
                <tr key={p.id}>
                  <td><span className="font-medium text-[var(--fg)]">{p.name}</span></td>
                  <td className="text-[var(--muted)] capitalize">{p.tag || 'N/A'}</td>
                  <td>
                    <span className={`badge ${isCritical ? 'badge-cancelled' : 'badge-pending'}`}>
                      {qty} left
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
