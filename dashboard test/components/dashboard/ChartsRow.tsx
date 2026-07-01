"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { useToast } from "./ToastProvider";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Filler);
ChartJS.defaults.color = "#5c6280";
ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.defaults.font.size = 11;
ChartJS.defaults.plugins.legend.display = false;

const tooltipStyle = {
  backgroundColor: "#1a1d28",
  borderColor: "#272c40",
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8,
  titleFont: { weight: "600" as const, size: 12 },
  bodyFont: { size: 11 },
};

const monthlyLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthlyThis = [12400, 15800, 14200, 18900, 16700, 21300, 19800, 23400, 21770, 25100, 26800, 28900];
const monthlyLast = [10200, 12100, 11800, 14500, 13200, 16800, 15900, 18200, 17400, 20100, 21500, 23600];

const weeklyLabels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"];
const weeklyThis = [4200, 5100, 3800, 6400, 5600, 7200, 6100, 7800, 7300, 8400, 8100, 9200];
const weeklyLast = [3100, 3900, 3200, 4800, 4100, 5600, 4900, 6100, 5800, 6700, 6400, 7300];

// ─── Revenue Chart ───
function RevenueChart() {
  const chartRef = useRef<ChartJS<"bar">>(null);
  const [range, setRange] = useState<"monthly" | "weekly">("monthly");
  const { showToast } = useToast();

  const labels = range === "monthly" ? monthlyLabels : weeklyLabels;
  const dataThis = range === "monthly" ? monthlyThis : weeklyThis;
  const dataLast = range === "monthly" ? monthlyLast : weeklyLast;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(240,160,48,0.85)");
    gradient.addColorStop(1, "rgba(240,160,48,0.15)");
    chart.data.datasets[0].backgroundColor = gradient;
    chart.update("none");
  }, [range]);

  return (
    <div className="card p-5 col-span-1 lg:col-span-3 animate-in" style={{ animationDelay: "0.15s" }}>
      <div className="flex items-center justify-between mb-4 relative z-[2]">
        <div>
          <h3 className="text-sm font-bold">Revenue Overview</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">Revenue in ETB — {range === "monthly" ? "by month" : "by week"}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] mr-3">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent)]" />This Period</span>
            <span className="flex items-center gap-1.5 text-[var(--muted)]"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--border-light)]" />Last Period</span>
          </div>
          <div className="flex gap-0.5 bg-[var(--bg-deep)] rounded-lg p-0.5">
            <button className={`tab-btn ${range === "monthly" ? "active" : ""}`} onClick={() => { setRange("monthly"); showToast("Switched to monthly view", "info"); }}>Monthly</button>
            <button className={`tab-btn ${range === "weekly" ? "active" : ""}`} onClick={() => { setRange("weekly"); showToast("Switched to weekly view", "info"); }}>Weekly</button>
          </div>
        </div>
      </div>
      <div style={{ height: 260 }}>
        <Bar
          key={range}
          ref={chartRef}
          data={{
            labels,
            datasets: [
              { label: "This Period", data: dataThis, borderRadius: 6, borderSkipped: false, barThickness: 20, backgroundColor: "rgba(240,160,48,0.6)", hoverBackgroundColor: "rgba(240,160,48,0.9)" },
              { label: "Last Period", data: dataLast, borderRadius: 6, borderSkipped: false, barThickness: 20, backgroundColor: "rgba(39,44,64,0.6)", hoverBackgroundColor: "rgba(39,44,64,0.9)" },
            ],
          }}
          options={{
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()} ETB` } } },
            scales: {
              y: { beginAtZero: true, grid: { color: "rgba(30,34,51,0.5)", drawBorder: false }, ticks: { callback: (v) => `${(v / 1000).toFixed(0)}k` }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ─── Sales Distribution ───
function SalesDistribution() {
  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart: ChartJS) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f0f2f8";
      ctx.font = "bold 22px 'Inter', sans-serif";
      ctx.fillText("87.6%", width / 2, height / 2 - 6);
      ctx.fillStyle = "#5c6280";
      ctx.font = "500 10px 'Inter', sans-serif";
      ctx.fillText("ONLINE", width / 2, height / 2 + 12);
      ctx.restore();
    },
  };

  return (
    <div className="card p-5 col-span-1 animate-in" style={{ animationDelay: "0.2s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold">Sales Distribution</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">By sales channel</p>
      </div>
      <div className="flex justify-center" style={{ height: 200 }}>
        <Doughnut
          data={{
            labels: ["Online Sales", "Telegram", "Instagram"],
            datasets: [{ data: [87.6, 7.5, 4.9], backgroundColor: ["#f0a030", "#38bdf8", "#a78bfa"], borderColor: "#13161f", borderWidth: 3, hoverOffset: 8 }],
          }}
          plugins={[centerTextPlugin]}
          options={{ responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%` } } } }}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 mt-4">
        {[
          { label: "Online Sales", pct: "87.6%", color: "#f0a030" },
          { label: "Telegram", pct: "7.5%", color: "#38bdf8" },
          { label: "Instagram", pct: "4.9%", color: "#a78bfa" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-[11px] text-[var(--muted)] truncate">{item.label}</span>
            <span className="text-[11px] font-bold ml-auto">{item.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sales by Region ───
function SalesByRegion() {
  const chartRef = useRef<ChartJS<"bar">>(null);
  const regions = ["North", "South", "East", "West", "Central"];
  const values = [89400, 67200, 54800, 43100, 30150];
  const colors = ["#f0a030", "#38bdf8", "#a78bfa", "#34d399", "#fb7185"];

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const gradients = colors.map((c) => {
      const g = ctx.createLinearGradient(0, 0, 0, 220);
      g.addColorStop(0, c);
      g.addColorStop(1, c + "33");
      return g;
    });
    chart.data.datasets[0].backgroundColor = gradients;
    chart.update("none");
  }, []);

  return (
    <div className="card p-5 col-span-1 animate-in" style={{ animationDelay: "0.25s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold">Sales by Region</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Geographic performance</p>
      </div>
      <div style={{ height: 220 }}>
        <Bar
          ref={chartRef}
          data={{
            labels: regions,
            datasets: [{ data: values, borderRadius: 8, borderSkipped: false, barThickness: 28, backgroundColor: "rgba(240,160,48,0.6)" }],
          }}
          options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx) => ` ${ctx.parsed.y.toLocaleString()} ETB` } } },
            scales: {
              y: { beginAtZero: true, grid: { color: "rgba(30,34,51,0.5)", drawBorder: false }, ticks: { callback: (v) => `${(v / 1000).toFixed(0)}k` }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

export default function ChartsRow() {
  return (
    <>
      {/* Row 2: Revenue + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <RevenueChart />
        <SalesDistribution />
      </div>
      {/* Row 3: Region */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <SalesByRegion />
        <div className="lg:col-span-3">
          <EmployeePerformanceWrapper />
        </div>
      </div>
    </>
  );
}

// Import EmployeePerformance inline to avoid circular deps
import EmployeePerformanceWrapper from "./EmployeePerformance";