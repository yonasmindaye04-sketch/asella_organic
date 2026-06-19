import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../store/slices/uiSlice';

const categoryCards = [
  { name: 'Powders', image: '/image/products/Moringa 200g,500g and 1kg.png' },
  { name: 'Oils', image: '/image/products/Blackseed Oil ( 30ml ).JPG' },
  { name: 'Seeds', image: '/image/products/Chiaseed 250g and 1kg.png' },
  { name: 'Supplements', image: '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png' },
  { name: 'Herbs & Spices', image: '/image/products/Erid Turmeric ( 220g ).png' },
  { name: 'Essential Oils', image: '/image/products/Frankincense Oil  30ml and 60 ml.jpeg' },
  { name: 'Natural Beauty', image: '/image/products/Qasil Powder ( 200g ).png' },
  { name: 'Wellness', image: '/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png' },
];

const highlightsMapping = [
  { image: '/image/dailyimages/Moringa Powder.png', searchKey: 'Moringa', tag: 'Trending' },
  { image: '/image/dailyimages/Shilajit.png', searchKey: 'Shilajit Gel', tag: 'Bestseller' },
  { image: '/image/dailyimages/Ashwegenda powder.png', searchKey: 'Ashewagenda powder', tag: 'Organic' },
  { image: '/image/dailyimages/Aswhwegnda Tablet.png', searchKey: 'Ashewagenda (Himalya) Tablet', tag: 'Supplement' },
  { image: '/image/dailyimages/Black seed  oil.png', searchKey: 'Blackseed Oil', tag: 'Pure' },
  { image: '/image/dailyimages/Chiaseed.png', searchKey: 'Chia Seed', tag: 'Superfood' },
  { image: '/image/dailyimages/Franchinses Oil.png', searchKey: 'Frankincense Oil', tag: 'Essential' },
  { image: '/image/dailyimages/Hibscus.png', searchKey: 'Hibiscus', tag: 'Herbal' },
  { image: '/image/dailyimages/Kerbe Oil.png', searchKey: 'Kerebe', tag: 'Aromatic' },
  { image: '/image/dailyimages/Kesil Powder.png', searchKey: 'Kesil Powder', tag: 'Natural' },
  { image: '/image/dailyimages/Turemic Erid.png', searchKey: 'Turmeric', tag: 'Spice' },
];

// Pure helper outside the component — safe to call anywhere
function getRandomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function pickTwoUnique(length: number): [number, number] {
  const first = getRandomIndex(length);
  let second = getRandomIndex(length);
  while (second === first) second = getRandomIndex(length);
  return [first, second];
}

const DailyHighlights: React.FC = () => {
  const dispatch = useDispatch();
  const [products, setProducts] = useState<any[]>([]);
  const [displayIndices, setDisplayIndices] = useState<[number, number]>([0, 1]);
  const productsRef = useRef<any[]>([]);

  useEffect(() => {
    api.get<any[]>('/api/products?limit=200').then(res => {
      if (res.success && res.data) {
        const matched = highlightsMapping.map(m => {
          const product = res.data!.find((p: any) =>
            p.name.toLowerCase().includes(m.searchKey.toLowerCase())
          );
          return { ...m, product };
        }).filter(m => m.product);

        productsRef.current = matched;
        setProducts(matched);

        if (matched.length >= 2) {
          setDisplayIndices(pickTwoUnique(matched.length));
        }
      }
    }).catch(err => console.error('Failed to fetch products for highlights', err));
  }, []);

  const changeRandomProduct = useCallback((position: 0 | 1) => {
    const current = productsRef.current;
    if (current.length <= 2) return;

    setDisplayIndices(prev => {
      const currentOther = prev[position === 0 ? 1 : 0];
      const currentSelf = prev[position];

      let nextIndex = getRandomIndex(current.length);
      let attempts = 0;
      while ((nextIndex === currentOther || nextIndex === currentSelf) && attempts < 100) {
        nextIndex = getRandomIndex(current.length);
        attempts++;
      }

      const next = [...prev] as [number, number];
      next[position] = nextIndex;
      return next;
    });
  }, []);

  return (
    <section className="py-16 bg-parchment dark:bg-[#121212] overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 mb-16">
        
        {/* Title */}
        <div className="text-center mb-12">
          <p className="font-mono text-2xl text-highland-gold uppercase tracking-[0.2em] mb-6">Learn While Visiting Us</p>
          <h2 className="font-bebas text-5xl md:text-6xl text-obsidian dark:text-white mb-6 tracking-wide">Build Your Healthy Self</h2>
          <p className="text-slate-700 dark:text-slate-300 max-w-5xl mx-auto text-2xl leading-relaxed">Click the cards to explore different natural benefits of our authentic Ethiopian harvest.</p>
        </div>

        {/* 2 Wide Cards Grid */}
        {products.length >= 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {[0, 1].map((pos) => {
              const itemIndex = displayIndices[pos as 0 | 1];
              const item = products[itemIndex];
              if (!item) return null;

              return (
                <div 
                  key={`${pos}-${item.product.id}`}
                  className="group relative rounded-3xl overflow-hidden aspect-[4/3] md:aspect-[16/9] lg:aspect-[3/2] shadow-sm hover:shadow-2xl transition-all duration-500 bg-white dark:bg-obsidian border border-border cursor-pointer"
                  onClick={() => changeRandomProduct(pos as 0 | 1)}
                >
                  <div 
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" 
                    style={{ backgroundImage: `url('${item.image}')` }}
                  ></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D2E10]/95 via-[#0D2E10]/30 to-transparent"></div>
                  
                  <div className="absolute inset-0 p-8 md:p-10 flex flex-col justify-end z-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                      <div className="flex-1">
                        <h3 className="font-serif text-[32px] md:text-[40px] text-white mb-3 font-bold drop-shadow-md leading-tight">
                          {item.product.name}
                        </h3>
                        <p className="font-sans text-[15px] md:text-[17px] text-white/90 max-w-lg drop-shadow-sm line-clamp-3 leading-relaxed">
                          {item.product.description || "Experience the pure, natural benefits of this authentic product. Harvested and prepared with care."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Static Category Cards */}
      <div className="w-full bg-parchment dark:bg-[#0A0A0A] border-y border-border py-12">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          
          {/* Section Header */}
          <div className="text-center mb-10">
            <h3 className="font-bebas text-4xl md:text-5xl text-obsidian dark:text-white tracking-wide">Shop By Category</h3>
          </div>
          <div className="flex overflow-x-auto items-center gap-6 md:gap-8 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {categoryCards.map((cat, idx) => (
              <div 
                key={idx} 
                onClick={() => dispatch(openOrderModal({ mode: 'sales' }))}
                className="shrink-0 flex flex-col items-center justify-center w-36 md:w-44 cursor-pointer bg-white dark:bg-obsidian p-4 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all duration-300 hover:border-highland-gold hover:-translate-y-1"
              >
                <div className="w-24 h-24 md:w-28 md:h-28 mb-3 rounded-xl overflow-hidden bg-white flex items-center justify-center p-2 shadow-sm border border-gray-100">
                   <img src={cat.image} alt={cat.name} className="w-full h-full object-contain" />
                </div>
                <span className="font-bold text-sm md:text-base text-obsidian dark:text-white tracking-wider uppercase whitespace-normal text-center leading-tight">
                  {cat.name}
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


