/**
 * frontend/src/constants/siteAssets.ts
 *
 * The single source of truth for every storefront image an admin can swap
 * without a redeploy.
 *
 * This file serves two audiences:
 *
 *   1. The storefront — `defaultUrl` is what renders until an admin
 *      overrides the slot. Because the defaults live here and not inline in
 *      components, a slot and its fallback can never drift apart.
 *   2. /dashboard/media — the admin UI builds its layout from this list, so a
 *      new slot becomes editable the moment it is added, with no changes to
 *      the page.
 *
 * Keys are dotted lowercase slugs. They are the database primary key, so
 * treat a published key as permanent: renaming one silently detaches every
 * override already stored against it.
 *
 * Deliberately NOT listed: the payment QR code and bank-transfer slip in
 * OrderReceipt.tsx. Those are payment instructions, not marketing art — a
 * mistaken swap there would send customers' money to the wrong account, and
 * they should stay a deliberate code change reviewed by a human.
 */

export interface SiteAssetSlot {
  /** Stable database key. Immutable once shipped. */
  key: string;
  /** Grouping heading in the admin UI. */
  section: string;
  /** Human label in the admin UI. */
  label: string;
  /** Path bundled in public/. Used whenever there is no admin override. */
  defaultUrl: string;
  /** Rendered width, in px, at the largest breakpoint. */
  width: number;
  /** Passed to the ?q= optimizer for bundled defaults. */
  quality: number;
}

export const SITE_ASSET_SLOTS: SiteAssetSlot[] = [
  // ── Home › Shop by Category ─────────────────────────────────────────────
  // Source images pre-converted to WebP at 224px (scripts/convert-images.js).
  { key: 'category.powders',       section: 'Shop by Category', label: 'Powders',       defaultUrl: '/image/products/Moringa 200g,500g and 1kg.webp',                              width: 224, quality: 78 },
  { key: 'category.oils',          section: 'Shop by Category', label: 'Oils',          defaultUrl: '/image/products/Blackseed Oil ( 30ml ).webp',                                     width: 224, quality: 78 },
  { key: 'category.seeds',         section: 'Shop by Category', label: 'Seeds',         defaultUrl: '/image/products/Chiaseed 250g and 1kg.webp',                                      width: 224, quality: 78 },
  { key: 'category.supplements',   section: 'Shop by Category', label: 'Supplements',   defaultUrl: '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).webp',                      width: 224, quality: 78 },
  { key: 'category.herbsSpices',   section: 'Shop by Category', label: 'Herbs & Spices',defaultUrl: '/image/products/Erid Turmeric ( 220g ).webp',                                        width: 224, quality: 78 },
  { key: 'category.essentialOils', section: 'Shop by Category', label: 'Essential Oils',defaultUrl: '/image/products/Frankincense Oil  30ml and 60 ml.webp',                            width: 224, quality: 78 },
  { key: 'category.naturalBeauty', section: 'Shop by Category', label: 'Natural Beauty',defaultUrl: '/image/products/Qasil Powder ( 200g ).webp',                                         width: 224, quality: 78 },
  { key: 'category.wellness',      section: 'Shop by Category', label: 'Wellness',      defaultUrl: '/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).webp',                    width: 224, quality: 78 },

  // ── Home › Daily Highlights carousel ─────────────────────────────────────
  // Cards render at w-400px (ProductCard). Source images are pre-converted to
  // WebP at 400px width (see scripts/convert-images.js), so the backend
  // optimizer's ignored ?w=&q= params no longer matter — files are ~15KB each.
  { key: 'highlight.moringa',      section: 'Daily Highlights', label: 'Moringa',       defaultUrl: '/image/dailyimages/Moringa Powder.webp',        width: 400, quality: 75 },
  { key: 'highlight.shilajitGel',  section: 'Daily Highlights', label: 'Shilajit Gel',  defaultUrl: '/image/dailyimages/Shilajit.webp',              width: 400, quality: 75 },
  { key: 'highlight.ashwagandhaPowder', section: 'Daily Highlights', label: 'Ashwagandha Powder', defaultUrl: '/image/dailyimages/Ashwegenda powder.webp', width: 400, quality: 75 },
  { key: 'highlight.ashwagandhaTablet', section: 'Daily Highlights', label: 'Ashwagandha Tablet', defaultUrl: '/image/dailyimages/Aswhwegnda Tablet.webp',   width: 400, quality: 75 },
  { key: 'highlight.blackseedOil', section: 'Daily Highlights', label: 'Blackseed Oil', defaultUrl: '/image/dailyimages/Black seed  oil.webp',       width: 400, quality: 75 },
  { key: 'highlight.chiaSeed',     section: 'Daily Highlights', label: 'Chia Seed',     defaultUrl: '/image/dailyimages/Chiaseed.webp',              width: 400, quality: 75 },
  { key: 'highlight.frankincense', section: 'Daily Highlights', label: 'Frankincense Oil', defaultUrl: '/image/dailyimages/Franchinses Oil.webp',      width: 400, quality: 75 },
  { key: 'highlight.hibiscus',     section: 'Daily Highlights', label: 'Hibiscus',      defaultUrl: '/image/dailyimages/Hibscus.webp',               width: 400, quality: 75 },
  { key: 'highlight.kerebeOil',    section: 'Daily Highlights', label: 'Kerebe Oil',    defaultUrl: '/image/dailyimages/Kerbe Oil.webp',             width: 400, quality: 75 },
  { key: 'highlight.kesilPowder',  section: 'Daily Highlights', label: 'Kesil Powder',  defaultUrl: '/image/dailyimages/Kesil Powder.webp',          width: 400, quality: 75 },
  { key: 'highlight.turmeric',     section: 'Daily Highlights', label: 'Turmeric',      defaultUrl: '/image/dailyimages/Turemic Erid.webp',          width: 400, quality: 75 },
];

/** key -> slot, for O(1) lookups from the storefront. */
export const SITE_ASSET_BY_KEY: Record<string, SiteAssetSlot> = Object.fromEntries(
  SITE_ASSET_SLOTS.map((slot) => [slot.key, slot]),
);

/** Section headings in display order, derived from the slot list. */
export const SITE_ASSET_SECTIONS: string[] = [
  ...new Set(SITE_ASSET_SLOTS.map((slot) => slot.section)),
];