/**
 * frontend/src/components/media/ProductImagesSection.tsx
 *
 * The "Product Images" half of /dashboard/media.
 *
 * Why this is a component and not more rows in SITE_ASSET_SLOTS
 * ------------------------------------------------------------
 * Site chrome images are a fixed list compiled into the bundle, so their
 * defaults can live in constants/siteAssets.ts. Products are database rows
 * that get created, renamed, archived and deleted at runtime, so they cannot
 * be a compile-time list — they are fetched, and their "default" is whatever
 * products.image_url already holds.
 *
 * Storage
 * -------
 * Product images live in `products.image_url`, NOT in the site_assets table.
 * The storefront already reads that column through resolveProductImage(), so
 * editing it here needs no storefront change at all.
 *
 * Reset semantics
 * ---------------
 * Clearing image_url makes resolveProductImage() fall through to the bundled
 * getLocalImage() name match, which is the behaviour that existed before any
 * admin ever uploaded a photo. That is the correct definition of "default"
 * for a product, and it is why Reset is a PATCH to null rather than a delete.
 *
 * Cache note
 * ----------
 * GET /products is wrapped in a 60s apiCache on the server. Refetching after
 * a save could hand back the pre-save list and look like the upload failed, so
 * each card patches its own row into local state on success instead.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveProductImage } from '../../utils/image';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 100; // backend clamps limit to 100

interface MediaProduct {
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

/** Mirrors the isDefault/isCustom split used for site chrome slots. */
function isBundled(url: string | null): boolean {
  if (!url || url.trim() === '') return true;
  return url.startsWith('/image/') || url.startsWith('/uploads/');
}

const ProductImageCard: React.FC<{
  product: MediaProduct;
  onSaved: (id: string, url: string | null) => void;
}> = ({ product, onSaved }) => {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlError, setUrlError] = useState('');
  const [busy, setBusy] = useState<'upload' | 'url' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const custom = !isBundled(product.image_url);
  // Preview through the real resolver so the admin sees exactly what the
  // storefront renders, including the getLocalImage() fallback.
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
        // Reuse the existing product-image upload endpoint rather than
        // adding a second Cloudinary path — same magic-byte checks, same
        // folder, one less thing to keep in sync.
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
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 shrink-0 rounded-xl border border-[var(--border)] bg-white flex items-center justify-center p-1.5 overflow-hidden">
          {preview ? (
            <img
              src={preview}
              alt={product.name}
              loading="lazy"
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="material-symbols-outlined text-[var(--fg-muted)] text-[28px]">image_not_supported</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-[var(--fg)] text-sm leading-tight">{product.name}</h3>
            {custom ? (
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Custom
              </span>
            ) : (
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--fg-muted)]">
                Default
              </span>
            )}
            {!product.active && (
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                Archived
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--fg-muted)] truncate">
            {product.package_size} · ETB {Number(product.price).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0D2E10] text-white text-xs font-bold hover:bg-[#1a4a1f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className={`material-symbols-outlined text-[15px] ${busy === 'upload' ? 'animate-spin' : ''}`}>
            {busy === 'upload' ? 'progress_activity' : 'upload'}
          </span>
          {custom ? 'Replace' : 'Upload'}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setUrlDraft(custom ? product.image_url ?? '' : '');
            setUrlError('');
            setShowUrlInput((v) => !v);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--fg)] hover:bg-[var(--accent)]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[15px]">link</span>
          Paste URL
        </button>

        {custom && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleReset}
            title="Clear image_url so the storefront falls back to the bundled photo"
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


const ProductImagesSection: React.FC = () => {
  const [products, setProducts] = useState<MediaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Two calls because the endpoint filters on active/inactive but has no
      // "all" mode: omitting ?active returns active only, ?active=false
      // returns archived only. Admins manage archived products too.
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
      setProducts(
        [...active, ...archived].filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        })
      );
    } catch (err: any) {
      setError(err?.message ?? 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchProducts(); }, [fetchProducts]);

  /**
   * Applied in place instead of re-fetching: GET /products is served from a
   * 60s server-side apiCache, so a refetch could return the pre-save list.
   */
  const handleSaved = useCallback((id: string, url: string | null) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, image_url: url } : p)));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.package_size.toLowerCase().includes(q)
    );
  }, [products, query]);

  const customCount = products.filter((p) => !isBundled(p.image_url)).length;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--fg-muted)]">
          Product Images
          <span className="ml-2 font-mono text-xs normal-case text-[var(--accent)]">
            {customCount} of {products.length} customised
          </span>
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="bg-[var(--input-bg,#fff)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
        />
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-[132px] bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 text-center">
          <span className="material-symbols-outlined text-[48px] text-red-300 block mb-2">error_outline</span>
          <p className="text-red-600 font-bold">{error}</p>
          <button onClick={() => void fetchProducts()} className="mt-3 text-sm text-[var(--accent)] underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-12 text-center">
          <span className="material-symbols-outlined text-[56px] text-[var(--fg-muted)] block mb-3">
            inventory_2
          </span>
          <p className="text-[var(--fg-muted)] font-semibold">
            {products.length === 0 ? 'No products yet.' : `No products match “${query}”.`}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductImageCard key={p.id} product={p} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductImagesSection;