import React, { useEffect, useState, Suspense } from 'react';
import { api } from '../../services/api';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';
import ProductCarousel from './ProductCarousel';
import type { CarouselProduct } from './ProductCarousel/carouselData';
import { useLanguage } from '../../LanguageContext';
import { useSiteAssets } from '../../context/SiteAssetsContext';

const Reviews = React.lazy(() => import('./Reviews'));

/**
 * Image slots are referenced by key, not by path. The path lives in
 * constants/siteAssets.ts and the rendered URL comes from useSiteAssets(),
 * which returns an admin override when one exists. Adding a new card here
 * automatically makes it editable at /dashboard/media.
 */
const categoryCards = [
  { key: 'powders',       assetKey: 'category.powders' },
  { key: 'oils',          assetKey: 'category.oils' },
  { key: 'seeds',         assetKey: 'category.seeds' },
  { key: 'supplements',   assetKey: 'category.supplements' },
  { key: 'herbsSpices',   assetKey: 'category.herbsSpices' },
  { key: 'essentialOils', assetKey: 'category.essentialOils' },
  { key: 'naturalBeauty', assetKey: 'category.naturalBeauty' },
  { key: 'wellness',      assetKey: 'category.wellness' },
];


const highlightsMapping = [
  { assetKey: 'highlight.moringa',          searchKey: 'Moringa',                    tagKey: 'trending' },
  { assetKey: 'highlight.shilajitGel',      searchKey: 'Shilajit Gel',               tagKey: 'bestseller' },
  { assetKey: 'highlight.ashwagandhaPowder',searchKey: 'Ashewagenda powder',         tagKey: 'organic' },
  { assetKey: 'highlight.ashwagandhaTablet',searchKey: 'Ashewagenda (Himalya) Tablet', tagKey: 'supplement' },
  { assetKey: 'highlight.blackseedOil',     searchKey: 'Blackseed Oil',              tagKey: 'pure' },
  { assetKey: 'highlight.chiaSeed',         searchKey: 'Chia Seed',                  tagKey: 'superfood' },
  { assetKey: 'highlight.frankincense',     searchKey: 'Frankincense Oil',           tagKey: 'essential' },
  { assetKey: 'highlight.hibiscus',         searchKey: 'Hibiscus',                   tagKey: 'herbal' },
  { assetKey: 'highlight.kerebeOil',        searchKey: 'Kerebe',                     tagKey: 'aromatic' },
  { assetKey: 'highlight.kesilPowder',      searchKey: 'Kesil Powder',               tagKey: 'natural' },
  { assetKey: 'highlight.turmeric',         searchKey: 'Turmeric',                   tagKey: 'spice' },
];


type HighlightItem = Omit<CarouselProduct, 'image'> & { assetKey: string; tagKey: string };


const DailyHighlights: React.FC = () => {
  const dispatch = useDispatch();
  const [products, setProducts] = useState<HighlightItem[]>([]);
  const { t } = useLanguage();
  const { resolve } = useSiteAssets();

  useEffect(() => {
    api.get<any[]>('/api/products?limit=200').then(res => {
      if (res.success && res.data) {
        const matched = highlightsMapping.map(m => {
          const candidates = res.data!.filter((p: any) =>
            p.name.toLowerCase().includes(m.searchKey.toLowerCase())
          );
          const product = candidates.find((p: any) => Boolean(p.featured)) || candidates[0];
          if (!product) return null;
          return {
            id: product.id,
            name: product.name,
            tagKey: m.tagKey,
            desc: product.description || "default_desc",
            icon: "",
            bgFrom: "#c8960a",
            bgTo: "#6b3a08",
            // Resolved at render time, not here: overrides load asynchronously
            // and this effect only runs once.
            assetKey: m.assetKey,
            slug: product.id.toString(),
            price: product.price,
          };
        }).filter(Boolean) as HighlightItem[];

        setProducts(matched);
      }
    }).catch(err => console.error('Failed to fetch products for highlights', err));
  }, []); // Note: re-running this isn't strictly necessary for language change if we map tagKey later

  // Translate products before passing to Carousel
  const translatedProducts = products.map((p: HighlightItem) => ({
    ...p,
    image: resolve(p.assetKey),
    tag: t(`tags.${p.tagKey}`),
    desc: p.desc === "default_desc" ? t('dailyHighlights.defaultDesc') : p.desc
  }));

  return (
    <section className="bg-parchment dark:bg-[#121212] overflow-hidden content-visibility-auto">
      
      {/* 3D Product Carousel (Replacing old 2-wide cards) */}
      {translatedProducts.length > 0 && <ProductCarousel products={translatedProducts} />}

      {/* Static Category Cards */}
      <div className="w-full bg-parchment dark:bg-[#0A0A0A] border-y border-border py-12">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          
          {/* Section Header */}
          <div className="text-center mb-10">
            <h2 className="font-heading font-black text-4xl md:text-5xl text-obsidian dark:text-white tracking-tight">{t('dailyHighlights.shopByCategory')}</h2>
          </div>
          <div className="flex overflow-x-auto items-center gap-6 md:gap-8 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {categoryCards.map((cat, idx) => (
              <div 
                key={idx} 
                onClick={() => dispatch(openOrderModal({ mode: 'sales' }))}
                className="shrink-0 flex flex-col items-center justify-center w-36 md:w-44 cursor-pointer bg-white dark:bg-obsidian p-4 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all duration-300 hover:border-highland-gold hover:-translate-y-1"
              >
                <div className="w-24 h-24 md:w-28 md:h-28 mb-3 rounded-xl overflow-hidden bg-white flex items-center justify-center p-2 shadow-sm border border-gray-100">
                   <img src={resolve(cat.assetKey)} alt={t(`categories.${cat.key}`)} width="112" height="112" className="w-full h-full object-contain" loading="lazy" decoding="async" />
                </div>
                <span className="font-bold text-sm md:text-base text-obsidian dark:text-white tracking-wider uppercase whitespace-normal text-center leading-tight">
                  {t(`categories.${cat.key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reviews — Real Experiences / Voices of Our Community */}
      <Suspense fallback={null}>
        <Reviews />
      </Suspense>

    </section>
  );
};

export default DailyHighlights;
