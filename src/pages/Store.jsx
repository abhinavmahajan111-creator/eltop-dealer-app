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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#7C3AED" }}>
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
              style={{ width: "100%", padding: "12px 0", background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}
            >
              Place Order
            </button>
            <p style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
              Dealer?{" "}
              <span onClick={onLoginClick} style={{ color: "#7C3AED", fontWeight: 700, cursor: "pointer" }}>
                Login for trade pricing →
              </span>
            </p>
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
          <span style={{ position: "absolute", top: 6, left: 6, background: "#7C3AED", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {p.category}
          </span>
        )}
      </div>
      <div style={{ padding: "10px 10px 8px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#1e293b", lineHeight: 1.4, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: "2.8em" }}>
          {p.name}
        </div>
        <div>
          {p.sku      && <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU <span style={{ color: "#64748b", fontWeight: 600 }}>{p.sku}</span></div>}
          {p.hsn_code && <div style={{ fontSize: 10, color: "#94a3b8" }}>HSN <span style={{ color: "#64748b", fontWeight: 600 }}>{p.hsn_code}</span></div>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>MRP</span>
          <span style={{ fontSize: 16, fontWeight: 900, color: "#DC2626" }}>₹{fmt(p.mrp)}</span>
        </div>
        <button
          onClick={() => onAdd(p)}
          style={{ width: "100%", padding: "8px 0", background: hov ? "#6D28D9" : "#7C3AED", color: "#fff", border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "background .15s" }}
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
      {/* ── Responsive styles ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .store-root { min-height: 100vh; background: #F1F3F6; font-family: inherit; overflow-x: hidden; max-width: 100vw; }

        /* Header */
        .store-header { position: sticky; top: 0; z-index: 200; background: #1e293b; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
        .store-header-inner { max-width: 1400px; margin: 0 auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; }
        .store-header-row1 { display: flex; align-items: center; gap: 10px; width: 100%; }
        .store-header-row2 { display: flex; width: 100%; }
        .store-search-wrap { display: flex; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.2); flex: 1; }
        .store-search-wrap input { flex: 1; padding: 9px 14px; border: none; outline: none; font-size: 14px; font-family: inherit; min-width: 0; }
        .store-search-icon { background: #F59E0B; padding: 0 16px; display: flex; align-items: center; justify-content: center; font-size: 17px; cursor: pointer; flex-shrink: 0; }
        .store-login-btn { background: none; border: 1.5px solid rgba(255,255,255,.4); border-radius: 8px; color: #fff; font-weight: 600; font-size: 13px; padding: 8px 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0; font-family: inherit; }
        .store-cart-btn { background: none; border: none; color: #fff; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px; flex-shrink: 0; padding: 2px 8px; position: relative; }
        .store-logo { height: 44px; width: auto; object-fit: contain; flex-shrink: 0; cursor: pointer; }
        .store-logo-spacer { flex: 1; }

        /* On mobile: two rows */
        @media (max-width: 639px) {
          .store-header-row2 { display: flex; }
          .store-login-btn { font-size: 11px; padding: 7px 8px; }
          .store-logo { height: 36px; }
        }
        /* On tablet+: single row, hide row2 */
        @media (min-width: 640px) {
          .store-header-inner { flex-direction: row; align-items: center; gap: 12px; padding: 10px 20px; }
          .store-header-row1 { flex: 1; }
          .store-header-row2 { display: none; }
          .store-logo-spacer { display: none; }
        }

        /* Category strip */
        .store-cats { background: #fff; border-bottom: 1px solid #e8e8f0; position: sticky; top: 65px; z-index: 100; box-shadow: 0 2px 6px rgba(0,0,0,.05); }
        .store-cats-inner { max-width: 1400px; margin: 0 auto; padding: 0 16px; overflow-x: auto; display: flex; gap: 0; scrollbar-width: none; -ms-overflow-style: none; }
        .store-cats-inner::-webkit-scrollbar { display: none; }
        .store-cat-btn { flex-shrink: 0; padding: 11px 14px; background: none; border: none; cursor: pointer; font-size: 13px; font-family: inherit; display: flex; align-items: center; gap: 5px; white-space: nowrap; transition: all .15s; border-bottom: 3px solid transparent; }

        /* Hero banner */
        .store-hero { background: linear-gradient(135deg, #7C3AED 0%, #DC2626 100%); color: #fff; text-align: center; padding: 16px 20px; cursor: pointer; }
        .store-hero-title { font-weight: 900; font-size: 17px; margin-bottom: 4px; }
        .store-hero-sub { font-size: 13px; opacity: 0.9; }
        @media (max-width: 639px) {
          .store-hero-title { font-size: 14px; }
          .store-hero-sub { font-size: 11px; }
          .store-hero { padding: 12px 14px; }
        }

        /* Product grid */
        .store-content { max-width: 1400px; margin: 0 auto; padding: 16px 14px 60px; }
        .store-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
        @media (min-width: 480px)  { .store-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
        @media (min-width: 640px)  { .store-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 900px)  { .store-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 1200px) { .store-grid { grid-template-columns: repeat(5, 1fr); } }

        /* Skeleton */
        .store-skeleton { border-radius: 10px; background: #e2e8f0; animation: pulse 1.4s ease infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {/* ── Header ── */}
      <header className="store-header">
        <div className="store-header-inner">
          {/* Row 1: always visible */}
          <div className="store-header-row1">
            <img
              src="/assets/eltop-logo.png.jpg"
              alt="Eltop by Embassy"
              className="store-logo"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              onError={e => { e.target.style.display = "none"; }}
            />
            {/* Search in row1 — hidden on mobile via CSS, shown on tablet+ */}
            <div className="store-search-wrap" style={{ flex: 1 }}>
              <input
                type="search"
                placeholder="Search products, SKU, HSN…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="store-search-icon">🔍</div>
            </div>
            <button className="store-login-btn" onClick={() => navigate("/login")}>🔐 Dealer Login</button>
            <button className="store-cart-btn" onClick={() => setCartOpen(true)}>
              <span style={{ fontSize: 22 }}>🛒</span>
              <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>Cart</span>
              {cart.count > 0 && (
                <span style={{ position: "absolute", top: 0, right: 4, background: "#F59E0B", color: "#1e293b", fontSize: 10, fontWeight: 900, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                  {cart.count}
                </span>
              )}
            </button>
          </div>

          {/* Row 2: search on mobile only */}
          <div className="store-header-row2">
            <div className="store-search-wrap">
              <input
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="store-search-icon">🔍</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero banner ── */}
      <div className="store-hero" onClick={() => navigate("/login")}>
        <div className="store-hero-title">Eltop Electrical Products — Quality you can trust</div>
        <div className="store-hero-sub">🏷️ Dealer? <strong>Login for special trade pricing</strong> →</div>
      </div>

      {/* ── Category strip ── */}
      {!loading && categories.length > 1 && (
        <div className="store-cats">
          <div className="store-cats-inner">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="store-cat-btn"
                style={{
                  fontWeight: category === cat ? 800 : 500,
                  color: category === cat ? "#7C3AED" : "#475569",
                  borderBottomColor: category === cat ? "#7C3AED" : "transparent",
                }}
              >
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
            {[...Array(10)].map((_, i) => <div key={i} className="store-skeleton" style={{ height: 280 }} />)}
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
        <CartDrawer
          cart={cart}
          onClose={() => setCartOpen(false)}
          onLoginClick={() => { setCartOpen(false); navigate("/login"); }}
        />
      )}
    </div>
  );
}
