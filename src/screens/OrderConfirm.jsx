import { useNavigate } from "react-router-dom";

export default function OrderConfirm() {
  const navigate = useNavigate();
  return (
    <div className="screen" id="screen-confirm">
      <div className="confirm-wrap">
        <div className="check-circle">&#10003;</div>
        <div className="confirm-title">Order Placed Successfully!</div>
        <div className="confirm-sub">Your order has been sent to Eltop for processing.</div>
        <div className="confirm-id">ORD-10257</div>
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => navigate("/tracking")}>
          Track Order
        </button>
        <button className="btn outline" onClick={() => navigate("/dashboard")}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
