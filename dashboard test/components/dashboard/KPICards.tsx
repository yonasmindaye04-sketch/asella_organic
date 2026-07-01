"use client";

import React, { useEffect, useRef, useState } from "react";

interface KPIConfig {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  change: number;
  icon: string;
  color: string;
  colorDim: string;
  subtitle?: string;
}

const kpis: KPIConfig[] = [
  { label: "Total Revenue", value: 21770, suffix: " ETB", change: 24.6, icon: "fa-solid fa-coins", color: "var(--emerald)", colorDim: "var(--emerald-dim)" },
  { label: "Total Orders", value: 11, change: 18.2, icon: "fa-solid fa-receipt", color: "var(--accent)", colorDim: "var(--accent-dim)" },
  { label: "Avg. Order Value", value: 1979, suffix: " ETB", change: -3.1, icon: "fa-solid fa-hand-holding-dollar", color: "var(--sky)", colorDim: "var(--sky-dim)" },
  { label: "Active Staff", value: 8, subtitle: "of 12 total", change: 0, icon: "fa-solid fa-user-group", color: "var(--violet)", colorDim: "var(--violet-dim)" },
  { label: "Conversion Rate", value: 34, suffix: "%", change: 5.4, icon: "fa-solid fa-bullseye", color: "var(--rose)", colorDim: "var(--rose-dim)" },
  { label: "Satisfaction", value: 92, suffix: "%", change: 1.2, icon: "fa-solid fa-face-smile", color: "var(--accent-light)", colorDim: "var(--accent-dim)" },
];

function AnimatedNumber({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const duration = 1400;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target]);

  const formatted = target >= 1000 ? display.toLocaleString() : display.toString();
  return <span className="font-bold tabular-nums">{prefix}{formatted}{suffix}</span>;
}

function KPICard({ kpi, index }: { kpi: KPIConfig; index: number }) {
  const isPositive = kpi.change > 0;
  const isNeutral = kpi.change === 0;

  return (
    <div
      className="card p-4 group animate-in"
      style={{ animationDelay: `${0.06 * index}s` }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
        e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
      }}
    >
      <div className="flex items-start justify-between mb-3 relative z-[2]">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[16px] transition-transform duration-300 group-hover:scale-110" style={{ background: kpi.colorDim, color: kpi.color }}>
          <i className={kpi.icon} />
        </div>
        {!isNeutral ? (
          <span className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-md ${isPositive ? "text-[var(--emerald)] bg-[var(--emerald-dim)]" : "text-[var(--rose)] bg-[var(--rose-dim)]"}`}>
            <i className={`fa-solid fa-arrow-${isPositive ? "up" : "down"} text-[8px]`} />
            {Math.abs(kpi.change)}%
          </span>
        ) : (
          <span className="text-[11px] text-[var(--muted)] font-medium">{kpi.subtitle}</span>
        )}
      </div>
      <p className="text-[10.5px] text-[var(--muted)] font-semibold uppercase tracking-[0.06em] relative z-[2]">{kpi.label}</p>
      <p className="text-[22px] font-extrabold tracking-tight mt-1 relative z-[2]">
        <AnimatedNumber target={kpi.value} prefix={kpi.prefix} suffix={kpi.suffix} />
      </p>
    </div>
  );
}

export default function KPICards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi, i) => (
        <KPICard key={kpi.label} kpi={kpi} index={i} />
      ))}
    </div>
  );
}