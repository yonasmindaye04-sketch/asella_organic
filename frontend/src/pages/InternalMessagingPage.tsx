/**
 * frontend/src/pages/InternalMessagingPage.tsx
 * Asella Organic — Internal Team Messaging & Mention System
 *
 * Modeled after Yekis Chat Workspace architecture:
 * - Two-pane responsive workspace layout with mobile drawer
 * - Real-time channel streams (#deliveries, #announcements, #general, #call_center, #operations, #tech_support)
 * - @Mention system with floating autocomplete menu, keyboard navigation (Up/Down/Enter),
 *   and highlighted mention badges for all teammates
 * - "Mentioned You" notification highlights when current user is tagged
 * - Filtering by Channel or "Mentions" tab
 * - Zero emojis (Google Material Symbols and clean corporate typography strictly per rule.md)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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

export interface StaffUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  telegram_username?: string | null;
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
  mentions?: string[];
  created_at: string;
  updated_at: string;
}

const ROLE_BADGES: Record<string, { label: string; style: string; icon: string }> = {
  tech_support:  { label: 'Tech Support',       style: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-black', icon: 'terminal' },
  admin:         { label: 'Super Admin',        style: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',     icon: 'shield_person' },
  manager:       { label: 'Manager',            style: 'bg-blue-100 text-blue-900 border-blue-300 font-bold',         icon: 'manage_accounts' },
  delivery:      { label: 'Delivery Driver',    style: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold', icon: 'local_shipping' },
  driver:        { label: 'Delivery Driver',    style: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold', icon: 'local_shipping' },
  call_center:   { label: 'Call Center Agent',  style: 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold',         icon: 'headset_mic' },
  store_manager: { label: 'Substore Manager',   style: 'bg-teal-100 text-teal-900 border-teal-300 font-bold',         icon: 'storefront' },
  employee:      { label: 'Staff Member',       style: 'bg-gray-100 text-gray-800 border-gray-300',                   icon: 'person' },
  staff:         { label: 'Staff Member',       style: 'bg-gray-100 text-gray-800 border-gray-300',                   icon: 'person' },
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
  const currentUsername = (user?.username || '').toLowerCase();
  const isAdminOrManagerOrTech =
    currentRole === 'admin' || currentRole === 'manager' || currentRole === 'tech_support';

  // Navigation & Channels
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>(() => {
    if (currentRole === 'delivery' || currentRole === 'driver') return 'deliveries';
    if (currentRole === 'call_center') return 'call_center';
    return 'deliveries';
  });
  const [activeFilter, setActiveFilter] = useState<'CHANNELS' | 'MENTIONS'>('CHANNELS');

  // Directory for @mentions
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  // Messages state
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'announcement'>('normal');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Mention Autocomplete State
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // 2. Fetch staff directory for @mentions
  const fetchStaffUsers = useCallback(async () => {
    try {
      const res = await api.get<StaffUser[]>('/api/messages/users');
      if (res.success && res.data) {
        setStaffUsers(res.data);
      }
    } catch {
      /* silent */
    }
  }, []);

  // 3. Fetch messages for active channel or mentions tab
  const fetchMessages = useCallback(async (isInitial = false) => {
    if (isInitial) setLoadingMessages(true);
    try {
      const searchParam = searchQuery.trim() ? `&search=${encodeURIComponent(searchQuery.trim())}` : '';
      const filterParam = activeFilter === 'MENTIONS' ? '&filter=mentions' : `&channel=${activeChannelId}`;
      const res = await api.get<InternalMessage[]>(
        `/api/messages?limit=100${filterParam}${searchParam}`
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
  }, [activeChannelId, activeFilter, searchQuery]);

  useEffect(() => {
    fetchChannels();
    fetchStaffUsers();
  }, [fetchChannels, fetchStaffUsers]);

  useEffect(() => {
    fetchMessages(true);
  }, [fetchMessages]);

  // Polling every 5 seconds for live conversation
  useEffect(() => {
    const t = setInterval(() => {
      fetchMessages(false);
      fetchChannels();
    }, 5000);
    return () => clearInterval(t);
  }, [fetchMessages, fetchChannels]);

  // Filter staff list based on mention query
  const filteredStaff = useMemo(() => {
    if (!mentionQuery) return staffUsers.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return staffUsers
      .filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.full_name.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [staffUsers, mentionQuery]);

  // Detect @ character in input and trigger mention autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(val);

    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_.-]*)$/);

    if (match) {
      setShowMentionMenu(true);
      setMentionQuery(match[1]);
      setMentionStartIndex(match.index !== undefined ? match.index : -1);
      setHighlightedIndex(0);
    } else {
      setShowMentionMenu(false);
      setMentionStartIndex(-1);
    }
  };

  // Insert chosen mention
  const insertMention = (selectedUser: StaffUser) => {
    if (mentionStartIndex < 0) return;
    const cursorPos = textareaRef.current?.selectionStart || content.length;
    const before = content.slice(0, mentionStartIndex);
    const after = content.slice(cursorPos);
    const newContent = `${before}@${selectedUser.username} ${after}`;

    setContent(newContent);
    setShowMentionMenu(false);

    // Focus back on textarea after mention inserted
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = mentionStartIndex + selectedUser.username.length + 2;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 50);
  };

  // Keyboard navigation inside composer and mention menu
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu && filteredStaff.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredStaff.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + filteredStaff.length) % filteredStaff.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredStaff[highlightedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Send message
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
        setShowMentionMenu(false);
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

  // Helper to format text with highlighted @mentions
  const renderFormattedContent = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const usernameWithoutAt = part.slice(1).toLowerCase();
        const isMentionedMe = usernameWithoutAt === currentUsername;
        return (
          <span
            key={index}
            className={`inline-flex items-center gap-0.5 font-bold px-1.5 py-0.2 rounded-md transition ${
              isMentionedMe
                ? 'bg-[#1b4d24] text-white font-black shadow-2xs'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId) || {
    id: activeChannelId,
    name: activeChannelId === 'deliveries' ? 'Delivery & Dispatch' : 'Internal Channel',
    description: 'Internal platform team communications.',
    icon: 'chat',
    badgeColor: 'bg-gray-100 text-gray-800',
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-65px)] flex flex-col overflow-hidden bg-[#f8fafc]">

        {/* Top Header Bar */}
        <header className="bg-white border-b border-gray-200/90 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-3 shadow-2xs">
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
              <span className="material-symbols-outlined text-xl">
                {activeFilter === 'MENTIONS' ? 'alternate_email' : activeChannel.icon}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-gray-900 tracking-tight truncate">
                  {activeFilter === 'MENTIONS' ? '@ Mentions for Me' : `#${activeChannel.name}`}
                </h1>
                {activeChannel.adminOnlyPost && activeFilter === 'CHANNELS' && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                    <span className="material-symbols-outlined text-xs">campaign</span>
                    Broadcast
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate hidden sm:block">
                {activeFilter === 'MENTIONS'
                  ? 'All messages across branches and channels where you were mentioned.'
                  : activeChannel.description}
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
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Desktop Left Sidebar: Channels & Mentions */}
          <aside className="w-72 bg-white border-r border-gray-200/90 hidden lg:flex flex-col shrink-0 overflow-y-auto">
            {/* Filter Selector Tabs */}
            <div className="p-3 border-b border-gray-100 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('CHANNELS');
                  setSearchQuery('');
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeFilter === 'CHANNELS'
                    ? 'bg-[#1b4d24] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">tag</span>
                Channels
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('MENTIONS');
                  setSearchQuery('');
                }}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  activeFilter === 'MENTIONS'
                    ? 'bg-[#1b4d24] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">alternate_email</span>
                Mentions
              </button>
            </div>

            {/* Channels List */}
            <div className="p-2 space-y-1 flex-1">
              {loadingChannels ? (
                <div className="p-4 text-center text-xs text-gray-400">Loading channels…</div>
              ) : (
                channels.map((ch) => {
                  const isActive = activeFilter === 'CHANNELS' && ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => {
                        setActiveFilter('CHANNELS');
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

            {/* Mention hint & staff profile row */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                <span className="material-symbols-outlined text-sm">alternate_email</span>
                <span>Type @ in chat to mention any user</span>
              </div>
              <p className="text-[10px] text-gray-400 truncate">
                Logged in as <b>@{currentUsername}</b> ({currentRole})
              </p>
            </div>
          </aside>

          {/* Mobile Drawer Menu */}
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
                    <h3 className="text-sm font-bold">Team Workspace</h3>
                  </div>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                {/* Mobile Filter Tabs */}
                <div className="p-2 border-b border-gray-100 grid grid-cols-2 gap-1">
                  <button
                    onClick={() => {
                      setActiveFilter('CHANNELS');
                      setMobileDrawerOpen(false);
                    }}
                    className={`py-2 text-xs font-bold rounded-lg ${
                      activeFilter === 'CHANNELS' ? 'bg-[#1b4d24] text-white' : 'text-gray-700 bg-gray-100'
                    }`}
                  >
                    Channels
                  </button>
                  <button
                    onClick={() => {
                      setActiveFilter('MENTIONS');
                      setMobileDrawerOpen(false);
                    }}
                    className={`py-2 text-xs font-bold rounded-lg ${
                      activeFilter === 'MENTIONS' ? 'bg-[#1b4d24] text-white' : 'text-gray-700 bg-gray-100'
                    }`}
                  >
                    Mentions
                  </button>
                </div>

                <div className="p-2 space-y-1 flex-1 overflow-y-auto">
                  {channels.map((ch) => {
                    const isActive = activeFilter === 'CHANNELS' && ch.id === activeChannelId;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setActiveFilter('CHANNELS');
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
          <main className="flex-1 flex flex-col overflow-hidden bg-[#f8fafc] min-w-0 relative">

            {/* Announcement Banner */}
            {activeChannelId === 'announcements' && activeFilter === 'CHANNELS' && (
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
                  <p>Loading conversation…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 px-4 max-w-md mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-3 text-gray-400 shadow-2xs">
                    <span className="material-symbols-outlined text-2xl">
                      {activeFilter === 'MENTIONS' ? 'alternate_email' : activeChannel.icon}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {activeFilter === 'MENTIONS'
                      ? 'No mentions yet'
                      : `Welcome to #${activeChannel.name}`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {activeFilter === 'MENTIONS'
                      ? 'When other team members tag @' + currentUsername + ' in any channel, the messages will appear here.'
                      : activeChannel.description}
                  </p>
                  {activeFilter === 'CHANNELS' && (
                    <p className="text-[11px] text-gray-400 mt-3 bg-gray-100/70 p-2.5 rounded-lg">
                      Tip: Type @ to mention colleagues (e.g. @admin, @substore, @driver) to notify them immediately.
                    </p>
                  )}
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMine = msg.sender_id === currentUserId;
                  const roleConfig = ROLE_BADGES[msg.sender_role] || ROLE_BADGES['employee'];
                  const isUrgent = msg.priority === 'urgent';
                  const isAnnouncement = Boolean(msg.is_announcement) || msg.priority === 'announcement';

                  // Check if current user is mentioned in this message
                  const mentionsList = msg.mentions || [];
                  const isMentionedMe =
                    mentionsList.some((m) => m.toLowerCase() === currentUsername) ||
                    msg.content.toLowerCase().includes(`@${currentUsername}`);

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
                        className={`group flex items-start gap-3 transition rounded-2xl p-3 sm:p-4 ${
                          isMentionedMe
                            ? 'bg-[#f4faf4] border-2 border-emerald-500 shadow-xs ring-2 ring-emerald-500/10'
                            : isUrgent
                            ? 'bg-rose-50/70 border border-rose-200 shadow-2xs'
                            : isAnnouncement
                            ? 'bg-amber-50/70 border border-amber-200 shadow-2xs'
                            : isMine
                            ? 'bg-white border border-gray-200/90 shadow-2xs'
                            : 'bg-white border border-gray-100 shadow-2xs'
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black shrink-0 ${
                            msg.sender_role === 'tech_support'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : msg.sender_role === 'admin'
                              ? 'bg-amber-600 text-white'
                              : msg.sender_role === 'delivery' || msg.sender_role === 'driver'
                              ? 'bg-[#1b4d24] text-white'
                              : msg.sender_role === 'call_center'
                              ? 'bg-cyan-600 text-white'
                              : msg.sender_role === 'store_manager'
                              ? 'bg-teal-600 text-white'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {(msg.sender_name || 'U').charAt(0).toUpperCase()}
                        </div>

                        {/* Message Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-xs font-black text-gray-900">
                              {msg.sender_name}
                            </span>

                            <span
                              className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleConfig.style}`}
                            >
                              {roleConfig.label}
                            </span>

                            {isMentionedMe && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                <span className="material-symbols-outlined text-[11px]">alternate_email</span>
                                Mentioned You
                              </span>
                            )}

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
                            {(isMine || isAdminOrManagerOrTech) && (
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
                            {renderFormattedContent(msg.content)}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── FLOATING @MENTION AUTOCOMPLETE MENU ── */}
            {showMentionMenu && (
              <div className="absolute bottom-[92px] left-4 right-4 sm:left-6 sm:right-6 max-w-lg bg-white rounded-2xl border border-gray-300 shadow-xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-emerald-700">alternate_email</span>
                    <span>Mention Teammate</span>
                  </div>
                  <span className="text-gray-400 font-normal">Use ↑↓ keys + Enter to select</span>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {filteredStaff.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-400">
                      No matching team members found for "@{mentionQuery}"
                    </div>
                  ) : (
                    filteredStaff.map((staff, idx) => {
                      const isHighlighted = idx === highlightedIndex;
                      const roleConfig = ROLE_BADGES[staff.role] || ROLE_BADGES['employee'];

                      return (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => insertMention(staff)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left transition ${
                            isHighlighted ? 'bg-emerald-50/80 text-emerald-900' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-xl bg-gray-200 flex items-center justify-center text-xs font-bold shrink-0">
                              {staff.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {staff.full_name}
                              </p>
                              <p className="text-[10px] font-mono text-gray-400 truncate">
                                @{staff.username}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${roleConfig.style}`}
                          >
                            {roleConfig.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Message Composer Footer */}
            <div className="p-3 sm:p-4 bg-white border-t border-gray-200/90 shrink-0">
              <form onSubmit={handleSendMessage} className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Priority Selector & Quick Mention Trigger */}
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

                    {/* Quick @ button for mobile / touch accessibility */}
                    <button
                      type="button"
                      onClick={() => {
                        setContent((prev) => prev + '@');
                        setShowMentionMenu(true);
                        setMentionQuery('');
                        setMentionStartIndex(content.length);
                        setHighlightedIndex(0);
                        textareaRef.current?.focus();
                      }}
                      className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#eaf4ec] text-[#1b4d24] hover:bg-[#d8eedb] transition border border-[#c1e2b0]"
                      title="Mention a colleague"
                    >
                      <span className="material-symbols-outlined text-xs">alternate_email</span>
                      Mention
                    </button>
                  </div>

                  <span className="text-[10px] text-gray-400 hidden sm:inline">
                    Press Enter to send · Shift+Enter for new line · Type @ to mention
                  </span>
                </div>

                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={content}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message #${activeChannel.name}... (type @ to mention colleagues)`}
                    className="flex-1 p-3 text-xs sm:text-sm border border-gray-300 rounded-xl bg-gray-50/60 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none leading-relaxed min-h-[44px]"
                  />

                  <button
                    type="submit"
                    disabled={!content.trim() || sending}
                    className="h-11 px-4 sm:px-5 rounded-xl bg-[#1b4d24] text-white hover:bg-[#143a1b] disabled:opacity-50 disabled:cursor-not-allowed transition font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 shrink-0"
                    aria-label="Send message"
                  >
                    <span className="material-symbols-outlined text-lg">send</span>
                    <span className="hidden sm:inline text-xs">Send</span>
                  </button>
                </div>
              </form>
            </div>

          </main>
        </div>

      </div>
    </DashboardLayout>
  );
}
