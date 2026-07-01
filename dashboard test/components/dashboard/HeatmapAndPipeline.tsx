"use client";

import React, { useRef, useEffect } from "react";
import {
  Chart as ChartJS,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(LinearScale, BarElement, Tooltip);
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
};

// ─── Heatmap ───
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm"];
const heatData = [
  [2, 4, 6, 5, 7, 8, 6, 4, 3, 1],
  [3, 5, 8, 7, 9, 10, 7, 5, 4, 2],
  [4, 6, 9, 8, 10, 9, 8, 6, 3, 1],
  [3, 7, 8, 9, 8, 10, 9, 7, 5, 2],
  [2, 5, 7, 6, 8, 7, 6, 5, 4, 2],
  [1, 2, 3, 2, 3, 4, 3, 2, 1, 0],
  [0, 1, 1, 1, 2, 2, 1, 1, 0, 0],
];
const maxVal = 10;

function Heatmap() {
  return (
    <div className="card p-5 animate-in" style={{ animationDelay: "0.45s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold">Weekly Sales Heatmap</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Sales intensity by day and hour</p>
      </div>
      <div className="overflow-x-auto relative z-[2]">
        <div className="min-w-[460px]">
          {/* Hour labels */}
          <div className="flex gap-1 mb-1 pl-[44px]">
            {hours.map((h) => (
              <div key={h} className="flex-1 text-center text-[9px] text-[var(--muted)]">{h}</div>
            ))}
          </div>
          {/* Rows */}
          {heatData.map((row, ri) => (
            <div key={days[ri]} className="flex gap-1 mb-1">
              <div className="w-[40px] flex items-center text-[10px] text-[var(--muted)] font-medium pr-1">{days[ri]}</div>
              {row.map((val, ci) => {
                const intensity = val / maxVal;
                const r = Math.round(240 * intensity + 20 * (1 - intensity));
                const g = Math.round(160 * intensity + 20 * (1 - intensity));
                const b = Math.round(48 * intensity + 40 * (1 - intensity));
                const alpha = 0.15 + intensity * 0.75;
                return (
                  <div
                    key={ci}
                    className="heat-cell flex-1 h-[22px]"
                    style={{ background: `rgba(${r},${g},${b},${alpha})` }}
                    title={`${days[ri]} ${hours[ci]}: ${val} sales`}
                  />
                );
              })}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-2 pl-[44px]">
            <span className="text-[9px] text-[var(--muted)]">Low</span>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => {
              const r = Math.round(240 * v + 20 * (1 - v));
              const g = Math.round(160 * v + 20 * (1 - v));
              const b = Math.round(48 * v + 40 * (1 - v));
              return <div key={v} className="w-4 h-3 rounded-sm" style={{ background: `rgba(${r},${g},${b},${0.15 + v * 0.75})` }} />;
            })}
            <span className="text-[9px] text-[var(--muted)]">High</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Funnel ───
function Pipeline() {
  return (
    <div className="card p-5 animate-in" style={{ animationDelay: "0.5s" }}>
      <div className="mb-4 relative z-[2]">
        <h3 className="text-sm font-bold">Sales Pipeline</h3>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">Deal stages and values</p>
      </div>
      <div className="relative z-[2]" style={{ height: 180 }}>
        <Bar
          data={{
            labels: ["Closed Won", "Proposal Sent", "Qualified", "Lead"],
            datasets: [{
              data: [186000, 142000, 98000, 54000],
              backgroundColor: ["#34d399", "#a78bfa", "#f0a030", "#38bdf8"],
              borderRadius: 6,
              borderSkipped: false,
              barThickness: 20,
            }],
          }}
          options={{
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { tooltip: { ...tooltipStyle, callbacks: { label: (ctx) => ` ${ctx.parsed.x.toLocaleString()} ETB` } } },
            scales: {
              x: { beginAtZero: true, grid: { color: "rgba(30,34,51,0.5)", drawBorder: false }, ticks: { callback: (v) => `${(v / 1000).toFixed(0)}k` }, border: { display: false } },
              y: { grid: { display: false }, border: { display: false } },
            },
          }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3 relative z-[2]">
        {[
          { label: "Leads", value: "42", color: "var(--sky)" },
          { label: "Qualified", value: "28", color: "var(--accent)" },
          { label: "Proposal", value: "15", color: "var(--violet)" },
          { label: "Closed", value: "8", color: "var(--emerald)" },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-base font-extrabold" style={{ color: item.color }}>{item.value}</p>
            <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeatmapAndPipeline() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Heatmap />
      <Pipeline />
    </div>
  );
}