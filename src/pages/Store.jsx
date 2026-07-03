import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ── Cart helpers ──────────────────────────────────────────────────────────────
function useCart() {
  const [items, setItems] = useState([]);

  const add = (product) =>
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

// ── Cart Drawer ───────────────────────────────────────────────────────────────
function CartDrawer({ cart, onClose, onLoginClick }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380, maxWidth: "95vw",
        background: "#fff", zIndex: 1001, display: "flex", flexDirection: "column",
        boxShadow: "-6px 0 32px rgba(0,0,0,.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #eee", background: "#7C3AED" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>
            🛒 Cart {cart.count > 0 && <span style={{ fontWeight: 400, fontSize: 13, opacity: 0.85 }}>({cart.count} items)</span>}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 6, color: "#fff", width: 32, height: 32, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {cart.items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Your cart is empty</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Add products to get started</div>
            </div>
          ) : cart.items.map(({ product: p, qty }) => (
            <div key={p.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid #eee", flexShrink: 0, background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {p.image_urls?.[0]
                  ? <img src={p.image_urls[0]} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : <span style={{ fontSize: 28 }}>📦</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#DC2626" }}>₹{fmt(p.mrp)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <button onClick={() => cart.change(p.id, +1)} style={qtyBtn}>+</button>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{qty}</span>
                <button onClick={() => cart.change(p.id, -1)} style={qtyBtn}>−</button>
              </div>
            </div>
          ))}
        </div>

        {cart.items.length > 0 && (
          <div style={{ padding: "16px 20px", borderTop: "2px solid #eee" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: "#555", fontWeight: 600 }}>Total MRP</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#1e293b" }}>₹{fmt(cart.total)}</span>
            </div>
            <button
              onClick={() => alert("Thank you! We'll contact you soon to confirm your order.")}
              style={{ width: "100%", padding: "13px 0", background: "#7C3AED", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}
            >
              Place Order
            </button>
            <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
              Dealer?{" "}
              <span onClick={onLoginClick} style={{ color: "#7C3AED", fontWeight: 700, cursor: "pointer" }}>
                Login for trade pricing →
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product: p, onAdd }) {
  const [hovered, setHovered] = useState(false);
  const img = p.image_urls?.[0];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff", borderRadius: 12,
        border: "1px solid #edf0f7",
        boxShadow: hovered ? "0 8px 32px rgba(124,58,237,.13)" : "0 2px 8px rgba(0,0,0,.06)",
        transform: hovered ? "translateY(-3px)" : "none",
        transition: "all .18s ease",
        overflow: "hidden", display: "flex", flexDirection: "column", cursor: "default",
      }}
    >
      {/* Image area */}
      <div style={{ background: "#f9f8ff", position: "relative", paddingTop: "80%", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
          {img
            ? <img src={img} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 52, opacity: 0.4 }}>📦</span>}
        </div>
        {p.category && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            background: "#7C3AED", color: "#fff",
            fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 20,
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}>{p.category}</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "12px 12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          fontWeight: 600, fontSize: 13, color: "#1e293b", lineHeight: 1.4,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          minHeight: "2.8em", flex: 1,
        }}>
          {p.name}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {p.sku      && <div style={{ fontSize: 10, color: "#94a3b8" }}>SKU <span style={{ color: "#64748b", fontWeight: 600 }}>{p.sku}</span></div>}
          {p.hsn_code && <div style={{ fontSize: 10, color: "#94a3b8" }}>HSN <span style={{ color: "#64748b", fontWeight: 600 }}>{p.hsn_code}</span></div>}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px" }}>MRP</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#DC2626" }}>₹{fmt(p.mrp)}</span>
        </div>

        <button
          onClick={() => onAdd(p)}
          style={{
            width: "100%", padding: "9px 0", background: hovered ? "#6D28D9" : "#7C3AED",
            color: "#fff", border: "none", borderRadius: 8,
            fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            transition: "background .15s", marginTop: 4,
          }}
        >
          + Add to Cart
        </button>
      </div>
    </div>
  );
}

const qtyBtn = {
  width: 28, height: 28, border: "1.5px solid #e2e8f0", borderRadius: 6,
  background: "#f8f8f8", cursor: "pointer", fontSize: 15, fontWeight: 700,
  lineHeight: 1, padding: 0, fontFamily: "inherit",
};

