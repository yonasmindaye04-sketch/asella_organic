/**
 * frontend/src/components/dashboard/ChatNotificationListener.tsx
 * Asella Organic — Internal Team Chat Push Notification & Sound Chime Listener
 *
 * Runs inside DashboardLayout to monitor real-time team messages:
 * 1. Web Notifications API: Native browser push notifications (when user is in another tab or window)
 * 2. Web Audio API Chime: Harmonious dual-tone synthesized chime via chatSound utility
 * 3. In-App Toasts: Instant visual alert when navigating elsewhere on the dashboard
 * 4. Dispatches events to update sidebar unread badges in real time
 */

import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { api } from '../../services/api';
import { useToast } from './DashboardToastProvider';
import { playChatSound } from '../../utils/chatSound';

interface UnreadResponse {
  unread: number;
  mentions: number;
  urgent: number;
  announcements: number;
  direct_unreads?: number;
  direct_unreads_by_user?: Record<string, number>;
  latest: {
    id: string;
    channel: string;
    sender_id: string;
    sender_name: string;
    sender_role: string;
    recipient_id?: string | null;
    is_direct?: boolean | number;
    content: string;
    media_url?: string | null;
    media_type?: string | null;
    priority: 'normal' | 'urgent' | 'announcement';
    is_announcement: boolean | number;
    mentions?: string[];
    created_at: string;
  } | null;
}

export const ChatNotificationListener: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const currentUserId = user?.id || '';
  const currentUsername = (user?.username || user?.name || '').toLowerCase();
  const lastSeenMsgIdRef = useRef<string | null>(null);
  const isFirstCheckRef = useRef<boolean>(true);

  // Request browser Notification permission once if available
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const askPermission = () => {
        Notification.requestPermission().catch(() => {});
        window.removeEventListener('click', askPermission);
      };
      window.addEventListener('click', askPermission, { once: true });
    }
  }, []);

  // Poll for unread messages and trigger push notification & sound
  useEffect(() => {
    if (!user) return;

    const checkNewMessages = async () => {
      try {
        const channelReadsRaw = localStorage.getItem('asella_channel_reads') || '{}';
        const res = await api.get<UnreadResponse>(`/api/messages/unread?channel_reads=${encodeURIComponent(channelReadsRaw)}`);

        if (res.success && res.data && res.data.latest) {
          const latest = res.data.latest;
          const isFromMe =
            (Boolean(currentUserId) && latest.sender_id === currentUserId) ||
            (Boolean(currentUsername) && (latest.sender_name || '').toLowerCase() === currentUsername);

          // On first run, remember the existing latest message without alerting
          if (isFirstCheckRef.current) {
            isFirstCheckRef.current = false;
            lastSeenMsgIdRef.current = latest.id;
            return;
          }

          // If a new message arrived that we haven't seen yet and is authored by someone else
          if (!isFromMe && latest.id !== lastSeenMsgIdRef.current) {
            lastSeenMsgIdRef.current = latest.id;

            // Notify sidebar and internal messaging page
            window.dispatchEvent(new CustomEvent('asella:new-message-received', { detail: latest }));

            const isDirect = Boolean(latest.is_direct);
            const isUrgent = latest.priority === 'urgent';
            const isAnnouncement = Boolean(latest.is_announcement) || latest.priority === 'announcement';
            const mentionsList = latest.mentions || [];
            const isMentionedMe =
              mentionsList.some((m) => m.toLowerCase() === currentUsername) ||
              latest.content.toLowerCase().includes(`@${currentUsername}`);

            const isOnMessagesPage = location.pathname === '/dashboard/messages';

            // 1. Play Harmonious Audio Chime
            playChatSound();

            // 2. Native Browser Push Notification (when window is not active or user is in another tab/page)
            if (!isOnMessagesPage || document.visibilityState === 'hidden') {
              if ('Notification' in window && Notification.permission === 'granted') {
                const isDirect = Boolean(latest.is_direct);
                const prefix = isUrgent ? '[URGENT] ' : isMentionedMe ? '[@MENTION] ' : isAnnouncement ? '[ANNOUNCEMENT] ' : '';
                const notifTitle = isDirect
                  ? `[DIRECT] ${latest.sender_name}`
                  : `${prefix}#${latest.channel} · ${latest.sender_name}`;
                try {
                  const browserNotif = new Notification(notifTitle, {
                    body: latest.content || (latest.media_url ? '[Sent an attachment]' : 'New message'),
                    tag: `asella-chat-${latest.id}`,
                    icon: '/favicon.ico',
                  });
                  browserNotif.onclick = () => {
                    window.focus();
                    navigate(`/dashboard/messages`);
                  };
                } catch {
                  /* silent */
                }
              }

              // 3. In-App Toast
              if (!isOnMessagesPage) {
                const toastMsg = isDirect
                  ? `${latest.sender_name} sent you a direct message`
                  : isMentionedMe
                  ? `${latest.sender_name} mentioned you in #${latest.channel}`
                  : `New message from ${latest.sender_name} in #${latest.channel}`;
                showToast(toastMsg, isUrgent ? 'warning' : 'info');
              }
            }
          }
        }
      } catch {
        /* silent poll fail */
      }
    };

    checkNewMessages();
    const interval = setInterval(checkNewMessages, 10_000);
    return () => clearInterval(interval);
  }, [user, currentUserId, currentUsername, location.pathname, navigate, showToast]);

  return null;
};
