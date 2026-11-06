/**
 * frontend/src/pages/InternalMessagingPage.tsx
 * Asella Organic — Internal Team Messaging & Delivery Dispatch Channel
 *
 * Provides a dedicated, real-time internal communication hub for:
 * - Admins & Managers: Broadcast announcements, dispatch alerts to drivers
 * - Delivery Drivers: Review priority route updates, address notes, drop-off queries
 * - Call Center & Store Managers: Coordinate inventory, customer order edits, and shift notes
 * - Tech Support: Unlimited permissions to support staff, resolve issues, and guide team
 *
 * Adheres strictly to rule.md:
 * - Zero emojis (Google Material Symbols only)
 * - Fluid mobile responsiveness (320px to 2xl, touch targets >= 44px)
 * - Highland-gold, obsidian, parchment, forest-green branding
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';

export interface ChannelItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  badgeColor: string;
  adminOnlyPost?: boolean;
  messageCount?: number;
  lastActivity?: string | null;
}

export interface InternalMessage {
  id: string;
  channel: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  priority: 'normal' | 'urgent' | 'announcement';
  is_announcement: boolean | number;
  created_at: string;
  updated_at: string;
}

const ROLE_BADGES: Record<string, { label: string; style: string }> = {
  tech_support:  { label: 'Tech Support',       style: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-extrabold' },
  admin:         { label: 'Super Admin',        style: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' },
  manager:       { label: 'Manager',            style: 'bg-blue-100 text-blue-900 border-blue-300 font-bold' },
  delivery:      { label: 'Delivery Driver',    style: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold' },
  driver:        { label: 'Delivery Driver',    style: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold' },
  call_center:   { label: 'Call Center Agent',  style: 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold' },
  store_manager: { label: 'Substore Manager',   style: 'bg-teal-100 text-teal-900 border-teal-300 font-bold' },
  employee:      { label: 'Staff Member',       style: 'bg-gray-100 text-gray-800 border-gray-300' },
  staff:         { label: 'Staff Member',       style: 'bg-gray-100 text-gray-800 border-gray-300' },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function InternalMessagingPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const currentRole = (user?.role || '').toLowerCase();
  const currentUserId = user?.id || '';
  const isAdminOrManagerOrTech =
    currentRole === 'admin' || currentRole === 'manager' || currentRole === 'tech_support';

  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>(() => {
    // Default drivers to deliveries, call center to call_center, others to general or deliveries
    if (currentRole === 'delivery' || currentRole === 'driver') return 'deliveries';
    if (currentRole === 'call_center') return 'call_center';
    return 'deliveries';
  });
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'announcement'>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch channel list & stats
  const fetchChannels = useCallback(async () => {
    try {
      const res = await api.get<ChannelItem[]>('/api/messages/channels');
      if (res.success && res.data) {
        setChannels(res.data);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  // 2. Fetch messages in active channel
  const fetchMessages = useCallback(async (isInitial = false) => {
    if (isInitial) setLoadingMessages(true);
    try {
      const searchParam = searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await api.get<InternalMessage[]>(
        `/api/messages?channel=${activeChannelId}&limit=100${searchParam}`
      );
      if (res.success && res.data) {
        setMessages(res.data);
        if (isInitial) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    } catch {
      /* silent */
    } finally {
      if (isInitial) setLoadingMessages(false);
    }
  }, [activeChannelId, searchQuery]);

  // Initial load
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    fetchMessages(true);
  }, [fetchMessages]);

  // Polling every 5 seconds for live conversation feel
  useEffect(() => {
    const t = setInterval(() => {
      fetchMessages(false);
      fetchChannels();
    }, 5000);
    return () => clearInterval(t);
  }, [fetchMessages, fetchChannels]);

  // Send a message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const res = await api.post<InternalMessage>('/api/messages', {
        channel: activeChannelId,
        content: trimmed,
        priority,
        is_announcement: priority === 'announcement' || activeChannelId === 'announcements',
      });

      if (res.success && res.data) {
        const newMsg: InternalMessage = res.data;
        setContent('');
        setPriority('normal');
        setMessages((prev) => [...prev, newMsg]);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        fetchChannels();
      }
    } catch {
      /* silent */
    } finally {
      setSending(false);
    }
  };

  // Delete message
  const handleDeleteMessage = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      const res = await api.delete(`/api/messages/${id}`);
      if (res.success) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        fetchChannels();
      }
    } catch {
      /* silent */
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId) || {
    id: activeChannelId,
    name: activeChannelId === 'deliveries' ? 'Delivery & Dispatch' : 'Internal Channel',
    description: 'Internal platform team communications.',
    icon: 'chat',
    badgeColor: 'bg-gray-100 text-gray-800',
  };

  const canPostInCurrentChannel =
    !activeChannel.adminOnlyPost || isAdminOrManagerOrTech;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-65px)] flex flex-col overflow-hidden bg-[#f8fafc]">

        {/* Top Operational Bar */}
        <div className="bg-white border-b border-gray-200/90 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Channel Menu Trigger */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 shrink-0"
              title="Open channels"
              aria-label="Open channels"
            >
              <span className="material-symbols-outlined text-xl">menu_open</span>
            </button>

            <div className="w-10 h-10 rounded-xl bg-[#eaf4ec] text-[#1b4d24] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">{activeChannel.icon}</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight truncate">
                  #{activeChannel.name}
                </h1>
                {activeChannel.adminOnlyPost && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                    <span className="material-symbols-outlined text-xs">campaign</span>
                    Broadcast
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate hidden sm:block">
                {activeChannel.description}
              </p>
            </div>
          </div>

          {/* Search messages in active channel */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-36 sm:w-56">
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-gray-400 text-sm">
                search
              </span>
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-gray-50/70 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <button
              onClick={() => fetchMessages(true)}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 transition"
              title="Refresh messages"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>
          </div>
        </div>

        {/* Main Content: Split Pane on Desktop, Drawer on Mobile */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Desktop Left Rail: Channel List */}
          <aside className="w-72 bg-white border-r border-gray-200/90 hidden lg:flex flex-col shrink-0 overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                Team Channels
              </span>
              <span className="text-[11px] font-mono font-bold text-gray-500">
                {channels.length} Active
              </span>
            </div>

            <div className="p-2 space-y-1 flex-1">
              {loadingChannels ? (
                <div className="p-4 text-center text-xs text-gray-400">Loading channels…</div>
              ) : (
                channels.map((ch) => {
                  const isActive = ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => {
                        setActiveChannelId(ch.id);
                        setSearchQuery('');
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition ${
                        isActive
                          ? 'bg-[#1b4d24] text-white shadow-2xs'
                          : 'text-gray-700 hover:bg-gray-100/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`material-symbols-outlined text-lg ${
                            isActive ? 'text-[#a0f399]' : 'text-gray-400'
                          }`}
                        >
                          {ch.icon}
                        </span>
                        <div className="truncate">
                          <p className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-gray-800'}`}>
                            {ch.name}
                          </p>
                          <p
                            className={`text-[10px] truncate ${
                              isActive ? 'text-white/80' : 'text-gray-400'
                            }`}
                          >
                            {ch.description}
                          </p>
                        </div>
                      </div>

                      {ch.messageCount !== undefined && ch.messageCount > 0 && (
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {ch.messageCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick role note at bottom */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-emerald-700">shield</span>
              <span>Logged in as <b>{user?.name || user?.username}</b> ({currentRole})</span>
            </div>
          </aside>

          {/* Mobile Drawer Backdrop & Menu */}
          {mobileDrawerOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
                onClick={() => setMobileDrawerOpen(false)}
              />
              <div className="relative w-72 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-[#001803] text-white">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#a0f399]">forum</span>
                    <h3 className="text-sm font-bold">Team Channels</h3>
                  </div>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                <div className="p-2 space-y-1 flex-1 overflow-y-auto">
                  {channels.map((ch) => {
                    const isActive = ch.id === activeChannelId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setActiveChannelId(ch.id);
                          setSearchQuery('');
                          setMobileDrawerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition ${
                          isActive
                            ? 'bg-[#1b4d24] text-white'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`material-symbols-outlined text-lg ${
                              isActive ? 'text-[#a0f399]' : 'text-gray-400'
                            }`}
                          >
                            {ch.icon}
                          </span>
                          <div className="truncate">
                            <p className="text-xs font-bold truncate">{ch.name}</p>
                            <p className={`text-[10px] truncate ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                              {ch.description}
                            </p>
                          </div>
                        </div>

                        {ch.messageCount !== undefined && ch.messageCount > 0 && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {ch.messageCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Central Chat Stream */}
          <main className="flex-1 flex flex-col overflow-hidden bg-[#f8fafc] min-w-0">

            {/* Announcement Banner (if viewing announcements or top alert) */}
            {activeChannelId === 'announcements' && (
              <div className="bg-amber-50 border-b border-amber-200/90 px-4 py-2 text-xs text-amber-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-amber-700 shrink-0">campaign</span>
                <span>
                  Official Announcements Channel: Broadcast updates sent here are published to all branch staff and drivers.
                </span>
              </div>
            )}

            {/* Messages Feed */}
            <div
              ref={chatScrollContainerRef}
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
            >
              {loadingMessages ? (
                <div className="text-center py-20 text-gray-400 text-sm">
                  <span className="material-symbols-outlined animate-spin text-3xl text-emerald-600 mb-2">sync</span>
                  <p>Loading channel messages…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 px-4 max-w-md mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-3 text-gray-400 shadow-2xs">
                    <span className="material-symbols-outlined text-2xl">{activeChannel.icon}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Welcome to #{activeChannel.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {activeChannel.description}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-3 bg-gray-100/70 p-2 rounded-lg">
                    Start the conversation below to coordinate with teammates across the organization.
                  </p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMe = msg.sender_id === currentUserId;
                  const roleConfig = ROLE_BADGES[msg.sender_role] || ROLE_BADGES['employee'];
                  const isUrgent = msg.priority === 'urgent';
                  const isAnnouncement = Boolean(msg.is_announcement) || msg.priority === 'announcement';

                  const showDateDivider =
                    index === 0 ||
                    formatDate(msg.created_at) !== formatDate(messages[index - 1].created_at);

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateDivider && (
                        <div className="flex items-center justify-center my-3">
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold text-gray-500 bg-white border border-gray-200 shadow-2xs">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div
                        className={`group flex items-start gap-3 transition ${
                          isUrgent
                            ? 'p-3 bg-rose-50/60 rounded-2xl border border-rose-200 shadow-2xs'
                            : isAnnouncement
                            ? 'p-3 bg-amber-50/70 rounded-2xl border border-amber-200 shadow-2xs'
                            : ''
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                            msg.sender_role === 'tech_support'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : msg.sender_role === 'admin'
                              ? 'bg-amber-600 text-white'
                              : msg.sender_role === 'delivery' || msg.sender_role === 'driver'
                              ? 'bg-[#1b4d24] text-white'
                              : msg.sender_role === 'call_center'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {(msg.sender_name || 'U').charAt(0).toUpperCase()}
                        </div>

                        {/* Message Bubble & Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-xs font-black text-gray-900">
                              {msg.sender_name}
                            </span>

                            <span
                              className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleConfig.style}`}
                            >
                              {roleConfig.label}
                            </span>

                            {isUrgent && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                <span className="material-symbols-outlined text-[11px]">priority_high</span>
                                Urgent
                              </span>
                            )}

                            {isAnnouncement && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                <span className="material-symbols-outlined text-[11px]">campaign</span>
                                Broadcast
                              </span>
                            )}

                            <span className="text-[10px] text-gray-400 font-mono ml-auto">
                              {formatTime(msg.created_at)}
                            </span>

                            {/* Delete Action (only author or admin/tech_support) */}
                            {(isMe || isAdminOrManagerOrTech) && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-600 transition p-0.5"
                                title="Delete message"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            )}
                          </div>

                          <div className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words font-medium">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Composer Footer */}
            <div className="p-3 sm:p-4 bg-white border-t border-gray-200/90 shrink-0">
              {canPostInCurrentChannel ? (
                <form onSubmit={handleSendMessage} className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    {/* Priority Selector */}
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">
                        Priority:
                      </span>
                      <button
                        type="button"
                        onClick={() => setPriority('normal')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          priority === 'normal'
                            ? 'bg-gray-200 text-gray-900'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        onClick={() => setPriority('urgent')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          priority === 'urgent'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">priority_high</span>
                        Urgent Alert
                      </button>
                      {isAdminOrManagerOrTech && (
                        <button
                          type="button"
                          onClick={() => setPriority('announcement')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                            priority === 'announcement'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'text-amber-700 hover:bg-amber-50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs">campaign</span>
                          Broadcast
                        </button>
                      )}
                    </div>

                    <span className="text-[10px] text-gray-400 hidden sm:inline">
                      Press Enter to send · Shift+Enter for new line
                    </span>
                  </div>

                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message #${activeChannel.name}...`}
                      className="flex-1 p-3 text-xs sm:text-sm border border-gray-300 rounded-xl bg-gray-50/60 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none leading-relaxed"
                    />

                    <button
                      type="submit"
                      disabled={!content.trim() || sending}
                      className="h-11 px-4 sm:px-5 rounded-xl bg-[#1b4d24] text-white hover:bg-[#143a1b] disabled:opacity-50 disabled:cursor-not-allowed transition font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 shrink-0"
                    >
                      <span className="material-symbols-outlined text-lg">send</span>
                      <span className="hidden sm:inline text-xs">Send</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
                  <span className="material-symbols-outlined text-sm align-middle mr-1 text-amber-600">lock</span>
                  This channel is restricted to announcements by Admins, Managers, and Tech Support.
                </div>
              )}
            </div>

          </main>
        </div>

      </div>
    </DashboardLayout>
  );
}
