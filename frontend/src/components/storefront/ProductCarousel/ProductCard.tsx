import { useDispatch } from 'react-redux';
import { openOrderModal } from '../../../store/slices/uiSlice';
import type { CarouselProduct } from "./carouselData";
import { useLanguage } from '../../../LanguageContext';

interface ProductCardProps {
  product: CarouselProduct;
  offset: number;   // -2 | -1 | 0 | 1 | 2
  total: number;
  onClick: () => void;
}

function getCardStyle(offset: number): React.CSSProperties {
  const abs = Math.abs(offset);

  if (abs === 0) {
    return {
      transform: "translate(-50%, -50%) scale(1)",
      zIndex: 10,
      opacity: 1,
      pointerEvents: "auto",
    };
  }
  if (abs === 1) {
    const x = offset > 0 ? 280 : -280;
    return {
      transform: `translate(calc(-50% + ${x}px), -50%) scale(0.78)`,
      zIndex: 7,
      opacity: 0.82,
      pointerEvents: "auto",
    };
  }
  if (abs === 2) {
    const x = offset > 0 ? 480 : -480;
    return {
      transform: `translate(calc(-50% + ${x}px), -50%) scale(0.62)`,
      zIndex: 4,
      opacity: 0.45,
      pointerEvents: "auto",
    };
  }
  return {
    transform: "translate(-50%, -50%) scale(0.5)",
    zIndex: 1,
    opacity: 0,
    pointerEvents: "none",
  };
}

export default function ProductCard({ product, offset, onClick }: ProductCardProps) {
  const style = getCardStyle(offset);
  const dispatch = useDispatch();
  const { t } = useLanguage();

  return (
    <div
      className="absolute left-1/2 top-1/2 w-[400px] h-[480px] rounded-[24px] overflow-hidden cursor-pointer
                 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ ...style, willChange: 'transform, opacity' }}
      onClick={onClick}
      role="button"
      tabIndex={offset === 0 ? 0 : -1}
      aria-label={`View ${product.name}`}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Background */}
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ willChange: 'transform' }}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `linear-gradient(145deg, ${product.bgFrom} 0%, ${product.bgTo} 100%)` }}
        >
          <span className="text-[80px] leading-none drop-shadow-lg opacity-90 select-none">
            {product.icon}
          </span>
        </div>
      )}

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(6,20,6,0.95) 0%, rgba(6,20,6,0.7) 45%, rgba(6,20,6,0.1) 100%)",
        }}
      />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-8 text-left">
        <h3 className="font-serif text-[1.8rem] font-bold text-white leading-tight mb-3">
          {product.name}
        </h3>

        <p className="text-[15px] text-white/90 leading-relaxed mb-6 font-medium">
          {product.desc}
        </p>

        <button
          className="inline-block bg-highland-gold hover:bg-[#c09040] text-white text-[15px] font-bold
                     tracking-[0.06em] border-none rounded-full px-7 py-3 cursor-pointer
                     transition-colors duration-200"
          onClick={(e) => {
            e.stopPropagation();
            dispatch(openOrderModal({
              id: product.id.toString(), // or product.slug if string
              name: product.name,
              price: product.price || 0,
              mode: 'buy_now'
            }));
          }}
        >
          {t('carousel.shopNow')}
        </button>
      </div>
    </div>
  );
}
