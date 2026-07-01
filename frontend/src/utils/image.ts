/**
 * Resolves the best available image for a product.
 *
 * Priority:
 *   1. Local `/image/products/…` file matched by product name  (always works, no CORS issues)
 *   2. DB `image_url` if it's already a local path (`/image/…`)
 *   3. DB `image_url` if it's any other URL (Google Drive, etc.)  — last resort
 *   4. Empty string (no image available)
 */
export function resolveProductImage(
  dbImageUrl: string | null | undefined,
  productName: string,
): string {
  // 1. Try local image by product name
  const localMatch = getLocalImage(productName);
  if (localMatch) return localMatch;

  // 2. If DB has a local path, use it directly
  if (dbImageUrl && dbImageUrl.trim() !== '') {
    const url = dbImageUrl.trim();
    if (url.startsWith('/image/') || url.startsWith('/image\\')) return url;

    // 3. Full external URL (Google Drive etc.) — last resort
    if (url.startsWith('http')) return url;

    // Bare Google Drive ID
    if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) {
      return `https://drive.google.com/uc?export=view&id=${url}`;
    }
  }

  return '';
}

// ──────────────────────────────────────────────────────────────────────────
// Product name -> local image mapping
// ──────────────────────────────────────────────────────────────────────────
function getLocalImage(productName: string): string {
  if (!productName) return '';
  const n = productName.toLowerCase();

  // Ashwagandha (Himalaya 60 capsules / 250 mg)
  if (
    (n.includes('ashwagandha') && n.includes('60')) ||
    (n.includes('himalaya') && n.includes('ashwagandha') && !n.includes('120'))
  )
    return '/image/products/Himalaya Ashwagandha 60   ( 250 mg ).png';

  // Ashwagandha (Himalaya 120 tablet / 250 mg)
  if (
    (n.includes('ashwagandha') && n.includes('120')) ||
    (n.includes('ashwagandha') && n.includes('tablet')) ||
    (n.includes('ashewagenda') && n.includes('tablet')) ||
    (n.includes('himalaya') && n.includes('ashwagandha'))
  )
    return '/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png';

  // Ashwagandha powder
  if (
    n.includes('ashwagandha powder') ||
    n.includes('ashewagenda powder') ||
    n.includes('ashwegdna') ||
    (n.includes('ashwagandha') && n.includes('powder'))
  )
    return '/image/products/Ashwegdna Powder 250g.png';

  // Ashwagandha generic fallback
  if (n.includes('ashwagandha') || n.includes('ashewagenda'))
    return '/image/products/Himalaya ashwagandha tablet 120 ( 250 mg ).png';

  // Blackseed Oil
  if (n.includes('blackseed') || n.includes('black seed'))
    return '/image/products/Blackseed Oil ( 30ml ).JPG';

  // Chebe Powder
  if (n.includes('chebe'))
    return '/image/products/Chebe powder  ( 100g ).png';

  // Chia Seed
  if (n.includes('chia'))
    return '/image/products/Chiaseed 250g and 1kg.png';

  // Cloves
  if (n.includes('clove'))
    return '/image/products/Cloves.png';

  // Coffee
  if (n.includes('coffee') || n.includes('buna'))
    return '/image/products/Coffee.png';

  // Turmeric (Erid)
  if (n.includes('turmeric') || n.includes('erid') || n.includes('erde') || n.includes('ird'))
    return '/image/products/Erid Turmeric ( 220g ).png';

  // Frankincense Oil (must check before generic frankincense)
  if (n.includes('frankincense') && n.includes('oil'))
    return '/image/products/Frankincense Oil  30ml and 60 ml.jpeg';

  // Frankincense Raw / generic
  if (n.includes('frankincense') || n.includes('itan'))
    return '/image/products/Asella Frankincense Raw.jpeg';

  // Hibiscus
  if (n.includes('hibiscus') || n.includes('kerkede'))
    return '/image/products/Hibiscus ( 100g ).png';

  // Shilajit 60 Tablet (Himalaya)
  if (n.includes('shilajit') && (n.includes('tablet') || n.includes('60')))
    return '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png';

  // Shilajit Gummies (Neuherb)
  if (n.includes('shilajit') && (n.includes('gumm') || n.includes('30')))
    return '/image/products/Neuherb Shilajit Gummies  (30 Gummies ).png';

  // Shilajit Gel / Oil (Neuherb)
  if (n.includes('shilajit') && (n.includes('gel') || n.includes('oil') || n.includes('20')))
    return '/image/products/Neuherb Shilajit gel 20g.png';

  // Shilajit generic fallback
  if (n.includes('shilajit'))
    return '/image/products/Himalaya Shilajit 60 Tablet   ( 500 mg ).png';

  // Kerebe / Myrrh Oil
  if ((n.includes('myrrh') && n.includes('oil')) || n.includes('kerebe oil') || n.includes('kerbe oil'))
    return '/image/products/Kerebe Oil (Myrrh Oil )  30ml and 60 ml.png';

  // Kerbe / Myrrh Powder
  if (n.includes('myrrh') || n.includes('kerbe') || n.includes('kerebe') || n.includes('kerbea'))
    return '/image/products/Kerbe Powder ( 100g ).png';

  // Moringa
  if (n.includes('moringa'))
    return '/image/products/Moringa 200g,500g and 1kg.png';

  // Pumpkin Seed
  if (n.includes('pumpkin'))
    return '/image/products/Pumpkin Seed  100g.jpeg';

  // Nila Powder
  if (n.includes('nila'))
    return '/image/products/Nila Powder 100g.jpeg';

  // Qasil / Kesil Powder
  if (n.includes('qasil') || n.includes('kesil'))
    return '/image/products/Qasil Powder ( 200g ).png';

  // No local match
  return '';
}
