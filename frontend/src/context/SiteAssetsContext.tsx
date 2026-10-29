/**
 * frontend/src/context/SiteAssetsContext.tsx
 *
 * Loads the admin's image overrides once per page load and exposes a
 * `resolve(key)` helper that always returns something renderable.
 *
 * Resolution order, per slot:
 *   1. Admin override from GET /api/media (usually a Cloudinary URL)
 *   2. The bundled default declared in constants/siteAssets.ts, passed
 *      through optimizeLocalUrl so the backend optimizer still sees ?w=&q=
 *   3. Empty string — the caller should render its own placeholder
 *
 * Failure is always non-fatal: a network error or an unmigrated database
 * leaves every slot on its bundled default, which is exactly how the site
 * behaved before this feature existed. The storefront never blocks on it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { SITE_ASSET_BY_KEY } from '../constants/siteAssets';
import { optimizeLocalUrl } from '../utils/image';

interface SiteAssetOverride {
  asset_key: string;
  url: string;
  alt_text: string | null;
  updated_at?: string;
}

interface SiteAssetsValue {
  /** key -> override URL. Empty until the fetch resolves. */
  overrides: Record<string, SiteAssetOverride>;
  loading: boolean;
  /** True if the override table could not be read; used to warn admins. */
  failed: boolean;
  /** Reload from the API — called by the media page after each change. */
  refresh: () => Promise<void>;
  /** Final src for a slot, or '' if the key is unknown. */
  resolve: (key: string) => string;
  /** True when an admin has replaced this slot. */
  isOverridden: (key: string) => boolean;
}

const SiteAssetsContext = createContext<SiteAssetsValue>({
  overrides: {},
  loading: false,
  failed: false,
  refresh: async () => {},
  resolve: () => '',
  isOverridden: () => false,
});

export const SiteAssetsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [overrides, setOverrides] = useState<Record<string, SiteAssetOverride>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SiteAssetOverride[]>('/api/v1/media');
      if (res.success && Array.isArray(res.data)) {
        const next: Record<string, SiteAssetOverride> = {};
        for (const row of res.data) {
          if (row?.asset_key && row?.url) next[row.asset_key] = row;
        }
        setOverrides(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolve = useCallback(
    (key: string): string => {
      const override = overrides[key]?.url;
      if (override) return override;

      const slot = SITE_ASSET_BY_KEY[key];
      if (!slot) return '';
      return optimizeLocalUrl(slot.defaultUrl, slot.width, slot.quality);
    },
    [overrides],
  );

  const isOverridden = useCallback(
    (key: string) => Boolean(overrides[key]?.url),
    [overrides],
  );

  const value = useMemo<SiteAssetsValue>(
    () => ({ overrides, loading, failed, refresh, resolve, isOverridden }),
    [overrides, loading, failed, refresh, resolve, isOverridden],
  );

  return <SiteAssetsContext.Provider value={value}>{children}</SiteAssetsContext.Provider>;
};

/**
 * Read the asset table from any component. Call `resolve` during render; the
 * first paint uses bundled defaults and swaps to overrides when the request
 * resolves, so there is no layout shift for images that keep their aspect
 * ratio.
 */
export function useSiteAssets(): SiteAssetsValue {
  return useContext(SiteAssetsContext);
}

/** Convenience wrapper for the common "give me this one slot's src". */
export function useSiteAsset(key: string): string {
  return useSiteAssets().resolve(key);
}