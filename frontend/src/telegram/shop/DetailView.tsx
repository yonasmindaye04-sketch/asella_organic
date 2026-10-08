/**
 * frontend/src/telegram/shop/DetailView.tsx
 * Full-screen product detail overlay.
 */

import type { GroupedProduct } from '../../hooks/useProducts';
import { resolveProductImage } from '../../utils/image';
import { formatEtb } from './types';

export interface DetailViewProps {
  product: GroupedProduct;
  selectedVariantId: string | undefined;
  onSelectVariant: (variantId: string) => void;
  onAddToCart: () => void;
  onBack: () => void;
}

export function DetailView({
  product,
  selectedVariantId,
  onSelectVariant,
  onAddToCart,
  onBack,
}: DetailViewProps) {
  const activeVariant =
    product.variants.find((v) => v.id === selectedVariantId) ?? product.variants[0];
  const imageUrl = resolveProductImage(product.image_url, product.name);
  const inStock = (activeVariant?.inventory_quantity ?? 0) > 0;

  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-xs text-muted hover:text-ink"
      >
        Back to store
      </button>

      <div className="mb-4 h-48 w-full overflow-hidden rounded-lg border border-brand-50 bg-brand-50">
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-sm text-line">
            Asella Organic
          </div>
        )}
      </div>

      <span className="mb-1 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-brand-800">
        {product.tag || 'Organic Supplement'}
      </span>
      <h1 className="font-heading text-lg font-bold text-ink">{product.name}</h1>

      <p className="mt-2 text-xs leading-relaxed font-semibold text-ink2">
        {product.description ||
          'Ethically harvested and traditional Ethiopian organic formula. Formulated to support vitality, immune health, and balance.'}
      </p>

      <div className="mt-4">
        <span className="mb-1.5 block text-xs font-semibold text-ink2">
          Select Package Size:
        </span>
        <div className="grid grid-cols-2 gap-2">
          {product.variants.map((variant) => {
            const isSelected = activeVariant?.id === variant.id;

            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => onSelectVariant(variant.id)}
                aria-pressed={isSelected}
                className={`rounded-lg border p-2 text-left transition-all ${
                  isSelected
                    ? 'border-brand-700 bg-brand-50'
                    : 'border-line bg-panel hover:bg-cream'
                }`}
              >
                <span className="block text-xs font-semibold text-ink">
                  {variant.package_size}
                </span>
                <span className="mt-0.5 block font-mono text-xs font-bold text-brand-900">
                  {formatEtb(variant.price)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-brand-50 pt-4">
        <div>
          <span className="block text-xs text-muted">Unit Price</span>
          <span className="block font-mono font-heading text-base font-bold text-brand-900">
            {formatEtb(activeVariant?.price ?? 0)}
          </span>
        </div>

        <button
          type="button"
          disabled={!inStock}
          onClick={onAddToCart}
          className="rounded-lg bg-brand-solid px-4 py-2 text-xs font-semibold text-white shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {inStock ? 'Add to Cart & Checkout' : 'Unavailable'}
        </button>
      </div>
    </div>
  );
}