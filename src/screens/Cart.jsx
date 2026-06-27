import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Cart() {
  const navigate = useNavigate();
  const { cart, changeCartQty, removeFromCart, clearCart } = useApp();

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax;

  function placeOrder() {
    clearCart();
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
            {cart.map((c, i) => (
              <div className="cart-item" key={c.id}>
                <div className="cart-img">
                  <img src={c.img} alt={c.name} />
                </div>
                <div className="cart-info">
                  <div className="cart-name">{c.name}</div>
                  <div className="cart-price">Rs. {c.price} x {c.qty}</div>
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
                <span>Subtotal</span>
                <span>Rs. {subtotal.toLocaleString()}</span>
              </div>
              <div className="summary-row">
                <span>GST (18%)</span>
                <span>Rs. {tax.toLocaleString()}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>Rs. {total.toLocaleString()}</span>
              </div>
            </div>
            <button className="btn" onClick={placeOrder}>Place Order</button>
          </>
        )}
      </div>
    </div>
  );
}
