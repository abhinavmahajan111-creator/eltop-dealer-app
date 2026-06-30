import { useState } from "react";

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

export default function ProductGallery({ images = [], videoUrl = null }) {
  const embedUrl = getEmbedUrl(videoUrl);
  const ytThumb = videoUrl ? getYoutubeThumbnail(videoUrl) : null;

  // Build media items: video first (if present), then images
  const items = [
    ...(embedUrl ? [{ type: "video", embedUrl, thumb: ytThumb }] : []),
    ...images.map((url) => ({ type: "image", url })),
  ];

  const [active, setActive] = useState(0);

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
      <div className="gallery-main">
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
    </div>
  );
}
