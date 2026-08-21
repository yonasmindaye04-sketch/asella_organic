export type TimeRangeOption = 'day' | 'week' | 'month' | '3month' | '6month' | 'all' | 'custom';

interface TimeRangeSelectorProps {
  onRangeChange: (from: string, to: string) => void;
  activeRange: TimeRangeOption;
  setActiveRange: (range: TimeRangeOption) => void;
}

export default function TimeRangeSelector({ onRangeChange, activeRange, setActiveRange }: TimeRangeSelectorProps) {
  const handleSelect = (option: TimeRangeOption) => {
    setActiveRange(option);
    
    const now = new Date();
    let from = '';
    const to = now.toISOString().split('T')[0];

    if (option === 'all') {
      onRangeChange('', '');
      return;
    }

    if (option === 'day') {
      from = to;
    } else if (option === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      from = weekAgo.toISOString().split('T')[0];
    } else if (option === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      from = monthAgo.toISOString().split('T')[0];
    } else if (option === '3month') {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      from = threeMonthsAgo.toISOString().split('T')[0];
    } else if (option === '6month') {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      from = sixMonthsAgo.toISOString().split('T')[0];
    }

    onRangeChange(from, to);
  };

  const options: { value: TimeRangeOption; label: string }[] = [
    { value: 'day', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: '3month', label: '3 Months' },
    { value: '6month', label: '6 Months' },
    { value: 'all', label: 'All Time' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-[#001803] border border-slate-200 dark:border-[#E2F0D9]/20 p-1 rounded-xl shadow-sm w-fit">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleSelect(opt.value)}
          className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${
            activeRange === opt.value
              ? 'bg-emerald-500 text-white shadow-sm dark:bg-[#A0F399] dark:text-[#002C17]'
              : 'text-slate-600 dark:text-[#A0F399]/70 hover:bg-slate-100 dark:hover:bg-[#E2F0D9]/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
