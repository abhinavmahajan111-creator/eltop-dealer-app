import { useEffect, useRef, useState } from "react";
import { supabaseTrack } from "../lib/supabaseTrackClient";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(s) {
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

const STATUS_STYLE = {
  confirmed:        { bg: "#f0f4ff", color: "#2563eb" },
  pending:          { bg: "#fef9e7", color: "#e67e22" },
  dispatched:       { bg: "#f0f4ff", color: "#2563eb" },
  out_for_delivery: { bg: "#f0f4ff", color: "#7B2D8B" },
  delivered:        { bg: "#eafaf1", color: "#27ae60" },
};

// ── styles ─────────────────────────────────────────────────────────────────
const wrap  = { minHeight: "100vh", background: "#f5f5f5", fontFamily: "inherit", padding: "0 0 40px" };
const card  = { background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 14 };
const inp   = { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 14, fontFamily: "inherit", outline: "none" };
const btn   = { width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#7B2D8B", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" };
const btnSm = { padding: "8px 18px", borderRadius: 8, border: "none", background: "#7B2D8B", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };

export default function TrackOrder() {
  const [step, setStep]       = useState("email");   // "email" | "otp" | "orders"
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState(["", "", "", "", "", ""]);
  const [orders, setOrders]   = useState([]);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [expandedId, setExpandedId]   = useState(null);
  const [itemsCache, setItemsCache]   = useState({});
  const otpRefs = useRef([]);
  const cooldownRef = useRef(null);

  // Sign out of track session on unmount — never pollutes main app session
  useEffect(() => {
    return () => { supabaseTrack?.auth.signOut(); };
  }, []);

  const startCooldown = () => {
    setCooldown(30);
    clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => { if (prev <= 1) { clearInterval(cooldownRef.current); return 0; } return prev - 1; });
    }, 1000);
  };

  const sendOtp = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+/.test(email.trim())) {
      setError("Enter a valid email address."); return;
    }
    setError(""); setBusy(true);
    const { error: err } = await supabaseTrack.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setStep("otp");
    startCooldown();
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  };

  const verifyOtp = async () => {
    const token = otp.join("");
    if (token.length < 6) { setError("Enter all 6 digits."); return; }
    setError(""); setBusy(true);
    const { error: err } = await supabaseTrack.auth.verifyOtp({
      email: email.trim(), token, type: "email",
    });
    if (err) {
      setBusy(false);
      setError("Invalid or expired code. Try again.");
      return;
    }
    // Fetch orders while session is active
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error: fetchErr } = await supabaseTrack
      .from("orders")
      .select("id, customer_name, total, created_at, status, delivery_address, payment_id, order_items(id, name, qty, price)")
      .eq("customer_email", normalizedEmail)
      .is("dealer_id", null)
      .order("created_at", { ascending: false });
    setBusy(false);
    if (fetchErr) { setError("Could not load orders: " + fetchErr.message); return; }
    setOrders(data || []);
    setEmail(normalizedEmail);
    setStep("orders");
    // Sign out of the temporary track session immediately after fetching
    await supabaseTrack.auth.signOut();
  };

  const handleOtpChange = (idx, val) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...otp]; next[idx] = ch; setOtp(next);
    setError("");
    if (ch && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKey = (idx, e) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  };

  const toggleOrder = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // ── Header ──────────────────────────────────────────────────────────────
  const header = (
    <div style={{ background: "#7B2D8B", padding: "20px 24px", color: "#fff", marginBottom: 24 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Track Your Order</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Eltop by Embassy</div>
      </div>
    </div>
  );

  // ── Step 1: Email ────────────────────────────────────────────────────────
  if (step === "email") return (
    <div style={wrap}>
      {header}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Enter your email</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
            We'll send a one-time code to verify your identity and show your orders.
          </div>
          <input
            style={inp} type="email" placeholder="your@email.com"
            value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && sendOtp()}
            autoFocus
          />
          {error && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>{error}</div>}
          <button style={{ ...btn, marginTop: 14, opacity: busy ? 0.6 : 1 }} onClick={sendOtp} disabled={busy}>
            {busy ? "Sending…" : "Send Code"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Step 2: OTP ──────────────────────────────────────────────────────────
  if (step === "otp") return (
    <div style={wrap}>
      {header}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Enter the 6-digit code</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
            Sent to <strong>{email}</strong>.{" "}
            <button onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(""); }}
              style={{ background: "none", border: "none", color: "#7B2D8B", cursor: "pointer", fontSize: 13, padding: 0, fontWeight: 600 }}>
              Change
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 18 }}>
            {otp.map((d, i) => (
              <input key={i} ref={el => otpRefs.current[i] = el}
                style={{ width: 42, height: 48, textAlign: "center", fontSize: 22, fontWeight: 700, borderRadius: 8, border: "1.5px solid #ddd", fontFamily: "inherit" }}
                maxLength={1} value={d}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => { handleOtpKey(i, e); if (e.key === "Enter") verifyOtp(); }}
              />
            ))}
          </div>
          {error && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10, textAlign: "center" }}>{error}</div>}
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} onClick={verifyOtp} disabled={busy}>
            {busy ? "Verifying…" : "Verify & View Orders"}
          </button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#64748b" }}>
            {cooldown > 0
              ? `Resend in ${cooldown}s`
              : <button onClick={() => { sendOtp(); }} style={{ background: "none", border: "none", color: "#7B2D8B", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Resend Code</button>
            }
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Orders ───────────────────────────────────────────────────────
  return (
    <div style={wrap}>
      {header}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Showing orders for <strong>{email}</strong>
        </div>

        {orders.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#475569", marginBottom: 4 }}>No orders found</div>
            <div style={{ fontSize: 13 }}>No guest orders were placed with this email address.</div>
          </div>
        ) : (
          orders.map(o => {
            const st = STATUS_STYLE[o.status] || STATUS_STYLE.pending;
            const expanded = expandedId === o.id;
            return (
              <div key={o.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                      {o.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{fmtDate(o.created_at)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "3px 10px", background: st.bg, color: st.color }}>
                    {o.status?.replace(/_/g, " ")}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>₹{fmt(o.total)}</div>
                  <button onClick={() => toggleOrder(o.id)} style={{ ...btnSm, background: "none", color: "#7B2D8B", border: "1.5px solid #7B2D8B" }}>
                    {expanded ? "Hide items ▲" : "View items ▼"}
                  </button>
                </div>

                {expanded && (
                  <div style={{ marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                    {(o.order_items || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: "#94a3b8" }}>No items recorded.</div>
                    ) : (
                      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>
                            <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 600 }}>Item</th>
                            <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600 }}>Qty</th>
                            <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 600 }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.order_items.map(it => (
                            <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "6px 0", color: "#334155" }}>{it.name}</td>
                              <td style={{ textAlign: "center", color: "#64748b" }}>{it.qty}</td>
                              <td style={{ textAlign: "right", fontWeight: 600 }}>₹{fmt(Number(it.price) * it.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {o.payment_id && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: "#f9f5fb", borderRadius: 6, fontSize: 12 }}>
                        <span style={{ color: "#64748b" }}>Payment ref: </span>
                        <span style={{ fontFamily: "monospace", color: "#7B2D8B", fontWeight: 700 }}>{o.payment_id}</span>
                      </div>
                    )}
                    {o.delivery_address && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                        <span style={{ fontWeight: 600 }}>Delivery: </span>{o.delivery_address}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <button onClick={() => { setStep("email"); setEmail(""); setOtp(["","","","","",""]); setOrders([]); setError(""); }}
          style={{ ...btn, background: "none", color: "#7B2D8B", border: "1.5px solid #7B2D8B", marginTop: 8 }}>
          Track a different order
        </button>
      </div>
    </div>
  );
}
