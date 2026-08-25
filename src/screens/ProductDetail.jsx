import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ProductGallery from "../components/ProductGallery";

const fmtINR = (n) => Number(n || 0).toLocaleString('en-IN');

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, addToCart, dealer, dealerApplicationStatus } = useApp();
  const [qty, setQty] = useState(1);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const product = products.find((p) => p.id === Number(id));
  if (!product) {
    return (
      <div className="screen">
        <div className="content">Product not found.</div>
      </div>
    );
  }

  const isApprovedDealer = dealerApplicationStatus === 'approved' || dealerApplicationStatus === 'none';
  const d1 = isApprovedDealer ? Number(dealer?.discount1 || 0) : 0;
  const d2 = isApprovedDealer ? Number(dealer?.discount2 || 0) : 0;
  const dlp = Number(product.dlp ?? product.price ?? product.mrp ?? 0);
  const net = isApprovedDealer
    ? Math.round(dlp * (1 - d1 / 100) * (1 - d2 / 100) * 100) / 100
    : Math.round(Number(product.mrp || 0) * 0.85 * 100) / 100;
  const pct = product.mrp && product.mrp > net ? Math.round((product.mrp - net) / product.mrp * 100) : 0;

  // Share link points at the public /store page, not this dealer-only
  // /product/:id route — a customer or non-dealer opening a shared
  // /product/:id link would just get bounced back to /store by DealerRoute,
  // so the store link is the one that actually works for anyone it's sent to.
  const handleShare = async () => {
    const productUrl = `${window.location.origin}/store?product=${product.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: `Check out ${product.name} - MRP ₹${product.mrp}`, url: productUrl });
      } catch (_) {}
    } else {
      setShareUrl(productUrl);
      setShowShareModal(true);
    }
  };

  return (
    <div className="screen" id="screen-product">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/catalogue")}>&#8592;</span>
        <h1>Product Detail</h1>
      </div>
      <div className="content">
        <ProductGallery images={product.image_urls} videoUrl={product.video_url} productName={product.name} />

        <div className="pd-title">{product.name}</div>
        <div className="pd-sku">SKU: {product.sku}</div>

        <div style={{ margin: "10px 0 4px" }}>
          <button
            onClick={handleShare}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, border: "1px solid #7B2D8B", background: "white", color: "#7B2D8B", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}
          >
            🔗 Share This Product
          </button>
        </div>

        <div style={{ margin: "12px 0 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Net price</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#7B2D8B" }}>₹{fmtINR(net)}</span>
            {pct > 0 && (
              <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{pct}% OFF</span>
            )}
          </div>
          {isApprovedDealer ? (
            (product.dlp || product.mrp) && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {product.dlp && <span>DLP <span style={{ textDecoration: "line-through" }}>₹{fmtINR(product.dlp)}</span></span>}
                {product.dlp && product.mrp && <span> · </span>}
                {product.mrp && <span>MRP <span style={{ textDecoration: "line-through" }}>₹{fmtINR(product.mrp)}</span></span>}
              </div>
            )
          ) : (
            product.mrp && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                MRP <span style={{ textDecoration: "line-through" }}>₹{fmtINR(product.mrp)}</span>
              </div>
            )
          )}
        </div>

        <div className="section-title">Warehouse Stock</div>
        <div className="wh-table">
          <div className="wh-row">
            <span>Delhi Warehouse</span>
            <span className="wh-stock">{product.wh?.delhi ?? 0} units</span>
          </div>
          <div className="wh-row">
            <span>Ludhiana Warehouse</span>
            <span className="wh-stock">{product.wh?.ludhiana ?? 0} units</span>
          </div>
          <div className="wh-row">
            <span>Jaipur Warehouse</span>
            <span className="wh-stock">{product.wh?.jaipur ?? 0} units</span>
          </div>
        </div>
        <div className="section-title">Quantity</div>
        <div className="qty-row">
          <div className="qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>-</div>
          <div className="qty-val">{qty}</div>
          <div className="qty-btn" onClick={() => setQty((q) => q + 1)}>+</div>
        </div>
        <button className="btn" onClick={() => addToCart(product, qty)}>Add to Cart</button>
      </div>

      {/* ── Share Modal ── */}
      {showShareModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3500 }}
          onClick={() => setShowShareModal(false)}
        >
          <div
            style={{ background: "white", borderRadius: 16, padding: 24, width: 320, maxWidth: "90vw" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>Share This Product</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                value={shareUrl}
                readOnly
                style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 8, fontSize: 13 }}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(shareUrl); alert("Link copied!"); }}
                style={{ padding: "8px 12px", background: "#7B2D8B", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              >
                Copy
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(product.name + " - MRP ₹" + product.mrp + "\n" + shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "#25D366", color: "white", borderRadius: 8, textDecoration: "none", fontSize: 14 }}
              >
                📱 WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "#1877F2", color: "white", borderRadius: 8, textDecoration: "none", fontSize: 14 }}
              >
                👍 Facebook
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(product.name)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "#1DA1F2", color: "white", borderRadius: 8, textDecoration: "none", fontSize: 14 }}
              >
                🐦 Twitter
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(product.name)}&body=${encodeURIComponent("Check out " + product.name + " - MRP ₹" + product.mrp + "\n" + shareUrl)}`}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "#64748b", color: "white", borderRadius: 8, textDecoration: "none", fontSize: 14 }}
              >
                📧 Email
              </a>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              style={{ marginTop: 16, width: "100%", padding: "10px", background: "none", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 14, fontFamily: "inherit", color: "#64748b" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
