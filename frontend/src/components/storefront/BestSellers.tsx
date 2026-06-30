import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../services/api';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';
import { useLanguage } from '../../LanguageContext';

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

// Map product names to their specific images
// Rules: check DB image_url first (done at call site), then fall back to local file by name keyword.
// File names are taken EXACTLY from /public/image/products/ folder listing.
const getProductImage = (name: string): string => {
  const n = name.toLowerCase();

  // ── Ashwagandha ──────────────────────────────────────────────────
  // File: Himalaya ashwagandha tablet 120 ( 250 mg ).png
  // Matches: "Ashewagenda (Himalya) Tablet", "himalaya ashwagandha tablet"
  if (n.includes('ashewagenda') || n.includes('ashwagandha tablet') || n.includes('himalya') || n.includes('himalaya ashwagandha'))
    return '/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png';

  // File: Ashwegdna Powder 250g.png
  // Matches: "Ashwagandha Powder", "Ashewagenda Powder"
  if (n.includes('ashwagandha powder') || n.includes('ashewagenda powder'))
    return '/image/products/Ashwegdna Powder 250g.png';

  // ── Blackseed ────────────────────────────────────────────────────
  // File: Blackseed Oil ( 30ml ).JPG
  if (n.includes('blackseed') || n.includes('black seed'))
    return '/image/products/Blackseed Oil ( 30ml ).JPG';

  // ── Chebe ────────────────────────────────────────────────────────
  // File: Chebe powder  ( 100g ).png
  if (n.includes('chebe'))
    return '/image/products/Chebe powder  ( 100g ).png';

  // ── Chia ─────────────────────────────────────────────────────────
  // File: Chiaseed 250g and 1kg.png
  if (n.includes('chia'))
    return '/image/products/Chiaseed 250g and 1kg.png';

  // ── Cloves ───────────────────────────────────────────────────────
  // File: Cloves 100g.png
  if (n.includes('clove'))
    return '/image/products/Cloves 100g.png';

  // ── Turmeric ─────────────────────────────────────────────────────
  // File: Erid Turmeric ( 220g ).png
  if (n.includes('turmeric') || n.includes('erid') || n.includes('erde'))
    return '/image/products/Erid Turmeric ( 220g ).png';

  // ── Frankincense ─────────────────────────────────────────────────
  // File: Frankincense Oil  30ml and 60 ml.jpeg
  if (n.includes('frankincense oil'))
    return '/image/products/Frankincense Oil  30ml and 60 ml.jpeg';
  // File: Frankincense ( 100g ).jpeg
  // Matches: "Frankincense Raw", "Asella Frankincense Raw", "Frankincense"
  if (n.includes('frankincense'))
    return '/image/products/Frankincense ( 100g ).jpeg';

  // ── Hibiscus ─────────────────────────────────────────────────────
  // File: Hibiscus ( 100g ).png
  if (n.includes('hibiscus') || n.includes('kerkede'))
    return '/image/products/Hibiscus ( 100g ).png';

  // ── Shilajit ─────────────────────────────────────────────────────
  // File: Himalaya Shilajit 60 Tablet   ( 500 mg ).png
  if (n.includes('shilajit tablet') || n.includes('shilajit 60'))
    return '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png';
  // File: Neuherb Shilajit Gummies  (30 Gummies ).png
  if (n.includes('shilajit gum'))
    return '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png';
  // File: Neuherb Shilajit gel 20g.png
  if (n.includes('shilajit'))
    return '/image/products/Neuherb Shilajit gel 20g.png';

  // ── Kerbe / Myrrh ────────────────────────────────────────────────
  // File: Kerbe Powder ( 100g ).png
  if (n.includes('kerbe powder'))
    return '/image/products/Kerbe Powder ( 100g ).png';
  // File: Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png
  if (n.includes('myrrh') || n.includes('kerbe oil') || n.includes('kerebe oil') || n.includes('kerbe (myrrh)'))
    return '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png';
  // "Kerbe raw" / "Kerebe raw" — no image file exists yet, show placeholder
  if (n.includes('kerbe') || n.includes('kerebe'))
    return '';

  // ── Moringa ──────────────────────────────────────────────────────
  // File: Moringa 200g,500g and 1kg.png
  if (n.includes('moringa'))
    return '/image/products/Moringa 200g,500g and 1kg.png';

  // ── Nila ─────────────────────────────────────────────────────────
  // File: Nila Powder 100g.jpeg
  if (n.includes('nila'))
    return '/image/products/Nila Powder 100g.jpeg';

  // ── Pumpkin ──────────────────────────────────────────────────────
  // File: Pumpkin Seed  100g.jpeg
  if (n.includes('pumpkin'))
    return '/image/products/Pumpkin Seed  100g.jpeg';

  // ── Qasil ────────────────────────────────────────────────────────
  // File: Qasil Powder ( 200g ).png
  if (n.includes('qasil') || n.includes('kesil'))
    return '/image/products/Qasil Powder ( 200g ).png';

  // ── Coffee / No image ────────────────────────────────────────────
  // No coffee image exists in /public/image/products/ — return empty
  // so the Unsplash placeholder is shown instead of a wrong product image.
  return '';
};


