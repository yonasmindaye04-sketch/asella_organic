"use client";

import React, { useState, useEffect, useRef } from "react";

export default function TopHeader() {
  const [dateStr, setDateStr] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = new Date();
    setDateStr(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const notifications = [
    { text: "Order #ORD-2089 delivered successfully", time: "5m ago", icon: "fa-check-circle", color: "var(--emerald)" },
    { text: "New partner request from Ethio Telecom", time: "22m ago", icon: "fa-handshake", color: "var(--sky)" },
    { text: "Low stock alert: Wireless Earbuds", time: "1h ago", icon: "fa-triangle-exclamation", color: "var(--accent)" },
  ];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[rgba(8,9,13,0.75)] border-b border-[var(--border)]">
      <div className="flex items-center justify-between px-5 h-[56px]">
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[11px]" />
            <input type="text" className="search-input" placeholder="Search orders, staff, partners..." aria-label="Search" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--muted)] hidden lg:block mr-2">{dateStr}</span>
          <div ref={notifRef} className="relative">
            <button onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }} className="relative w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-light)] transition-all" aria-label="Notifications">
              <i className="fa-solid fa-bell text-[12px]" />
              <span className="absolute -top-0.5 -right-0.5 w-[14px] h-[14px] rounded-full bg-[var(--rose)] text-[8px] font-bold text-white flex items-center justify-center border-2 border-[var(--bg-deep)]">3</span>
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[320px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl overflow-hidden animate-in">
                <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                  <p className="text-xs font-bold">Notifications</p>
                  <button className="text-[10px] text-[var(--accent)] font-semibold hover:underline">Mark all read</button>
                </div>
                {notifications.map((n, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors border-b border-[var(--border)] last:border-0">
                    <i className={`fa-solid ${n.icon} mt-0.5 text-[12px]`} style={{ color: n.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] text-[var(--fg-secondary)] leading-snug">{n.text}</p>
                      <p className="text-[10px] text-[var(--muted)] mt-1">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div ref={profileRef} className="relative ml-1">
            <button onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }} className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-xl border border-[var(--border)] hover:border-[var(--border-light)] transition-all">
              <div className="hidden sm:block text-right">
                <p className="text-[11.5px] font-semibold leading-tight">Marcus Reid</p>
                <p className="text-[9.5px] text-[var(--muted)]">Sales Director</p>
              </div>
              <img src="https://picsum.photos/seed/ceo-face-ultimate/80/80.jpg" alt="Profile" className="w-7 h-7 rounded-lg object-cover border border-[var(--border)]" />
              <i className="fa-solid fa-chevron-down text-[8px] text-[var(--muted)]" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[200px] rounded-xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl overflow-hidden animate-in">
                {[
                  { label: "My Profile", icon: "fa-user" },
                  { label: "Preferences", icon: "fa-sliders" },
                  { label: "Billing", icon: "fa-credit-card" },
                ].map((item) => (
                  <button key={item.label} className="w-full px-4 py-2.5 flex items-center gap-3 text-[12px] text-[var(--fg-secondary)] hover:bg-[rgba(255,255,255,0.03)] transition-colors text-left">
                    <i className={`fa-solid ${item.icon} w-4 text-center text-[var(--muted)]`} />
                    {item.label}
                  </button>
                ))}
                <div className="border-t border-[var(--border)]">
                  <button className="w-full px-4 py-2.5 flex items-center gap-3 text-[12px] text-[var(--rose)] hover:bg-[var(--rose-dim)] transition-colors text-left">
                    <i className="fa-solid fa-right-from-bracket w-4 text-center" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}