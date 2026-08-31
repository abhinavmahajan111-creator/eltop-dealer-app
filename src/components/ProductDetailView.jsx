import { useEffect, useState } from "react";
import { getImages, getEmbedUrl, getYoutubeThumbnail, downloadImageAsFile } from "../utils/productMedia";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

// ── Consolidated Product Detail view ────────────────────────────────────────
// Used by both the public /store page (Store.jsx) and the dealer-only
// /product/:id page (ProductDetail.jsx). Before 31 Aug 2026 these were two
// separate, drifting implementations — Store.jsx's richer inline version
// (zoom lightbox, collapsible About/Specs/Item Details, quick specs table)
// vs. the dealer flow's simpler one (video support, a Warehouse Stock table,
// no collapsible sections). This component merges both feature sets:
//   - Video support (YouTube/Vimeo) is shown to everyone — just product
//     marketing content, not sensitive.
//   - Warehouse Stock is shown ONLY when `showWarehouseStock` is true, which
//     callers gate on `isApprovedDealer` — a guest/customer on /store must
//     never see it, same as they never see dealer (DLP) pricing today.
//
// `compact` switches between Store's desktop two-column layout (thumbnail
// rail beside a wide main image) and a single-column stacked layout with a
// horizontal thumbnail row below the main image — needed because the dealer
// route always renders inside the narrow (≤640px) PhoneFrame, where a fixed
// desktop-width image column would overflow.
export default function ProductDetailView({
  product: p,
  onBack,
  showBackButton = true,
  backLabel = "← Back to Products",
  onAdd,
  qty,
  onIncrease,
  onDecrease,
  effectivePrice,
  pricingMode,
  showWarehouseStock = false,
  compact = false,
}) {
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);
  const [showItemDetails, setShowItemDetails] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const images = getImages(p);
  const embedUrl = getEmbedUrl(p.video_url);
  const ytThumb = p.video_url ? getYoutubeThumbnail(p.video_url) : null;
  // Media rail: video first (if present), then images — same ordering the
  // dealer flow's ProductGallery.jsx used.
  const media = [
    ...(embedUrl ? [{ type: "video", embedUrl, thumb: ytThumb }] : []),
    ...images.map((url) => ({ type: "image", url })),
  ];
  const current = media[Math.min(activeImg, media.length - 1)] || null;

  // Close lightbox on Escape key
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  const handleShare = async () => {
    const productUrl = `${window.location.origin}/store?product=${p.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: p.name, text: `Check out ${p.name} - MRP ₹${p.mrp}`, url: productUrl });
      } catch (_) {}
    } else {
      setShareUrl(productUrl);
      setShowShareModal(true);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: compact ? "12px 0 40px" : "20px 16px 60px" }}>
      {showBackButton && (
        <button
          onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1.5px solid #7B2D8B", color: "#7B2D8B", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}
        >
          {backLabel}
        </button>
      )}

      <div style={{ display: "flex", gap: compact ? 0 : 32, flexWrap: "wrap", flexDirection: compact ? "column" : "row" }}>
        {/* Left/top: image + video viewer */}
        <div style={{ flex: compact ? "1 1 auto" : "1 1 340px", maxWidth: compact ? "100%" : 480, minWidth: 0, display: "flex", gap: 10, flexDirection: compact ? "column" : "row" }}>

          {/* Thumbnail rail — left of main image on desktop, below it on compact/phone-frame layouts */}
          {media.length > 1 && (
            <div style={{
              display: "flex",
              flexDirection: compact ? "row" : "column",
              gap: 8,
              width: compact ? "100%" : 72,
              flexShrink: 0,
              overflowX: compact ? "auto" : "visible",
              overflowY: compact ? "visible" : "auto",
              maxHeight: compact ? "none" : 440,
              order: compact ? 2 : 0,
            }}>
              {media.map((item, i) => (
                <div
                  key={i}
                  onClick={() => setActiveImg(i)}
                  style={{
                    width: 70, height: 70, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                    border: i === activeImg ? "2px solid #7B2D8B" : "2px solid transparent",
                    cursor: "pointer", background: "#f9f8ff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: i === activeImg ? 1 : 0.6,
                    transition: "opacity .15s, border-color .15s",
                    boxShadow: i === activeImg ? "0 0 0 1px #7B2D8B" : "0 1px 4px rgba(0,0,0,.1)",
                    position: "relative",
                  }}
                >
                  {item.type === "video" ? (
                    <>
                      {item.thumb
                        ? <img src={item.thumb} alt="video" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ background: "#222", width: "100%", height: "100%" }} />}
                      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>▶</span>
                    </>
                  ) : (
                    <img src={item.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Main image / video */}
          <div
            onClick={() => current && current.type === "image" && setLightbox(true)}
            style={{
              flex: 1, minWidth: 0, background: "#f9f8ff", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: current && current.type === "video" ? 0 : "20px 20px", backgroundColor: "#f9f9f9",
              borderRadius: 12, minHeight: compact ? 260 : 380,
              border: "1px solid #edf0f7", cursor: current && current.type === "image" ? "zoom-in" : "default",
              position: "relative",
            }}
          >
            {!current && <span style={{ fontSize: 80, opacity: 0.2 }}>📦</span>}
            {current && current.type === "video" && (
              <iframe
                src={current.embedUrl}
                title="Product video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ width: "100%", height: compact ? 260 : 380, border: "none" }}
              />
            )}
            {current && current.type === "image" && (
              <>
                <img src={current.url} alt={p.name} style={{ maxWidth: "85%", maxHeight: compact ? 240 : 360, objectFit: "contain", cursor: "zoom-in", display: "block", margin: "0 auto" }} />
                <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 11, color: "#94a3b8", background: "rgba(255,255,255,.8)", borderRadius: 6, padding: "2px 8px" }}>
                  🔍 {compact ? "Tap" : "Click"} to zoom
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right/bottom: info */}
        <div style={{ flex: 1, minWidth: compact ? "100%" : 260, marginTop: compact ? 16 : 0 }}>
          {p.category && (
            <span style={{ display: "inline-block", background: "#7B2D8B", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {p.category}
            </span>
          )}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", lineHeight: 1.3, margin: "0 0 8px" }}>{p.name}</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px 0' }}>
            <button
              onClick={handleShare}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: '1px solid #7B2D8B', background: 'white', color: '#7B2D8B', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}
            >
              🔗 Share This Product
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {p.sku      && <div style={{ fontSize: 13, color: "#64748b" }}>SKU: <strong style={{ color: "#334155" }}>{p.sku}</strong></div>}
            {p.hsn_code && <div style={{ fontSize: 13, color: "#64748b" }}>HSN Code: <strong style={{ color: "#334155" }}>{p.hsn_code}</strong></div>}
            {p.unit     && <div style={{ fontSize: 13, color: "#64748b" }}>Unit: <strong style={{ color: "#334155" }}>{p.unit}</strong></div>}
          </div>

          {(() => {
            const discPct = p.mrp && effectivePrice < p.mrp ? Math.round((p.mrp - effectivePrice) / p.mrp * 100) : 0;
            const showDlp = pricingMode === 'dealer' && p.dlp && effectivePrice < p.dlp;
            const showMrp = p.mrp && effectivePrice < p.mrp;
            return (
              <div style={{ background: "#faf7ff", border: "1px solid #e9d5f5", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Net price</span>
                  <span style={{ fontSize: 32, fontWeight: 900, color: "#7B2D8B" }}>₹{fmt(effectivePrice)}</span>
                  {discPct > 0 && (
                    <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: 13, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{discPct}% OFF</span>
                  )}
                </div>
                {(showDlp || showMrp) && (
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {showDlp && <span>DLP <span style={{ textDecoration: "line-through" }}>₹{fmt(p.dlp)}</span></span>}
                    {showDlp && showMrp && <span> · </span>}
                    {showMrp && <span>MRP <span style={{ textDecoration: "line-through" }}>₹{fmt(p.mrp)}</span></span>}
                  </div>
                )}
              </div>
            );
          })()}

          {!qty ? (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(p); }}
              style={{ width: "100%", padding: "13px 0", background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}
            >
              + Add to Cart
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#7B2D8B", borderRadius: 10, overflow: "hidden", width: "100%", marginBottom: 10 }}>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onDecrease(p.id); }} style={{ background: "none", border: "none", color: "white", fontSize: 28, fontWeight: "bold", cursor: "pointer", padding: "10px 20px", lineHeight: 1 }}>−</button>
              <span style={{ color: "white", fontWeight: "bold", fontSize: 20 }}>{qty}</span>
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onIncrease(p.id); }} style={{ background: "none", border: "none", color: "white", fontSize: 28, fontWeight: "bold", cursor: "pointer", padding: "10px 20px", lineHeight: 1 }}>+</button>
            </div>
          )}
          {/* Only relevant to guests/customers browsing dealer-priced items —
              an already-approved dealer is already getting dealer pricing,
              so showing this note to them (as the old Store.jsx version
              always did, unconditionally) didn't make sense. */}
          {pricingMode !== 'dealer' && (
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
              Sign up to place orders at dealer pricing
            </div>
          )}

          {/* Warehouse Stock — dealer-only, never shown to a guest/customer.
              Gated by the same isApprovedDealer flag callers use for dealer
              pricing, regardless of whether they're on /store or /product/:id. */}
          {showWarehouseStock && (
            <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <div style={{ padding: "9px 14px", background: "#f9f8ff", fontSize: 12, fontWeight: 700, color: "#7B2D8B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Warehouse Stock
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[
                    ["Delhi Warehouse", p.wh?.delhi ?? 0],
                    ["Ludhiana Warehouse", p.wh?.ludhiana ?? 0],
                    ["Jaipur Warehouse", p.wh?.jaipur ?? 0],
                  ].map(([label, units], i, arr) => (
                    <tr key={label} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: 12 }}>{label}</td>
                      <td style={{ padding: "9px 14px", color: "#1e293b", fontWeight: 600, textAlign: "right" }}>{units} units</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick specs */}
          {(p.standard_packing || p.unit || p.brand || p.warranty) && (
            <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {[
                    ["Brand", p.brand],
                    ["Unit", p.unit],
                    ["Standard Packing", p.standard_packing ? `${p.standard_packing} pcs` : null],
                    ["Warranty", p.warranty],
                    ["Colour", p.colour],
                    ["Material", p.material],
                    ["Weight", p.weight],
                    ["Dimensions", p.dimensions],
                    ["Power Source", p.power_source],
                    ["Wattage", p.wattage],
                    ["Voltage", p.voltage],
                    ["Mounting Type", p.mounting_type],
                    ["Room Type", p.room_type],
                  ].filter(([, v]) => v).map(([label, val], i, arr) => (
                    <tr key={label} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <td style={{ padding: "9px 14px", color: "#64748b", width: "42%", fontSize: 12 }}>{label}</td>
                      <td style={{ padding: "9px 14px", color: "#1e293b", fontWeight: 600 }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── About This Item (collapsible) ── */}
      <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
        <div
          onClick={() => setShowAbout(!showAbout)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#7B2D8B', cursor: 'pointer', userSelect: 'none' }}
        >
          <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 'bold' }}>📋 About This Item</h3>
          <span style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{showAbout ? '▲' : '▼'}</span>
        </div>
        {showAbout && (
          <div style={{ padding: 16, background: '#fafafa' }}>
            {Array.isArray(p.about_item) && p.about_item.filter(Boolean).length > 0 ? (
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {p.about_item.filter(Boolean).map((pt, i) => (
                  <li key={i} style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.6 }}>{pt}</li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#bbb', fontSize: 14, margin: 0 }}>No description added yet</p>
            )}
          </div>
        )}
      </div>

      {/* ── Features & Specs (collapsible) ── */}
      {(() => {
        const SPEC_FIELDS = [
          { key: 'power_source', label: 'Power Source' },
          { key: 'room_type', label: 'Room Type' },
          { key: 'mounting_type', label: 'Mounting Type' },
          { key: 'special_features', label: 'Special Features' },
          { key: 'recommended_use', label: 'Recommended Use' },
          { key: 'colour', label: 'Colour' },
          { key: 'style', label: 'Style' },
          { key: 'material', label: 'Material' },
          { key: 'wattage', label: 'Wattage' },
          { key: 'voltage', label: 'Voltage' },
          { key: 'speed', label: 'Speed' },
          { key: 'capacity', label: 'Capacity' },
          { key: 'warranty', label: 'Warranty' },
          { key: 'weight', label: 'Weight' },
          { key: 'dimensions', label: 'Dimensions' },
        ];
        const ITEM_DETAIL_FIELDS = [
          { key: 'brand', label: 'Brand' },
          { key: 'colour', label: 'Colour' },
          { key: 'style', label: 'Style' },
          { key: 'warranty', label: 'Warranty' },
          { key: 'weight', label: 'Weight' },
          { key: 'dimensions', label: 'Dimensions' },
          { key: 'material', label: 'Material' },
          { key: 'wattage', label: 'Wattage' },
          { key: 'voltage', label: 'Voltage' },
          { key: 'power_source', label: 'Power Source' },
          { key: 'mounting_type', label: 'Mounting Type' },
          { key: 'room_type', label: 'Room Type' },
          { key: 'special_features', label: 'Special Features' },
        ];
        const specsVis = p.features_specs?.visibility || {};
        const specs = p.features_specs?.values || {};
        const itemVis = p.item_details?.visibility || {};
        const itemDetails = p.item_details?.values || {};
        const hdrStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#7B2D8B', cursor: 'pointer', userSelect: 'none' };
        const renderRow = (key, label, val, vis) => {
          if (vis[key] === false) return null;
          return (
            <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '10px 12px', fontWeight: 500, width: '40%', background: '#f9f9f9', fontSize: 14 }}>{label}</td>
              <td style={{ padding: '10px 12px', fontSize: 14, color: val ? '#333' : '#bbb' }}>{val || '—'}</td>
            </tr>
          );
        };
        return (
          <>
            <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => setShowSpecs(!showSpecs)} style={hdrStyle}>
                <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 'bold' }}>⚡ Features &amp; Specs</h3>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{showSpecs ? '▲' : '▼'}</span>
              </div>
              {showSpecs && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>{SPEC_FIELDS.map(({ key, label }) => renderRow(key, label, specs[key], specsVis))}</tbody>
                </table>
              )}
            </div>
            <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => setShowItemDetails(!showItemDetails)} style={hdrStyle}>
                <h3 style={{ color: 'white', margin: 0, fontSize: 15, fontWeight: 'bold' }}>📦 Item Details</h3>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{showItemDetails ? '▲' : '▼'}</span>
              </div>
              {showItemDetails && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>{ITEM_DETAIL_FIELDS.map(({ key, label }) => renderRow(key, label, itemDetails[key], itemVis))}</tbody>
                </table>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Share Modal ── */}
      {showShareModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3500 }}
          onClick={() => setShowShareModal(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 16, padding: 24, width: 320, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Share This Product</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={shareUrl}
                readOnly
                style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Link copied!'); }}
                style={{ padding: '8px 12px', background: '#7B2D8B', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Copy
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(p.name + ' - MRP ₹' + p.mrp + '\n' + shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#25D366', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                📱 WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#1877F2', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                👍 Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(p.name)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#1DA1F2', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                🐦 Twitter
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(p.name)}&body=${encodeURIComponent('Check out ' + p.name + ' - MRP ₹' + p.mrp + '\n' + shareUrl)}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: '#64748b', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
              >
                📧 Email
              </a>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              style={{ marginTop: 16, width: '100%', padding: '10px', background: 'none', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', color: '#64748b' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Lightbox (images only — video plays inline in the main viewer) ── */}
      {lightbox && current && current.type === "image" && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* Controls top-right */}
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => downloadImageAsFile(current.url, p.name)}
              style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >
              ⬇️ Download
            </button>
            <button
              onClick={() => setLightbox(false)}
              style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, width: 40, height: 40, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ✕
            </button>
          </div>

          {/* Image */}
          <img
            src={current.url}
            alt={p.name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.6)" }}
          />

          {/* Thumbnail strip at bottom (images only — video isn't reachable via lightbox) */}
          {images.length > 1 && (
            <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, maxWidth: "90vw", overflowX: "auto" }} onClick={e => e.stopPropagation()}>
              {media.map((item, i) => item.type === "image" && (
                <div
                  key={i}
                  onClick={() => setActiveImg(i)}
                  style={{ width: 52, height: 52, borderRadius: 6, overflow: "hidden", border: i === activeImg ? "2px solid #fff" : "2px solid rgba(255,255,255,.3)", cursor: "pointer", background: "#222", flexShrink: 0 }}
                >
                  <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
