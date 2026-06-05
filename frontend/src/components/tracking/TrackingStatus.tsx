import React from 'react';

const TrackingStatus: React.FC = () => {
  const statuses = [
    { label: 'All Orders', count: 1245, dotClass: 'bg-gray-400', active: true },
    { label: 'Pending', count: 45, dotClass: 'bg-amber-500', active: false },
    { label: 'Confirmed', count: 112, dotClass: 'bg-blue-500', active: false },
    { label: 'Packed', count: 85, dotClass: 'bg-purple-500', active: false },
    { label: 'In Transit', count: 42, dotClass: 'bg-cyan-500', active: false },
    { label: 'Delivered', count: 954, dotClass: 'bg-green-500', active: false },
    { label: 'Issues', count: 7, dotClass: 'bg-orange-500', active: false }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 p-3 sm:p-4 bg-white border-b border-primary-200 flex-shrink-0">
      {statuses.map((s, i) => (
        <button key={i} className={`text-left p-3 sm:p-4 rounded-xl border border-primary-100 transition ${s.active ? 'bg-[#f1f8f1] border-b-4 border-b-[#43a047]' : 'bg-white hover:bg-[#f1f8f1] border-l-4'} ${!s.active ? 'border-l-' + s.dotClass.split('-')[1] + '-500' : ''}`}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#607d66] mb-1">{s.label}</div>
          <div className="text-xl sm:text-2xl font-mono font-medium text-[#141c15]">{s.count}</div>
          <div className={`w-1.5 h-1.5 rounded-full ${s.dotClass} mt-2`}></div>
        </button>
      ))}
    </div>
  );
};

export default TrackingStatus;
