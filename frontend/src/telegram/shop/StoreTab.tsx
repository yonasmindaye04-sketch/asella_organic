/**
 * frontend/src/telegram/shop/StoreTab.tsx
 * Store tab: search, category circles, product grid and filter bar.
 */

import React, { useMemo } from 'react';
import type { GroupedProduct, Variant } from '../../hooks/useProducts';
import { resolveProductImage } from '../../utils/image';
import { formatEtb, type CartItem } from './types';

export interface CategoryDefinition {
  id: string;
  label: string;
  icon: React.ReactNode;
  matches: (product: GroupedProduct) => boolean;
}

export const STORE_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'all',
    label: 'All products',
    icon: <i className="fa-solid fa-grip" aria-hidden="true" />,
    matches: () => true,
  },
  {
    id: 'bestsellers',
    label: 'Best Sellers',
    icon: <i className="fa-solid fa-star" aria-hidden="true" />,
    matches: (product) => Boolean(product.featured),
  },
  {
    id: 'superfood',
    label: 'Superfood',
    icon: <i className="fa-solid fa-leaf" aria-hidden="true" />,
    matches: (product) => product.tag?.toLowerCase() === 'superfood',
  },
  {
    id: 'oils',
    label: 'Oils',
    icon: <i className="fa-solid fa-droplet" aria-hidden="true" />,
    matches: (product) => product.tag?.toLowerCase() === 'oils',
  },
  {
    id: 'herbs',
    label: 'Herbs',
    icon: <i className="fa-solid fa-seedling" aria-hidden="true" />,
    matches: (product) => product.tag?.toLowerCase() === 'herbs',
  },
  {
    id: 'traditional',
    label: 'Traditional',
    icon: <i className="fa-solid fa-spa" aria-hidden="true" />,
    matches: (product) => product.tag?.toLowerCase() === 'traditional',
  },
];

export type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'name';

const SORT_LABELS: Record<SortKey, string> = {
  recommended: 'Recommended',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  name: 'Name A-Z',
};

export function selectDefaultVariant(product: GroupedProduct): Variant | undefined {
  return (
    product.variants.find((v) => Number(v.active) !== 0 && v.inventory_quantity > 0) ??
    product.variants[0]
  );
}

function variantPrice(product: GroupedProduct, variantId: string | undefined): number {
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  return Number(variant?.price ?? 0);
}

function totalStock(product: GroupedProduct): number {
  return product.variants.reduce((sum, v) => sum + (Number(v.active) === 0 ? 0 : v.inventory_quantity), 0);
}

export interface ProductGridProps {
  products: GroupedProduct[];
  selectedVariants: Record<string, string>;
  cart: CartItem[];
  onSelectVariant: (productName: string, variantId: string) => void;
  onOpenProduct: (product: GroupedProduct) => void;
  onAddToCart: (product: GroupedProduct, variant: Variant) => void;
  onIncrement: (variantId: string) => void;
}

