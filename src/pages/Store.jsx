import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ── Cart helpers ──────────────────────────────────────────────────────────────
function useCart() {
  const [items, setItems] = useState([]); // [{ product, qty }]

  const add = (product) =>
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });

  const change = (id, delta) =>
    setItems(prev =>
      prev
        .map(i => i.product.id === id ? { ...i, qty: i.qty + delta } : i)
        .filter(i => i.qty > 0)
    );

  const total  = items.reduce((s, i) => s + (Number(i.product.mrp) || 0) * i.qty, 0);
  const count  = items.reduce((s, i) => s + i.qty, 0);

  return { items, add, change, total, count };
}

// ── Cart drawer ───────────────────────────────────────────────────────────────
function CartDrawer({ cart, onClose }) {
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000 }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 360, maxWidth: "100vw",
        background: "#fff", zIndex: 1001, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,.15)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🛒 Your Cart <span style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>({cart.count} items)</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#666", lineHeight: 1 }}>✕</button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {cart.items.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", marginTop: 60, fontSize: 14 }}>Your cart is empty</div>
          ) : cart.items.map(({ product: p, qty }) => (
            <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f5f5f5" }}>
              {p.image_urls?.[0]
                ? <img src={p.image_urls[0]} alt={p.name} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #eee" }} />
                : <div style={{ width: 56, height: 56, background: "#f3f0fa", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📦</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 13, color: "#7C3AED", fontWeight: 700 }}>₹{fmt(p.mrp)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button onClick={() => cart.change(p.id, -1)} style={qtyBtnStyle}>−</button>
                <span style={{ minWidth: 20, textAlign: "center", fontWeight: 700 }}>{qty}</span>
                <button onClick={() => cart.change(p.id, +1)} style={qtyBtnStyle}>+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && (
          <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: "#555" }}>Total MRP</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: "#1e293b" }}>₹{fmt(cart.total)}</span>
            </div>
            <button
              onClick={() => alert("Thank you! We'll contact you soon.")}
              style={{ ...actionBtnStyle, width: "100%", padding: "13px 0", fontSize: 15 }}
            >
              Place Order
            </button>
            <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 8 }}>
              Dealer? <span style={{ color: "#7C3AED", cursor: "pointer", fontWeight: 600 }}>Login for trade pricing →</span>
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ product: p, onAdd }) {
  const [hovered, setHovered] = useState(false);
  const img = p.image_urls?.[0];
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff", borderRadius: 14,
        border: "1px solid #e8e8f0",
        boxShadow: hovered ? "0 8px 28px rgba(124,58,237,.12)" : "0 2px 8px rgba(0,0,0,.05)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "all .18s ease",
        overflow: "hidden", display: "flex", flexDirection: "column",
      }}
    >
      {/* Image */}
      <div style={{ position: "relative", background: "#f8f7ff", aspectRatio: "1", overflow: "hidden" }}>
        {img
          ? <img src={img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12, boxSizing: "border-box" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>📦</div>
        }
        {p.category && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            background: "#7C3AED", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>{p.category}</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "14px 14px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginBottom: 8, lineHeight: 1.4, flex: 1 }}>{p.name}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
          {p.hsn_code && <div style={{ fontSize: 11, color: "#94a3b8" }}>HSN: <span style={{ color: "#475569", fontWeight: 600 }}>{p.hsn_code}</span></div>}
          {p.sku      && <div style={{ fontSize: 11, color: "#94a3b8" }}>SKU: <span style={{ color: "#475569", fontWeight: 600 }}>{p.sku}</span></div>}
          {p.unit     && <div style={{ fontSize: 11, color: "#94a3b8" }}>Unit: <span style={{ color: "#475569", fontWeight: 600 }}>{p.unit}</span></div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto" }}>
          <div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>MRP</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#7C3AED" }}>₹{fmt(p.mrp)}</div>
          </div>
          <button onClick={() => onAdd(p)} style={{ ...actionBtnStyle, padding: "8px 14px", fontSize: 12 }}>
            🛒 Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const actionBtnStyle = {
  background: "#7C3AED", color: "#fff", border: "none", borderRadius: 8,
  fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};

const qtyBtnStyle = {
  width: 28, height: 28, border: "1.5px solid #e2e8f0", borderRadius: 6,
  background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};

// ── Main component ────────────────────────────────────────────────────────────
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
      .then(({ data }) => { if (data) setProducts(data); setLoading(false); });
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
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "inherit" }}>
      {/* ── Header ── */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #e8e8f0",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 8px rgba(0,0,0,.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", gap: 16, height: 64 }}>
          <img
            src="/assets/eltop-logo.png.jpg"
            alt="Eltop"
            style={{ height: 50, width: "auto", objectFit: "contain", flexShrink: 0 }}
            onError={e => { e.target.style.display = "none"; }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#1e293b", lineHeight: 1 }}>Eltop by Embassy</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Electrical Products</div>
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: "8px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", outline: "none",
              width: 220, display: "none",
            }}
            className="store-search"
          />

          {/* Dealer login */}
          <button
            onClick={() => navigate("/login")}
            style={{ background: "none", border: "1.5px solid #7C3AED", borderRadius: 8, color: "#7C3AED", fontWeight: 700, fontSize: 13, padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            🔐 Dealer Login
          </button>

          {/* Cart */}
          <button
            onClick={() => setCartOpen(true)}
            style={{ position: "relative", background: "#7C3AED", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 14px", cursor: "pointer", flexShrink: 0 }}
          >
            🛒 Cart
            {cart.count > 0 && (
              <span style={{
                position: "absolute", top: -6, right: -6,
                background: "#DC2626", color: "#fff",
                fontSize: 10, fontWeight: 800, width: 18, height: 18,
                borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              }}>{cart.count}</span>
            )}
          </button>
        </div>

        {/* Mobile search */}
        <div style={{ padding: "0 20px 12px", display: "none" }} className="store-mobile-search">
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}
          />
        </div>
      </header>

      {/* ── Promo banner ── */}
      <div
        onClick={() => navigate("/login")}
        style={{
          background: "linear-gradient(90deg, #F59E0B, #FBBF24)",
          color: "#78350F", fontWeight: 700, fontSize: 13,
          textAlign: "center", padding: "10px 20px", cursor: "pointer",
          letterSpacing: "0.1px",
        }}
      >
        🏷️ Are you a dealer? Login for special trade pricing →
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* Category filter + search row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            placeholder="Search products, SKU, HSN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: "7px 14px", borderRadius: 20, border: "1.5px solid",
                  borderColor: category === cat ? "#7C3AED" : "#e2e8f0",
                  background: category === cat ? "#7C3AED" : "#fff",
                  color: category === cat ? "#fff" : "#475569",
                  fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  transition: "all .15s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
            Showing {filtered.length} of {products.length} products
            {category !== "All" && ` in ${category}`}
            {search && ` matching "${search}"`}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "#94a3b8", fontSize: 15 }}>Loading products…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "#94a3b8", fontSize: 15 }}>No products found.</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 18,
          }}>
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onAdd={cart.add} />
            ))}
          </div>
        )}
      </div>

      {/* ── Cart drawer ── */}
      {cartOpen && <CartDrawer cart={cart} onClose={() => setCartOpen(false)} />}

      {/* ── Responsive styles ── */}
      <style>{`
        @media (min-width: 640px) { .store-search { display: block !important; } }
        @media (max-width: 639px) { .store-mobile-search { display: block !important; } }
      `}</style>
    </div>
  );
}
