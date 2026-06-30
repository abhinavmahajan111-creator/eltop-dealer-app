import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ProductGallery from "../components/ProductGallery";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, addToCart } = useApp();
  const [qty, setQty] = useState(1);

  const product = products.find((p) => p.id === Number(id));
  if (!product) {
    return (
      <div className="screen">
        <div className="content">Product not found.</div>
      </div>
    );
  }

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
        <div className="pd-price-row">
          <div className="pd-dealer-price">Rs. {product.price}</div>
          {product.mrp && <div className="pd-mrp">Rs. {product.mrp}</div>}
          {product.mrp && (
            <div className="pd-save">
              Save {Math.round((1 - product.price / product.mrp) * 100)}%
            </div>
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
