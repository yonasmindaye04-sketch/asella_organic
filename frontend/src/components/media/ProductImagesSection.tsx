/**
 * frontend/src/components/media/ProductImagesSection.tsx
 *
 * The "Product Images" section of /dashboard/media.
 * Allows managing, uploading, overriding, and resetting product images in products.image_url.
 *
 * Fully redesigned to match Asella Organic design system & rule.md:
 *   - Bare icons without background tiles
 *   - Bold colored text only in CAPITAL LETTERS for status indicators
 *   - Full dark/light mode compatibility with high contrast
 *   - Zero emojis per rule.md
 *   - Mobile responsive layout with touch-friendly hit targets
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveProductImage } from '../../utils/image';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 100;

export interface MediaProduct {
  id: string;
  name: string;
  package_size: string;
  price: number | string;
  image_url: string | null;
  active: boolean;
}

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

function isBundled(url: string | null): boolean {
  if (!url || url.trim() === '') return true;
  return url.startsWith('/image/') || url.startsWith('/uploads/');
}

interface ProductImageCardProps {
  product: MediaProduct;
  onSaved: (id: string, url: string | null) => void;
  onPreviewClick?: (title: string, src: string) => void;
}

const ProductImageCard: React.FC<ProductImageCardProps> = ({ product, onSaved, onPreviewClick }) => {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState('');
  const [busy, setBusy] = useState<'upload' | 'url' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const custom = !isBundled(product.image_url);
  const preview = resolveProductImage(product.image_url, product.name, { width: 200, quality: 80 });

  const patch = useCallback(
    async (url: string | null): Promise<Error | null> => {
      const res = await fetch(`${BASE_URL}/api/v1/products/${product.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url }),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        return new Error(json.error ?? 'Could not save the image.');
      }
      onSaved(product.id, url);
      return null;
    },
    [product.id, onSaved],
  );

  const handleFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }
    void (async () => {
      setBusy('upload');
      setError('');
      try {
        const body = new FormData();
        body.append('image', file);
        const res = await fetch(`${BASE_URL}/api/v1/upload/image`, {
          method: 'POST',
          credentials: 'include',
          body,
        });
        const json = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !json.success) {
          setError(json.error ?? 'Upload failed.');
          return;
        }
        const failure = await patch(json.data.url);
        if (failure) setError(failure.message);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(null);
      }
    })();
  };

  const handleSaveUrl = () => {
    const problem = validateUrl(urlDraft);
    if (problem) {
      setUrlError(problem);
      return;
    }
    void (async () => {
      setBusy('url');
      setError('');
      try {
        const failure = await patch(urlDraft.trim());
        if (failure) setError(failure.message);
        else {
          setUrlDraft('');
          setShowUrlInput(false);
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(null);
      }
    })();
  };

  const handleReset = () => {
    void (async () => {
      setBusy('reset');
      setError('');
      try {
        const failure = await patch(null);
        if (failure) setError(failure.message);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition flex flex-col justify-between gap-3.5">
      <div className="flex items-start gap-3.5">
        {/* Preview Thumbnail */}
        <div
          onClick={() => { if (preview && onPreviewClick) onPreviewClick(product.name, preview); }}
          className={`w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-100/70 dark:bg-zinc-800/60 p-1.5 flex items-center justify-center overflow-hidden relative group ${
            preview && onPreviewClick ? 'cursor-pointer' : ''
          }`}
          title={preview ? 'Click to inspect image' : undefined}
        >
          {preview ? (
            <>
              <img
                src={preview}
                alt={product.name}
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

        {/* Product Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold font-heading text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-tight truncate">
              {product.name}
            </h3>
          </div>

          {/* Status Indicator (bold colored text in CAPITAL LETTERS per rule.md) */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {custom ? (
              <span className="text-xs font-black font-heading tracking-wider uppercase text-amber-600 dark:text-amber-400">
                CUSTOM PHOTO
              </span>
            ) : (
              <span className="text-xs font-bold font-heading tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
                BUNDLED DEFAULT
              </span>
            )}
            {!product.active && (
              <span className="text-xs font-black font-heading tracking-wider uppercase text-rose-600 dark:text-rose-400">
                ARCHIVED
              </span>
            )}
          </div>

          <p className="text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400 truncate">
            {product.package_size} · ETB {Number(product.price).toFixed(2)}
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
          <span>{custom ? 'Replace' : 'Upload'}</span>
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setUrlDraft(custom ? product.image_url ?? '' : '');
            setUrlError('');
            setShowUrlInput((v) => !v);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold font-heading text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">link</span>
          <span>Paste URL</span>
        </button>

        {custom && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleReset}
            title="Clear custom image and fall back to bundled photo"
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

export interface ProductImagesSectionProps {
  onStatsChange?: (stats: { total: number; custom: number; archived: number }) => void;
  onPreviewClick?: (title: string, src: string) => void;
}

const ProductImagesSection: React.FC<ProductImagesSectionProps> = ({ onStatsChange, onPreviewClick }) => {
  const [products, setProducts] = useState<MediaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'custom' | 'default' | 'archived'>('all');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const collect = async (qs: string): Promise<MediaProduct[]> => {
        const first = await fetch(
          `${BASE_URL}/api/v1/products?limit=${PAGE_SIZE}&page=1${qs}`,
          { credentials: 'include' }
        ).then((r) => r.json());
        if (!first.success) throw new Error(first.error ?? 'Failed to load products.');

        const pages: MediaProduct[] = first.data ?? [];
        const totalPages: number = first.meta?.pages ?? 1;
        for (let page = 2; page <= totalPages; page++) {
          const next = await fetch(
            `${BASE_URL}/api/v1/products?limit=${PAGE_SIZE}&page=${page}${qs}`,
            { credentials: 'include' }
          ).then((r) => r.json());
          if (next.success) pages.push(...(next.data ?? []));
        }
        return pages;
      };

      const [active, archived] = await Promise.all([
        collect(''),
        collect('&active=false'),
      ]);

      const seen = new Set<string>();
      const combined = [...active, ...archived].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      setProducts(combined);

      if (onStatsChange) {
        const customCount = combined.filter((p) => !isBundled(p.image_url)).length;
        const archivedCount = combined.filter((p) => !p.active).length;
        onStatsChange({
          total: combined.length,
          custom: customCount,
          archived: archivedCount,
        });
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [onStatsChange]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const handleSaved = useCallback((id: string, url: string | null) => {
    setProducts((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, image_url: url } : p));
      if (onStatsChange) {
        const customCount = updated.filter((p) => !isBundled(p.image_url)).length;
        const archivedCount = updated.filter((p) => !p.active).length;
        onStatsChange({
          total: updated.length,
          custom: customCount,
          archived: archivedCount,
        });
      }
      return updated;
    });
  }, [onStatsChange]);

  const customCount = products.filter((p) => !isBundled(p.image_url)).length;
  const defaultCount = products.length - customCount;
  const archivedCount = products.filter((p) => !p.active).length;

  const filtered = useMemo(() => {
    let result = products;

    if (filterMode === 'custom') {
      result = result.filter((p) => !isBundled(p.image_url));
    } else if (filterMode === 'default') {
      result = result.filter((p) => isBundled(p.image_url));
    } else if (filterMode === 'archived') {
      result = result.filter((p) => !p.active);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.package_size.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, query, filterMode]);

  return (
    <div className="space-y-4">
      {/* Section Header & Search Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-2xl text-[#1b4d24] dark:text-emerald-400">
            inventory_2
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-bold font-heading text-zinc-900 dark:text-zinc-100 tracking-tight">
              Product Catalog Photography
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {customCount} of {products.length} products have custom photos stored in database.
            </p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            {(
              [
                { key: 'all', label: `All (${products.length})` },
                { key: 'custom', label: `Custom (${customCount})` },
                { key: 'default', label: `Default (${defaultCount})` },
                { key: 'archived', label: `Archived (${archivedCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterMode(tab.key)}
                className={`px-2.5 py-1 text-xs font-bold font-heading rounded-lg transition cursor-pointer ${
                  filterMode === tab.key
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base pointer-events-none">
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-1.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-[#1b4d24] dark:focus:border-emerald-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Grid of Product Cards */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-rose-500 block">
            error_outline
          </span>
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
          <button
            onClick={() => void fetchProducts()}
            className="px-4 py-2 rounded-xl bg-[#1b4d24] text-white text-xs font-bold font-heading hover:bg-[#153e1c] transition"
          >
            Retry Loading Products
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-2">
          <span className="material-symbols-outlined text-4xl text-zinc-400 block opacity-50">
            inventory_2
          </span>
          <p className="text-sm font-bold font-heading text-zinc-900 dark:text-zinc-100">
            {products.length === 0 ? 'No products registered in catalog.' : `No products match “${query}”.`}
          </p>
          {query && (
            <button
              onClick={() => { setQuery(''); setFilterMode('all'); }}
              className="text-xs font-bold text-[#1b4d24] dark:text-emerald-400 underline cursor-pointer"
            >
              Clear search & filters
            </button>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductImageCard
              key={p.id}
              product={p}
              onSaved={handleSaved}
              onPreviewClick={onPreviewClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductImagesSection;
