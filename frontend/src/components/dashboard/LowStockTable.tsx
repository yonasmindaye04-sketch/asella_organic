import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import type { Product } from "../../services/api";

export default function LowStockTable() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLowStock = async () => {
      try {
        setLoading(true);
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
    <div className="card h-full flex flex-col justify-between animate-in">
      <div>
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Low Stock Alerts
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Inventory below minimum restock threshold
            </p>
          </div>
          <Link
            to="/dashboard/stock-alerts"
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-0.5"
          >
            Restock
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="text-right">Stock Left</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-zinc-400 text-xs">
                    Checking inventory...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-zinc-400 text-xs">
                    All products are well stocked
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const qty = Number(p.inventory_quantity ?? 0);
                  const isCritical = qty <= 3;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">
                          {p.name}
                          {(p as any).package_size ? (
                            <span className="text-zinc-400 ml-1">({(p as any).package_size})</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-zinc-500 dark:text-zinc-400 text-xs capitalize">
                        {p.tag || "Organic"}
                      </td>
                      <td className="text-right tabular-nums">
                        <span className={`badge ${isCritical ? "badge-cancelled" : "badge-pending"}`}>
                          {qty} units
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
