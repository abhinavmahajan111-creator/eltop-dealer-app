// Shared product-media helpers used by both the public Store product page
// and the dealer-only Product Detail page. Consolidated here (26/31 Aug work
// on checkout already unified the *ordering* logic between /store and the
// Catalogue flow — this does the same for the *display* logic, which used to
// be duplicated with small drifts between Store.jsx's ProductDetailView and
// the dealer-only ProductGallery.jsx/ProductDetail.jsx).

// Handle image_urls (array or JSON string) or image_url (string).
// When image_urls is present but resolves to an empty array (product has no
// uploaded photos yet), fall back to image_url — same logic Store.jsx and
// Catalogue.jsx already relied on; the old dealer ProductDetail.jsx did NOT
// have this fallback, so a dealer-only product with just image_url set could
// show a broken/empty gallery on /product/:id even though it displayed fine
// on /store. Centralizing here fixes that gap for both callers.
export function getImages(p) {
  let urls = p.image_urls;
  if (urls != null) {
    if (typeof urls === "string") {
      try { urls = JSON.parse(urls); } catch { urls = [urls]; }
    }
    if (Array.isArray(urls)) {
      const filtered = urls.filter(Boolean);
      if (filtered.length > 0) return filtered; // has real uploaded photos — use them
      // empty array — fall through to image_url fallback below
    } else if (urls) {
      return [urls];
    }
  }
  // Fallback: single image_url field (e.g. the default red-poster image)
  return p.image_url ? [p.image_url] : [];
}

export function getFirstImage(p) { return getImages(p)[0] || null; }

// Video support — previously only on the dealer flow's ProductGallery.jsx.
// Merged in here so the unified detail view can show product videos to
// everyone (customers included), same as before, just no longer tied to a
// dealer-only-gated component.
export function getEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export function getYoutubeThumbnail(url) {
  const match = url && url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

// Product images are served from Supabase Storage — a different origin than
// eltopbyembassy.com. Browsers ignore the `download` attribute on a
// cross-origin <a> link, so a plain <a href={url} download> just opens the
// raw image in a new tab instead of saving a file. Fix: fetch the image as a
// blob first (same-origin blob: URL), then trigger the download from that.
// Falls back to opening the image in a new tab only if the fetch itself
// fails (e.g. a CORS issue), so there's always some way to save the image.
// (This was previously duplicated, nearly verbatim, in three places —
// Store.jsx's ProductDetailView and the dealer ProductGallery.jsx — now one
// copy shared by both.)
export async function downloadImageAsFile(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = (filename || "product") + ".jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    window.open(url, "_blank");
  }
}
