/**
 * frontend/src/telegram/shop/AccountTab.tsx
 * Account tab: identity card, order stats and the editable profile form.
 */

import { useEffect, useState } from 'react';
import type { ProfileResponse, ProfileUpdate } from './types';
import { useMiniAppI18n } from './MiniAppI18n';
import { formatEtb } from './types';
import type { UseMiniAppProfileReturn } from './useMiniAppProfile';

export interface AccountTabProps {
  telegramUser: { first_name?: string; last_name?: string; username?: string } | null;
  profile: UseMiniAppProfileReturn;
  onViewOrders: () => void;
  onBrowseStore: () => void;
  onHapticImpact?: (style: 'light' | 'medium') => void;
  onHapticNotify?: (type: 'error' | 'success' | 'warning') => void;
}

function Avatar({
  name,
  photoUrl,
  size = 'lg',
}: {
  name: string;
  photoUrl?: string | null;
  size?: 'lg' | 'sm';
}) {
  const dimension = size === 'lg' ? 'h-16 w-16 text-lg' : 'h-9 w-9 text-xs';

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${dimension} shrink-0 rounded-full border-2 border-white object-cover`}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800`}
      aria-hidden="true"
    >
      {initials || 'A'}
    </span>
  );
}

function StatCard({
  icon,
  title,
  value,
  caption,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  caption: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col rounded-xl border border-line bg-panel p-3 text-left shadow-sm"
    >
      <span className="mb-2 text-ink2 [&>i]:text-[15px]">{icon}</span>
      <span className="text-xs font-semibold text-ink">{title}</span>
      <span className="mt-0.5 font-mono text-sm font-bold text-ink">{value}</span>
      <span className="mt-0.5 text-xs leading-tight text-muted">{caption}</span>
    </button>
  );
}

/** City <option> labels are translated, but the persisted/submitted value stays
 * the plain English string so stored profiles keep matching the backend. */
const CITY_OPTIONS = [
  { key: 'city.addisAbaba', value: 'Addis Ababa' },
  { key: 'city.otherRegions', value: 'Other Regions' },
  { key: 'city.abroad', value: 'Abroad' },
] as const;

export function AccountTab({
  telegramUser,
  profile,
  onViewOrders,
  onBrowseStore,
  onHapticImpact,
  onHapticNotify,
}: AccountTabProps) {
  const data: ProfileResponse | null = profile.data;

  const [form, setForm] = useState<ProfileUpdate>({
    display_name: '',
    phone: '+251',
    city: 'Addis Ababa',
    location: '',
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Seed the form from the server profile. The effect keys off a primitive
  // signature rather than the response object so an unrelated refetch does not
  // wipe out what the customer is currently typing or the saved confirmation.
  const seedSignature = data
    ? [
        data.profile.updated_at ?? '',
        data.profile.display_name,
        data.profile.phone,
        data.profile.city,
        data.profile.location,
      ].join('|')
    : '';

  useEffect(() => {
    if (!data) return;
    setForm({
      display_name: data.profile.display_name || '',
      phone: data.profile.phone || '+251',
      city: data.profile.city || 'Addis Ababa',
      location: data.profile.location || '',
    });
  }, [seedSignature, data]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    onHapticImpact?.('medium');

    const ok = await profile.save({
      display_name: form.display_name.trim(),
      phone: form.phone.trim(),
      city: form.city,
      location: form.location.trim(),
    });

    if (ok) {
      onHapticNotify?.('success');
      setSavedAt(
        new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    } else {
      onHapticNotify?.('error');
    }
  };

  const { t } = useMiniAppI18n();

  const displayName =
    form.display_name ||
    data?.telegram.first_name ||
    [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(' ') ||
    t('account.customer');

  const isSaving = profile.status === 'saving';
  const isLoading = profile.status === 'loading' || profile.status === 'idle';

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4">
        <Avatar name={displayName} photoUrl={data?.telegram.photo_url} />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted">
            {t('account.space')}
          </p>
          <h1 className="truncate font-heading text-lg font-bold text-ink">{displayName}</h1>
          {data?.telegram.username && (
            <p className="truncate text-xs text-muted">@{data.telegram.username}</p>
          )}
        </div>
      </section>

      <section className="flex gap-3">
        <StatCard
          icon={<i className="fa-solid fa-box" aria-hidden="true" />}
          title={t('account.orders')}
          value={String(data?.stats.order_count ?? 0)}
          caption={t('account.ordersCaption')}
          onClick={onViewOrders}
        />
        <StatCard
          icon={<i className="fa-solid fa-wallet" aria-hidden="true" />}
          title={formatEtb(data?.stats.total_spent ?? 0)}
          value={`${data?.stats.active_count ?? 0} active`}
          caption={t('account.spentCaption')}
          onClick={onViewOrders}
        />
        <StatCard
          icon={<i className="fa-solid fa-store" aria-hidden="true" />}
          title={t('account.shopNow')}
          value={`${data?.stats.delivered_count ?? 0} done`}
          caption={t('account.shopNowCaption')}
          onClick={onBrowseStore}
        />
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-ink">{t('account.profile')}</h2>
        <p className="mt-0.5 text-xs text-muted">
          {t('account.profileSub')}
        </p>

        {profile.error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {profile.error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="tma-display-name" className="mb-1 block text-xs font-semibold text-ink2">
              {t('account.displayName')}
            </label>
            <input
              id="tma-display-name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={form.display_name}
              onChange={(event) => setForm({ ...form, display_name: event.target.value })}
              placeholder={t('account.namePlaceholder')}
              className="w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
          </div>

          <div>
            <label htmlFor="tma-phone" className="mb-1 block text-xs font-semibold text-ink2">
              {t('account.phone')}
            </label>
            <input
              id="tma-phone"
              type="tel"
              required
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder={t('account.phonePlaceholder')}
              className="w-full rounded-lg border border-line bg-cream px-3 py-2.5 font-mono text-sm text-ink focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="tma-city" className="mb-1 block text-xs font-semibold text-ink2">
                {t('account.city')}
              </label>
              <select
                id="tma-city"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                className="w-full rounded-lg border border-line bg-cream px-2.5 py-2.5 text-sm text-ink focus:border-brand-700 focus:outline-none"
              >
                {CITY_OPTIONS.map((city) => (
                  <option key={city.key} value={city.value}>
                    {t(city.key)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tma-location" className="mb-1 block text-xs font-semibold text-ink2">
                {t('account.deliveryArea')}
              </label>
              <input
                id="tma-location"
                type="text"
                maxLength={255}
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
                placeholder={t('account.areaPlaceholder')}
                className="w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-sm text-ink focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving || isLoading}
            className="w-full rounded-full bg-brand-solid py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-50"
          >
            {isSaving ? t('account.saving') : t('account.save')}
          </button>

          {savedAt && (
            <p className="text-center text-xs text-brand-700">
              Profile saved at {savedAt}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
