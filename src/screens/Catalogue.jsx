import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";

const CATEGORIES = ["all", "Fans", "Coolers", "Geysers", "Heaters", "Kitchen"];
const fmtINR = (n) => Number(n || 0).toLocaleString('en-IN');

export default function Catalogue() {
  const navigate = useNavigate();
  const { products, dealer, dealerApplicationStatus } = useApp();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");

  const isApprovedDealer = dealerApplicationStatus === 'approved' || dealerApplicationStatus === 'none';
  const d1 = isApprovedDealer ? Number(dealer?.discount1 || 0) : 0;
  const d2 = isApprovedDealer ? Number(dealer?.discount2 || 0) : 0;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return products.filter((p) => {
      const catMatch = cat === "all" || p.cat === cat;
      const searchMatch = p.name.toLowerCase().includes(term);
      return catMatch && searchMatch;
    });
  }, [search, cat, products]);

  return (
    <div className="screen" id="screen-catalogue">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/dashboard")}>&#8592;</span>
        <h1>Product Catalogue</h1>
      </div>
      <div className="content">
        <div className="search-wrap">
          <span className="search-ic">&#128269;</span>
          <input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="cat-scroll">
          {CATEGORIES.map((c) => (
            <div
              key={c}
              className={`cat-chip${cat === c ? " active" : ""}`}
              onClick={() => setCat(c)}
            >
              {c === "all" ? "All" : c}
            </div>
          ))}
        </div>
        <div className="prod-grid">
          {filtered.map((p) => {
            const dlp = Number(p.dlp ?? p.price ?? p.mrp ?? 0);
            const net = isApprovedDealer
              ? Math.round(dlp * (1 - d1 / 100) * (1 - d2 / 100) * 100) / 100
              : Math.round(Number(p.mrp || 0) * 0.85 * 100) / 100;
            const pct = p.mrp && p.mrp > net ? Math.round((p.mrp - net) / p.mrp * 100) : 0;
            return (
              <div className="prod-card" key={p.id} onClick={() => navigate(`/product/${p.id}`)}>
                <div className="prod-img">
                  <img src={p.image_urls?.[0] || p.img} alt={p.name} />
                </div>
                <div className="prod-body">
                  <div className="prod-name">{p.name}</div>
                  <div className={`prod-stock${p.stock === 0 ? " low" : ""}`}>
                    {p.stock === 0 ? "Out of Stock" : `${p.stock} in stock`}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Net price</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#7B2D8B" }}>₹{fmtINR(net)}</span>
                      {pct > 0 && (
                        <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 20 }}>{pct}% OFF</span>
                      )}
                    </div>
                    {isApprovedDealer ? (
                      (p.dlp || p.mrp) && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                          {p.dlp && <span>DLP <span style={{ textDecoration: "line-through" }}>₹{fmtINR(p.dlp)}</span></span>}
                          {p.dlp && p.mrp && <span> · </span>}
                          {p.mrp && <span>MRP <span style={{ textDecoration: "line-through" }}>₹{fmtINR(p.mrp)}</span></span>}
                        </div>
                      )
                    ) : (
                      p.mrp && (
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                          MRP <span style={{ textDecoration: "line-through" }}>₹{fmtINR(p.mrp)}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--muted)", padding: "30px 0" }}>
              No products found
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
