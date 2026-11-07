/**
 * frontend/src/pages/MediaLibraryPage.tsx
 * /dashboard/media — swap any storefront "site chrome" image or product photo without a redeploy.
 *
 * Fully redesigned to match Asella Organic design system & rule.md:
 *   - Bare icons without background tiles
 *   - Bold colored text only in CAPITAL LETTERS for status indicators
 *   - Full dark/light mode compatibility with high contrast
 *   - Zero emojis per rule.md
 *   - Mobile responsive layout with touch-friendly hit targets (2 KPIs per row on mobile)
 *   - Image inspection lightbox modal for full-resolution view
 */

import React, { useCallback, useRef, useState } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useSiteAssets } from '../context/SiteAssetsContext';
import {
  SITE_ASSET_SLOTS,
  SITE_ASSET_SECTIONS,
  type SiteAssetSlot,
} from '../constants/siteAssets';
import ProductImagesSection from '../components/media/ProductImagesSection';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Mirrors the backend Zod rule so the admin gets the message inline. */
function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'Enter an image URL.';
  if (/drive\.google\.com|dropbox\.com/i.test(trimmed)) {
    return 'Paste a direct image link, not a cloud drive share page.';
  }
  const ok =
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/image/') ||
    trimmed.startsWith('/uploads/');
  return ok ? null : 'Must be an http(s) address or a /image/ path.';
}

