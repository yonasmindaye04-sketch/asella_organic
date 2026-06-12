import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';

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
const getProductImage = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('himalaya ashwagandha') || n.includes('ashewagenda (himalya)')) return '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png';
  if (n.includes('ashwagandha powder') || n.includes('ashewagenda powder')) return '/image/products/Ashwegdna Powder 250g.png';
  if (n.includes('blackseed oil')) return '/image/products/Blackseed Oil ( 30ml ).JPG';
  if (n.includes('chebe')) return '/image/products/Chebe powder  ( 100g ).png';
  if (n.includes('chia')) return '/image/products/Chiaseed 250g and 1kg.png';
  if (n.includes('cloves') || n.includes('cinnamon')) return '/image/products/Cloves 100g.png';
  if (n.includes('turmeric') || n.includes('erid') || n.includes('erde')) return '/image/products/Erid Turmeric ( 220g ).png';
  if (n.includes('frankincense oil')) return '/image/products/Frankincense Oil  30ml and 60 ml.jpeg';
  if (n.includes('frankincense')) return '/image/products/Frankincense ( 100g ).jpeg';
  if (n.includes('hibiscus') || n.includes('kerkede')) return '/image/products/Hibiscus ( 100g ).png';
  if (n.includes('shilajit tablet')) return '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png';
  if (n.includes('kerbe powder')) return '/image/products/Kerbe Powder ( 100g ).png';
  if (n.includes('kerbe raw') || n.includes('kerebe raw') || n.includes('kerbe (myrrh)')) return '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png';
  if (n.includes('myrrh oil') || n.includes('kerbe oil') || n.includes('kerebe oil')) return '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png';
  if (n.includes('moringa')) return '/image/products/Moringa 200g,500g and 1kg.png';
  if (n.includes('shilajit gummies')) return '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png';
  if (n.includes('shilajit gel') || n.includes('shilajit')) return '/image/products/Neuherb Shilajit gel 20g.png';
  if (n.includes('nila')) return '/image/products/Nila Powder 100g.jpeg';
  if (n.includes('pumpkin')) return '/image/products/Pumpkin Seed  100g.jpeg';
  if (n.includes('qasil') || n.includes('kesil')) return '/image/products/Qasil Powder ( 200g ).png';
  
  return '/image/products/Moringa 200g,500g and 1kg.png'; // Nice default fallback
};

const BestSellers: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('/api/products?limit=200');
        if (response.data.success && response.data.data.length > 0) {
          // Remove duplicates by name
          const uniqueProducts: Product[] = [];
          const seenNames = new Set<string>();
          for (const p of response.data.data) {
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
        console.error("Failed to fetch products", err);
        setError('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  return (
    <section id="products" className="py-16 bg-parchment">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12">

        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h2
              className="font-display-lg font-black text-obsidian dark:text-white"
              style={{ fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1.15, letterSpacing: '-0.02em' }}
            >
              Featured Organic<br />
              <span className="text-highland-gold">Supplements</span>
            </h2>
          </div>
          <p className="font-sans text-highland-gold max-w-md text-2xl font-medium leading-relaxed">
            Sourced from Ethiopian highlands. Every product is third-party tested
            and certified organic.
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          /* Loading Skeletons */
          <div className="flex overflow-x-auto gap-6 pb-8 hide-scrollbar">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex-none w-[320px] bg-white dark:bg-obsidian rounded-3xl border border-border overflow-hidden">
                <div className="aspect-square bg-parchment-mid animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-[#d4ecd4]/60 rounded-lg animate-pulse w-3/4" />
                  <div className="h-4 bg-[#d4ecd4]/40 rounded-lg animate-pulse" />
                  <div className="h-9 bg-[#d4ecd4]/30 rounded-xl animate-pulse mt-4" />
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
            <p className="font-display-lg font-semibold text-obsidian dark:text-white text-xl mb-2">
              Coming Soon
            </p>
            <p className="font-sans text-slate-700 dark:text-slate-300 text-2xl">
              Our product catalog is being updated. Check back shortly.
            </p>
          </div>
        ) : (
          /* Product Cards - 2 Rows, Horizontal Scroll */
          <div className="relative">
            {/* Inject style for hiding webkit scrollbar inline just in case */}
            <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            
            <div 
              className="grid grid-rows-2 grid-flow-col gap-x-6 gap-y-10 overflow-x-auto snap-x snap-mandatory py-8 px-4 hide-scrollbar"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', gridAutoColumns: 'max-content' }}
            >
              {products.map((product) => {
                const productImageUrl = getProductImage(product.name);
                return (
                  <div
                    key={product.id}
                    className="snap-start w-[85vw] sm:w-[320px] lg:w-[340px] group bg-white dark:bg-obsidian rounded-3xl overflow-hidden border border-border
                               shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer flex flex-col h-full"
                  >
                    {/* Image container */}
                    <div className="relative aspect-[4/3] bg-white dark:bg-obsidian shrink-0 border-b border-border/30">
                      {/* Featured badge */}
                      {product.featured && (
                        <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-highland-gold
                                        text-obsidian dark:text-white font-mono text-sm font-bold uppercase
                                        tracking-widest rounded-full shadow-sm">
                          Featured
                        </div>
                      )}

                      {/* Category badge */}
                      {product.tag && (
                        <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-white dark:bg-obsidian/90
                                        backdrop-blur-sm text-obsidian dark:text-white font-mono text-sm
                                        rounded-full border border-border">
                          {product.tag}
                        </div>
                      )}

                      {/* Product image with zoom on hover */}
                      <img
                        src={productImageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain p-6 transition-transform duration-700
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
                        className="absolute bottom-4 left-4 right-4 transform translate-y-4
                                   opacity-0 group-hover:translate-y-0 group-hover:opacity-100
                                   transition-all duration-500 pointer-events-none"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-white/90 font-bold">Price From</span>
                          <span className="font-display-lg font-bold text-highland-gold text-xl drop-shadow-md">
                            {product.price ? Number(product.price).toLocaleString() : '—'} ETB
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-6 flex flex-col flex-1 bg-white dark:bg-obsidian">
                      <h3
                        className="font-display-lg font-bold text-obsidian dark:text-white text-xl mb-3
                                   group-hover:text-highland-gold transition-colors duration-300"
                      >
                        {product.name}
                      </h3>
                      <p className="font-sans text-slate-700 dark:text-slate-300 text-2xl leading-relaxed line-clamp-3 mb-6 flex-1">
                        {product.description || "Premium organic supplement sourced from the Ethiopian highlands."}
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
                        className="flex items-center justify-center gap-2 w-full py-3 mt-auto bg-highland-gold hover:bg-highland-gold-light text-obsidian dark:text-white font-mono font-bold text-base rounded-xl uppercase tracking-widest transition-colors shadow-lg"
                      >
                        Buy Now
                        <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA below grid */}
        <div className="text-center mt-6">
          <button
            onClick={() => dispatch(openOrderModal({ mode: 'sales' }))}
            className="inline-flex items-center gap-2 px-8 py-4 bg-obsidian text-parchment
                       font-display-lg font-semibold rounded-full hover:bg-obsidian-mid
                       transition-colors duration-300 text-base shadow-xl"
          >
            Order Any Product
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default BestSellers;


