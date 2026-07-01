"use client";

import React, { useEffect } from "react";
import ToastProvider, { useToast } from "@/components/dashboard/ToastProvider";
import Sidebar from "@/components/dashboard/Sidebar";
import TopHeader from "@/components/dashboard/TopHeader";
import KPICards from "@/components/dashboard/KPICards";
import ChartsRow from "@/components/dashboard/ChartsRow";
import LogisticsTable from "@/components/dashboard/LogisticsTable";
import StaffDirectory from "@/components/dashboard/StaffDirectory";
import HeatmapAndPipeline from "@/components/dashboard/HeatmapAndPipeline";
import SalesByLocation from "@/components/dashboard/SalesByLocation";

function DashboardContent() {
  const { showToast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      showToast("Dashboard data synced successfully", "success");
    }, 1200);
    return () => clearTimeout(timer);
  }, [showToast]);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      {/* Ambient background blobs */}
      <div className="ambient-blob" style={{ width: 500, height: 500, background: "#f0a030", top: "-180px", left: "-100px" }} />
      <div className="ambient-blob" style={{ width: 400, height: 400, background: "#38bdf8", bottom: "-120px", right: "-80px", animationDelay: "-8s" }} />
      <div className="ambient-blob" style={{ width: 300, height: 300, background: "#a78bfa", top: "40%", left: "55%", animationDelay: "-16s" }} />

      <Sidebar activePath="/dashboard" />

      <div className="ml-[248px] relative z-[1] transition-all duration-300">
        <TopHeader />

        <main className="p-5 space-y-3 max-w-[1440px]">
          {/* Title */}
          <div className="animate-in" style={{ animationDelay: "0s" }}>
            <h2 className="text-xl font-extrabold tracking-tight">Dashboard</h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-0.5">Welcome back, Marcus. Here&apos;s what&apos;s happening today.</p>
          </div>

          {/* Row 1: KPIs */}
          <KPICards />

          {/* Row 2-3: Revenue + Distribution + Region + Employee Performance */}
          <ChartsRow />

          {/* Row 4: Logistics + Staff */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
            <div className="xl:col-span-3">
              <LogisticsTable />
            </div>
            <div className="xl:col-span-2">
              <StaffDirectory />
            </div>
          </div>

          {/* Row 5: Heatmap + Pipeline + Sales by Location */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="xl:col-span-2">
              <HeatmapAndPipeline />
            </div>
            <div>
              <SalesByLocation />
            </div>
          </div>
        </main>

        <footer className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between text-[10.5px] text-[var(--muted)]">
          <p>SalesForge v2.4.1</p>
          <p>Last synced: {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
        </footer>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ToastProvider>
      <DashboardContent />
    </ToastProvider>
  );
}