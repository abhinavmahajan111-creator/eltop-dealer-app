import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";

const fmt = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

const getQuarterKey = () => {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
};

const cardStyle = {
  background: "var(--card)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  marginBottom: 12,
  overflow: "hidden",
};
const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 18px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 15,
  userSelect: "none",
};
const bodyStyle = {
  padding: "0 18px 18px",
  fontSize: 14,
  color: "var(--muted)",
  borderTop: "1px solid var(--border)",
};

export default function ResolveOrder() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { session, profile } = useApp();

  const {
    orderTotal = 0,
    liveOutstanding = 0,
    creditLimit = 0,
    shortfall = 0,
    returnTo = "/cart",
  } = state || {};
  const backLabel = returnTo === "/store" ? "Back to Store" : "Back to Cart";

  const [expanded, setExpanded] = useState(null);
  const [extraDaysResult, setExtraDaysResult] = useState(null);
  const [extraLimitResult, setExtraLimitResult] = useState(null);
  const [loading, setLoading] = useState(null);
  const [payLoading, setPayLoading] = useState(false);

  if (!state?.orderTotal) {
    return (
      <div className="screen" id="screen-resolve-order">
        <div className="topbar">
          <span className="back" onClick={() => navigate(returnTo)}>&#8592;</span>
          <h1>Credit Limit</h1>
        </div>
        <div className="content" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
          No order context found.
          <br /><br />
          <button className="btn small" onClick={() => navigate(returnTo)}>{backLabel}</button>
        </div>
      </div>
    );
  }

  const toggle = (key) => setExpanded((prev) => (prev === key ? null : key));

  const handlePayNow = async () => {
    if (payLoading) return;
    setPayLoading(true);
    try {
      // 1. Create Razorpay order server-side (server re-fetches live balance + credit_limit)
      const { data, error } = await supabase.functions.invoke("create-payment-order", {
        body: { orderTotal },
      });
      if (error || !data?.razorpay_order_id) {
        alert("Could not create payment order.\n" + (data?.error || error?.message || "Unknown error"));
        setPayLoading(false);
        return;
      }
      const { razorpay_order_id, amount_paise } = data;

      // 2. Load Razorpay checkout.js and open
      const existingScript = document.getElementById("razorpay-script-resolve");
      if (existingScript) existingScript.remove();
      const script = document.createElement("script");
      script.id = "razorpay-script-resolve";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        const options = {
          key:         import.meta.env.VITE_RAZORPAY_KEY_ID,
          order_id:    razorpay_order_id,
          amount:      amount_paise,
          currency:    "INR",
          name:        "Eltop by Embassy",
          description: "Outstanding balance payment",
          image:       "/assets/ELTOP%20LOGO.png",
          prefill: {
            name:    profile?.name    || "",
            email:   profile?.email   || session?.user?.email || "",
            contact: profile?.phone   || "",
          },
          handler: async function (response) {
            const { razorpay_payment_id, razorpay_order_id: rpOrderId, razorpay_signature } = response;
            // 3. Verify signature + record ledger entry server-side
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
              "verify-and-record-payment",
              { body: { razorpay_order_id: rpOrderId, razorpay_payment_id, razorpay_signature } }
            );
            if (verifyError || !verifyData?.success) {
              // Payment captured but ledger write failed — surface loudly, do not navigate away
              console.error("[resolve-order] verify-and-record-payment failed", razorpay_payment_id, verifyError, verifyData);
              alert(
                "⚠️ Payment received but balance update failed.\n" +
                "Payment ID: " + razorpay_payment_id + "\n" +
                "Please contact support immediately with this ID — your payment is safe."
              );
              setPayLoading(false);
              return;
            }
            // 4. Success — balance reduced; navigate back to cart
            alert(
              "✅ Payment of ₹" + Math.round(verifyData.amount_inr).toLocaleString("en-IN") +
              " recorded (Voucher: " + verifyData.voucher_no + ").\n\n" +
              "You can now place your order."
            );
            navigate(returnTo);
          },
          theme: { color: "#7B2D8B" },
          modal: {
            ondismiss: () => setPayLoading(false),
            escape: true,
            animation: false,
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
        setPayLoading(false);
      };
      script.onerror = () => {
        alert("Failed to load payment gateway. Please try again.");
        setPayLoading(false);
      };
      document.body.appendChild(script);
    } catch (err) {
      console.error("[resolve-order] handlePayNow error:", err);
      alert("Unexpected error starting payment. Please try again.");
      setPayLoading(false);
    }
  };

  const handleExtraDays = async () => {
    setLoading("extra_days");
    const dealerId = session?.user?.id;
    const quarterKey = getQuarterKey();

    const { count } = await supabase
      .from("credit_requests")
      .select("id", { count: "exact", head: true })
      .eq("dealer_id", dealerId)
      .eq("type", "extra_days")
      .eq("status", "approved")
      .eq("quarter_key", quarterKey);

    const used = count || 0;
    const approved = used < 2;
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await supabase.from("credit_requests").insert({
      dealer_id:   dealerId,
      type:        "extra_days",
      status:      approved ? "approved" : "rejected",
      quarter_key: quarterKey,
      valid_until: approved ? validUntil : null,
      notes:       approved ? null : `Already used 2/2 extensions in ${quarterKey}`,
    });

    setExtraDaysResult({ approved, validUntil, used });
    setLoading(null);
  };

  const handleExtraLimit = async () => {
    setLoading("extra_limit");
    const dealerId = session?.user?.id;
    const today = new Date().toISOString().slice(0, 10);
    const quarterKey = getQuarterKey();

    const { data: active } = await supabase
      .from("credit_requests")
      .select("id")
      .eq("dealer_id", dealerId)
      .eq("type", "extra_limit")
      .eq("status", "approved")
      .gte("valid_until", today)
      .limit(1)
      .maybeSingle();

    const approved = !active;
    const extraAmount = Math.round(creditLimit * 0.5);
    const newLimit = creditLimit + extraAmount;
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await supabase.from("credit_requests").insert({
      dealer_id:          dealerId,
      type:               "extra_limit",
      status:             approved ? "approved" : "rejected",
      quarter_key:        quarterKey,
      valid_until:        approved ? validUntil : null,
      extra_limit_amount: approved ? extraAmount : null,
      notes:              approved ? null : "Active limit enhancement already in use",
    });

    setExtraLimitResult({ approved, extraAmount, newLimit, validUntil });
    setLoading(null);
  };

  return (
    <div className="screen" id="screen-resolve-order">
      <div className="topbar">
        <span className="back" onClick={() => navigate(returnTo)}>&#8592;</span>
        <h1>Order Blocked</h1>
      </div>
      <div className="content">

        {/* Summary card */}
        <div style={{
          background: "#FFF3CD",
          border: "1.5px solid #F5C518",
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#856404", marginBottom: 12 }}>
            ⚠️ Credit limit exceeded
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 0", fontSize: 13 }}>
            <span style={{ color: "#856404" }}>Order value</span>
            <span style={{ fontWeight: 700, textAlign: "right" }}>{fmt(orderTotal)}</span>

            <span style={{ color: "#856404" }}>Current outstanding</span>
            <span style={{ fontWeight: 700, textAlign: "right" }}>{fmt(liveOutstanding)}</span>

            <span style={{ color: "#856404" }}>Credit limit</span>
            <span style={{ fontWeight: 700, textAlign: "right" }}>{fmt(creditLimit)}</span>

            <span style={{ color: "#c0392b", fontWeight: 700 }}>Shortfall</span>
            <span style={{ fontWeight: 700, color: "#c0392b", textAlign: "right" }}>{fmt(shortfall)}</span>
          </div>
        </div>

        {/* Cash-to-salesperson policy note */}
        <div style={{
          background: "#EFF6FF",
          border: "1.5px solid #BFDBFE",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "#1E3A5F",
        }}>
          ℹ️ Your credit limit is restored only once digital payment is received in your account. Paying cash to a salesperson does not update your limit — the order can only be placed after the payment is made digitally.
        </div>

        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--muted)", marginBottom: 12, letterSpacing: 0.5 }}>
          CHOOSE AN OPTION
        </div>

        {/* Option 1: Pay now */}
        <div style={cardStyle}>
          <div style={headerStyle} onClick={() => toggle("pay")}>
            <span>💳 Pay {fmt(shortfall)} now</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>{expanded === "pay" ? "▲" : "▼"}</span>
          </div>
          {expanded === "pay" && (
            <div style={bodyStyle}>
              <p style={{ marginTop: 12, marginBottom: 16, lineHeight: 1.5 }}>
                Pay online now to immediately reduce your outstanding balance.
                Once payment is confirmed, go back to cart and place your order.
              </p>
              <button
                className="btn"
                onClick={handlePayNow}
                disabled={payLoading}
                style={{ opacity: payLoading ? 0.6 : 1 }}
              >
                {payLoading ? "Opening payment…" : `Pay ${fmt(shortfall)} now →`}
              </button>
            </div>
          )}
        </div>

        {/* Option 2: Request 7 more days */}
        <div style={cardStyle}>
          <div
            style={headerStyle}
            onClick={async () => {
              toggle("extra_days");
              if (expanded !== "extra_days" && !extraDaysResult && loading !== "extra_days") {
                await handleExtraDays();
              }
            }}
          >
            <span>📅 Request 7 more days</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>{expanded === "extra_days" ? "▲" : "▼"}</span>
          </div>
          {expanded === "extra_days" && (
            <div style={bodyStyle}>
              {loading === "extra_days" ? (
                <p style={{ marginTop: 12 }}>Checking eligibility…</p>
              ) : extraDaysResult?.approved ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "#27ae60", fontWeight: 700, marginBottom: 8 }}>✅ Extension granted</div>
                  <p style={{ lineHeight: 1.5 }}>
                    You have 7 extra days to clear your balance. New due date:{" "}
                    <strong>{extraDaysResult.validUntil}</strong>.
                  </p>
                  <p style={{ marginTop: 8, lineHeight: 1.5 }}>
                    Go back to your cart — orders placed before this date will be processed
                    during your grace period.
                  </p>
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate(returnTo)}>
                    {backLabel} →
                  </button>
                </div>
              ) : extraDaysResult ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "#c0392b", fontWeight: 700, marginBottom: 8 }}>❌ Not eligible</div>
                  <p style={{ lineHeight: 1.5 }}>
                    You've already used 2 of 2 payment extensions this quarter ({getQuarterKey()}).
                    Please contact admin to discuss your account.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Option 3: Request extra credit limit */}
        <div style={cardStyle}>
          <div
            style={headerStyle}
            onClick={async () => {
              toggle("extra_limit");
              if (expanded !== "extra_limit" && !extraLimitResult && loading !== "extra_limit") {
                await handleExtraLimit();
              }
            }}
          >
            <span>📈 Request extra credit limit</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>{expanded === "extra_limit" ? "▲" : "▼"}</span>
          </div>
          {expanded === "extra_limit" && (
            <div style={bodyStyle}>
              {loading === "extra_limit" ? (
                <p style={{ marginTop: 12 }}>Checking eligibility…</p>
              ) : extraLimitResult?.approved ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "#27ae60", fontWeight: 700, marginBottom: 8 }}>✅ Temporary limit granted</div>
                  <p style={{ lineHeight: 1.5 }}>
                    Your credit limit has been temporarily raised by{" "}
                    <strong>{fmt(extraLimitResult.extraAmount)}</strong> to{" "}
                    <strong>{fmt(extraLimitResult.newLimit)}</strong>, valid until{" "}
                    <strong>{extraLimitResult.validUntil}</strong>.
                  </p>
                  <p style={{ marginTop: 8, lineHeight: 1.5 }}>
                    Go back to your cart and place the order — the new limit is active immediately.
                  </p>
                  <p style={{ marginTop: 8, fontSize: 12, color: "#aaa", lineHeight: 1.4 }}>
                    Note: eligibility is currently based on whether an active enhancement is already
                    in use. Payment history scoring will be added in a future update.
                  </p>
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate(returnTo)}>
                    {backLabel} →
                  </button>
                </div>
              ) : extraLimitResult ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "#c0392b", fontWeight: 700, marginBottom: 8 }}>❌ Not eligible</div>
                  <p style={{ lineHeight: 1.5 }}>
                    You already have an active credit limit enhancement in use. It must expire
                    before a new one can be granted. Please contact admin for assistance.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
