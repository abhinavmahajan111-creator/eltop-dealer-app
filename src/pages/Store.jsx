import { useEffect, useMemo, useState } from "react";
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

const CAT_ICONS = {
  "Fans": "🌀", "Wiring Devices": "🔌", "Cables": "🔋", "Lighting": "💡",
  "Switches": "🔘", "MCB": "⚡", "Distribution": "🗂️", "Motors": "⚙️", "Tools": "🔧",
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
                {p.image_urls?.[0]
                  ? <img src={p.image_urls[0]} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
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

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product: p, onAdd }) {
  const [hov, setHov] = useState(false);
  const saving = Math.round((Number(p.mrp) || 0) * 0.15);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff", borderRadius: 10,
        border: "1px solid #edf0f7",
        boxShadow: hov ? "0 8px 28px rgba(124,58,237,.14)" : "0 1px 6px rgba(0,0,0,.06)",
        transform: hov ? "translateY(-2px)" : "none",
        transition: "all .18s", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ background: "#f9f8ff", position: "relative", paddingTop: "75%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
          {p.image_urls?.[0]
            ? <img src={p.image_urls[0]} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
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
          onClick={() => onAdd(p)}
          style={{ width: "100%", padding: "8px 0", background: hov ? "#6A1F7A" : "#7B2D8B", color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "background .15s", marginTop: 2 }}
        >
          + Add to Cart
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Store() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart();

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase
      .from("products")
      .select("id, name, mrp, unit, stock, hsn_code, category, image_urls, sku")
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
    return ["All", ...cats];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchCat = category === "All" || p.category === category;
      const matchQ   = !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.hsn_code?.includes(q);
      return matchCat && matchQ;
    });
  }, [products, search, category]);

  return (
    <div className="store-root">
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

        /* Desktop: single row, search visible in row1 */
        .store-row1-search { display: none; }
        @media (min-width: 640px) {
          .store-header-inner { flex-direction: row; align-items: center; padding: 10px 20px; gap: 16px; justify-content: space-between; }
          .store-row1 { flex: none; }
          .store-row2 { display: none; }
          .store-row1-search { display: flex; flex: 0 1 400px; max-width: 400px; min-width: 0; }
        }

        /* Logos */
        .store-logos { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .store-logo-eltop  { height: 45px; width: auto; object-fit: contain; cursor: pointer; }
        .store-logo-embassy { height: 35px; width: auto; object-fit: contain; cursor: pointer; }
        .logo-divider { width: 1px; height: 32px; background: rgba(255,255,255,.25); flex-shrink: 0; }
        @media (max-width: 639px) {
          .store-logo-eltop  { height: 36px; }
          .store-logo-embassy { height: 28px; }
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

        /* Category strip */
        .store-cats { background: #fff; border-bottom: 1px solid #e8e8f0; position: sticky; top: 65px; z-index: 100; box-shadow: 0 2px 6px rgba(0,0,0,.05); }
        .store-cats-inner { max-width: 1400px; margin: 0 auto; padding: 0 16px; overflow-x: auto; display: flex; scrollbar-width: none; -ms-overflow-style: none; }
        .store-cats-inner::-webkit-scrollbar { display: none; }
        .store-cat-btn { flex-shrink: 0; padding: 11px 14px; background: none; border: none; cursor: pointer; font-size: 13px; font-family: inherit; display: flex; align-items: center; gap: 5px; white-space: nowrap; transition: all .15s; border-bottom: 3px solid transparent; }

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

        /* Product grid */
        .store-content { max-width: 1400px; margin: 0 auto; padding: 16px 12px 100px; background: transparent; }
        .store-root::after { content: ''; display: block; height: 0; }
        .store-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 480px)  { .store-grid { gap: 12px; } }
        @media (min-width: 640px)  { .store-grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
        @media (min-width: 900px)  { .store-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 1200px) { .store-grid { grid-template-columns: repeat(5, 1fr); } }

        /* Discount strip */
        .discount-strip { background: #7B2D8B; color: #fff; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 10px 16px; flex-wrap: wrap; }
        .discount-strip-text { font-size: 13px; font-weight: 700; }
        .discount-strip-btn { background: #fff; color: #7B2D8B; border: none; border-radius: 20px; padding: 6px 16px; font-weight: 800; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .discount-strip-close { background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer; font-size: 18px; margin-left: 4px; padding: 0 4px; line-height: 1; }

        /* Floating bottom strip on mobile */
        .discount-float { position: fixed; bottom: 0; left: 0; right: 0; z-index: 300; display: flex; }
        @media (min-width: 640px) { .discount-float { display: none; } }
        .discount-top { display: none; }
        @media (min-width: 640px) { .discount-top { display: flex; } }

        /* Skeleton */
        .store-skeleton { border-radius: 10px; background: #e2e8f0; animation: pulse 1.4s ease infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {/* ── Header ── */}
      <header className="store-header">
        <div className="store-header-inner">
          {/* Row 1: logos + (search on desktop) + actions */}
          <div className="store-row1">
            {/* Dual logos */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '20px',
              minWidth: '280px',
              flexShrink: 0,
              padding: '4px 0'
            }}>
              <img
                src="/assets/logo-eltop-new.jpg"
                alt="Eltop"
                style={{
                  height: '70px',
                  width: 'auto',
                  maxWidth: '150px',
                  objectFit: 'contain',
                  display: 'block',
                  flexShrink: 0
                }}
                onError={e => e.target.style.display = 'none'}
              />
              <img
                src="/assets/logo-embassy-new.jpeg"
                alt="Embassy"
                style={{
                  height: '55px',
                  width: 'auto',
                  maxWidth: '120px',
                  objectFit: 'contain',
                  display: 'block',
                  flexShrink: 0
                }}
                onError={e => e.target.style.display = 'none'}
              />
            </div>

            {/* Search — desktop only, inside row1 */}
            <div className="store-row1-search">
              <div className="store-search-wrap">
                <input type="search" placeholder="Search for electrical products, brands and more…"
                  value={search} onChange={e => setSearch(e.target.value)} />
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
                value={search} onChange={e => setSearch(e.target.value)} />
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

      {/* ── Category strip ── */}
      {!loading && categories.length > 1 && (
        <div className="store-cats">
          <div className="store-cats-inner">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)} className="store-cat-btn"
                style={{ fontWeight: category === cat ? 800 : 500, color: category === cat ? "#7B2D8B" : "#475569", borderBottomColor: category === cat ? "#7B2D8B" : "transparent" }}>
                <span>{catIcon(cat)}</span>
                <span>{cat}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Products ── */}
      <div className="store-content">
        {!loading && (
          <div style={{ marginBottom: 12, fontSize: 13, color: "#64748b" }}>
            {search || category !== "All"
              ? <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> results{category !== "All" ? ` in ${category}` : ""}{search ? ` for "${search}"` : ""}</>
              : <><strong style={{ color: "#1e293b" }}>{products.length}</strong> products available</>
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
            {filtered.map(p => <ProductCard key={p.id} product={p} onAdd={cart.add} />)}
          </div>
        )}
      </div>

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <CartDrawer cart={cart} onClose={() => setCartOpen(false)}
          onLoginClick={() => { setCartOpen(false); navigate("/login"); }} />
      )}

      {/* ── Footer ── */}
      <div style={{ background: "#E8D5F0", borderTop: "2px solid #C084D4", padding: "20px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <img src="/assets/logo-eltop-new.jpg" alt="Eltop" style={{ height: 36, objectFit: "contain", marginBottom: 8 }} onError={e => { e.target.style.display = "none"; }} />
          <div style={{ fontSize: 13, color: "#7B2D8B", fontWeight: 700 }}>Eltop by Embassy Electricals (India) Pvt. Ltd.</div>
          <div style={{ fontSize: 11, color: "#9B4DB8", marginTop: 4 }}>Quality Electrical Products · Dealer Enquiries: <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/login")}>Login as Dealer →</span></div>
        </div>
      </div>
    </div>
  );
}