// How many cards to show in the "first section" grid (3 rows × N cols)
const CARDS_PER_PAGE = 18; // enough to fill 3 rows nicely

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
          // Remove duplicates by name
          const uniqueProducts: Product[] = [];
          const seenNames = new Set<string>();
          for (const p of response.data) {
            const normalizedName = p.name.trim().toLowerCase();
            if (!seenNames.has(normalizedName)) {
              uniqueProducts.push(p);
              seenNames.add(normalizedName);
            }
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
    // Just slice the first CARDS_PER_PAGE since they are already sorted by sales descending
    return products.slice(0, Math.min(CARDS_PER_PAGE, products.length));
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
          /* Loading Skeletons — 3 rows */
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gridAutoRows: 'auto',
            }}
          >
            {[...Array(18)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-obsidian rounded-2xl border border-border overflow-hidden">
                <div className="aspect-square bg-parchment-mid animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-[#d4ecd4]/60 rounded-lg animate-pulse w-3/4" />
                  <div className="h-3 bg-[#d4ecd4]/40 rounded-lg animate-pulse" />
                  <div className="h-8 bg-[#d4ecd4]/30 rounded-xl animate-pulse mt-3" />
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
          /* Product Cards — responsive 3-row grid, fills full width */
          <div
            className="grid gap-4"
            style={{
              // Columns: as many as fit, min 200px, max 1fr — fills all horizontal space
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            }}
          >
            {displayedProducts.map((product) => {
              const productImageUrl = product.image_url || getProductImage(product.name);
              return (
                <div
                  key={product.id}
                  className="group bg-white dark:bg-obsidian rounded-2xl overflow-hidden border border-border
                             shadow-sm hover:shadow-lg transition-all duration-400 cursor-pointer flex flex-col"
                >
                  {/* Image container */}
                  <div className="relative aspect-[4/3] bg-white shrink-0 border-b border-border">
                    {/* Featured badge */}
                    {product.featured && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-highland-gold
                                      text-obsidian font-mono text-[10px] font-bold uppercase
                                      tracking-widest rounded-full shadow-sm">
                        {t('bestSellers.badgeFeatured')}
                      </div>
                    )}

                    {/* Category badge */}
                    {product.tag && (
                      <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-white dark:bg-obsidian
                                      backdrop-blur-sm text-obsidian dark:text-white font-mono text-[10px]
                                      rounded-full border border-border">
                        {product.tag}
                      </div>
                    )}

                    {/* Product image with zoom on hover */}
                    <img
                      src={productImageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80'}
                      alt={product.name}
                      className="w-full h-full object-contain p-4 transition-transform duration-700
                                 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80';
                      }}
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