export function ProductGrid({
  products,
  selectedVariants,
  cart,
  onSelectVariant,
  onOpenProduct,
  onAddToCart,
  onIncrement,
}: ProductGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {products.map((product) => {
        const variantId = selectedVariants[product.name] ?? product.variants[0]?.id;
        const activeVariant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
        const imageUrl = resolveProductImage(product.image_url, product.name);
        const inStock = (activeVariant?.inventory_quantity ?? 0) > 0;
        const cartItem = cart.find((item) => item.productId === activeVariant?.id);
        const isPopular = Boolean(product.featured);

        return (
          <li
            key={product.name}
            className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm"
          >
            {isPopular && (
              <span className="absolute right-0 top-3 z-10 rounded-l bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                Popular
              </span>
            )}

            <button
              type="button"
              onClick={() => onOpenProduct(product)}
              className="relative block h-32 w-full bg-brand-50"
              aria-label={`View ${product.name}`}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={product.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-mono text-xs text-muted">
                  Asella
                </span>
              )}
            </button>

            <div className="flex flex-1 flex-col p-2.5">
              {product.tag && (
                <span className="mb-1 self-start rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink2">
                  {product.tag}
                </span>
              )}

              <button
                type="button"
                onClick={() => onOpenProduct(product)}
                className="line-clamp-2 text-left text-sm font-semibold leading-snug text-ink transition-transform duration-200 active:scale-95"
              >
                {product.name}
              </button>

              {product.variants.length > 1 && (
                <select
                  value={variantId ?? ''}
                  onChange={(event) => onSelectVariant(product.name, event.target.value)}
                  aria-label={`Package size for ${product.name}`}
                  className="mt-1.5 w-full rounded-md border border-line bg-cream px-1.5 py-1 text-xs text-ink2 focus:border-brand-700 focus:outline-none"
                >
                  {product.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.package_size}
                    </option>
                  ))}
                </select>
              )}

              <div className="mt-auto pt-2">
                <p className="font-mono text-sm font-bold text-brand-900">
                  {formatEtb(variantPrice(product, variantId))}
                </p>

                <button
                  type="button"
                  disabled={!inStock}
                  onClick={() => activeVariant && onAddToCart(product, activeVariant)}
                  className={`mt-1.5 w-full rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    inStock
                      ? 'bg-brand-solid text-white hover:brightness-95'
                      : 'cursor-not-allowed bg-line text-muted'
                  }`}
                >
                  {inStock ? 'Add to Cart' : 'Unavailable'}
                </button>

                {cartItem && (
                  <button
                    type="button"
                    onClick={() => activeVariant && onIncrement(activeVariant.id)}
                    className="mt-1.5 w-full rounded-lg border border-brand-200 bg-brand-50 py-1.5 text-xs font-semibold text-brand-800"
                  >
                    {cartItem.quantity} in cart
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export interface StoreTabProps extends ProductGridProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  inStockOnly: boolean;
  onInStockOnlyChange: (value: boolean) => void;
  totalProducts: number;
}

function CategoryCircles({
  activeCategory,
  onCategoryChange,
  onHapticSelection,
}: {
  activeCategory: string;
  onCategoryChange: (id: string) => void;
  onHapticSelection?: () => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {STORE_CATEGORIES.map((category) => {
        const isActive = category.id === activeCategory;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => {
              onHapticSelection?.();
              onCategoryChange(category.id);
            }}
            className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center"
            aria-pressed={isActive}
          >
            {/* No resting background or border: the icon and its label carry
                the meaning. Selection is shown by a soft-edged green plate. */}
            <span
              className={`flex h-12 w-12 items-center justify-center transition-all duration-200 active:scale-90 [&>i]:text-[19px] ${
                isActive
                  ? 'rounded-2xl bg-brand-solid text-white shadow-sm shadow-brand-900/20'
                  : 'rounded-2xl text-ink'
              }`}
            >
              {category.icon}
            </span>
            <span
              className={`text-xs leading-tight transition-colors ${
                isActive ? 'font-bold text-brand-800' : 'font-semibold text-ink2'
              }`}
            >
              {category.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StoreTab({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  sortKey,
  onSortChange,
  inStockOnly,
  onInStockOnlyChange,
  totalProducts,
  onHapticSelection,
  ...gridProps
}: StoreTabProps & { onHapticSelection?: () => void }) {
  const [showFilters, setShowFilters] = React.useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink">For you</h1>
        <p className="mt-0.5 text-xs text-muted">{totalProducts} products</p>
      </div>

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search Moringa, Shilajit, Black Seed..."
          aria-label="Search organic products"
          className="w-full rounded-full border border-line bg-panel py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink2"
          >
            <i className="fa-solid fa-xmark text-[13px]" aria-hidden="true" />
          </button>
        )}
      </div>

      <CategoryCircles
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
        onHapticSelection={onHapticSelection}
      />

      <div className="flex items-center justify-between gap-3">
        {/* Styled as a pill to match the Filters control. The @tailwindcss/forms
            plugin injects its own border and background on <select>, so every
            one of those is explicitly neutralised here. */}
        <label className="flex h-7 cursor-pointer items-center gap-2 rounded-full border border-line bg-panel pl-3 pr-2.5 text-xs font-semibold text-ink2">
          <select
            value={sortKey}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            aria-label="Sort products"
            className="h-5 cursor-pointer appearance-none rounded-none border-0 bg-transparent p-0 font-semibold leading-none text-ink2 focus:border-0 focus:outline-none focus:ring-0"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <i className="fa-solid fa-chevron-down shrink-0 text-[10px] text-muted" aria-hidden="true" />
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          aria-expanded={showFilters}
          className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-xs font-semibold text-ink2"
        >
          <i className="fa-solid fa-sliders text-[13px]" aria-hidden="true" />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="rounded-xl border border-line bg-panel p-3">
          <label className="flex items-center justify-between text-xs font-semibold text-ink2">
            In-stock items only
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => onInStockOnlyChange(event.target.checked)}
              className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-700"
            />
          </label>
        </div>
      )}

      {gridProps.products.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          No products match your search.
        </p>
      ) : (
        <ProductGrid {...gridProps} />
      )}
    </div>
  );
}

/** Applies the active category, search text, sort order and stock filter. */
export function useFilteredProducts(
  products: GroupedProduct[],
  options: {
    searchQuery: string;
    activeCategory: string;
    sortKey: SortKey;
    inStockOnly: boolean;
  }
): GroupedProduct[] {
  const { searchQuery, activeCategory, sortKey, inStockOnly } = options;

  return useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const category = STORE_CATEGORIES.find((c) => c.id === activeCategory) ?? STORE_CATEGORIES[0];

    const filtered = products.filter((product) => {
      if (!category.matches(product)) return false;
      if (inStockOnly && totalStock(product) <= 0) return false;
      if (!query) return true;

      return (
        product.name.toLowerCase().includes(query) ||
        (product.description ?? '').toLowerCase().includes(query) ||
        (product.tag ?? '').toLowerCase().includes(query)
      );
    });

    const sorted = [...filtered];

    if (sortKey === 'price-asc') {
      sorted.sort(
        (a, b) => variantPrice(a, a.variants[0]?.id) - variantPrice(b, b.variants[0]?.id)
      );
    } else if (sortKey === 'price-desc') {
      sorted.sort(
        (a, b) => variantPrice(b, b.variants[0]?.id) - variantPrice(a, a.variants[0]?.id)
      );
    } else if (sortKey === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
    }

    return sorted;
  }, [products, searchQuery, activeCategory, sortKey, inStockOnly]);
}