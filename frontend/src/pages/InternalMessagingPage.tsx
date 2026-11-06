/**
 * frontend/src/pages/InternalMessagingPage.tsx
 * Asella Organic — Internal Team Messaging & Mention System
 *
 * Designed strictly per rule.md & user requirements:
 * - Two-sided chat system (just like proper messaging apps):
 *   • My messages (outgoing): Right-aligned chat bubbles with distinct soft-tint surface
 *   • Others' messages (incoming): Left-aligned chat bubbles on white/zinc surface
 * - Removed all vertical left indicator bars (border-l-4) from message cards
 * - Perfectly aligned Send button with matching vertical stretch & baseline
 * - Bold colors in CAPITAL LETTERS for status & roles (URGENT, BROADCAST, MENTIONED) — zero low-opacity backgrounds
 * - Outfit font-heading for headers/buttons/roles, DM Sans for message text & descriptions
 * - Floating keyboard-driven @mention autocomplete
 * - Full Dark Mode & Light Mode support
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { api } from '../services/api';
import DashboardLayout from '../layouts/DashboardLayout';
import { playChatSound, isChatSoundEnabled, setChatSoundEnabled } from '../utils/chatSound';

export interface ChannelItem {
  id: string;
  name: string;
  description: string;
  icon: string;
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

export interface ChannelMember {
  id: string;
  username: string;
  full_name: string;
  role: string;
  telegram_username?: string | null;
  joined_at: string;
  added_by?: string | null;
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

/**
 * Role indicator styles per rule.md:
 * Bold colored text in CAPITAL LETTERS only. No background pills, no borders.
 */
const ROLE_LABELS: Record<string, { label: string; textClass: string; icon: string }> = {
  tech_support:  { label: 'TECH SUPPORT',       textClass: 'text-indigo-600 dark:text-indigo-400 font-black font-heading',  icon: 'terminal' },
  admin:         { label: 'SUPER ADMIN',        textClass: 'text-amber-600 dark:text-amber-400 font-black font-heading',    icon: 'shield_person' },
  manager:       { label: 'MANAGER',            textClass: 'text-blue-600 dark:text-blue-400 font-black font-heading',      icon: 'manage_accounts' },
  delivery:      { label: 'DELIVERY DRIVER',    textClass: 'text-emerald-700 dark:text-emerald-400 font-black font-heading', icon: 'local_shipping' },
  driver:        { label: 'DELIVERY DRIVER',    textClass: 'text-emerald-700 dark:text-emerald-400 font-black font-heading', icon: 'local_shipping' },
  call_center:   { label: 'CALL CENTER',        textClass: 'text-cyan-700 dark:text-cyan-400 font-black font-heading',      icon: 'headset_mic' },
  store_manager: { label: 'SUBSTORE MANAGER',   textClass: 'text-teal-700 dark:text-teal-400 font-black font-heading',      icon: 'storefront' },
  employee:      { label: 'STAFF',              textClass: 'text-zinc-600 dark:text-zinc-400 font-black font-heading',      icon: 'person' },
  staff:         { label: 'STAFF',              textClass: 'text-zinc-600 dark:text-zinc-400 font-black font-heading',      icon: 'person' },
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
    if (d.toDateString() === today.toDateString()) return 'TODAY';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch {
    return '';
  }
}

const DEFAULT_CHANNELS: ChannelItem[] = [
  {
    id: 'operations',
    name: 'Store & Inventory',
    description: 'Substore fulfillment, restock coordination, and counter inventory queries.',
    icon: 'inventory_2',
  },
  {
    id: 'deliveries',
    name: 'Delivery & Dispatch',
    description: 'Dispatch coordination, priority route notes, customer address updates, and driver reports.',
    icon: 'local_shipping',
  },
  {
    id: 'announcements',
    name: 'Company Announcements',
    description: 'Official workplace broadcasts and management alerts across all branches.',
    icon: 'campaign',
  },
  {
    id: 'general',
    name: 'All-Staff Team',
    description: 'Company-wide general communication, daily shift notes, and employee collaboration.',
    icon: 'forum',
  },
  {
    id: 'call_center',
    name: 'Call Center Desk',
    description: 'Order modifications, customer inquiries, and phone order handovers.',
    icon: 'headset_mic',
  },
  {
    id: 'tech_support',
    name: 'Tech Support Desk',
    description: 'Technical assistance, bug reports, and system permissions help.',
    icon: 'terminal',
  },
];

