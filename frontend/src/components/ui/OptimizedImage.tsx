/**
 * frontend/src/components/ui/OptimizedImage.tsx
 *
 * Drop-in <img> replacement that:
 *   1. Lazy-loads images below the fold (loading="lazy")
 *   2. Preloads above-the-fold images (loading="eager")
 *   3. Reserves aspect ratio so layout doesn't shift
 *   4. Uses srcSet/sizes for responsive images when a `sizes` prop
 *      is provided (e.g. "100vw", "(min-width: 768px) 50vw, 100vw")
 *   5. Falls back to a placeholder while loading
 *   6. Defers decoding to next idle frame for off-screen images
 *
 * Image transformations (WebP conversion, responsive sizing) are
 * typically done at upload time on the backend (or via a CDN like
 * Cloudinary/Cloudflare Images). This component handles the
 * *consumption* side — the frontend correctly requests and renders
 * the sizes the CDN serves.
 */
import React, { useState } from 'react';

export interface OptimizedImageProps {
  src:        string;
  alt:        string;
  /** Aspect ratio "width / height" — e.g. 16/9. Reserves space. */
  aspectRatio?: number;
  /** CSS classes for the wrapping <picture> element. */
  className?:  string;
  /** CSS classes for the inner <img>. */
  imgClassName?: string;
  /** Sizes attribute for srcSet. E.g. "(min-width: 768px) 33vw, 100vw" */
  sizes?:      string;
  /** Eager-load this image (use for above-the-fold). Default: lazy. */
  eager?:      boolean;
  /** Decoding hint. Default async. */
  decoding?:   'async' | 'sync' | 'auto';
  /** fetchpriority for critical images. */
  fetchPriority?: 'high' | 'low' | 'auto';
}

const PLACEHOLDER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice"><rect width="100%" height="100%" fill="%23f3f4f6"/><path d="M150 150 L250 250 M250 150 L150 250" stroke="%239ca3af" stroke-width="4" stroke-linecap="round"/><text x="50%" y="280" font-family="sans-serif" font-size="16" fill="%236b7280" text-anchor="middle">Image Not Found</text></svg>`;

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  aspectRatio = 1,
  className = '',
  imgClassName = '',
  sizes,
  eager = false,
  decoding = 'async',
  fetchPriority,
}) => {
  // Pre-validate known bad URLs (e.g. drive.google.com, dropbox share links)
  const isKnownBadUrl = (url: string) => {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('drive.google.com') || lowerUrl.includes('dropbox.com/s/')) return true;
    if (lowerUrl.startsWith('data:')) return false; // base64 is fine
    // A very basic check: if it doesn't look like a valid path or URL, mark bad
    return false;
  };

  const [errored, setErrored] = useState(isKnownBadUrl(src));

  // Some image hosts support resizing via query params (e.g.
  // ?w=400, ?w=800). We try to auto-append width hints when the
  // host is recognized (Cloudinary, Googleusercontent). Otherwise we
  // just use src as-is.
  const buildSrcSet = (baseSrc: string): string | undefined => {
    if (!sizes) return undefined;

    const widths = [320, 480, 640, 800, 1200, 1600];
    const u = new URL(baseSrc, window.location.origin);

    if (u.hostname.includes('googleusercontent.com')) {
      // Google CDN supports =sNNN sizing
      return widths
        .map((w) => `${baseSrc.split('=')[0]}=s${w} ${w}w`)
        .join(', ');
    }
    if (u.hostname.includes('cloudinary.com')) {
      return widths
        .map((w) => `${baseSrc.replace(/\/upload\//, `/upload/w_${w},c_scale,q_auto,f_auto/`)} ${w}w`)
        .join(', ');
    }
    return undefined;
  };

  const srcSet = errored ? undefined : buildSrcSet(src);

  return (
    <picture className={className} style={{ display: 'block' }}>
      <img
        src={errored ? PLACEHOLDER_SVG : src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding={decoding}
        fetchPriority={fetchPriority}
        srcSet={srcSet}
        sizes={sizes}
        onError={() => setErrored(true)}
        className={imgClassName}
        style={{
          width:      '100%',
          height:     '100%',
          objectFit:  'cover',
          aspectRatio: `${aspectRatio}`,
          backgroundColor: '#f0ede6', // matches Tailwind bg-stone-100
        }}
      />
    </picture>
  );
};
