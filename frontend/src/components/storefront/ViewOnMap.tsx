import { useEffect, useId, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';

interface ViewOnMapProps {
  /** Store name shown on the collapsed card. */
  title: string;
  /** Street address shown on the collapsed card. */
  address: string;
  /** Human-readable place used to centre the Google Maps embed. */
  mapQuery: string;
  /** Existing "Get directions" share link. */
  directionsUrl: string;
  /** Translated "View on Map" label used for the map's accessible name. */
  viewOnMapLabel: string;
  /** Translated label for the old-style card link that opens the map. */
  triggerLabel: string;
  /** Material Symbols icon name for the trigger. */
  triggerIcon?: string;
  /** Translated "Directions" label used in the expanded map overlay. */
  directionsLabel: string;
  /** Translated accessible label for the close button. */
  closeLabel: string;
  /** Existing address icon (the site uses Material Symbols). */
  icon?: ReactNode;
  className?: string;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

/**
 * Storefront location card whose original action link morphs the card into an
 * interactive Google Map. The collapsed state keeps the site's existing card
 * styling; only the map behaviour is new.
 */
const ViewOnMap: FC<ViewOnMapProps> = ({
  title,
  address,
  mapQuery,
  directionsUrl,
  viewOnMapLabel,
  triggerLabel,
  triggerIcon = 'explore',
  directionsLabel,
  closeLabel,
  icon,
  className = '',
}) => {
  const layoutId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  // Mount the cross-origin iframe only after the card→map layout animation
  // settles. Loading it mid-transform makes Chromium rasterise Google Maps at
  // the transient size, leaving grey bands on mobile.
  const [isMapReadyToMount, setIsMapReadyToMount] = useState(false);
  const hasOpenedRef = useRef(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=16&ie=UTF8&iwloc=&output=embed`;

  useEffect(() => {
    if (!isOpen) {
      setIsMapReadyToMount(false);
      // Only pull focus back after a map was actually opened — not on mount.
      if (hasOpenedRef.current) {
        hasOpenedRef.current = false;
        openButtonRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    hasOpenedRef.current = true;
    closeButtonRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsMapLoaded(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const closeMap = () => {
    setIsOpen(false);
    setIsMapLoaded(false);
  };

  return (
    <motion.div layout transition={springConfig} className={`relative ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!isOpen ? (
          <motion.div
            key="card"
            layoutId={layoutId}
            className="bg-white dark:bg-obsidian p-5 rounded-2xl border border-border"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={springConfig}
          >
            <div className="flex items-center gap-2 mb-2">
              {icon ?? (
                <span className="material-symbols-outlined text-highland-gold text-[20px]">
                  storefront
                </span>
              )}
              <h4 className="font-bold text-obsidian dark:text-white text-base">{title}</h4>
            </div>

            <p className="text-base text-slate-900 dark:text-slate-300 mb-3 leading-relaxed">
              {address}
            </p>

            {/* Same action-link styling as the original location card. */}
            <button
              ref={openButtonRef}
              type="button"
              onClick={() => setIsOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 text-sm font-mono font-bold uppercase tracking-wider text-highland-gold hover:text-highland-gold-light transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{triggerIcon}</span>
              {triggerLabel}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="map"
            layoutId={layoutId}
            role="dialog"
            aria-label={`${title} — ${viewOnMapLabel}`}
            className="relative aspect-square w-full overflow-hidden rounded-[28px] bg-[#DEDEDE] shadow-xl dark:bg-[#141414]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={springConfig}
            onLayoutAnimationComplete={() => setIsMapReadyToMount(true)}
          >
            {isMapReadyToMount && (
              <iframe
                title={`${title} — ${viewOnMapLabel}`}
                src={embedUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={() => setIsMapLoaded(true)}
                className={`absolute inset-0 h-full w-full contrast-[1.02] saturate-[0.85] transition-opacity duration-700 ${
                  isMapLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}

            {!isMapLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#E5E5E7] dark:bg-[#1C1C1E]">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            )}

            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeMap}
              aria-label={closeLabel}
              className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#85848B] shadow-lg transition-all hover:bg-gray-50 active:scale-90 dark:bg-[#2A2A2D] dark:text-white dark:hover:bg-[#3A3A3D] sm:right-5 sm:top-5 sm:h-11 sm:w-11"
            >
              <X className="h-5 w-5" strokeWidth={3} />
            </button>

            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-8 right-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-obsidian px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-obsidian-mid dark:bg-white dark:text-obsidian dark:hover:bg-highland-gold-light"
            >
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">explore</span>
              {directionsLabel}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ViewOnMap;
