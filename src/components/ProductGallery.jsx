import { useEffect, useState } from "react";

function getEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function getYoutubeThumbnail(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

export default function ProductGallery({ images = [], videoUrl = null, productName = "product" }) {
  const embedUrl = getEmbedUrl(videoUrl);
  const ytThumb = videoUrl ? getYoutubeThumbnail(videoUrl) : null;

  // Build media items: video first (if present), then images
  const items = [
    ...(embedUrl ? [{ type: "video", embedUrl, thumb: ytThumb }] : []),
    ...images.map((url) => ({ type: "image", url })),
  ];

  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // Close lightbox on Escape key — same as the Store.jsx version.
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  // Same fix as Store.jsx's ProductDetailView: product images live on
  // Supabase Storage, a different origin, so a plain <a download> is
  // ignored by the browser and just opens the image in a new tab instead
  // of saving it. Fetch it as a blob first so `download` actually works.
  const handleDownload = async (url) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = (productName || "product") + ".jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, "_blank");
    }
  };

  if (items.length === 0) {
    return (
      <div className="pd-img">
        <span style={{ fontSize: 60, color: "#bbb" }}>&#128247;</span>
      </div>
    );
  }

  const current = items[Math.min(active, items.length - 1)];

  return (
    <div>
      <div
        className="gallery-main"
        onClick={() => current.type === "image" && setLightbox(true)}
        style={{ cursor: current.type === "image" ? "zoom-in" : "default", position: "relative" }}
      >
        {current.type === "video" ? (
          <iframe
            src={current.embedUrl}
            title="Product video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <img src={current.url} alt="Product" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        )}
        {current.type === "image" && (
          <span style={{ position: "absolute", bottom: 6, right: 8, fontSize: 10, color: "#94a3b8", background: "rgba(255,255,255,.85)", borderRadius: 6, padding: "2px 7px" }}>
            🔍 Tap to zoom
          </span>
        )}
      </div>

      {items.length > 1 && (
        <div className="gallery-thumbs">
          {items.map((item, i) => (
            <div
              key={i}
              className={`gallery-thumb${active === i ? " active" : ""}`}
              onClick={() => setActive(i)}
            >
              {item.type === "video" ? (
                <div className="gallery-play-wrap">
                  {item.thumb
                    ? <img src={item.thumb} alt="video" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ background: "#222", width: "100%", height: "100%" }} />}
                  <span className="gallery-play">&#9654;</span>
                </div>
              ) : (
                <img src={item.url} alt={`thumb-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && current.type === "image" && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => handleDownload(current.url)}
              style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >
              ⬇️ Download
            </button>
            <button
              onClick={() => setLightbox(false)}
              style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ✕
            </button>
          </div>
          <img
            src={current.url}
            alt="Product"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "92vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.6)" }}
          />
        </div>
      )}
    </div>
  );
}
