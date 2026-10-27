import React, { useState } from 'react';

export type TimeRange = 'day' | 'week' | 'month' | 'custom';

export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRangeDates(range: TimeRange, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const to = formatLocalDate(now);

  if (range === 'day') {
    return { from: to, to };
  }
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: formatLocalDate(start), to };
  }
  if (range === 'month') {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return { from: formatLocalDate(start), to };
  }
  // custom
  const defaultFrom = new Date(now);
  defaultFrom.setDate(now.getDate() - 14);
  return {
    from: customFrom || formatLocalDate(defaultFrom),
    to: customTo || to,
  };
}

interface TimeRangeSelectorProps {
  activeRange: TimeRange;
  from: string;
  to: string;
  onRangeChange: (range: TimeRange, startDate: string, endDate: string) => void;
}

const RANGES: { id: TimeRange; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: '1M' },
  { id: 'custom', label: 'Custom' },
];

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  activeRange,
  from,
  to,
  onRangeChange,
}) => {
  const [customStart, setCustomStart] = useState(from);
  const [customEnd, setCustomEnd] = useState(to);

  const handleSelect = (range: TimeRange) => {
    if (range === 'custom') {
      const dates = getRangeDates('custom', customStart || from, customEnd || to);
      setCustomStart(dates.from);
      setCustomEnd(dates.to);
      onRangeChange('custom', dates.from, dates.to);
      return;
    }
    const dates = getRangeDates(range);
    setCustomStart(dates.from);
    setCustomEnd(dates.to);
    onRangeChange(range, dates.from, dates.to);
  };

  const handleCustomStartChange = (val: string) => {
    setCustomStart(val);
    const validEnd = customEnd && customEnd >= val ? customEnd : val;
    if (validEnd !== customEnd) setCustomEnd(validEnd);
    if (val && validEnd) {
      onRangeChange('custom', val, validEnd);
    }
  };

  const handleCustomEndChange = (val: string) => {
    setCustomEnd(val);
    const validStart = customStart && customStart <= val ? customStart : val;
    if (validStart !== customStart) setCustomStart(validStart);
    if (validStart && val) {
      onRangeChange('custom', validStart, val);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date window indicator */}
      {activeRange !== 'custom' && (
        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-600 dark:text-zinc-400 tabular-nums shadow-2xs">
          <span className="material-symbols-outlined text-[15px] text-emerald-600 dark:text-emerald-400">calendar_today</span>
          <span>{from === to ? from : `${from} → ${to}`}</span>
        </div>
      )}

      {/* Segmented filter tabs (Day, Week, 1M, Custom) */}
      <div className="inline-flex items-center p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        {RANGES.map((r) => {
          const isActive = activeRange === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/80 dark:border-zinc-700'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Inline Custom Date Range Picker */}
      {activeRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs animate-in">
          <span className="material-symbols-outlined text-[15px] text-emerald-600 dark:text-emerald-400">date_range</span>
          <input
            type="date"
            aria-label="Start date"
            value={customStart}
            onChange={(e) => handleCustomStartChange(e.target.value)}
            className="bg-transparent text-xs font-medium text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
          />
          <span className="text-zinc-400 text-xs font-medium">to</span>
          <input
            type="date"
            aria-label="End date"
            value={customEnd}
            onChange={(e) => handleCustomEndChange(e.target.value)}
            className="bg-transparent text-xs font-medium text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
          />
        </div>
      )}
    </div>
  );
};
