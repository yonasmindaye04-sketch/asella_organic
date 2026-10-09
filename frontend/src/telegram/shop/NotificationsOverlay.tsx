/**
 * frontend/src/telegram/shop/NotificationsOverlay.tsx
 * Bell panel for customer notifications.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchNotifications, markNotificationsRead, type CustomerNotification } from './api';
import { useMiniAppI18n } from './MiniAppI18n';

export interface NotificationsOverlayProps {
  initData: string;
  onClose: () => void;
  onViewOrder: (orderId: string) => void;
}

function relativeTime(value: string, locale: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;

  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3600000);
  const days = Math.round(diffMs / 86400000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (minutes < 1) return rtf.format(0, 'minute');
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (hours < 24) return rtf.format(-hours, 'hour');
  if (days < 7) return rtf.format(-days, 'day');
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function NotificationsOverlay({ initData, onClose, onViewOrder }: NotificationsOverlayProps) {
  const { t, language } = useMiniAppI18n();
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const locale = language === 'am' ? 'am-ET' : language === 'or' ? 'om-ET' : 'en-GB';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await fetchNotifications(initData);
        if (cancelled) return;
        setItems(result.notifications);

        // Opening the panel is the read receipt.
        if (result.unread > 0) {
          await markNotificationsRead(initData);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || t('notifications.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initData]);

  const handleViewOrder = useCallback(
    (orderId: string) => {
      onViewOrder(orderId);
    },
    [onViewOrder]
  );

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
        <h1 className="font-heading text-base font-bold text-ink">{t('notifications.title')}</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-ink2"
        >
          <i className="fa-solid fa-xmark text-[13px]" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-xs text-muted">{t('orders.loading')}</p>
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-xs text-red-600">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 rounded-lg bg-brand-solid px-4 py-2 text-xs font-semibold text-white"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <i className="fa-regular fa-bell-slash text-2xl text-muted" aria-hidden="true" />
          <p className="mt-2 text-xs text-muted">{t('notifications.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border p-3 ${
                item.read ? 'border-line bg-cream' : 'border-brand-200 bg-brand-50'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    item.read ? 'bg-brand-100 text-brand-700' : 'bg-brand-solid text-white'
                  }`}
                  aria-hidden="true"
                >
                  <i className={`fa-solid ${item.type === 'order_created' ? 'fa-box' : 'fa-truck-fast'} text-[13px]`} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-xs leading-relaxed text-ink2">{item.body}</p>}
                  <p className="mt-1 text-[10px] text-muted">{relativeTime(item.created_at, locale)}</p>
                </div>
              </div>

              {item.order_id && (
                <button
                  type="button"
                  onClick={() => handleViewOrder(item.order_id as string)}
                  className="mt-2 flex w-full items-center justify-between rounded-lg bg-panel px-3 py-1.5 text-[11px] font-semibold text-ink"
                >
                  <span className="font-mono">{item.order_id}</span>
                  <i className="fa-solid fa-chevron-right text-[10px] text-muted" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}