interface AssetCardProps {
  slot: SiteAssetSlot;
  onPreviewClick?: (title: string, src: string) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ slot, onPreviewClick }) => {
  const { resolve, isOverridden, overrides, refresh } = useSiteAssets();

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState('');
  const [busy, setBusy] = useState<'upload' | 'url' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const overridden = isOverridden(slot.key);
  const preview = resolve(slot.key);
  const updatedAt = overrides[slot.key]?.updated_at;

  const run = useCallback(
    async (kind: 'upload' | 'url' | 'reset', work: () => Promise<Error | null>) => {
      setBusy(kind);
      setError('');
      try {
        const failure = await work();
        if (failure) setError(failure.message);
        await refresh();
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const handleFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }
    void run('upload', async () => {
      const body = new FormData();
      body.append('image', file);
      const res = await fetch(`${BASE_URL}/api/v1/media/${slot.key}/image`, {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const json = await res.json().catch(() => ({ success: false }));
      return json.success ? null : new Error(json.error ?? 'Upload failed.');
    });
  };

  const handleSaveUrl = () => {
    const problem = validateUrl(urlDraft);
    if (problem) {
      setUrlError(problem);
      return;
    }
    void run('url', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/media/${slot.key}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlDraft.trim() }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success) return new Error(json.error ?? 'Could not save URL.');
      setUrlDraft('');
      setShowUrlInput(false);
      return null;
    });
  };

  const handleReset = () => {
    void run('reset', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/media/${slot.key}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({ success: false }));
      return json.success ? null : new Error(json.error ?? 'Could not reset.');
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between gap-3.5">
      <div className="flex items-start gap-3.5">
        {/* Preview Thumbnail */}
        <div
          onClick={() => { if (preview && onPreviewClick) onPreviewClick(slot.label, preview); }}
          className={`w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-100/70 dark:bg-zinc-800/60 p-1.5 flex items-center justify-center overflow-hidden relative group ${
            preview && onPreviewClick ? 'cursor-pointer' : ''
          }`}
          title={preview ? 'Click to inspect image' : undefined}
        >
          {preview ? (
            <>
              <img
                src={preview}
                alt={slot.label}
                loading="lazy"
                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-lg">zoom_in</span>
              </div>
            </>
          ) : (
            <span className="material-symbols-outlined text-zinc-400 dark:text-zinc-500 text-3xl">
              image_not_supported
            </span>
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold font-heading text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-tight truncate">
              {slot.label}
            </h3>
          </div>

          {/* Status Indicator (bold colored text only in CAPITAL LETTERS per rule.md) */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {overridden ? (
              <span className="text-xs font-black font-heading tracking-wider uppercase text-amber-600 dark:text-amber-400">
                CUSTOM OVERRIDE
              </span>
            ) : (
              <span className="text-xs font-bold font-heading tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
                BUNDLED DEFAULT
              </span>
            )}
          </div>

          <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate" title={slot.key}>
            {slot.key}
          </p>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Target: <span className="font-mono">{slot.width}px</span> · WebP q={slot.quality}
            {overridden && updatedAt && (
              <span className="ml-1.5">· Updated {new Date(updatedAt).toLocaleDateString()}</span>
            )}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleFile(file);
          }}
        />

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1b4d24] text-white hover:bg-[#153e1c] text-xs font-bold font-heading transition cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <span className={`material-symbols-outlined text-sm ${busy === 'upload' ? 'animate-spin' : ''}`}>
            {busy === 'upload' ? 'sync' : 'upload'}
          </span>
          <span>{overridden ? 'Replace' : 'Upload'}</span>
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setUrlDraft(overridden ? overrides[slot.key]?.url ?? '' : '');
            setUrlError('');
            setShowUrlInput((v) => !v);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold font-heading text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">link</span>
          <span>Paste URL</span>
        </button>

        {overridden && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleReset}
            title="Reset to bundled default image"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs font-bold font-heading text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50 ml-auto"
          >
            <span className={`material-symbols-outlined text-sm ${busy === 'reset' ? 'animate-spin' : ''}`}>
              {busy === 'reset' ? 'sync' : 'undo'}
            </span>
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* URL Drawer */}
      {showUrlInput && (
        <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => { setUrlDraft(e.target.value); setUrlError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveUrl(); } }}
            placeholder="https://res.cloudinary.com/… or /image/products/…"
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500 transition"
          />
          {urlError && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{urlError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={handleSaveUrl}
              className="px-3 py-1.5 rounded-xl bg-[#1b4d24] text-white text-xs font-bold font-heading hover:bg-[#153e1c] transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {busy === 'url' ? 'Saving…' : 'Save URL'}
            </button>
            <button
              type="button"
              onClick={() => setShowUrlInput(false)}
              className="px-3 py-1.5 text-xs font-bold font-heading text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 pt-1">
          <span className="material-symbols-outlined text-sm">error</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

const MediaLibraryPage: React.FC = () => {
  const { overrides, isOverridden, loading, failed, refresh } = useSiteAssets();
  const [productStats, setProductStats] = useState({ total: 0, custom: 0, archived: 0 });
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'categories' | 'highlights'>('all');
  const [lightbox, setLightbox] = useState<{ title: string; src: string } | null>(null);

  const overriddenCount = Object.keys(overrides).length;
  const totalSlots = SITE_ASSET_SLOTS.length;

  const handleStatsChange = useCallback((stats: { total: number; custom: number; archived: number }) => {
    setProductStats(stats);
  }, []);

  const openLightbox = (title: string, src: string) => {
    setLightbox({ title, src });
  };

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-50/70 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

          {/* ── Page Header ────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-3xl text-[#1b4d24] dark:text-emerald-400">
                  photo_library
                </span>
                <h1 className="text-xl sm:text-2xl font-bold font-heading text-zinc-900 dark:text-zinc-50 tracking-tight">
                  Media Library
                </h1>
                <span className="text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 ml-1">
                  ({overriddenCount + productStats.custom} active overrides)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                Manage site chrome graphics, category banners, carousel highlights, and product catalog photography in real time.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
              <button
                onClick={() => void refresh()}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1b4d24] text-white hover:bg-[#153e1c] text-xs sm:text-sm font-bold font-heading shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>{loading ? 'Refreshing…' : 'Refresh Overrides'}</span>
              </button>
            </div>
          </div>

          {/* ── KPI Overview Statistics (2 per row on mobile per rule.md section 4) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Site Chrome Assets */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">
                  aspect_ratio
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Site Chrome Slots
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {overriddenCount} <span className="text-sm font-semibold text-zinc-400">/ {totalSlots}</span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Customized storefront assets
              </p>
            </div>

            {/* Product Photography */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-teal-600 dark:text-teal-400">
                  inventory_2
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Product Photos
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {productStats.custom} <span className="text-sm font-semibold text-zinc-400">/ {productStats.total}</span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Products with custom photos
              </p>
            </div>

            {/* Total Overrides */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400">
                  cloud_done
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Total Custom Overrides
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                {overriddenCount + productStats.custom}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Stored in DB and Cloudinary
              </p>
            </div>

            {/* CDN Delivery */}
            <div className="p-4 sm:p-5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-xl text-blue-600 dark:text-blue-400">
                  auto_awesome
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 font-heading truncate">
                  Delivery & Format
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 leading-tight">
                WebP / CDN
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate mt-1">
                Optimized responsive assets
              </p>
            </div>
          </div>

          {/* ── Warning Banner ───────────────────────────────────────── */}
          {failed && (
            <div className="flex items-center gap-3 p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-sm font-semibold">
              <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400">warning</span>
              <div>
                Could not load site overrides from database. The public storefront is currently rendering bundled fallback defaults.
              </div>
            </div>
          )}

          {/* ── Section Navigation Tabs ──────────────────────────────── */}
          <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            {(
              [
                { key: 'all', label: 'All Media', icon: 'grid_view' },
                { key: 'products', label: `Products (${productStats.total})`, icon: 'inventory_2' },
                { key: 'categories', label: 'Shop by Category', icon: 'category' },
                { key: 'highlights', label: 'Daily Highlights', icon: 'auto_graph' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold font-heading transition cursor-pointer border ${
                  activeTab === tab.key
                    ? 'bg-[#1b4d24] text-white border-[#1b4d24] shadow-xs'
                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span className="material-symbols-outlined text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Product Images Section ───────────────────────────────── */}
          {(activeTab === 'all' || activeTab === 'products') && (
            <section className="bg-zinc-100/40 dark:bg-zinc-900/40 p-4 sm:p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <ProductImagesSection
                onStatsChange={handleStatsChange}
                onPreviewClick={openLightbox}
              />
            </section>
          )}

          {/* ── Site Chrome Asset Sections ───────────────────────────── */}
          {SITE_ASSET_SECTIONS.map((section) => {
            const isCategorySection = section === 'Shop by Category';
            const isHighlightSection = section === 'Daily Highlights';

            if (activeTab === 'products') return null;
            if (activeTab === 'categories' && !isCategorySection) return null;
            if (activeTab === 'highlights' && !isHighlightSection) return null;

            const sectionSlots = SITE_ASSET_SLOTS.filter((s) => s.section === section);
            const customInSection = sectionSlots.filter((s) => isOverridden(s.key)).length;

            return (
              <section
                key={section}
                className="bg-zinc-100/40 dark:bg-zinc-900/40 p-4 sm:p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-2xl text-[#1b4d24] dark:text-emerald-400">
                      {isCategorySection ? 'category' : 'auto_graph'}
                    </span>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold font-heading text-zinc-900 dark:text-zinc-100 tracking-tight">
                        {section}
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {customInSection} of {sectionSlots.length} assets customized on storefront
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionSlots.map((slot) => (
                    <AssetCard
                      key={slot.key}
                      slot={slot}
                      onPreviewClick={openLightbox}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* ── Documentation & Guidance Card ────────────────────────── */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl text-[#1b4d24] dark:text-emerald-400">
                help_outline
              </span>
              <h2 className="text-sm sm:text-base font-bold font-heading text-zinc-900 dark:text-zinc-100">
                How Storefront Media Overrides Work
              </h2>
            </div>
            <ul className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 space-y-2 list-disc pl-5">
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">BUNDLED DEFAULT:</strong> Renders the pre-converted WebP asset included in the application bundle. Zero external network calls.
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">CUSTOM OVERRIDE:</strong> Admin uploaded photo or URL saved to the database. Overrides take precedence immediately across all customer sessions.
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">RESET TO DEFAULT:</strong> Deletes the override from the database or clears <code className="font-mono text-zinc-800 dark:text-zinc-200">products.image_url</code>, reverting cleanly to the original bundled asset.
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">PRODUCT CACHING:</strong> Product catalog listings are cached on the server for 60 seconds; image updates in this panel apply locally immediately and will refresh globally within 1 minute.
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">SECURITY RESTRICTION:</strong> Payment QR codes, bank accounts, and transfer slips in receipts are hardcoded for financial safety and cannot be overridden here.
              </li>
            </ul>
          </div>

        </div>
      </div>

      {/* ── Lightbox Modal ───────────────────────────────────────────── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          style={{ background: 'rgba(10,30,10,0.75)', backdropFilter: 'blur(8px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center gap-4 animate-in"
          >
            <div className="w-full flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-bold font-heading text-zinc-900 dark:text-zinc-100 text-sm sm:text-base truncate">
                {lightbox.title}
              </h3>
              <button
                onClick={() => setLightbox(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition cursor-pointer"
                title="Close lightbox"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="w-full max-h-[60vh] flex items-center justify-center bg-zinc-100/70 dark:bg-zinc-800/60 rounded-xl p-4 overflow-hidden">
              <img
                src={lightbox.src}
                alt={lightbox.title}
                className="max-h-[50vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>

            <div className="w-full flex items-center justify-between gap-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
              <span className="truncate max-w-[80%]" title={lightbox.src}>{lightbox.src}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lightbox.src);
                }}
                className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
                <span>Copy URL</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default MediaLibraryPage;
