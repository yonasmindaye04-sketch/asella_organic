/**
 * frontend/src/pages/MediaLibraryPage.tsx
 * /dashboard/media — swap any storefront "site chrome" image without a redeploy.
 *
 * The page is generated from SITE_ASSET_SLOTS (constants/siteAssets.ts), which
 * is the same list the storefront resolves against. Adding a slot there adds
 * a card here with no change to this file.
 *
 * Every slot always renders *something*. "Default" means the image bundled
 * in public/ (no row in site_assets); "Custom" means an admin override is
 * stored. Reset deletes the row and hands the slot back to its default.
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

const AssetCard: React.FC<{ slot: SiteAssetSlot }> = ({ slot }) => {
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
        // Reload the shared table so the storefront and this page agree.
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
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {/* Preview */}
        <div className="w-20 h-20 shrink-0 rounded-xl border border-[var(--border)] bg-white flex items-center justify-center p-1.5 overflow-hidden">
          {preview ? (
            <img
              src={preview}
              alt={slot.label}
              loading="lazy"
              className="w-full h-full object-contain"
              onError={(e) => {
                // A bad pasted URL must not leave a broken-image glyph.
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          ) : (
            <span className="material-symbols-outlined text-[var(--fg-muted)] text-[28px]">image_not_supported</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-[var(--fg)] text-sm leading-tight">{slot.label}</h3>
            {overridden ? (
              <span className="text-[10px] font-mono font-bold uppercase text-amber-700 dark:text-amber-400">
                Custom
              </span>
            ) : (
              <span className="text-[10px] font-mono font-bold uppercase text-gray-600 dark:text-gray-400">
                Default
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-[var(--fg-muted)] truncate" title={slot.key}>{slot.key}</p>
          {overridden && updatedAt && (
            <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
              Updated {new Date(updatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so re-picking the same file still fires a change event.
            e.target.value = '';
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0D2E10] text-white text-xs font-bold hover:bg-[#1a4a1f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className={`material-symbols-outlined text-[15px] ${busy === 'upload' ? 'animate-spin' : ''}`}>
            {busy === 'upload' ? 'progress_activity' : 'upload'}
          </span>
          {overridden ? 'Replace' : 'Upload'}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setUrlDraft(overridden ? overrides[slot.key]?.url ?? '' : '');
            setUrlError('');
            setShowUrlInput((v) => !v);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--fg)] hover:bg-[var(--accent)]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[15px]">link</span>
          Paste URL
        </button>

        {overridden && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-[15px] ${busy === 'reset' ? 'animate-spin' : ''}`}>
              {busy === 'reset' ? 'progress_activity' : 'undo'}
            </span>
            Reset
          </button>
        )}
      </div>

      {showUrlInput && (
        <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border)]">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => { setUrlDraft(e.target.value); setUrlError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveUrl(); } }}
            placeholder="https://res.cloudinary.com/…  or  /image/products/…"
            className="w-full bg-[var(--input-bg,#fff)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
          />
          {urlError && <p className="text-[11px] font-semibold text-red-600">{urlError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={handleSaveUrl}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'url' ? 'Saving…' : 'Save URL'}
            </button>
            <button
              type="button"
              onClick={() => setShowUrlInput(false)}
              className="px-3 py-1.5 text-xs font-bold text-[var(--fg-muted)] hover:text-[var(--fg)] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>{error}
        </p>
      )}
    </div>
  );
};


const MediaLibraryPage: React.FC = () => {
  const { overrides, loading, failed, refresh } = useSiteAssets();
  const overriddenCount = Object.keys(overrides).length;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-[#f7faf7] font-sans overflow-hidden">
        {/* Dark Green Header */}
        <header className="flex items-center justify-between px-5 py-3 bg-[#1b3d1e] shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#2e7d32] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[16px]">perm_media</span>
            </div>
            <h1 className="text-white font-black text-[15px] tracking-wide">Asella — Media Library</h1>
            <span className="text-white/50 text-[11px] font-mono ml-2 hidden md:inline">Swap any image on the public site — site chrome and every product</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refresh()} className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-[1.5px] border-white/20 text-white rounded-md text-[12px] font-bold hover:bg-white/10 hover:border-white/50 transition whitespace-nowrap">
              <span className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}>refresh</span> Refresh
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6">
          <div className="max-w-6xl mx-auto">

        {failed && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold border bg-amber-50 border-amber-200 text-amber-900">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            Could not load overrides — the site is still showing its bundled defaults. If you have
            never run the media migration, run <code className="font-mono">npm run db:migrate</code>.
          </div>
        )}

        <div className="mb-6 text-xs text-[var(--fg-muted)]">
          <span className="font-mono font-bold text-[var(--accent)]">{overriddenCount}</span> of{' '}
          <span className="font-mono font-bold">{SITE_ASSET_SLOTS.length}</span> images customised
        </div>

        <ProductImagesSection />

        {SITE_ASSET_SECTIONS.map((section) => (
          <div key={section} className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--fg-muted)] mb-3">
              {section}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SITE_ASSET_SLOTS.filter((s) => s.section === section).map((slot) => (
                <AssetCard key={slot.key} slot={slot} />
              ))}
            </div>
          </div>
        ))}

        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-sm p-5">
          <h2 className="text-sm font-bold text-[var(--fg)] flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[18px] text-[var(--accent)]">info</span>
            How this works
          </h2>
          <ul className="text-xs text-[var(--fg-muted)] space-y-1 list-disc pl-5">
            <li><strong className="text-[var(--fg)]">Default</strong> means the image bundled with the site.</li>
            <li><strong className="text-[var(--fg)]">Custom</strong> means an admin replaced it; Reset restores the default.</li>
            <li>Product photos edit <code className="font-mono">products.image_url</code>; Resetting clears it so the storefront falls back to the bundled photo for that product.</li>
            <li>Product changes can take up to a minute to appear on the storefront — the products endpoint is cached for 60 seconds.</li>
            <li>Payment QR codes on receipts are deliberately not editable here.</li>
          </ul>
        </div>
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MediaLibraryPage;