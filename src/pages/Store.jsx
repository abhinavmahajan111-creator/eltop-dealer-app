import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ── Cart helpers ──────────────────────────────────────────────────────────────
function useCart() {
  const [items, setItems] = useState([]);

  const add = (product) =>
    setItems(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });

  const change = (id, delta) =>
    setItems(prev =>
      prev.map(i => i.product.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0)
    );

  const total = items.reduce((s, i) => s + (Number(i.product.mrp) || 0) * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  return { items, add, change, total, count };
}

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

// Handle image_urls (array or JSON string) or image_url (string)
function getImages(p) {
  let urls = p.image_urls ?? p.image_url ?? null;
  if (!urls) return [];
  if (typeof urls === "string") {
    // Could be a JSON array string or a plain URL
    try { urls = JSON.parse(urls); } catch { urls = [urls]; }
  }
  if (Array.isArray(urls)) return urls.filter(Boolean);
  return [urls].filter(Boolean);
}
function getFirstImage(p) { return getImages(p)[0] || null; }

const CAT_ICONS = {
  "Fans": "🌀", "Wiring Devices": "🔌", "Cables": "🔋", "Lighting": "💡",
  "Switches": "🔘", "MCB": "⚡", "Distribution": "🗂️", "Motors": "⚙️", "Tools": "🔧",
  "Coolers": "❄️", "Geysers": "🔥", "Heaters": "♨️", "Kitchen": "🍳",
};
const catIcon = (name) => CAT_ICONS[name] || "📦";