export default function InternalMessagingPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const currentRole = (user?.role || '').toLowerCase();
  const currentUserId = user?.id || '';
  const displayUsername = user?.username || user?.name || user?.full_name || 'staff';
  const currentUsername = displayUsername.toLowerCase().replace(/\s+/g, '_');
  const isAdminOrManagerOrTech =
    currentRole === 'admin' || currentRole === 'manager' || currentRole === 'tech_support';

  // Navigation & Channels
  const [channels, setChannels] = useState<ChannelItem[]>(DEFAULT_CHANNELS);
  const [activeChannelId, setActiveChannelId] = useState<string>(() => {
    if (currentRole === 'delivery' || currentRole === 'driver') return 'deliveries';
    if (currentRole === 'call_center') return 'call_center';
    if (currentRole === 'store_manager') return 'operations';
    return 'operations';
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Per-channel unread counts
  const [channelUnreads, setChannelUnreads] = useState<Record<string, number>>({});

  const markActiveChannelRead = useCallback((chId: string) => {
    try {
      const reads = JSON.parse(localStorage.getItem('asella_channel_reads') || '{}');
      reads[chId] = new Date().toISOString();
      localStorage.setItem('asella_channel_reads', JSON.stringify(reads));
      localStorage.setItem('asella_messages_last_read', new Date().toISOString());
      window.dispatchEvent(new CustomEvent('asella:channel-read', { detail: { channel: chId } }));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchUnreadStats = useCallback(async () => {
    try {
      const channelReadsRaw = localStorage.getItem('asella_channel_reads') || '{}';
      const res = await api.get<{
        unread: number;
        channel_unreads?: Record<string, number>;
      }>(`/api/messages/unread?channel_reads=${encodeURIComponent(channelReadsRaw)}`);
      if (res.success && res.data?.channel_unreads) {
        setChannelUnreads(res.data.channel_unreads);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Channel Members & Permissions
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedStaffToAdd, setSelectedStaffToAdd] = useState('');
  // Add by Role vs Individual state
  const [addMemberMode, setAddMemberMode] = useState<'ROLE' | 'INDIVIDUAL'>('ROLE');
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('all');

  // Create Channel Modal state
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanDescription, setNewChanDescription] = useState('');
  const [newChanIcon, setNewChanIcon] = useState('forum');
  const [newChanAdminOnly, setNewChanAdminOnly] = useState(false);
  const [newChanInitialRole, setNewChanInitialRole] = useState('all');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);

  const [savingMember, setSavingMember] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionSuccess, setMemberActionSuccess] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isChatSoundEnabled());

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setChatSoundEnabled(next);
  };

  const fetchChannelMembers = useCallback(async (chId: string) => {
    if (!chId) return;
    setLoadingMembers(true);
    setMemberActionError(null);
    try {
      const res = await api.get<ChannelMember[]>(`/api/messages/channels/${chId}/members`);
      if (res.success && Array.isArray(res.data)) {
        setChannelMembers(res.data);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  const handleAddMember = async () => {
    setSavingMember(true);
    setMemberActionError(null);
    setMemberActionSuccess(null);
    try {
      const payload =
        addMemberMode === 'ROLE'
          ? { role: selectedRoleToAdd }
          : { user_id: selectedStaffToAdd };

      if (addMemberMode === 'INDIVIDUAL' && !selectedStaffToAdd) {
        setMemberActionError('Please select an employee to add.');
        setSavingMember(false);
        return;
      }

      const res = await api.post<{ count?: number; message?: string }>(
        `/api/messages/channels/${activeChannelId}/members`,
        payload
      );
      if (res.success) {
        setMemberActionSuccess(res.data?.message || 'Members added successfully.');
        setSelectedStaffToAdd('');
        fetchChannelMembers(activeChannelId);
        fetchChannels();
      } else {
        setMemberActionError(res.error || 'Failed to add member(s) to channel.');
      }
    } catch (err: any) {
      setMemberActionError(err?.message || 'Failed to add member(s).');
    } finally {
      setSavingMember(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChanName.trim()) {
      setCreateChannelError('Channel name is required.');
      return;
    }
    setCreatingChannel(true);
    setCreateChannelError(null);
    try {
      const res = await api.post<ChannelItem>('/api/messages/channels', {
        name: newChanName.trim(),
        description: newChanDescription.trim(),
        icon: newChanIcon,
        admin_only_post: newChanAdminOnly,
        initial_role: newChanInitialRole || undefined,
      });
      if (res.success && res.data) {
        await fetchChannels();
        setActiveChannelId(res.data.id);
        setShowCreateChannelModal(false);
        setNewChanName('');
        setNewChanDescription('');
        setNewChanIcon('forum');
        setNewChanAdminOnly(false);
        setNewChanInitialRole('all');
      } else {
        setCreateChannelError(res.error || 'Failed to create channel.');
      }
    } catch (err: any) {
      setCreateChannelError(err?.message || 'Failed to create channel.');
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!window.confirm(`Are you sure you want to delete #${activeChannel.name}? All messages and member records in this channel will be permanently removed.`)) {
      return;
    }
    setDeletingChannel(true);
    try {
      const res = await api.delete(`/api/messages/channels/${activeChannelId}`);
      if (res.success) {
        setShowMembersModal(false);
        await fetchChannels();
        setActiveChannelId('general');
      } else {
        alert(res.error || 'Failed to delete channel.');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to delete channel.');
    } finally {
      setDeletingChannel(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setMemberActionError(null);
    setMemberActionSuccess(null);
    try {
      const res = await api.delete(`/api/messages/channels/${activeChannelId}/members/${userId}`);
      if (res.success) {
        setMemberActionSuccess('Employee removed from channel.');
        fetchChannelMembers(activeChannelId);
        fetchChannels();
      } else {
        setMemberActionError(res.error || 'Failed to remove employee.');
      }
    } catch (err: any) {
      setMemberActionError(err?.message || 'Failed to remove employee.');
    }
  };

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
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
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
      if (res.success && Array.isArray(res.data)) {
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
      if (res.success && Array.isArray(res.data)) {
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

  // Play sound when incoming message arrives from another staff member
  useEffect(() => {
    const handleIncoming = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg) {
        fetchMessages(false);
        fetchChannels();
        fetchUnreadStats();
        playChatSound();
      }
    };
    window.addEventListener('asella:new-message-received', handleIncoming);
    return () => window.removeEventListener('asella:new-message-received', handleIncoming);
  }, [fetchMessages, fetchChannels, fetchUnreadStats]);

  // Play sound when incoming message arrives from another staff member
  useEffect(() => {
    const handleIncoming = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg) {
        fetchMessages(false);
        fetchChannels();
        fetchUnreadStats();
        playChatSound();
      }
    };
    window.addEventListener('asella:new-message-received', handleIncoming);
    return () => window.removeEventListener('asella:new-message-received', handleIncoming);
  }, [fetchMessages, fetchChannels, fetchUnreadStats]);

  // Polling every 5 seconds for live conversation
  useEffect(() => {
    const t = setInterval(() => {
      fetchMessages(false);
      fetchChannels();
    }, 5000);
    return () => clearInterval(t);
  }, [fetchMessages, fetchChannels]);

  // Mark active channel as read and fetch unread stats
  useEffect(() => {
    if (activeChannelId) {
      markActiveChannelRead(activeChannelId);
      setChannelUnreads((prev) => ({ ...prev, [activeChannelId]: 0 }));
      fetchUnreadStats();
    }
  }, [activeChannelId, markActiveChannelRead, fetchUnreadStats]);

  useEffect(() => {
    if (activeChannelId && messages.length > 0) {
      markActiveChannelRead(activeChannelId);
      fetchUnreadStats();
    }
  }, [activeChannelId, messages, markActiveChannelRead, fetchUnreadStats]);

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

  // Quick reply by pre-filling mention in composer
  const handleReplyMention = (username: string) => {
    setContent((prev) => {
      const tag = `@${username} `;
      if (prev.includes(tag)) return prev;
      return `${tag}${prev}`;
    });
    textareaRef.current?.focus();
  };

  // Copy message content
  const handleCopyMessage = (msg: InternalMessage) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Helper to format text with clean highlighted @mentions
  const renderFormattedContent = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const usernameWithoutAt = part.slice(1).toLowerCase();
        const isMentionedMe = usernameWithoutAt === currentUsername;
        return (
          <span
            key={index}
            className={`font-black font-sans cursor-pointer hover:underline ${
              isMentionedMe
                ? 'text-[#1b4d24] dark:text-emerald-400 font-black'
                : 'text-zinc-900 dark:text-zinc-100 font-bold'
            }`}
            onClick={() => handleReplyMention(usernameWithoutAt)}
            title={`Reply to @${usernameWithoutAt}`}
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  // Helper to check if a message was authored by the current session user
  const isMessageFromMe = useCallback(
    (msg: InternalMessage): boolean => {
      if (currentUserId && msg.sender_id === currentUserId) return true;
      const sName = (msg.sender_name || '').toLowerCase().trim();
      if (currentUsername && sName === currentUsername) return true;
      if (displayUsername && sName === displayUsername.toLowerCase().trim()) return true;
      if (user?.name && sName === user.name.toLowerCase().trim()) return true;
      if (user?.username && sName === user.username.toLowerCase().trim()) return true;
      return false;
    },
    [currentUserId, currentUsername, displayUsername, user]
  );

  const activeChannel =
    channels.find((c) => c.id === activeChannelId) ||
    DEFAULT_CHANNELS.find((c) => c.id === activeChannelId) || {
      id: activeChannelId,
      name:
        activeChannelId === 'operations'
          ? 'Store & Inventory'
          : activeChannelId === 'deliveries'
          ? 'Delivery & Dispatch'
          : 'Internal Channel',
      description: 'Internal platform team communications.',
      icon: 'forum',
    };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-65px)] flex flex-col overflow-hidden bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans">

        {/* Top Header Bar */}
        <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Channel Drawer Trigger */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 cursor-pointer"
              title="Open channels"
              aria-label="Open channels"
            >
              <span className="material-symbols-outlined text-xl">menu_open</span>
            </button>

            {/* Bare Colored Icon per Rule 2 (No tinted tile) */}
            <span className="material-symbols-outlined text-2xl text-[#1b4d24] dark:text-emerald-400 shrink-0">
              {activeFilter === 'MENTIONS' ? 'alternate_email' : activeChannel.icon}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold font-heading text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                  {activeFilter === 'MENTIONS' ? '@ Mentions for Me' : `#${activeChannel.name}`}
                </h1>

                {activeChannel.adminOnlyPost && activeFilter === 'CHANNELS' && (
                  <span className="text-xs font-black font-heading tracking-wider text-amber-600 dark:text-amber-400 shrink-0 inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">campaign</span>
                    BROADCAST ONLY
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-sans text-zinc-500 dark:text-zinc-400 truncate hidden sm:block">
                {activeFilter === 'MENTIONS'
                  ? 'All messages across branches and channels where you were tagged.'
                  : activeChannel.description}
              </p>
            </div>
          </div>

          {/* Channel Actions: Members, Sound Toggle, Search */}
          <div className="flex items-center gap-2 shrink-0">
            {activeFilter === 'CHANNELS' && (
              <button
                type="button"
                onClick={() => {
                  fetchChannelMembers(activeChannelId);
                  setShowMembersModal(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition cursor-pointer"
                title="Manage channel members and access"
              >
                <span className="material-symbols-outlined text-base">group</span>
                <span className="font-sans hidden sm:inline">{channelMembers.length} Members</span>
              </button>
            )}

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={toggleSound}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition cursor-pointer"
              title={soundEnabled ? 'Notification sound is ON (click to mute)' : 'Notification sound is MUTED (click to enable)'}
            >
              <span className="material-symbols-outlined text-base">
                {soundEnabled ? 'volume_up' : 'volume_off'}
              </span>
              <span className="hidden xl:inline font-sans">{soundEnabled ? 'Sound ON' : 'Muted'}</span>
            </button>

            {/* Test Sound Chime */}
            <button
              type="button"
              onClick={() => playChatSound(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
              title="Play test audio chime"
            >
              <span className="material-symbols-outlined text-sm">music_note</span>
              <span className="hidden xl:inline font-sans">Test Chime</span>
            </button>
            <div className="relative w-40 sm:w-64">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-zinc-400 text-base">
                search
              </span>
              <input
                type="text"
                placeholder="Search conversation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs sm:text-sm font-sans border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 outline-none focus:ring-1 focus:ring-[#1b4d24] dark:focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              )}
            </div>

            <button
              onClick={() => fetchMessages(true)}
              className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Refresh messages"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Desktop Left Sidebar: Channels & Mentions */}
          <aside className="w-72 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 hidden lg:flex flex-col shrink-0 overflow-y-auto">
            {/* Filter Selector Tabs */}
            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('CHANNELS');
                  setSearchQuery('');
                }}
                className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold font-heading transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeFilter === 'CHANNELS'
                    ? 'bg-[#1b4d24] text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <span className="material-symbols-outlined text-base">tag</span>
                Channels
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('MENTIONS');
                  setSearchQuery('');
                }}
                className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold font-heading transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeFilter === 'MENTIONS'
                    ? 'bg-[#1b4d24] text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <span className="material-symbols-outlined text-base">alternate_email</span>
                Mentions
              </button>
            </div>

            {/* Channels List */}
            <div className="p-2 space-y-1 flex-1">
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <span className="text-xs font-bold font-heading uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Team Workspaces
                </span>
                {isAdminOrManagerOrTech && (
                  <button
                    type="button"
                    onClick={() => setShowCreateChannelModal(true)}
                    className="text-xs font-bold font-heading text-[#1b4d24] dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer"
                    title="Create a new communication channel"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    New
                  </button>
                )}
              </div>
              {loadingChannels ? (
                <div className="p-4 text-center text-xs font-sans text-zinc-400">Loading channels…</div>
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition cursor-pointer ${
                        isActive
                          ? 'bg-[#1b4d24] text-white shadow-xs'
                          : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`material-symbols-outlined text-xl shrink-0 ${
                            isActive ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'
                          }`}
                        >
                          {ch.icon}
                        </span>
                        <div className="truncate">
                          <p className={`text-sm font-bold font-heading truncate ${isActive ? 'text-white' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {ch.name}
                          </p>
                          <p
                            className={`text-xs font-sans truncate ${
                              isActive ? 'text-emerald-100/90' : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {ch.description}
                          </p>
                        </div>
                      </div>

                      {channelUnreads[ch.id] && channelUnreads[ch.id] > 0 ? (
                        <span
                          className={`ml-2 text-xs font-mono font-black shrink-0 ${
                            isActive ? 'text-white' : 'text-red-600 dark:text-red-400'
                          }`}
                          title={`${channelUnreads[ch.id]} unread messages`}
                        >
                          {channelUnreads[ch.id]}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            {/* Mention hint & staff profile row */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 text-xs font-sans text-zinc-500 dark:text-zinc-400 space-y-1">
              <div className="flex items-center gap-1.5 text-[#1b4d24] dark:text-emerald-400 font-semibold font-sans">
                <span className="material-symbols-outlined text-sm">alternate_email</span>
                <span>Type @ in composer to mention</span>
              </div>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 truncate">
                Signed in as <b className="text-zinc-900 dark:text-zinc-100">@{currentUsername}</b>{' '}
                <span className="font-bold font-heading uppercase text-amber-600 dark:text-amber-400">({currentRole || 'STAFF'})</span>
              </p>
            </div>
          </aside>

          {/* Mobile Drawer Menu */}
          {mobileDrawerOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                onClick={() => setMobileDrawerOpen(false)}
              />
              <div className="relative w-72 max-w-[80vw] bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-900 text-white">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-emerald-400">forum</span>
                    <h3 className="text-sm font-bold font-heading">Team Workspaces</h3>
                  </div>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                {/* Mobile Filter Tabs */}
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-1">
                  <button
                    onClick={() => {
                      setActiveFilter('CHANNELS');
                      setMobileDrawerOpen(false);
                    }}
                    className={`py-2 text-xs sm:text-sm font-bold font-heading rounded-lg cursor-pointer ${
                      activeFilter === 'CHANNELS'
                        ? 'bg-[#1b4d24] text-white'
                        : 'text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800'
                    }`}
                  >
                    Channels
                  </button>
                  <button
                    onClick={() => {
                      setActiveFilter('MENTIONS');
                      setMobileDrawerOpen(false);
                    }}
                    className={`py-2 text-xs sm:text-sm font-bold font-heading rounded-lg cursor-pointer ${
                      activeFilter === 'MENTIONS'
                        ? 'bg-[#1b4d24] text-white'
                        : 'text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800'
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
                        className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-left transition cursor-pointer ${
                          isActive
                            ? 'bg-[#1b4d24] text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`material-symbols-outlined text-lg ${
                              isActive ? 'text-white' : 'text-zinc-400'
                            }`}
                          >
                            {ch.icon}
                          </span>
                          <div className="truncate">
                            <p className="text-sm font-bold font-heading truncate">{ch.name}</p>
                            <p className={`text-xs font-sans truncate ${isActive ? 'text-emerald-100/90' : 'text-zinc-400'}`}>
                              {ch.description}
                            </p>
                          </div>
                        </div>

                        {channelUnreads[ch.id] && channelUnreads[ch.id] > 0 ? (
                          <span className={`text-xs font-mono font-black ${
                            isActive ? 'text-white' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {channelUnreads[ch.id]}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Central Chat Stream */}
          <main className="flex-1 flex flex-col overflow-hidden bg-zinc-50/70 dark:bg-zinc-950 min-w-0 relative">

            {/* Announcement Banner — Clean surface background with bold uppercase header */}
            {activeChannelId === 'announcements' && activeFilter === 'CHANNELS' && (
              <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-xs sm:text-sm font-sans text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                <span className="text-xs font-black font-heading tracking-wider text-amber-600 dark:text-amber-400 shrink-0 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">campaign</span>
                  ANNOUNCEMENTS:
                </span>
                <span>
                  Official workplace broadcasts and management alerts published across all branches.
                </span>
              </div>
            )}

            {/* Messages Feed — Two-sided chat bubbles */}
            <div
              ref={chatScrollContainerRef}
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
            >
              {loadingMessages ? (
                <div className="text-center py-20 text-zinc-400 text-sm font-sans">
                  <span className="material-symbols-outlined animate-spin text-3xl text-[#1b4d24] dark:text-emerald-400 mb-2">sync</span>
                  <p>Loading conversation…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 px-4 max-w-md mx-auto">
                  <span className="material-symbols-outlined text-5xl text-zinc-300 dark:text-zinc-600 mb-3 block">
                    {activeFilter === 'MENTIONS' ? 'alternate_email' : activeChannel.icon}
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold font-heading text-zinc-900 dark:text-zinc-100">
                    {activeFilter === 'MENTIONS'
                      ? 'No mentions yet'
                      : `Welcome to #${activeChannel.name}`}
                  </h3>
                  <p className="text-sm font-sans text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                    {activeFilter === 'MENTIONS'
                      ? 'When other team members tag @' + currentUsername + ' in any channel, the messages will appear here.'
                      : activeChannel.description}
                  </p>
                  {activeFilter === 'CHANNELS' && (
                    <p className="text-xs font-sans text-zinc-400 dark:text-zinc-500 mt-4">
                      Tip: Type @ to mention colleagues (e.g. @admin, @substore, @driver) to notify them immediately.
                    </p>
                  )}
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMine = isMessageFromMe(msg);
                  const roleConfig = ROLE_LABELS[msg.sender_role] || ROLE_LABELS['employee'];
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
                        <div className="flex items-center justify-center my-4">
                          <span className="text-xs font-bold font-heading uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full border border-zinc-200/80 dark:border-zinc-700/80 shadow-2xs">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>
                      )}

                      {/* Two-Sided Chat Layout Container */}
                      <div className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`group relative max-w-[88%] sm:max-w-[75%] transition-all rounded-2xl p-4 shadow-2xs ${
                            isMine
                              ? 'bg-[#eef7ee] dark:bg-emerald-950/40 border border-[#cbe6cc] dark:border-emerald-800/70 rounded-tr-xs'
                              : 'bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-tl-xs hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          {/* Message Header (Sender, Role, Status, Time) */}
                          <div className={`flex flex-wrap items-baseline gap-2 mb-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {/* Avatar for others */}
                            {!isMine && (
                              <div className="w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold font-heading text-zinc-800 dark:text-zinc-200 shrink-0">
                                {(msg.sender_name || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}

                            <span className={`text-sm font-bold font-heading ${isMine ? 'text-[#1b4d24] dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                              {isMine ? 'You' : msg.sender_name}
                            </span>

                            {/* Role Label — Bold colored text in CAPITAL LETTERS only */}
                            <span className={`text-xs tracking-wider ${roleConfig.textClass}`}>
                              {roleConfig.label}
                            </span>

                            {/* Mentioned You Status */}
                            {isMentionedMe && (
                              <span className="text-xs font-black font-heading tracking-wider text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-xs">alternate_email</span>
                                MENTIONED
                              </span>
                            )}

                            {/* Urgent Alert Status */}
                            {isUrgent && (
                              <span className="text-xs font-black font-heading tracking-wider text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-xs">priority_high</span>
                                URGENT
                              </span>
                            )}

                            {/* Announcement Status */}
                            {isAnnouncement && (
                              <span className="text-xs font-black font-heading tracking-wider text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-xs">campaign</span>
                                BROADCAST
                              </span>
                            )}

                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono ml-auto">
                              {formatTime(msg.created_at)}
                            </span>
                          </div>

                          {/* Message Body Content */}
                          <div className={`text-sm sm:text-base font-sans leading-relaxed whitespace-pre-wrap break-words ${isMine ? 'text-zinc-900 dark:text-zinc-100 text-left' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {renderFormattedContent(msg.content)}
                          </div>

                          {/* Hover Quick Action Bar */}
                          <div
                            className={`absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-zinc-800 px-1.5 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-2xs z-10 ${
                              isMine ? 'left-2' : 'right-2'
                            }`}
                          >
                            <button
                              onClick={() => handleReplyMention(msg.sender_name)}
                              className="p-1 text-zinc-400 hover:text-[#1b4d24] dark:hover:text-emerald-400 transition cursor-pointer"
                              title={`Reply to @${msg.sender_name}`}
                              aria-label="Reply"
                            >
                              <span className="material-symbols-outlined text-xs">reply</span>
                            </button>
                            <button
                              onClick={() => handleCopyMessage(msg)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
                              title={copiedId === msg.id ? 'Copied!' : 'Copy text'}
                              aria-label="Copy text"
                            >
                              <span className="material-symbols-outlined text-xs">
                                {copiedId === msg.id ? 'check' : 'content_copy'}
                              </span>
                            </button>
                            {(isMine || isAdminOrManagerOrTech) && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1 text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                                title="Delete message"
                                aria-label="Delete"
                              >
                                <span className="material-symbols-outlined text-xs">delete</span>
                              </button>
                            )}
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
              <div className="absolute bottom-[96px] left-4 right-4 sm:left-6 sm:right-6 max-w-lg bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-xs font-bold font-heading uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-[#1b4d24] dark:text-emerald-400">alternate_email</span>
                    <span>Mention Teammate</span>
                  </div>
                  <span className="text-xs font-sans text-zinc-400 font-normal">Use ↑↓ keys + Enter</span>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredStaff.length === 0 ? (
                    <div className="p-3 text-center text-xs font-sans text-zinc-400">
                      No matching team members found for "@{mentionQuery}"
                    </div>
                  ) : (
                    filteredStaff.map((staff, idx) => {
                      const isHighlighted = idx === highlightedIndex;
                      const roleConfig = ROLE_LABELS[staff.role] || ROLE_LABELS['employee'];

                      return (
                        <button
                          key={staff.id}
                          type="button"
                          onClick={() => insertMention(staff)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left transition cursor-pointer ${
                            isHighlighted
                              ? 'bg-zinc-100 dark:bg-zinc-800'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 shrink-0">
                              {staff.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <p className="text-sm font-bold font-heading text-zinc-900 dark:text-zinc-100 truncate">
                                {staff.full_name}
                              </p>
                              <p className="text-xs font-mono text-zinc-400 truncate">
                                @{staff.username}
                              </p>
                            </div>
                          </div>

                          <span className={`text-xs tracking-wider shrink-0 ${roleConfig.textClass}`}>
                            {roleConfig.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Message Composer Footer — Perfectly Aligned Input & Send Button */}
            <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
              <form onSubmit={handleSendMessage} className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Priority Selector & Quick Mention Trigger */}
                  <div className="flex items-center gap-3 overflow-x-auto">
                    <span className="text-xs font-bold font-heading text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                      Priority:
                    </span>
                    <button
                      type="button"
                      onClick={() => setPriority('normal')}
                      className={`text-xs font-black font-heading tracking-wider transition cursor-pointer ${
                        priority === 'normal'
                          ? 'text-zinc-900 dark:text-zinc-100 underline decoration-2 underline-offset-4'
                          : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      NORMAL
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriority('urgent')}
                      className={`inline-flex items-center gap-0.5 text-xs font-black font-heading tracking-wider transition cursor-pointer ${
                        priority === 'urgent'
                          ? 'text-rose-600 dark:text-rose-400 underline decoration-2 underline-offset-4'
                          : 'text-zinc-400 dark:text-zinc-500 hover:text-rose-500'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">priority_high</span>
                      URGENT
                    </button>
                    {isAdminOrManagerOrTech && (
                      <button
                        type="button"
                        onClick={() => setPriority('announcement')}
                        className={`inline-flex items-center gap-0.5 text-xs font-black font-heading tracking-wider transition cursor-pointer ${
                          priority === 'announcement'
                            ? 'text-amber-600 dark:text-amber-400 underline decoration-2 underline-offset-4'
                            : 'text-zinc-400 dark:text-zinc-500 hover:text-amber-500'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">campaign</span>
                        BROADCAST
                      </button>
                    )}

                    {/* Quick @ button for touch accessibility */}
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
                      className="ml-2 inline-flex items-center gap-1 text-xs font-bold font-heading text-[#1b4d24] dark:text-emerald-400 hover:underline transition cursor-pointer"
                      title="Mention a colleague"
                    >
                      <span className="material-symbols-outlined text-xs">alternate_email</span>
                      Mention
                    </button>
                  </div>

                  <span className="text-xs font-sans text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                    Enter to send · Shift+Enter for newline · @ to mention
                  </span>
                </div>

                {/* Input row: textarea & Send button share matching height & alignment */}
                <div className="flex items-stretch gap-2.5">
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      rows={2}
                      value={content}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder={`Message #${activeChannel.name}... (type @ to mention)`}
                      className="w-full h-full p-3 text-sm sm:text-base font-sans border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 outline-none focus:ring-1 focus:ring-[#1b4d24] dark:focus:ring-emerald-500 resize-none leading-relaxed min-h-[52px]"
                    />
                  </div>

                  {/* Send Button — Stretches cleanly to match the textarea height and baseline */}
                  <button
                    type="submit"
                    disabled={!content.trim() || sending}
                    className="px-6 rounded-xl bg-[#1b4d24] hover:bg-[#143a1b] text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition font-heading font-bold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-95 shrink-0 cursor-pointer self-stretch min-h-[52px]"
                    aria-label="Send message"
                  >
                    <span className="material-symbols-outlined text-xl">send</span>
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </div>
              </form>
            </div>

          </main>
        </div>

      </div>

      {/* Channel Members & Permissions Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-heading text-zinc-900 dark:text-zinc-100">
                  #{activeChannel.name} Members &amp; Access
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Employees must be added by an admin to see and participate in this channel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberActionError(null);
                  setMemberActionSuccess(null);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Alert Feedback */}
              {memberActionError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-sans text-rose-700 dark:text-rose-300">
                  {memberActionError}
                </div>
              )}
              {memberActionSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs font-sans text-emerald-700 dark:text-emerald-300">
                  {memberActionSuccess}
                </div>
              )}

              {/* Admin Add Member Form (By Role or Individual) */}
              {isAdminOrManagerOrTech && (
                <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-heading text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                      Add to Channel
                    </span>
                    <div className="flex items-center gap-1 bg-zinc-200 dark:bg-zinc-700 p-0.5 rounded-lg text-[11px] font-bold font-heading">
                      <button
                        type="button"
                        onClick={() => setAddMemberMode('ROLE')}
                        className={`px-2 py-0.5 rounded-md transition ${
                          addMemberMode === 'ROLE'
                            ? 'bg-white dark:bg-zinc-900 text-[#1b4d24] dark:text-emerald-400 shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        By Role (Bulk)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddMemberMode('INDIVIDUAL')}
                        className={`px-2 py-0.5 rounded-md transition ${
                          addMemberMode === 'INDIVIDUAL'
                            ? 'bg-white dark:bg-zinc-900 text-[#1b4d24] dark:text-emerald-400 shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        Single Staff
                      </button>
                    </div>
                  </div>

                  {addMemberMode === 'ROLE' ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRoleToAdd}
                        onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs font-sans rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                      >
                        <option value="all">All Active Staff Members (Company-wide)</option>
                        <option value="delivery">All Delivery Drivers</option>
                        <option value="call_center">All Call Center Agents</option>
                        <option value="store_manager">All Substore Managers</option>
                        <option value="employee">All Branch Staff / Counter Employees</option>
                        <option value="admin">All Administrators &amp; Managers</option>
                        <option value="tech_support">All Tech Support Engineers</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMember}
                        disabled={savingMember}
                        className="px-3.5 py-2 bg-[#1b4d24] text-white text-xs font-bold font-heading rounded-lg hover:bg-[#153e1c] disabled:opacity-50 transition cursor-pointer shrink-0"
                      >
                        {savingMember ? 'Adding...' : 'Add All in Role'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedStaffToAdd}
                        onChange={(e) => setSelectedStaffToAdd(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs font-sans rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                      >
                        <option value="">Select an employee...</option>
                        {staffUsers
                          .filter((u) => !channelMembers.some((m) => m.id === u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} (@{u.username}) · {u.role.toUpperCase()}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMember}
                        disabled={!selectedStaffToAdd || savingMember}
                        className="px-3.5 py-2 bg-[#1b4d24] text-white text-xs font-bold font-heading rounded-lg hover:bg-[#153e1c] disabled:opacity-50 transition cursor-pointer shrink-0"
                      >
                        {savingMember ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Members List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold font-heading text-zinc-500 uppercase tracking-wider">
                  <span>Current Members ({channelMembers.length})</span>
                  {loadingMembers && <span className="text-zinc-400">Loading...</span>}
                </div>

                {channelMembers.length === 0 && !loadingMembers ? (
                  <p className="text-xs text-zinc-400 italic py-2 text-center">
                    No members added yet. Administrators have default access.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    {channelMembers.map((m) => {
                      const isSelf = m.id === currentUserId;
                      const roleConfig = ROLE_LABELS[m.role] || { label: m.role.toUpperCase(), textClass: 'text-zinc-600 font-bold' };

                      return (
                        <div
                          key={m.id}
                          className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-300 shrink-0">
                              {(m.full_name || m.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold font-heading text-zinc-900 dark:text-zinc-100 truncate">
                                {m.full_name || m.username} {isSelf && <span className="text-[10px] text-zinc-400 font-normal">(You)</span>}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-400 font-sans">@{m.username}</span>
                                <span className={`text-[10px] uppercase ${roleConfig.textClass}`}>
                                  {roleConfig.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          {isAdminOrManagerOrTech && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              className="px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                              title="Remove from channel"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              {isAdminOrManagerOrTech && activeChannelId !== 'general' && activeChannelId !== 'announcements' ? (
                <button
                  type="button"
                  onClick={handleDeleteChannel}
                  disabled={deletingChannel}
                  className="px-3 py-2 text-xs font-bold font-heading text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                >
                  {deletingChannel ? 'Deleting...' : 'Delete Channel'}
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberActionError(null);
                  setMemberActionSuccess(null);
                }}
                className="px-4 py-2 text-xs font-bold font-heading rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Channel Members & Permissions Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-heading text-zinc-900 dark:text-zinc-100">
                  #{activeChannel.name} Members &amp; Access
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Employees must be added by an admin to see and participate in this channel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberActionError(null);
                  setMemberActionSuccess(null);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Alert Feedback */}
              {memberActionError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-sans text-rose-700 dark:text-rose-300">
                  {memberActionError}
                </div>
              )}
              {memberActionSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs font-sans text-emerald-700 dark:text-emerald-300">
                  {memberActionSuccess}
                </div>
              )}

              {/* Admin Add Member Form (By Role or Individual) */}
              {isAdminOrManagerOrTech && (
                <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-heading text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                      Add to Channel
                    </span>
                    <div className="flex items-center gap-1 bg-zinc-200 dark:bg-zinc-700 p-0.5 rounded-lg text-[11px] font-bold font-heading">
                      <button
                        type="button"
                        onClick={() => setAddMemberMode('ROLE')}
                        className={`px-2 py-0.5 rounded-md transition ${
                          addMemberMode === 'ROLE'
                            ? 'bg-white dark:bg-zinc-900 text-[#1b4d24] dark:text-emerald-400 shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        By Role (Bulk)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddMemberMode('INDIVIDUAL')}
                        className={`px-2 py-0.5 rounded-md transition ${
                          addMemberMode === 'INDIVIDUAL'
                            ? 'bg-white dark:bg-zinc-900 text-[#1b4d24] dark:text-emerald-400 shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        Single Staff
                      </button>
                    </div>
                  </div>

                  {addMemberMode === 'ROLE' ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRoleToAdd}
                        onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs font-sans rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                      >
                        <option value="all">All Active Staff Members (Company-wide)</option>
                        <option value="delivery">All Delivery Drivers</option>
                        <option value="call_center">All Call Center Agents</option>
                        <option value="store_manager">All Substore Managers</option>
                        <option value="employee">All Branch Staff / Counter Employees</option>
                        <option value="admin">All Administrators &amp; Managers</option>
                        <option value="tech_support">All Tech Support Engineers</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMember}
                        disabled={savingMember}
                        className="px-3.5 py-2 bg-[#1b4d24] text-white text-xs font-bold font-heading rounded-lg hover:bg-[#153e1c] disabled:opacity-50 transition cursor-pointer shrink-0"
                      >
                        {savingMember ? 'Adding...' : 'Add All in Role'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedStaffToAdd}
                        onChange={(e) => setSelectedStaffToAdd(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs font-sans rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                      >
                        <option value="">Select an employee...</option>
                        {staffUsers
                          .filter((u) => !channelMembers.some((m) => m.id === u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} (@{u.username}) · {u.role.toUpperCase()}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMember}
                        disabled={!selectedStaffToAdd || savingMember}
                        className="px-3.5 py-2 bg-[#1b4d24] text-white text-xs font-bold font-heading rounded-lg hover:bg-[#153e1c] disabled:opacity-50 transition cursor-pointer shrink-0"
                      >
                        {savingMember ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Members List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold font-heading text-zinc-500 uppercase tracking-wider">
                  <span>Current Members ({channelMembers.length})</span>
                  {loadingMembers && <span className="text-zinc-400">Loading...</span>}
                </div>

                {channelMembers.length === 0 && !loadingMembers ? (
                  <p className="text-xs text-zinc-400 italic py-2 text-center">
                    No members added yet. Administrators have default access.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                    {channelMembers.map((m) => {
                      const isSelf = m.id === currentUserId;
                      const roleConfig = ROLE_LABELS[m.role] || { label: m.role.toUpperCase(), textClass: 'text-zinc-600 font-bold' };

                      return (
                        <div
                          key={m.id}
                          className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-300 shrink-0">
                              {(m.full_name || m.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold font-heading text-zinc-900 dark:text-zinc-100 truncate">
                                {m.full_name || m.username} {isSelf && <span className="text-[10px] text-zinc-400 font-normal">(You)</span>}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-400 font-sans">@{m.username}</span>
                                <span className={`text-[10px] uppercase ${roleConfig.textClass}`}>
                                  {roleConfig.label}
                                </span>
                              </div>
                            </div>
                          </div>

                          {isAdminOrManagerOrTech && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              className="px-2 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                              title="Remove from channel"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              {isAdminOrManagerOrTech && activeChannelId !== 'general' && activeChannelId !== 'announcements' ? (
                <button
                  type="button"
                  onClick={handleDeleteChannel}
                  disabled={deletingChannel}
                  className="px-3 py-2 text-xs font-bold font-heading text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                >
                  {deletingChannel ? 'Deleting...' : 'Delete Channel'}
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberActionError(null);
                  setMemberActionSuccess(null);
                }}
                className="px-4 py-2 text-xs font-bold font-heading rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Create New Channel Modal */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-heading text-zinc-900 dark:text-zinc-100">
                  Create New Channel
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Create a dedicated workplace channel for your team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateChannelModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="p-4 sm:p-5 space-y-4">
              {createChannelError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-sans text-rose-700 dark:text-rose-300">
                  {createChannelError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Channel Name *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-bold text-sm">#</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Addis Logistics, Shift Notes, Bole Team"
                    value={newChanName}
                    onChange={(e) => setNewChanName(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="What is this channel about?"
                  value={newChanDescription}
                  onChange={(e) => setNewChanDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    'forum',
                    'local_shipping',
                    'campaign',
                    'inventory_2',
                    'storefront',
                    'headset_mic',
                    'groups',
                    'terminal',
                    'handshake',
                    'shield',
                    'assignment',
                    'support_agent',
                  ].map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewChanIcon(ic)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
                        newChanIcon === ic
                          ? 'bg-[#1b4d24] text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">{ic}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Initial Access (Add Members by Role)
                </label>
                <select
                  value={newChanInitialRole}
                  onChange={(e) => setNewChanInitialRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                >
                  <option value="">Private (Only creators &amp; admins until members added)</option>
                  <option value="all">All Active Staff Members</option>
                  <option value="delivery">All Delivery Drivers</option>
                  <option value="call_center">All Call Center Agents</option>
                  <option value="store_manager">All Substore Managers</option>
                  <option value="employee">All Branch Staff / Counter Employees</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="adminOnlyCheck"
                  checked={newChanAdminOnly}
                  onChange={(e) => setNewChanAdminOnly(e.target.checked)}
                  className="rounded border-zinc-300 text-[#1b4d24] focus:ring-[#1b4d24]"
                />
                <label htmlFor="adminOnlyCheck" className="text-xs font-sans text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  Broadcast only (Only Admins &amp; Managers can post)
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateChannelModal(false)}
                  className="px-4 py-2 text-xs font-bold font-heading rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingChannel || !newChanName.trim()}
                  className="px-4 py-2 text-xs font-bold font-heading rounded-lg bg-[#1b4d24] text-white hover:bg-[#153e1c] disabled:opacity-50 transition cursor-pointer"
                >
                  {creatingChannel ? 'Creating...' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Create New Channel Modal */}
      {showCreateChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in duration-150">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-bold font-heading text-zinc-900 dark:text-zinc-100">
                  Create New Channel
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Create a dedicated workplace channel for your team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateChannelModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="p-4 sm:p-5 space-y-4">
              {createChannelError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs font-sans text-rose-700 dark:text-rose-300">
                  {createChannelError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Channel Name *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-bold text-sm">#</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Addis Logistics, Shift Notes, Bole Team"
                    value={newChanName}
                    onChange={(e) => setNewChanName(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="What is this channel about?"
                  value={newChanDescription}
                  onChange={(e) => setNewChanDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    'forum',
                    'local_shipping',
                    'campaign',
                    'inventory_2',
                    'storefront',
                    'headset_mic',
                    'groups',
                    'terminal',
                    'handshake',
                    'shield',
                    'assignment',
                    'support_agent',
                  ].map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewChanIcon(ic)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
                        newChanIcon === ic
                          ? 'bg-[#1b4d24] text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">{ic}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold font-heading text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Initial Access (Add Members by Role)
                </label>
                <select
                  value={newChanInitialRole}
                  onChange={(e) => setNewChanInitialRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-sans rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-[#1b4d24]"
                >
                  <option value="">Private (Only creators &amp; admins until members added)</option>
                  <option value="all">All Active Staff Members</option>
                  <option value="delivery">All Delivery Drivers</option>
                  <option value="call_center">All Call Center Agents</option>
                  <option value="store_manager">All Substore Managers</option>
                  <option value="employee">All Branch Staff / Counter Employees</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="adminOnlyCheck"
                  checked={newChanAdminOnly}
                  onChange={(e) => setNewChanAdminOnly(e.target.checked)}
                  className="rounded border-zinc-300 text-[#1b4d24] focus:ring-[#1b4d24]"
                />
                <label htmlFor="adminOnlyCheck" className="text-xs font-sans text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  Broadcast only (Only Admins &amp; Managers can post)
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateChannelModal(false)}
                  className="px-4 py-2 text-xs font-bold font-heading rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingChannel || !newChanName.trim()}
                  className="px-4 py-2 text-xs font-bold font-heading rounded-lg bg-[#1b4d24] text-white hover:bg-[#153e1c] disabled:opacity-50 transition cursor-pointer"
                >
                  {creatingChannel ? 'Creating...' : 'Create Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
