import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';
import ProductCarousel from './ProductCarousel';
import type { CarouselProduct } from './ProductCarousel/carouselData';
import { useLanguage } from '../../LanguageContext';
import { optimizeLocalUrl } from '../../utils/image';


const categoryCards = [
  { key: 'powders',       image: optimizeLocalUrl('/image/products/Moringa 200g,500g and 1kg.png', 224, 78) },
  { key: 'oils',          image: optimizeLocalUrl('/image/products/Blackseed Oil ( 30ml ).JPG',    224, 78) },
  { key: 'seeds',         image: optimizeLocalUrl('/image/products/Chiaseed 250g and 1kg.png',     224, 78) },
  { key: 'supplements',   image: optimizeLocalUrl('/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png', 224, 78) },
  { key: 'herbsSpices',   image: optimizeLocalUrl('/image/products/Erid Turmeric ( 220g ).png',   224, 78) },
  { key: 'essentialOils', image: optimizeLocalUrl('/image/products/Frankincense Oil  30ml and 60 ml.jpeg', 224, 78) },
  { key: 'naturalBeauty', image: optimizeLocalUrl('/image/products/Qasil Powder ( 200g ).png',    224, 78) },
  { key: 'wellness',      image: optimizeLocalUrl('/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png', 224, 78) },
];


const highlightsMapping = [
  { image: optimizeLocalUrl('/image/dailyimages/Moringa Powder.png',        600, 75), searchKey: 'Moringa',                    tagKey: 'trending' },
  { image: optimizeLocalUrl('/image/dailyimages/Shilajit.png',              600, 75), searchKey: 'Shilajit Gel',               tagKey: 'bestseller' },
  { image: optimizeLocalUrl('/image/dailyimages/Ashwegenda powder.png',     600, 75), searchKey: 'Ashewagenda powder',         tagKey: 'organic' },
  { image: optimizeLocalUrl('/image/dailyimages/Aswhwegnda Tablet.png',     600, 75), searchKey: 'Ashewagenda (Himalya) Tablet', tagKey: 'supplement' },
  { image: optimizeLocalUrl('/image/dailyimages/Black seed  oil.png',       600, 75), searchKey: 'Blackseed Oil',              tagKey: 'pure' },
  { image: optimizeLocalUrl('/image/dailyimages/Chiaseed.png',              600, 75), searchKey: 'Chia Seed',                  tagKey: 'superfood' },
  { image: optimizeLocalUrl('/image/dailyimages/Franchinses Oil.png',       600, 75), searchKey: 'Frankincense Oil',           tagKey: 'essential' },
  { image: optimizeLocalUrl('/image/dailyimages/Hibscus.png',               600, 75), searchKey: 'Hibiscus',                   tagKey: 'herbal' },
  { image: optimizeLocalUrl('/image/dailyimages/Kerbe Oil.png',             600, 75), searchKey: 'Kerebe',                     tagKey: 'aromatic' },
  { image: optimizeLocalUrl('/image/dailyimages/Kesil Powder.png',          600, 75), searchKey: 'Kesil Powder',               tagKey: 'natural' },
  { image: optimizeLocalUrl('/image/dailyimages/Turemic Erid.png',          600, 75), searchKey: 'Turmeric',                   tagKey: 'spice' },
];


const DailyHighlights: React.FC = () => {
  const dispatch = useDispatch();
  const [products, setProducts] = useState<CarouselProduct[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    api.get<any[]>('/api/products?limit=200').then(res => {
      if (res.success && res.data) {
        const matched = highlightsMapping.map(m => {
          const product = res.data!.find((p: any) =>
            p.name.toLowerCase().includes(m.searchKey.toLowerCase())
          );
          if (!product) return null;
          return {
            id: product.id,
            name: product.name,
            tagKey: m.tagKey,
            desc: product.description || "default_desc",
            icon: "🌿",
            bgFrom: "#c8960a",
            bgTo: "#6b3a08",
            image: m.image,
            slug: product.id.toString(),
            price: product.price,
          };
        }).filter(Boolean) as (CarouselProduct & { tagKey: string })[];

        setProducts(matched);
      }
    }).catch(err => console.error('Failed to fetch products for highlights', err));
  }, []); // Note: re-running this isn't strictly necessary for language change if we map tagKey later

  // Translate products before passing to Carousel
  const translatedProducts = products.map((p: any) => ({
    ...p,
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
                   <img src={cat.image} alt={t(`categories.${cat.key}`)} width="112" height="112" className="w-full h-full object-contain" loading="lazy" decoding="async" />
                </div>
                <span className="font-bold text-sm md:text-base text-obsidian dark:text-white tracking-wider uppercase whitespace-normal text-center leading-tight">
                  {t(`categories.${cat.key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
};

export default DailyHighlights;
