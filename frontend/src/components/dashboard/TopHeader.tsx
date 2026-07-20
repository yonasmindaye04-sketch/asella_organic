import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import { api } from '../../services/api';

interface TopHeaderProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export default function TopHeader({ isSidebarOpen = false, onToggleSidebar }: TopHeaderProps = {}) {
  const { user } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  const role = user?.role ?? 'guest';
  const displayName = user?.name ?? 'Staff Member';

  const [dateStr, setDateStr] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = new Date();
    setDateStr(now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
  }, []);

  // Fetch real notification count from the API
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await api.get<{ total: number }>('/api/notifications/summary');
        if (res.success && res.data) setNotifCount(res.data.total);
      } catch { /* silently ignore */ }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-5 py-3.5 flex items-center justify-between bg-[var(--bg)] border-b border-[var(--border)] transition-all">
      <div className="flex items-center gap-4 relative z-[2]">
        {/* Hamburger Menu for Mobile */}
        {onToggleSidebar && (
          <button 
            onClick={onToggleSidebar}
            className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-[var(--emerald-dim)] text-[var(--fg)] hover:text-[var(--emerald)] transition-all duration-300 md:hidden"
          >
            <div className="relative w-5 h-4 flex flex-col justify-between overflow-hidden">
              <span className={`w-full h-[2px] bg-current rounded-full transform transition-all duration-300 origin-left ${isSidebarOpen ? 'rotate-[42deg] w-[22px]' : ''}`}></span>
              <span className={`w-full h-[2px] bg-current rounded-full transition-all duration-300 ${isSidebarOpen ? 'opacity-0 translate-x-4' : ''}`}></span>
              <span className={`w-full h-[2px] bg-current rounded-full transform transition-all duration-300 origin-left ${isSidebarOpen ? '-rotate-[42deg] w-[22px]' : ''}`}></span>
            </div>
          </button>
        )}

        {/* Moving items (Storefront & Date) */}
        <div className={`flex items-center gap-4 transition-all duration-300 ease-in-out ml-0`}>
          {/* Back to Storefront Button */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--fg)]"
          >
            <span className="material-symbols-outlined text-[11px]">store</span>
            <span className="text-[11px] font-medium hidden sm:inline">Storefront</span>
          </button>

          <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
            <span className="material-symbols-outlined text-[var(--muted)] text-[10px]">event</span>
            <span className="text-[11px] font-medium text-[var(--fg-secondary)]">{dateStr}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 relative z-[2]">
        
        {/* Notifications — links to the notifications page */}
        <button
          onClick={() => navigate('/dashboard/notifications')}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-light)] transition-all"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-[11px]">notifications</span>
          {notifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-[var(--rose)] text-white text-[9px] font-bold rounded-full">
              {notifCount > 99 ? '99+' : notifCount}
            </span>
          )}
        </button>

        {/* Profile */}
        <div className="relative ml-1" ref={profileRef}>
          <button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-[var(--bg-card)] transition-colors group">
            <div className="w-7 h-7 rounded-md bg-[#355E3B] flex items-center justify-center text-white font-bold text-xs shadow-sm group-hover:shadow-md transition-all">
                {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-[11px] font-bold leading-tight text-[var(--fg)]">{displayName}</p>
              <p className="text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold capitalize">{role}</p>
            </div>
            <span className={`material-symbols-outlined text-[8px] text-[var(--muted)] transition-transform ml-1 ${profileOpen ? "rotate-180" : ""}`}>expand_more</span>
          </button>
          
          {profileOpen && (
            <div className="absolute top-full right-0 mt-1 w-[180px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl py-1.5 animate-[fadeInUp_0.2s_ease-out]">
              <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                <p className="text-[11px] font-bold text-[var(--fg)]">{displayName}</p>
                <p className="text-[9.5px] text-[var(--muted)] truncate capitalize">{role}</p>
              </div>
              <button onClick={() => { setProfileOpen(false); navigate('/dashboard/change-password'); }} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-[var(--fg-secondary)] hover:text-[var(--fg)] hover:bg-[var(--bg-card-hover)] transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined w-4 text-center text-[10px]">settings</span> Settings
              </button>
              <div className="h-px bg-[var(--border)] my-1" />
              <button onClick={() => { setProfileOpen(false); navigate('/login'); }} className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-[var(--rose)] hover:bg-[var(--rose-dim)] transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined w-4 text-center text-[10px]">logout</span> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
