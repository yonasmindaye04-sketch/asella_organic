"use client";

import React, { useState } from "react";
import Link from "next/link";

interface NavItem {
  icon: string;
  label: string;
  href: string;
  badge?: string | number;
}

const mainNav: NavItem[] = [
  { icon: "fa-solid fa-grid-2", label: "Dashboard", href: "/dashboard" },
  { icon: "fa-solid fa-chart-line", label: "Analytics", href: "/analytics" },
  { icon: "fa-solid fa-boxes-stacked", label: "Inventory", href: "/inventory" },
  { icon: "fa-solid fa-cart-shopping", label: "Orders", href: "/orders", badge: 11 },
];

const teamNav: NavItem[] = [
  { icon: "fa-solid fa-users", label: "Staff", href: "/staff" },
  { icon: "fa-solid fa-handshake", label: "Partners", href: "/partners" },
  { icon: "fa-solid fa-truck-fast", label: "Logistics", href: "/logistics" },
];

const systemNav: NavItem[] = [
  { icon: "fa-solid fa-gear", label: "Settings", href: "/settings" },
  { icon: "fa-solid fa-circle-question", label: "Help", href: "/help" },
];

function NavSection({ title, items, activePath }: { title: string; items: NavItem[]; activePath: string }) {
  return (
    <div className="mb-5">
      <p className="text-[9.5px] font-bold text-[var(--muted)] tracking-[0.1em] uppercase px-3.5 mb-2">{title}</p>
      <nav className="flex flex-col gap-0.5" aria-label={title}>
        {items.map((item) => {
          const isActive = item.href === activePath;
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined}>
              <i className={`${item.icon} w-[18px] text-center text-[13px]`} />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isActive ? "bg-[var(--accent)] text-[var(--bg-deep)]" : "bg-[rgba(255,255,255,0.05)] text-[var(--fg-secondary)]"}`}>
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function Sidebar({ activePath = "/dashboard" }: { activePath?: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`fixed top-0 left-0 h-screen z-50 flex flex-col border-r border-[var(--border)] bg-[var(--bg)] transition-all duration-300 ${collapsed ? "w-[72px]" : "w-[248px]"}`} role="navigation" aria-label="Main navigation">
      <div className="flex items-center gap-3 px-5 h-[60px] border-b border-[var(--border)] flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[#e07a18] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[rgba(240,160,48,0.2)]">
          <i className="fa-solid fa-bolt text-[var(--bg-deep)] text-xs" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight leading-none">SalesForge</h1>
            <p className="text-[9px] text-[var(--muted)] tracking-[0.08em] uppercase mt-0.5">Management Suite</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto w-7 h-7 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-light)] transition-all flex-shrink-0" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <i className={`fa-solid fa-chevron-left text-[10px] transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="Main" items={mainNav} activePath={activePath} />
        <NavSection title="Team" items={teamNav} activePath={activePath} />
        <NavSection title="System" items={systemNav} activePath={activePath} />
      </div>

      {!collapsed && (
        <div className="px-3 pb-4 flex-shrink-0">
          <div className="rounded-xl bg-gradient-to-br from-[rgba(240,160,48,0.08)] to-transparent border border-[rgba(240,160,48,0.15)] p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <i className="fa-solid fa-crown text-[var(--accent)] text-xs" />
              <p className="text-xs font-bold">Go Pro</p>
            </div>
            <p className="text-[10.5px] text-[var(--muted)] leading-relaxed mb-3">AI forecasting, unlimited seats &amp; advanced reports.</p>
            <button className="w-full py-1.5 rounded-lg bg-[var(--accent)] text-[var(--bg-deep)] text-[11px] font-bold hover:bg-[var(--accent-light)] transition-colors">Upgrade Now</button>
          </div>
        </div>
      )}
    </aside>
  );
}