// ── Category icons map ────────────────────────────────────────────────────────
const CAT_ICONS = {
  "Fans": "🌀", "Wiring Devices": "🔌", "Cables": "🔋",
  "Lighting": "💡", "Switches": "🔘", "MCB": "⚡",
  "Distribution": "🗂️", "Motors": "⚙️", "Tools": "🔧",
};
const catIcon = (name) => CAT_ICONS[name] || "📦";

// ── Main Store ────────────────────────────────────────────────────────────────
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
    <div style={{ minHeight: "100vh", background: "#F1F3F6", fontFamily: "inherit" }}>

      {/* ── Sticky header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 200,
        background: "#1e293b",
        boxShadow: "0 2px 8px rgba(0,0,0,.25)",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          {/* Logo */}
          <img
            src="/assets/eltop-logo.png.jpg"
            alt="Eltop by Embassy"
            style={{ height: 45, width: "auto", objectFit: "contain", flexShrink: 0, cursor: "pointer" }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            onError={e => { e.target.style.display = "none"; }}
          />

          {/* Search bar */}
          <div style={{ flex: 1, display: "flex", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }}>
            <input
              type="search"
              placeholder="Search for electrical products, brands and more…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, padding: "10px 16px", border: "none", outline: "none",
                fontSize: 14, fontFamily: "inherit", background: "#fff",
              }}
            />
            <div style={{ background: "#F59E0B", padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer" }}>
              🔍
            </div>
          </div>

          {/* Right actions */}
          <button
            onClick={() => navigate("/login")}
            style={{ background: "none", border: "1.5px solid rgba(255,255,255,.4)", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 13, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            🔐 Dealer Login
          </button>

          <button
            onClick={() => setCartOpen(true)}
            style={{ position: "relative", background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, padding: "4px 10px" }}
          >
            <span style={{ fontSize: 24 }}>🛒</span>
            <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>Cart</span>
            {cart.count > 0 && (
              <span style={{
                position: "absolute", top: 0, right: 4,
                background: "#F59E0B", color: "#1e293b",
                fontSize: 10, fontWeight: 900, minWidth: 18, height: 18,
                borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
              }}>{cart.count}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Dealer promo banner ── */}
      <div
        onClick={() => navigate("/login")}
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #DC2626 100%)",
          color: "#fff", textAlign: "center", padding: "14px 20px", cursor: "pointer",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 3 }}>Eltop Electrical Products — Quality you can trust</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>🏷️ Dealer? <strong>Login for special trade pricing</strong> — up to 40% off MRP →</div>
      </div>

      {/* ── Category strip ── */}
      {!loading && categories.length > 1 && (
        <div style={{ background: "#fff", borderBottom: "1px solid #e8e8f0", position: "sticky", top: 65, zIndex: 100, boxShadow: "0 2px 6px rgba(0,0,0,.06)" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px", overflowX: "auto", display: "flex", gap: 4, scrollbarWidth: "none" }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  flexShrink: 0, padding: "12px 16px",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: category === cat ? 800 : 500,
                  color: category === cat ? "#7C3AED" : "#475569",
                  borderBottom: `3px solid ${category === cat ? "#7C3AED" : "transparent"}`,
                  transition: "all .15s", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}
              >
                <span>{catIcon(cat)}</span>
                <span>{cat}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* Results meta */}
        {!loading && (
          <div style={{ marginBottom: 14, fontSize: 13, color: "#64748b" }}>
            {search || category !== "All"
              ? <><strong style={{ color: "#1e293b" }}>{filtered.length}</strong> results{category !== "All" ? ` in ${category}` : ""}{search ? ` for "${search}"` : ""}</>
              : <><strong style={{ color: "#1e293b" }}>{products.length}</strong> products available</>
            }
          </div>
        )}

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, height: 320, animation: "pulse 1.5s ease infinite" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: "#475569" }}>No products found</div>
            <div style={{ fontSize: 14 }}>Try a different search or category</div>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 14,
          }}>
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} onAdd={cart.add} />
            ))}
          </div>
        )}
      </div>

      {/* ── Cart drawer ── */}
      {cartOpen && <CartDrawer cart={cart} onClose={() => setCartOpen(false)} onLoginClick={() => { setCartOpen(false); navigate("/login"); }} />}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        ::-webkit-scrollbar { height: 4px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>
    </div>
  );
}
