import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ProductDetailView from "../components/ProductDetailView";

// Dealer-only Product Detail route (/product/:id, DealerRoute-gated, renders
// inside the narrow PhoneFrame). Before 31 Aug 2026 this had its own
// separate, simpler implementation — no collapsible About/Specs sections, no
// quick specs table, a different "pick a qty then Add to Cart" interaction
// pattern instead of a live cart stepper. It now delegates to the same
// ProductDetailView component /store uses, so any future Product Detail
// change (pricing display, a new field, another bug) only has to be made
// once. See claude/Eltop_Session_23Aug2026_Summary.md for the full writeup.
//
// The topbar below already provides back navigation, so the shared
// component's own back button is suppressed here (showBackButton={false}).
export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, dealer, dealerApplicationStatus, cart, addToCart, changeCartQty, removeFromCart } = useApp();

  const product = products.find((p) => p.id === Number(id));
  if (!product) {
    return (
      <div className="screen">
        <div className="content">Product not found.</div>
      </div>
    );
  }

  // Same rule Store.jsx uses: only a fully-approved (or legacy 'none')
  // dealer gets dealer-rate pricing and sees Warehouse Stock. A dealer whose
  // application is still pending_details/under_review sees guest pricing,
  // same as an unverified visitor on /store would.
  const isApprovedDealer = dealerApplicationStatus === 'approved' || dealerApplicationStatus === 'none';
  const pricingMode = isApprovedDealer ? 'dealer' : 'guest-verified';

  const getPrice = (p) => {
    if (isApprovedDealer) {
      const d1 = Number(dealer?.discount1 || 0);
      const d2 = Number(dealer?.discount2 || 0);
      return Math.round(Number((p.dlp ?? p.mrp) || 0) * (1 - d1 / 100) * (1 - d2 / 100) * 100) / 100;
    }
    return Math.round(Number(p.mrp || 0) * 0.85);
  };

  const cartItem = cart.find((c) => c.id === product.id);
  const qty = cartItem?.qty;

  // AppContext's addToCart/changeCartQty already show the persistent
  // "Added to Cart!" toast themselves (see PhoneFrame.jsx) — no extra toast
  // wiring needed here, unlike Store.jsx which keeps its own local cart.
  const handleAdd = (p) => addToCart(p, 1);
  const handleIncrease = (id) => changeCartQty(id, +1);
  const handleDecrease = (id) => {
    // changeCartQty floors at qty 1 (it never removes the item) — Store's
    // stepper removes the item once qty hits 0, so mirror that here too.
    if ((cartItem?.qty ?? 0) <= 1) {
      removeFromCart(id);
    } else {
      changeCartQty(id, -1);
    }
  };

  return (
    <div className="screen" id="screen-product">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/catalogue")}>&#8592;</span>
        <h1>Product Detail</h1>
      </div>
      <div className="content">
        <ProductDetailView
          product={product}
          showBackButton={false}
          onAdd={handleAdd}
          qty={qty}
          onIncrease={handleIncrease}
          onDecrease={handleDecrease}
          effectivePrice={getPrice(product)}
          pricingMode={pricingMode}
          showWarehouseStock={isApprovedDealer}
          compact
        />
      </div>
    </div>
  );
}
