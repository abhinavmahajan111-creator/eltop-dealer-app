import { Outlet, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function PhoneFrame() {
  const { toastMsg, toastShow, cartToastProduct, cartToastShow, dismissCartToast } = useApp();
  const navigate = useNavigate();
  return (
    <div id="phone">
      <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>
      {cartToastShow && cartToastProduct && (
        <div className="cart-toast">
          {(cartToastProduct.image_urls?.[0] || cartToastProduct.img) && (
            <img src={cartToastProduct.image_urls?.[0] || cartToastProduct.img} alt="" />
          )}
          <div className="cart-toast-info">
            <div className="cart-toast-title">✅ Added to Cart!</div>
            <div className="cart-toast-name">{cartToastProduct.name}</div>
          </div>
          <button className="cart-toast-view" onClick={() => { dismissCartToast(); navigate("/cart"); }}>
            View Cart →
          </button>
          <button className="cart-toast-close" onClick={dismissCartToast} aria-label="Dismiss">✕</button>
        </div>
      )}
      <Outlet />
    </div>
  );
}
