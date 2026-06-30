import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Cart() {
  const navigate = useNavigate();
  const { cart, changeCartQty, removeFromCart, placeOrder, dealer } = useApp();

  const d1 = Number(dealer?.discount1 || 0);
  const d2 = Number(dealer?.discount2 || 0);

  const netRate = (item) => Number(item.dlp ?? item.price) * (1 - d1 / 100) * (1 - d2 / 100);
  const lineTotal = (item) => netRate(item) * item.qty;

  const grossTotal = cart.reduce((s, c) => s + lineTotal(c), 0);
  const subtotal   = cart.reduce((s, c) => s + (netRate(c) / 1.18) * c.qty, 0);
  const tax        = subtotal * 0.18;
  const total      = Math.round(grossTotal);

  async function handlePlaceOrder() {
    await placeOrder({ items: cart });
    navigate("/confirm");
  }

  return (
    <div className="screen" id="screen-cart">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/catalogue")}>&#8592;</span>
        <h1>My Cart</h1>
      </div>
      <div className="content">
        {cart.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>&#128722;</div>
            Your cart is empty
            <br /><br />
            <button className="btn small" onClick={() => navigate("/catalogue")}>
              Browse Products
            </button>
          </div>
        ) : (
          <>
            {cart.map((c) => (
              <div className="cart-item" key={c.id}>
                <div className="cart-img">
                  <img src={c.image_urls?.[0] || c.img} alt={c.name} />
                </div>
                <div className="cart-info">
                  <div className="cart-name">{c.name}</div>
                  <div className="cart-price">
                    Rs. {netRate(c).toFixed(2)} × {c.qty}
                  </div>
                  <div className="cart-qty">
                    <button onClick={() => changeCartQty(c.id, -1)}>-</button>
                    <span>{c.qty}</span>
                    <button onClick={() => changeCartQty(c.id, 1)}>+</button>
                  </div>
                </div>
                <div className="remove-link" onClick={() => removeFromCart(c.id)}>Remove</div>
              </div>
            ))}
            <div className="summary-box">
              <div className="summary-row">
                <span>Basic Amount</span>
                <span>Rs. {subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>CGST (9%)</span>
                <span>Rs. {(tax / 2).toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>SGST (9%)</span>
                <span>Rs. {(tax / 2).toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span>Total (Rounded)</span>
                <span>Rs. {total.toLocaleString()}</span>
              </div>
            </div>
            <button className="btn" onClick={handlePlaceOrder}>Place Order</button>
          </>
        )}
      </div>
    </div>
  );
}
