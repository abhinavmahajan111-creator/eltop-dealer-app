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
  const { session } = useApp();

  const {
    orderTotal = 0,
    liveOutstanding = 0,
    creditLimit = 0,
    shortfall = 0,
  } = state || {};

  const [expanded, setExpanded] = useState(null);
  const [extraDaysResult, setExtraDaysResult] = useState(null);
  const [extraLimitResult, setExtraLimitResult] = useState(null);
  const [loading, setLoading] = useState(null);

  if (!state?.orderTotal) {
    return (
      <div className="screen" id="screen-resolve-order">
        <div className="topbar">
          <span className="back" onClick={() => navigate("/cart")}>&#8592;</span>
          <h1>Credit Limit</h1>
        </div>
        <div className="content" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
          No order context found.
          <br /><br />
          <button className="btn small" onClick={() => navigate("/cart")}>Back to Cart</button>
        </div>
      </div>
    );
  }

  const toggle = (key) => setExpanded((prev) => (prev === key ? null : key));

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
        <span className="back" onClick={() => navigate("/cart")}>&#8592;</span>
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
                Record a payment in your Ledger. Once admin marks it received, your
                outstanding balance will drop and you can place this order.
              </p>
              <button className="btn" onClick={() => navigate("/ledger", { state: { returnTo: "/resolve-order" } })}>
                Go to Ledger →
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
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate("/cart")}>
                    Back to Cart →
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
                  <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate("/cart")}>
                    Back to Cart →
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
