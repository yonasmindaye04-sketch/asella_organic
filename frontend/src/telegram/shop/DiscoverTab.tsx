/**
 * frontend/src/telegram/shop/DiscoverTab.tsx
 * Discover tab: category browse, best sellers and delivery/payment guidance.
 */

import { useMemo } from 'react';
import type { GroupedProduct } from '../../hooks/useProducts';
import { resolveProductImage } from '../../utils/image';
import { STORE_CATEGORIES, selectDefaultVariant } from './StoreTab';
import { formatEtb } from './types';

export interface DiscoverTabProps {
  products: GroupedProduct[];
  onOpenProduct: (product: GroupedProduct) => void;
  onBrowseCategory: (categoryId: string) => void;
}

const CARE_TIPS = [
  {
    title: 'Start with one product',
    body: 'Add a single supplement to your routine for two weeks before stacking another.',
  },
  {
    title: 'Steep your tea',
    body: 'Allow 5 to 8 minutes in hot water. Longer steeping pulls bitterness out of dried leaves.',
  },
  {
    title: 'Store it sealed',
    body: 'Keep powders and oils away from direct sunlight to protect their active compounds.',
  },
];

const PAYMENT_METHODS = ['Telebirr', 'CBE Birr', 'Cash on delivery'];

export function DiscoverTab({ products, onOpenProduct, onBrowseCategory }: DiscoverTabProps) {
  const bestSellers = useMemo(
    () => products.filter((product) => Boolean(product.featured)).slice(0, 6),
    [products]
  );

  const popularByStock = useMemo(
    () =>
      [...products]
        .sort(
          (a, b) =>
            b.variants.reduce((sum, v) => sum + v.inventory_quantity, 0) -
            a.variants.reduce((sum, v) => sum + v.inventory_quantity, 0)
        )
        .slice(0, 3),
    [products]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">Discover</h1>
        <p className="mt-0.5 text-sm text-ink2">
          Learn what fits your routine, sourced from the Ethiopian highlands.
        </p>
      </div>

      <section>
        <h2 className="mb-2 font-heading text-base font-bold text-ink">Shop by category</h2>
        <ul className="grid grid-cols-3 gap-2">
          {STORE_CATEGORIES.filter((category) => category.id !== 'all').map((category) => (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => onBrowseCategory(category.id)}
                /* Soft tint gives the tap target an affordance without putting a
                   plate on the icon itself, plus hover/press feedback. */
                className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-xl bg-brand-50 p-3 text-center transition-all duration-200 hover:bg-brand-100 active:scale-95"
              >
                {/* Bare bold icon, matching the Store tab chips — no resting
                    plate or border, so the glyph carries the meaning. */}
                <span className="flex h-10 w-10 items-center justify-center text-ink [&>i]:text-[16px]">
                  {category.icon}
                </span>
                <span className="text-xs font-semibold leading-tight text-ink2">
                  {category.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {bestSellers.length > 0 && (
        <section>
          <h2 className="mb-2 font-heading text-base font-bold text-ink">Best sellers</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {bestSellers.map((product) => {
              const variant = selectDefaultVariant(product);
              const imageUrl = resolveProductImage(product.image_url, product.name);

              return (
                <li key={product.name} className="w-36 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenProduct(product)}
                    className="w-full overflow-hidden rounded-xl border border-line bg-panel text-left shadow-sm"
                  >
                    <span className="block h-24 w-full bg-brand-50">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="block p-2.5">
                      <span className="line-clamp-2 block text-sm font-semibold leading-snug text-ink">
                        {product.name}
                      </span>
                      <span className="mt-1 block font-mono text-sm font-bold text-brand-900">
                        {formatEtb(variant?.price ?? 0)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {popularByStock.length > 0 && (
        <section>
          <h2 className="mb-2 font-heading text-base font-bold text-ink">In high demand</h2>
          <ul className="space-y-2">
            {popularByStock.map((product) => {
              const variant = selectDefaultVariant(product);

              return (
                <li key={product.name}>
                  <button
                    type="button"
                    onClick={() => onOpenProduct(product)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-2.5 text-left transition-transform duration-200 active:scale-[0.98]"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                      {resolveProductImage(product.image_url, product.name) ? (
                        <img
                          src={resolveProductImage(product.image_url, product.name)}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {product.name}
                      </span>
                      {product.tag && (
                        <span className="block text-xs font-medium text-muted">{product.tag}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-bold text-brand-900">
                      {formatEtb(variant?.price ?? 0)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-heading text-base font-bold text-ink">How to use them</h2>
        <ul className="space-y-2">
          {CARE_TIPS.map((tip) => (
            <li key={tip.title} className="rounded-xl border border-line bg-panel p-3">
              <p className="text-sm font-bold text-ink">{tip.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink2">{tip.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-panel p-3">
        <p className="text-sm font-bold text-ink">Payment on delivery</p>
        <p className="mt-0.5 text-sm text-ink2">
          Pay our delivery rider when your order arrives.
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((method) => (
            <li
              key={method}
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-ink2"
            >
              {method}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}