import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../services/api';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';
import { useLanguage } from '../../LanguageContext';
import { OptimizedImage } from '../ui/OptimizedImage';
import { resolveProductImage } from '../../utils/image';

interface Product {
  id: string;
  name: string;
  package_size: string;
  price: number;
  description: string;
  featured: boolean;
  tag: string | null;
  image_url?: string;
}



const BestSellers: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();
  const { t } = useLanguage();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get<Product[]>('/api/products?limit=200&sort=sales');
        if (response.success && response.data && response.data.length > 0) {
          const uniqueProducts: Product[] = [];
          const seenNames = new Set<string>();
          for (const p of response.data) {
            const normalizedName = p.name.trim().toLowerCase();
            if (!seenNames.has(normalizedName)) {
              uniqueProducts.push(p);
              seenNames.add(normalizedName);
            }
          }
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
    // Show all products
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
              <div key={i} className="rounded-2xl overflow-hidden bg-white dark:bg-obsidian border border-border shadow-sm flex flex-col min-h-[300px]">
                <div className="aspect-[4/5] bg-slate-100 dark:bg-white/10 animate-pulse border-b border-border" />
                <div className="p-3 space-y-2 flex-1 flex flex-col">
                  <div className="h-4 bg-slate-200 dark:bg-white/10 rounded-lg animate-pulse w-3/4 mb-1" />
                  <div className="h-3 bg-slate-100 dark:bg-white/5 rounded-lg animate-pulse mb-auto" />
                  <div className="h-8 bg-slate-200 dark:bg-white/10 rounded-lg animate-pulse w-full mt-2" />
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
            {displayedProducts.map((product) => {
              const productImageUrl = resolveProductImage(product.image_url, product.name);
              return (
                <div
                  key={product.id}
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

                    {/* Gradient overlay — appears on hover */}
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-[#0D2E10]/60 via-transparent
                                 to-transparent opacity-0 group-hover:opacity-100
                                 transition-opacity duration-500 pointer-events-none"
                    />

                    {/* Price badge — slides up on hover */}
                    <div
                      className="absolute bottom-2 left-2 right-2 transform translate-y-3
                                 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
                                 transition-all duration-500 pointer-events-none"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-white/90 font-bold">{t('bestSellers.priceFrom')}</span>
                        <span className="font-display-lg font-bold text-highland-gold text-sm drop-shadow-md">
                          {product.price ? Number(product.price).toLocaleString() : '—'} {t('common.currency')}
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
                    <p className="font-sans text-slate-600 dark:text-slate-300 text-xs leading-snug line-clamp-4 mb-3 flex-1">
                      {product.description || t('bestSellers.defaultDesc')}
                    </p>

                    {/* Order button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(
                          openOrderModal({
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            mode: 'buy_now',
                          })
                        );
                      }}
                      className="flex items-center justify-center gap-1.5 w-full py-2 mt-auto bg-highland-gold
                                 hover:bg-highland-gold-light text-obsidian font-mono font-bold text-[11px]
                                 rounded-lg uppercase tracking-widest transition-colors shadow-md"
                    >
                      {t('bestSellers.buyNow')}
                      <span className="material-symbols-outlined text-[13px]">shopping_cart</span>
                    </button>
                  </div>
                </div>
              );
            })}
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
