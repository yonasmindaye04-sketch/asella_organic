/**
 * Resolves the best available image for a product.
 *
 * Priority:
 *   1. DB `image_url` if it's a local path (`/image/…`) or cloud storage URL
 *   2. DB `image_url` if it's any other HTTP URL
 *   3. Local `/image/products/…` file matched by product name
 *   4. Empty string (no image available)
 */
export function resolveProductImage(
  dbImageUrl: string | null | undefined,
  productName: string,
  options?: { width?: number; quality?: number },
): string {
  const { width = 400, quality = 78 } = options ?? {};

  // 1. If DB has an image URL, use it first
  if (dbImageUrl && dbImageUrl.trim() !== '') {
    const url = dbImageUrl.trim();

    // Local path - optimize it
    if (url.startsWith('/image/') || url.startsWith('/image\\')) {
      return optimizeLocalUrl(url, width, quality);
    }

    // Cloud storage URLs - convert to direct image links
    const cloudUrl = convertCloudStorageUrl(url);
    if (cloudUrl) return cloudUrl;

    // Full external URL (fallback)
    if (url.startsWith('http')) return url;
  }

  // 2. Fallback: Try local image by product name
  const localMatch = getLocalImage(productName);
  if (localMatch) return optimizeLocalUrl(localMatch, width, quality);

  return '';
}

/**
 * Converts various cloud storage URLs to direct image URLs.
 * Supports: Google Drive, Dropbox, OneDrive, Box, Cloudinary, Imgur, etc.
 */
function convertCloudStorageUrl(url: string): string | null {
  try {
    const u = new URL(url);

    // Google Drive - multiple URL formats
    if (u.hostname.includes('drive.google.com') || u.hostname.includes('docs.google.com')) {
      // Format: https://drive.google.com/file/d/FILE_ID/view
      let fileId = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      // Format: https://drive.google.com/open?id=FILE_ID
      if (!fileId) fileId = u.searchParams.get('id') ?? undefined;
      // Format: https://docs.google.com/uc?id=FILE_ID
      if (!fileId) fileId = u.searchParams.get('id') ?? undefined;
      if (fileId) {
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }

    // Dropbox - convert to raw=1
    if (u.hostname.includes('dropbox.com')) {
      if (u.searchParams.has('raw')) return url;
      u.searchParams.set('raw', '1');
      return u.toString();
    }

    // OneDrive / SharePoint - use /download endpoint
    if (u.hostname.includes('1drv.ms') || u.hostname.includes('onedrive.live.com') || u.hostname.includes('sharepoint.com')) {
      // For onedrive/SharePoint, we can't easily convert without API, return as-is
      // but add a note that it might not work directly
      return url;
    }

    // Box.com - use direct download
    if (u.hostname.includes('box.com')) {
      const fileId = u.pathname.match(/\/file\/([a-zA-Z0-9]+)/)?.[1];
      if (fileId) {
        return `https://app.box.com/api/2.0/files/${fileId}/content`;
      }
    }

    // Cloudinary - already direct, but we can add transformations
    if (u.hostname.includes('cloudinary.com')) {
      return url; // Already a direct image URL
    }

    // Imgur - convert to direct image
    if (u.hostname.includes('imgur.com')) {
      const id = u.pathname.match(/\/([a-zA-Z0-9]+)(?:\.\w+)?$/)?.[1];
      if (id && !u.pathname.includes('/a/') && !u.pathname.includes('/gallery/')) {
        return `https://i.imgur.com/${id}.jpg`;
      }
      return url;
    }

    // GitHub raw content
    if (u.hostname === 'raw.githubusercontent.com' || u.hostname === 'github.com') {
      if (u.hostname === 'github.com') {
        // Convert github.com/user/repo/blob/path to raw.githubusercontent.com/user/repo/path
        const parts = u.pathname.split('/');
        if (parts.length >= 5 && parts[3] === 'blob') {
          parts.splice(3, 1); // Remove 'blob'
          return `https://raw.githubusercontent.com${parts.join('/')}`;
        }
      }
      return url;
    }

    // AWS S3 - already direct if public
    if (u.hostname.includes('s3.') || u.hostname.includes('.s3.')) {
      return url;
    }

    // Google Cloud Storage
    if (u.hostname.includes('storage.googleapis.com')) {
      return url;
    }

    // Azure Blob Storage
    if (u.hostname.includes('.blob.core.windows.net')) {
      return url;
    }

  } catch {
    // Invalid URL, return null
  }

  return null;
}

/**
 * Appends ?w=&q= to a local /image/* URL so the backend optimizer picks it up.
 * External URLs are returned unchanged.
 */
export function optimizeLocalUrl(src: string, width = 800, quality = 78): string {
  if (!src || !src.startsWith('/image/')) return src;
  return `${src}?w=${width}&q=${quality}`;
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

  // Cinnamon
  if (n.includes('cinnamon'))
    return '/image/products/Cinnamon.png';

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
    return '/image/products/Asella Frankincense Raw.jpeg'; // correct filename

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
