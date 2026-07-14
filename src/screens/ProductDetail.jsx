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
  const dlp = Number(product.dlp ?? product.price ?? 0);
  const net = isApprovedDealer
    ? Math.round(dlp * (1 - d1 / 100) * (1 - d2 / 100) * 100) / 100
    : Math.round(Number(product.mrp || 0) * 0.85 * 100) / 100;
  const pct = product.mrp && product.mrp > net ? Math.round((product.mrp - net) / product.mrp * 100) : 0;

  return (
    <div className="screen" id="screen-product">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/catalogue")}>&#8592;</span>
        <h1>Product Detail</h1>
      </div>
      <div className="content">
        <ProductGallery images={product.image_urls} videoUrl={product.video_url} />

        <div className="pd-title">{product.name}</div>
        <div className="pd-sku">SKU: {product.sku}</div>

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
    </div>
  );
}
