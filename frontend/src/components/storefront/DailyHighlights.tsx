import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

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
  const [products, setProducts] = useState<any[]>([]);
  const [displayIndices, setDisplayIndices] = useState<[number, number]>([0, 1]);
  const productsRef = useRef<any[]>([]);

  useEffect(() => {
    axios.get('/api/products?limit=200').then(res => {
      if (res.data.success) {
        const matched = highlightsMapping.map(m => {
          const product = res.data.data.find((p: any) =>
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
    <section className="py-16 bg-[#FAF9F6] overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 mb-16">
        
        {/* Title */}
        <div className="text-center mb-12">
          <p className="font-mono text-2xl text-highland-gold uppercase tracking-[0.2em] mb-6">Learn While Visiting Us</p>
          <h2 className="font-bebas text-5xl md:text-6xl text-obsidian mb-6 tracking-wide">Build Your Healthy Self</h2>
          <p className="text-slate-700 max-w-5xl mx-auto text-2xl leading-relaxed">Click the cards to explore different natural benefits of our authentic Ethiopian harvest.</p>
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
                  className="group relative rounded-3xl overflow-hidden aspect-[4/3] md:aspect-[16/9] lg:aspect-[3/2] shadow-sm hover:shadow-2xl transition-all duration-500 bg-white border border-[#d4ecd4] cursor-pointer"
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

      {/* Category Marquee */}
      <div className="w-full bg-obsidian/[0.03] border-y border-[#d4ecd4] py-6 overflow-hidden flex items-center relative group">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#FAF9F6] to-transparent z-10"></div>
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#FAF9F6] to-transparent z-10"></div>
        
        <div className="flex animate-marquee group-hover:[animation-play-state:paused] whitespace-nowrap items-center w-[200%]">
          <div className="flex items-center gap-12 px-6 w-1/2 justify-around">
            {['Shilajit', 'Organic Honey', 'Black Seed Oil', "Lion's Mane", 'Turmeric Gold', 'Moringa Tea', 'Raw Cacao'].map(item => (
              <span key={item} className="font-bold text-base text-obsidian tracking-[0.2em] uppercase flex items-center gap-4">
                {item} <span className="w-1.5 h-1.5 rounded-full bg-highland-gold"></span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-12 px-6 w-1/2 justify-around">
            {['Shilajit', 'Organic Honey', 'Black Seed Oil', "Lion's Mane", 'Turmeric Gold', 'Moringa Tea', 'Raw Cacao'].map(item => (
              <span key={item + '-dup'} className="font-bold text-base text-obsidian tracking-[0.2em] uppercase flex items-center gap-4">
                {item} <span className="w-1.5 h-1.5 rounded-full bg-highland-gold"></span>
              </span>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
};

export default DailyHighlights;