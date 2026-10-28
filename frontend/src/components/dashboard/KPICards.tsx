import { useEffect, useState } from "react";

interface KPIMetrics {
  totalRevenue: number;
  netProfit: number;
  totalOrders: number;
  deliveredOrders: number;
  avgOrderValue: number;
  totalUnitsSold: number;
  totalExpenses: number;
  /** Optional — derived from netProfit / totalRevenue when omitted. */
  profitMargin?: number;
}

function AnimatedNumber({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [displayValue, setDisplayValue] = useState(target);

  useEffect(() => {
    let frameId: number;
    const startVal = displayValue;
    const endVal = Number.isFinite(target) ? target : 0;
    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    const duration = 450;
    const startTime = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * eased;
      setDisplayValue(current);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(endVal);
      }
    };

    frameId = requestAnimationFrame(step);
    // rAF is paused while the window is hidden/unfocused. Guarantee the
    // final value renders anyway so KPIs never stay stuck at their old value.
    const fallbackId = window.setTimeout(() => setDisplayValue(endVal), duration + 100);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(fallbackId);
    };
  }, [target]);

  const formatted =
    decimals > 0
      ? displayValue.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(displayValue).toLocaleString();

  return (
    <span className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export default function KPICards({
  metrics,
  rangeLabel,
}: {
  metrics?: KPIMetrics;
  rangeLabel?: string;
}) {
  const rev = metrics?.totalRevenue ?? 0;
  const profit = metrics?.netProfit ?? 0;
  const orders = metrics?.totalOrders ?? 0;
  const delivered = metrics?.deliveredOrders ?? 0;
  const aov = metrics?.avgOrderValue ?? 0;
  const unitsSold = metrics?.totalUnitsSold ?? 0;
  const margin = metrics?.profitMargin ?? (rev > 0 ? Math.round((profit / rev) * 100) : 0);
  const deliveryRate = orders > 0 ? Math.round((delivered / orders) * 100) : 0;

  const cards = [
    {
      label: "Total Revenue",
      value: rev,
      suffix: " ETB",
      icon: "payments",
      badgeText: `${unitsSold.toLocaleString()} items sold`,
      badgePositive: true,
      subtext: `Gross sales (${rangeLabel || "Selected Period"})`,
      accentClass: "bg-emerald-600 text-white border-emerald-600",
    },
    {
      label: "Net Profit",
      value: profit,
      suffix: " ETB",
      icon: "account_balance_wallet",
      badgeText: `${margin}% margin`,
      badgePositive: profit >= 0,
      subtext: `After COGS & operating expenses`,
      accentClass:
        profit >= 0
          ? "bg-teal-600 text-white border-teal-600"
          : "bg-rose-600 text-white border-rose-600",
    },
    {
      label: "Total Orders",
      value: orders,
      suffix: "",
      icon: "shopping_bag",
      badgeText: `${deliveryRate}% delivered`,
      badgePositive: deliveryRate >= 50,
      subtext: `${delivered} completed of ${orders} placed`,
      accentClass: "bg-sky-600 text-white border-sky-600",
    },
    {
      label: "Avg. Order Value",
      value: aov,
      suffix: " ETB",
      icon: "monitoring",
      badgeText: orders > 0 ? `${(unitsSold / orders).toFixed(1)} items/order` : "0 items/order",
      badgePositive: true,
      subtext: "Revenue per customer checkout",
      accentClass: "bg-amber-500 text-white border-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {cards.map((kpi, i) => (
        <div
          key={kpi.label}
          className="card p-5 flex flex-col justify-between animate-in"
          style={{ animationDelay: `${0.04 * (i + 1)}s` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {kpi.label}
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-1.5 tabular-nums">
                <AnimatedNumber target={kpi.value} suffix={kpi.suffix} />
              </h3>
            </div>
            <div
              className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${kpi.accentClass}`}
            >
              <span className="material-symbols-outlined text-[18px]">{kpi.icon}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
            <span className="text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
              {kpi.subtext}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[13px] font-bold shrink-0 tabular-nums ${
                kpi.badgePositive
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {kpi.badgeText}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
