import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";

const CATEGORIES = ["all", "Fans", "Coolers", "Geysers", "Heaters", "Kitchen"];

export default function Catalogue() {
  const navigate = useNavigate();
  const { products } = useApp();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");

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
          {filtered.map((p) => (
            <div className="prod-card" key={p.id} onClick={() => navigate(`/product/${p.id}`)}>
              <div className="prod-img">
                <img src={p.image_urls?.[0] || p.img} alt={p.name} />
              </div>
              <div className="prod-body">
                <div className="prod-name">{p.name}</div>
                <div className={`prod-stock${p.stock === 0 ? " low" : ""}`}>
                  {p.stock === 0 ? "Out of Stock" : `${p.stock} in stock`}
                </div>
                <div className="prod-price">
                  Rs. {p.price}
                  <span className="prod-mrp">Rs. {p.mrp}</span>
                </div>
              </div>
            </div>
          ))}
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