// ── Cart Drawer ───────────────────────────────────────────────────────────────
function CartDrawer({ cart, onClose, onLoginClick }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(380px, 100vw)", background: "#fff",
        zIndex: 1001, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#7B2D8B" }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>
            🛒 Cart {cart.count > 0 && <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.85 }}>({cart.count})</span>}
          </span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 6, color: "#fff", width: 32, height: 32, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {cart.items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🛒</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Your cart is empty</div>
            </div>
          ) : cart.items.map(({ product: p, qty }) => (
            <div key={p.id} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ width: 60, height: 60, borderRadius: 8, overflow: "hidden", border: "1px solid #eee", flexShrink: 0, background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {getFirstImage(p)
                  ? <img src={getFirstImage(p)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : <span style={{ fontSize: 26 }}>📦</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "#1e293b", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#DC2626" }}>₹{fmt(p.mrp)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <button onClick={() => cart.change(p.id, +1)} style={qtyBtnStyle}>+</button>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{qty}</span>
                <button onClick={() => cart.change(p.id, -1)} style={qtyBtnStyle}>−</button>
              </div>
            </div>
          ))}
        </div>

        {cart.items.length > 0 && (
          <div style={{ padding: "14px 16px", borderTop: "2px solid #eee" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>Total MRP</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: "#1e293b" }}>₹{fmt(cart.total)}</span>
            </div>
            <button
              onClick={() => alert("Thank you! We'll contact you soon.")}
              style={{ width: "100%", padding: "12px 0", background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}
            >
              Place Order
            </button>
            <div style={{ background: "#E8D5F0", border: "1px solid #C084D4", borderRadius: 8, padding: "10px 12px", marginTop: 10, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#7B2D8B", fontWeight: 700 }}>🎉 Login to get 15% OFF this order!</div>
              <span onClick={onLoginClick} style={{ fontSize: 12, color: "#7B2D8B", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Login / Sign Up →</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const qtyBtnStyle = {
  width: 28, height: 28, border: "1.5px solid #e2e8f0", borderRadius: 6,
  background: "#f8f8f8", cursor: "pointer", fontSize: 15, fontWeight: 700,
  lineHeight: 1, padding: 0, fontFamily: "inherit",
};

// ── Category Card ─────────────────────────────────────────────────────────────
function CategoryCard({ cat, count, image, isAll, onClick }) {
  const [hov, setHov] = useState(false);
  const bg = isAll
    ? "linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%)"
    : image
      ? `url(${image})`
      : "linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%)";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="cat-card"
      style={{
        backgroundImage: bg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transform: hov ? "scale(1.03)" : "scale(1)",
        boxShadow: hov ? "0 0 0 3px #7B2D8B, 0 8px 24px rgba(123,45,139,.3)" : "0 2px 12px rgba(0,0,0,.15)",
      }}
    >
      <div className="cat-card-overlay" style={{ background: hov ? "rgba(0,0,0,.45)" : "rgba(0,0,0,.35)" }} />
      <div className="cat-card-content">
        <span className="cat-card-icon">{catIcon(cat)}</span>
        <div className="cat-card-name">{cat}</div>
        <div className="cat-card-count">{count} Product{count !== 1 ? "s" : ""}</div>
      </div>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product: p, onAdd, onSelect }) {
  const [hov, setHov] = useState(false);
  const saving = Math.round((Number(p.mrp) || 0) * 0.15);

  return (
    <div
      onClick={() => { onSelect(p); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #edf0f7",
        boxShadow: hov ? "0 8px 28px rgba(124,58,237,.14)" : "0 1px 6px rgba(0,0,0,.06)",
        transform: hov ? "translateY(-2px)" : "none",
        transition: "all .18s", overflow: "hidden",
        display: "flex", flexDirection: "column",
        cursor: "pointer",
      }}
    >
      <div style={{ background: "#f9f8ff", position: "relative", paddingTop: "75%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
          {getFirstImage(p)
            ? <img src={getFirstImage(p)} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 40, opacity: 0.35 }}>📦</span>}
        </div>
        {p.category && (
          <span style={{ position: "absolute", top: 6, left: 6, background: "#7B2D8B", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {p.category}
          </span>
        )}
        {saving > 0 && (
          <span style={{ position: "absolute", top: 6, right: 6, background: "#E8001C", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 20 }}>
            -15%
          </span>
        )}
      </div>

      <div style={{ padding: "10px 10px 8px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#1e293b", lineHeight: 1.4, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: "2.8em" }}>
          {p.name}
        </div>

        <div>
          {p.sku      && <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU <span style={{ color: "#64748b", fontWeight: 600 }}>{p.sku}</span></div>}
          {p.hsn_code && <div style={{ fontSize: 10, color: "#94a3b8" }}>HSN <span style={{ color: "#64748b", fontWeight: 600 }}>{p.hsn_code}</span></div>}
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>MRP</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>₹{fmt(p.mrp)}</span>
          </div>
          {saving > 0 && (
            <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 700, marginTop: 1 }}>
              🔓 Login to save ₹{fmt(saving)}!
            </div>
          )}
        </div>

        <button
          onClick={e => { e.stopPropagation(); onAdd(p); }}
          style={{ width: "100%", padding: "8px 0", background: hov ? "#6A1F7A" : "#7B2D8B", color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "background .15s", marginTop: 2 }}
        >
          + Add to Cart
        </button>
      </div>
    </div>
  );
}

// ── Product Detail View ───────────────────────────────────────────────────────
function ProductDetailView({ product: p, onBack, onAdd }) {
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const saving = Math.round((Number(p.mrp) || 0) * 0.15);
  const images = getImages(p);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e) => { if (e.key === "Escape") setLightbox(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  const handleDownload = (url) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = (p.name || "product") + ".jpg";
    a.target = "_blank";
    a.click();
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      <button
        onClick={onBack}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1.5px solid #7B2D8B", color: "#7B2D8B", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 20 }}
      >
        ← Back to Products
      </button>

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {/* Left: image viewer */}
        <div style={{ flex: "0 0 420px", minWidth: 0, display: "flex", gap: 10 }}>

          {/* Thumbnail column — left of main image */}
          {images.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 72, flexShrink: 0, overflowY: "auto", maxHeight: 440 }}>
              {images.map((url, i) => (
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
                  }}
                >
                  <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
              ))}
            </div>
          )}

          {/* Main image */}
          <div
            onClick={() => images[activeImg] && setLightbox(true)}
            style={{
              flex: 1, background: "#f9f8ff", borderRadius: 14, overflow: "hidden",
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "20px 40px 20px 20px", backgroundColor: "#f9f9f9",
              borderRadius: 12, margin: "0 16px 0 0", minHeight: 380,
              border: "1px solid #edf0f7", cursor: images[activeImg] ? "zoom-in" : "default",
              position: "relative",
            }}
          >
            {images[activeImg]
              ? <img src={images[activeImg]} alt={p.name} style={{ maxWidth: "85%", maxHeight: 360, objectFit: "contain", cursor: "zoom-in", display: "block", margin: "0 auto" }} />
              : <span style={{ fontSize: 80, opacity: 0.2 }}>📦</span>}
            {images[activeImg] && (
              <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 11, color: "#94a3b8", background: "rgba(255,255,255,.8)", borderRadius: 6, padding: "2px 8px" }}>
                🔍 Click to zoom
              </span>
            )}
          </div>
        </div>

        {/* Right: info */}
        <div style={{ flex: 1, minWidth: 260 }}>
          {p.category && (
            <span style={{ display: "inline-block", background: "#7B2D8B", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {p.category}
            </span>
          )}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", lineHeight: 1.3, margin: "0 0 12px" }}>{p.name}</h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {p.sku      && <div style={{ fontSize: 13, color: "#64748b" }}>SKU: <strong style={{ color: "#334155" }}>{p.sku}</strong></div>}
            {p.hsn_code && <div style={{ fontSize: 13, color: "#64748b" }}>HSN Code: <strong style={{ color: "#334155" }}>{p.hsn_code}</strong></div>}
            {p.unit     && <div style={{ fontSize: 13, color: "#64748b" }}>Unit: <strong style={{ color: "#334155" }}>{p.unit}</strong></div>}
          </div>

          <div style={{ background: "#fff7f7", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>MRP (incl. all taxes)</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#DC2626" }}>₹{fmt(p.mrp)}</div>
            {saving > 0 && (
              <div style={{ marginTop: 6, fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                🔓 Login as dealer to save ₹{fmt(saving)} (15% OFF)
              </div>
            )}
          </div>

          <button
            onClick={() => onAdd(p)}
            style={{ width: "100%", padding: "13px 0", background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}
          >
            + Add to Cart
          </button>
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Sign up to place orders at dealer pricing
          </div>

          {/* Specs table */}
          {(p.standard_packing || p.stock != null) && (
            <div style={{ marginTop: 24, borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <div style={{ background: "#f8f9fc", padding: "10px 16px", fontWeight: 700, fontSize: 13, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
                Specifications
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {p.standard_packing && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 16px", color: "#64748b", width: "40%" }}>Standard Packing</td>
                      <td style={{ padding: "10px 16px", color: "#1e293b", fontWeight: 600 }}>{p.standard_packing}</td>
                    </tr>
                  )}
                  {p.unit && (
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>Unit</td>
                      <td style={{ padding: "10px 16px", color: "#1e293b", fontWeight: 600 }}>{p.unit}</td>
                    </tr>
                  )}
                  {p.category && (
                    <tr>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>Category</td>
                      <td style={{ padding: "10px 16px", color: "#1e293b", fontWeight: 600 }}>{p.category}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightbox && images[activeImg] && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* Controls top-right */}
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => handleDownload(images[activeImg])}
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
            src={images[activeImg]}
            alt={p.name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.6)" }}
          />

          {/* Thumbnail strip at bottom */}
          {images.length > 1 && (
            <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
              {images.map((url, i) => (
                <div
                  key={i}
                  onClick={() => setActiveImg(i)}
                  style={{ width: 52, height: 52, borderRadius: 6, overflow: "hidden", border: i === activeImg ? "2px solid #fff" : "2px solid rgba(255,255,255,.3)", cursor: "pointer", background: "#222", flexShrink: 0 }}
                >
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Store() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState(null); // null = show category landing
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const productsRef = useRef(null);
  const containerRef = useRef(null);
  const cart = useCart();

  const scrollToTop = () => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase
      .from("products")
      .select("id, name, mrp, unit, stock, hsn_code, category, image_urls, image_url, sku")
      .order("category", { nullsFirst: true })
      .order("name")
      .then(({ data, error }) => {
        console.log("products:", data, "error:", error);
        if (data) setProducts(data);
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [products]);

  // Category metadata: count + first image
  const catMeta = useMemo(() => {
    const meta = {};
    for (const cat of categories) {
      const prods = products.filter(p => p.category === cat);
      meta[cat] = {
        count: prods.length,
        image: getFirstImage(prods.find(p => getFirstImage(p)) || {}),
      };
    }
    return meta;
  }, [categories, products]);

  const filtered = useMemo(() => {
    if (!category && !search) return [];
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchCat = !category || category === "All" || p.category === category;
      const matchQ   = !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.hsn_code?.includes(q);
      return matchCat && matchQ;
    });
  }, [products, search, category]);

  // When search is typed from landing, switch to "All" view
  function handleSearch(val) {
    setSearch(val);
    if (val && !category) setCategory("All");
  }

  function selectCategory(cat) {
    setCategory(cat);
    scrollToTop();
  }

  function backToCategories() {
    setCategory(null);
    setSearch("");
    scrollToTop();
  }

  const showLanding = !category && !search;

  return (
    <div className="store-root" ref={containerRef}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .store-root { min-height: 100vh; background: #F1F3F6; font-family: inherit; overflow-x: hidden; max-width: 100vw; }

        /* ── Header ── */
        .store-header { position: sticky; top: 0; z-index: 200; background: #FFFFFF; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
        .store-header-inner { max-width: 1400px; margin: 0 auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; }
        .store-row1 { display: flex; align-items: center; gap: 12px; width: 100%; justify-content: space-between; }
        .store-row2 { display: flex; width: 100%; }
        .store-search-wrap { display: flex; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.2); flex: 1; min-width: 0; }
        .store-search-wrap input { flex: 1; padding: 9px 14px; border: none; outline: none; font-size: 14px; font-family: inherit; min-width: 0; width: 100%; }
        .store-search-icon { background: #F59E0B; padding: 0 16px; display: flex; align-items: center; justify-content: center; font-size: 17px; cursor: pointer; flex-shrink: 0; }
        .store-row1-search { display: none; }
        @media (min-width: 640px) {
          .store-header-inner { flex-direction: row; align-items: center; padding: 10px 20px; gap: 16px; justify-content: space-between; }
          .store-row1 { flex: none; }
          .store-row2 { display: none; }
          .store-row1-search { display: flex; flex: 0 1 400px; max-width: 400px; min-width: 0; }
        }

        /* Header right buttons */
        .store-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .btn-login-primary { background: #7B2D8B; border: none; border-radius: 8px; color: #fff; font-weight: 700; font-size: 13px; padding: 8px 14px; cursor: pointer; white-space: nowrap; font-family: inherit; }
        .btn-dealer-login { background: none; border: 1.5px solid #7B2D8B; border-radius: 8px; color: #7B2D8B; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; text-decoration: none; padding: 7px 12px; }
        .store-cart-btn { background: none; border: none; color: #7B2D8B; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 2px 8px; position: relative; flex-shrink: 0; }
        @media (max-width: 639px) {
          .btn-login-primary { font-size: 11px; padding: 7px 10px; }
          .btn-dealer-login  { display: none; }
        }

        /* Hero banner */
        .store-hero { background: linear-gradient(135deg, #7B2D8B 0%, #9B4DB8 100%); color: #fff; text-align: center; padding: 28px 20px; }
        .store-hero-title { font-weight: 900; font-size: 22px; margin-bottom: 6px; }
        .store-hero-sub { font-size: 15px; opacity: 0.9; margin-bottom: 16px; }
        .store-hero-btn { display: inline-block; background: #fff; color: #7B2D8B; font-weight: 800; font-size: 14px; padding: 10px 24px; border-radius: 24px; cursor: pointer; border: none; font-family: inherit; box-shadow: 0 4px 14px rgba(0,0,0,.2); }
        @media (max-width: 639px) {
          .store-hero { padding: 18px 14px; }
          .store-hero-title { font-size: 16px; }
          .store-hero-sub   { font-size: 12px; }
          .store-hero-btn   { font-size: 13px; padding: 9px 20px; }
        }

        /* Category card grid */
        .cat-grid-wrap { max-width: 1400px; margin: 0 auto; padding: 24px 16px 40px; }
        .cat-grid-title { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 16px; }
        .cat-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 640px)  { .cat-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; } }
        @media (min-width: 1024px) { .cat-grid { grid-template-columns: repeat(4, 1fr); } }

        .cat-card {
          position: relative; height: 200px; border-radius: 14px; overflow: hidden;
          cursor: pointer; transition: transform .2s, box-shadow .2s;
        }
        .cat-card-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,.7) 100%);
          transition: background .2s;
        }
        .cat-card-content {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 14px 16px; color: #fff;
        }
        .cat-card-icon { font-size: 22px; display: block; margin-bottom: 4px; }
        .cat-card-name { font-size: 16px; font-weight: 800; line-height: 1.2; text-shadow: 0 1px 4px rgba(0,0,0,.5); }
        .cat-card-count { font-size: 12px; opacity: 0.85; margin-top: 2px; font-weight: 500; }
        @media (max-width: 639px) {
          .cat-card { height: 160px; }
          .cat-card-name { font-size: 14px; }
        }

        /* Product section */
        .store-content { max-width: 1400px; margin: 0 auto; padding: 16px 12px 80px; }
        .store-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 480px)  { .store-grid { gap: 12px; } }
        @media (min-width: 640px)  { .store-grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
        @media (min-width: 900px)  { .store-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 1200px) { .store-grid { grid-template-columns: repeat(5, 1fr); } }

        /* Skeleton */
        .store-skeleton { border-radius: 10px; background: #e2e8f0; animation: pulse 1.4s ease infinite; }
        .cat-skeleton { border-radius: 14px; background: #e2e8f0; animation: pulse 1.4s ease infinite; height: 200px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

        /* Back button */
        .back-btn { display: inline-flex; align-items: center; gap: 6px; background: none; border: 1.5px solid #7B2D8B; color: #7B2D8B; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; margin-bottom: 16px; transition: background .15s; }
        .back-btn:hover { background: #7B2D8B; color: #fff; }
      `}</style>

      {/* ── Header ── */}
      <header className="store-header">
        <div className="store-header-inner">
          <div className="store-row1">
            {/* Dual logos */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px', minWidth: '280px', flexShrink: 0 }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-start' }}>
                <img
                  src="/assets/ELTOP%20LOGO.png"
                  alt="Eltop"
                  style={{ height: '60px', width: 'auto', objectFit: 'contain', display: 'block', filter: 'brightness(0) saturate(100%) invert(17%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' }}
                  onError={e => e.target.style.display = 'none'}
                />
                <span style={{ fontSize: '10px', color: '#FF0000', fontWeight: 'bold', lineHeight: 1 }}>®</span>
              </div>
              <img
                src="/assets/EMBASSY%20LOGO.png"
                alt="Embassy"
                style={{ height: '50px', width: 'auto', objectFit: 'contain', display: 'block', filter: 'brightness(0) saturate(100%) invert(17%) sepia(100%) saturate(7000%) hue-rotate(0deg) brightness(100%) contrast(100%)' }}
                onError={e => e.target.style.display = 'none'}
              />
            </div>

            {/* Search — desktop only */}
            <div className="store-row1-search">
              <div className="store-search-wrap">
                <input type="search" placeholder="Search for electrical products…"
                  value={search} onChange={e => handleSearch(e.target.value)} />
                <div className="store-search-icon">🔍</div>
              </div>
            </div>

            {/* Actions */}
            <div className="store-header-actions">
              <button className="btn-login-primary" onClick={() => navigate("/login")}>
                👤 Login / Sign Up
              </button>
              <button className="btn-dealer-login" onClick={() => navigate("/login")}>
                🤝 Dealer Login
              </button>
              <button className="store-cart-btn" onClick={() => setCartOpen(true)}>
                <span style={{ fontSize: 22 }}>🛒</span>
                <span style={{ fontSize: 10, color: "#7B2D8B", fontWeight: 700 }}>Cart</span>
                {cart.count > 0 && (
                  <span style={{ position: "absolute", top: 0, right: 4, background: "#F59E0B", color: "#1e293b", fontSize: 10, fontWeight: 900, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                    {cart.count}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: search — mobile only */}
          <div className="store-row2">
            <div className="store-search-wrap">
              <input type="search" placeholder="Search products…"
                value={search} onChange={e => handleSearch(e.target.value)} />
              <div className="store-search-icon">🔍</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero banner ── */}
      <div className="store-hero">
        <div className="store-hero-title">Welcome to Eltop by Embassy</div>
        <div className="store-hero-sub">✨ Sign up &amp; get Flat 15% OFF on your first order!</div>
        <button className="store-hero-btn" onClick={() => navigate("/login")}>Claim 15% Discount →</button>
      </div>

      {/* ── Category landing grid ── */}
      {showLanding && (
        <div className="cat-grid-wrap">
          <div className="cat-grid-title">Shop by Category</div>
          {loading ? (
            <div className="cat-grid">
              {[...Array(8)].map((_, i) => <div key={i} className="cat-skeleton" />)}
            </div>
          ) : (
            <div className="cat-grid">
              {categories.map(cat => (
                <CategoryCard
                  key={cat}
                  cat={cat}
                  count={catMeta[cat]?.count || 0}
                  image={catMeta[cat]?.image}
                  isAll={false}
                  onClick={() => selectCategory(cat)}
                />
              ))}
              {/* All Products card — last */}
              <CategoryCard
                cat="All Products"
                count={products.length}
                image={null}
                isAll={true}
                onClick={() => selectCategory("All")}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Product grid (shown when category selected or searching) ── */}
      {selectedProduct && (
        <ProductDetailView
          product={selectedProduct}
          onBack={() => { setSelectedProduct(null); scrollToTop(); }}
          onAdd={p => { cart.add(p); setSelectedProduct(null); scrollToTop(); }}
        />
      )}

      {!showLanding && !selectedProduct && (
        <div className="store-content" ref={productsRef}>
          <button className="back-btn" onClick={backToCategories}>
            ← Back to Categories
          </button>

          {/* Section heading */}
          {category && category !== "All" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 24 }}>{catIcon(category)}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>{category}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{(catMeta[category]?.count || 0)} products</div>
              </div>
            </div>
          )}

          {/* Result count */}
          {!loading && (
            <div style={{ marginBottom: 12, fontSize: 13, color: "#64748b" }}>
              {search
                ? <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> results for "{search}"{category && category !== "All" ? ` in ${category}` : ""}</>
                : <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> products{category && category !== "All" ? ` in ${category}` : ""}</>
              }
            </div>
          )}

          {loading ? (
            <div className="store-grid">
              {[...Array(10)].map((_, i) => <div key={i} className="store-skeleton" style={{ height: 300 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>🔍</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#475569", marginBottom: 6 }}>No products found</div>
              <div style={{ fontSize: 13 }}>Try a different search or category</div>
            </div>
          ) : (
            <div className="store-grid">
              {filtered.map(p => <ProductCard key={p.id} product={p} onAdd={cart.add} onSelect={p => { setSelectedProduct(p); scrollToTop(); }} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <CartDrawer cart={cart} onClose={() => setCartOpen(false)}
          onLoginClick={() => { setCartOpen(false); navigate("/login"); }} />
      )}

      {/* ── Footer ── */}
      <div style={{ background: "#E8D5F0", borderTop: "2px solid #C084D4", padding: "20px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <img src="/assets/ELTOP%20LOGO.png" alt="Eltop" style={{ height: 36, objectFit: "contain", marginBottom: 8 }} onError={e => { e.target.style.display = "none"; }} />
          <div style={{ fontSize: 13, color: "#7B2D8B", fontWeight: 700 }}>Eltop by Embassy Electricals (India) Pvt. Ltd.</div>
          <div style={{ fontSize: 11, color: "#9B4DB8", marginTop: 4 }}>Quality Electrical Products · Dealer Enquiries: <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/login")}>Login as Dealer →</span></div>
        </div>
      </div>
    </div>
  );
}
