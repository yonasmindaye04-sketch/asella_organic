import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../services/api';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';
import { useLanguage } from '../../LanguageContext';
import { OptimizedImage } from '../ui/OptimizedImage';
import { resolveProductImage } from '../../utils/image';

interface Variant {
  id: string;
  package_size: string;
  price: number;
  inventory_quantity: number;
  low_stock_threshold: number;
  active: boolean;
}

interface GroupedProduct {
  name: string;
  description: string | null;
  image_url: string | null;
  featured: boolean;
  tag: string | null;
  active: boolean;
  variants: Variant[];
}

// Sub-component for individual card with its own state for selected variant
const ProductCard: React.FC<{ product: GroupedProduct }> = ({ product }) => {
  const dispatch = useDispatch();
  const { t } = useLanguage();
  
  // Default to first variant
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const selectedVariant = product.variants[selectedVariantIndex];
  
  const productImageUrl = resolveProductImage(product.image_url, product.name);
  const isOutOfStock = selectedVariant.inventory_quantity <= 0;

  return (
    <div
      className="group bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-border
                 shadow-sm hover:shadow-lg transition-all duration-400 cursor-pointer flex flex-col"
    >
      {/* Image container */}
      <div className="relative aspect-[4/5] bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
        {/* Tag badge */}
        {product.tag && (
          <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-white dark:bg-obsidian
                          backdrop-blur-sm text-obsidian dark:text-white font-mono text-[10px]
                          rounded-full border border-border">
            {product.tag}
          </div>
        )}

        {/* Product image with zoom on hover */}
        <OptimizedImage
          src={productImageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80'}
          alt={product.name}
          aspectRatio={4 / 5}
          sizes="(min-width: 1280px) 220px, (min-width: 768px) 25vw, 50vw"
          className="w-full h-full"
          imgClassName="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-[1.08]"
        />

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#0D2E10]/60 via-transparent
                     to-transparent opacity-0 group-hover:opacity-100
                     transition-opacity duration-500 pointer-events-none"
        />

        {/* Price badge */}
        <div
          className="absolute bottom-2 left-2 right-2 transform translate-y-3
                     opacity-0 group-hover:translate-y-0 group-hover:opacity-100
                     transition-all duration-500 pointer-events-none"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/90 font-bold">{t('bestSellers.priceFrom')}</span>
            <span className="font-display-lg font-bold text-highland-gold text-sm drop-shadow-md">
              {selectedVariant.price ? Number(selectedVariant.price).toLocaleString() : '—'} {t('common.currency')}
            </span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col flex-1 bg-white dark:bg-obsidian">
        <h3
          className="font-display-lg font-bold text-obsidian dark:text-white text-sm mb-1.5
                     group-hover:text-highland-gold transition-colors duration-300 line-clamp-2"
        >
          {product.name}
        </h3>
        <p className="font-sans text-slate-600 dark:text-slate-300 text-xs leading-snug line-clamp-2 mb-3 flex-1">
          {product.description || t('bestSellers.defaultDesc')}
        </p>

        {/* Variant Selector */}
        {product.variants.length > 1 && (
          <div className="mb-3">
            <select
              className="w-full bg-slate-50 dark:bg-obsidian-mid border border-border rounded-lg px-2 py-1.5 text-xs text-obsidian dark:text-white outline-none focus:border-highland-gold transition-colors"
              value={selectedVariantIndex}
              onChange={(e) => {
                e.stopPropagation();
                setSelectedVariantIndex(Number(e.target.value));
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {product.variants.map((v, idx) => (
                <option key={v.id} value={idx}>
                  {v.package_size} - {Number(v.price).toLocaleString()} {t('common.currency')}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* Variant Info single item */}
        {product.variants.length === 1 && (
          <div className="mb-3 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
            <span>{selectedVariant.package_size}</span>
            <span className="font-bold text-obsidian dark:text-white">
              {Number(selectedVariant.price).toLocaleString()} {t('common.currency')}
            </span>
          </div>
        )}

        {/* Order button */}
        <button
          disabled={isOutOfStock}
          onClick={(e) => {
            e.stopPropagation();
            dispatch(
              openOrderModal({
                id: selectedVariant.id,
                name: `${product.name} (${selectedVariant.package_size})`,
                price: selectedVariant.price,
                mode: 'buy_now',
              })
            );
          }}
          className={`flex items-center justify-center gap-1.5 w-full py-2 mt-auto font-mono font-bold text-[11px] rounded-lg uppercase tracking-widest transition-colors shadow-md ${
            isOutOfStock 
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500' 
              : 'bg-highland-gold hover:bg-highland-gold-light text-obsidian'
          }`}
        >
          {isOutOfStock ? t('bestSellers.outOfStock') : t('bestSellers.buyNow')}
          {!isOutOfStock && <span className="material-symbols-outlined text-[13px]">shopping_cart</span>}
        </button>
      </div>
    </div>
  );
};

const BestSellers: React.FC = () => {
  const [products, setProducts] = useState<GroupedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();
  const { t } = useLanguage();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get<GroupedProduct[]>('/api/products/grouped?sort=sales');
        if (response.success && response.data && response.data.length > 0) {
          const uniqueProducts = [...response.data];
          // Randomize the products before displaying
          for (let i = uniqueProducts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueProducts[i], uniqueProducts[j]] = [uniqueProducts[j], uniqueProducts[i]];
          }
          setProducts(uniqueProducts);
        } else {
          setError('No products found');
        }
      } catch (err) {
        console.error('Failed to fetch products', err);
        setError('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const displayedProducts = useMemo(() => {
    if (products.length === 0) return [];
    return products;
  }, [products]);

  return (
    <section id="products" className="py-12 bg-parchment dark:bg-[#121212]">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-10">

        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-3">
          <div>
            <h2
              className="font-display-lg font-black text-obsidian dark:text-white"
              style={{ fontSize: 'clamp(24px, 4vw, 44px)', lineHeight: 1.15, letterSpacing: '-0.02em' }}
            >
              {t('bestSellers.title')}<br />
              <span className="text-highland-gold">{t('bestSellers.titleHighlight')}</span>
            </h2>
          </div>
          <p className="font-sans text-highland-gold max-w-md text-base font-medium leading-relaxed">
            {t('bestSellers.subtitle')}
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          /* Loading Skeletons */
          <div
            className="grid gap-4 overflow-x-auto pb-6 scrollbar-hide"
            style={{
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              gridAutoFlow: 'column',
              gridAutoColumns: 'minmax(230px, 1fr)',
            }}
          >
            {[...Array(15)].map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white dark:bg-obsidian border border-highland-gold/10 shadow-sm flex flex-col min-h-[300px]">
                <div className="aspect-[4/5] bg-gradient-to-r from-highland-gold/10 via-highland-gold/20 to-highland-gold/10 bg-[length:200%_100%] animate-[shimmer_2s_infinite] border-b border-highland-gold/10" />
                <div className="p-3 space-y-2 flex-1 flex flex-col">
                  <div className="h-4 bg-highland-gold/20 rounded-lg animate-pulse w-3/4 mb-1" />
                  <div className="h-3 bg-highland-gold/10 rounded-lg animate-pulse mb-auto" />
                  <div className="h-8 bg-highland-gold/30 rounded-lg animate-pulse w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : error || products.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-highland-gold text-5xl mb-4 block animate-breathe">
              eco
            </span>
            <p className="font-display-lg font-semibold text-obsidian dark:text-white text-lg mb-2">
              {t('bestSellers.comingSoon')}
            </p>
            <p className="font-sans text-slate-700 dark:text-slate-300 text-base">
              {t('bestSellers.comingSoonDesc')}
            </p>
          </div>
        ) : (
          /* Product Cards — responsive horizontally scrollable 3-row grid */
          <div
            className="grid gap-4 overflow-x-auto pb-4 hide-scrollbar snap-x snap-mandatory"
            style={{
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              gridAutoFlow: 'column',
              gridAutoColumns: 'minmax(240px, 1fr)',
            }}
          >
            {displayedProducts.map((product) => (
              <ProductCard key={product.name} product={product} />
            ))}
          </div>
        )}

        {/* CTA below grid */}
        <div className="text-center mt-8">
          <button
            onClick={() => dispatch(openOrderModal({ mode: 'sales' }))}
            className="inline-flex items-center gap-2 px-7 py-3 bg-obsidian text-parchment
                       font-display-lg font-semibold rounded-full hover:bg-obsidian-mid
                       transition-colors duration-300 text-sm shadow-xl"
          >
            {t('bestSellers.orderAny')}
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default BestSellers;

