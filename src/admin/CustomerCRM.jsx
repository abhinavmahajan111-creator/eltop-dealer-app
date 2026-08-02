import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(s) {
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDateOnly(s) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--red-dark)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const TABS = ["Overview", "Orders", "Addresses"];

export default function CustomerCRM() {
  const { profileId } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appStatusBusy, setAppStatusBusy] = useState(false);

  const handleAction = async (action) => {
    const updates = {
      promote:   { is_dealer: true,  dealer_application_status: 'approved', is_blocked: false },
      approve:   { is_dealer: true,  dealer_application_status: 'approved' },
      reject:    { is_dealer: false, dealer_application_status: 'rejected' },
      downgrade: { is_dealer: false, dealer_application_status: '' },
      block:     { is_blocked: true },
      unblock:   { is_blocked: false },
    };
    const base = updates[action];
    if (!base) return;
    let update = base;
    if (action === 'promote' || action === 'downgrade') {
      const name = profile?.name;
      if (!name || name === 'New Dealer' || name === 'New Customer') update = { ...base, name: '' };
    }
    setAppStatusBusy(true);
    const { error } = await supabase.from('profiles').update(update).eq('id', profileId);
    if (error) { alert('Failed: ' + error.message); }
    else { setProfile(prev => ({ ...prev, ...update })); }
    setAppStatusBusy(false);
  };
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsCache, setOrderItemsCache] = useState({});

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    Promise.all([
      supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
      supabase.from("customer_addresses").select("*").eq("profile_id", profileId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
    ]).then(async ([profRes, addrRes]) => {
      const prof = profRes.data;
      setProfile(prof);
      setAddresses(addrRes.data || []);
      if (prof?.email) {
        const { data: ords } = await supabase
          .from("orders")
          .select("id, customer_name, customer_phone, customer_email, total, created_at, status, delivery_address")
          .ilike("customer_email", prof.email)
          .is("dealer_id", null)
          .order("created_at", { ascending: false });
        setOrders(ords || []);
      }
      setLoading(false);
    });
  }, [profileId]);

  const toggleOrder = async (orderId) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, name, qty, price").eq("order_id", orderId);
    setOrderItemsCache(prev => ({ ...prev, [orderId]: data || [] }));
  };

  const totalSpent  = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrder    = orders.length ? totalSpent / orders.length : 0;
  const lastOrderAt = orders[0]?.created_at;

  const lbl  = { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 3 };
  const val  = { fontSize: 14, fontWeight: 500 };
  const card = { background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 18 };

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: "'Segoe UI', Arial, sans-serif" }}>Loading…</div>;
  if (!profile) return <div style={{ padding: 40, color: "red", fontFamily: "'Segoe UI', Arial, sans-serif" }}>Customer not found.</div>;

  const rawName = profile.name && profile.name !== 'New Customer' && profile.name !== 'New Dealer' ? profile.name : null;
  const displayName = rawName
    ? <span>{rawName}</span>
    : <span style={{ color: "var(--muted)", fontStyle: "italic", fontWeight: 500 }}>Unnamed customer</span>;
  const avatarInitials = (rawName || profile.email || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", position: "fixed", inset: 0, zIndex: 1000, overflowY: "auto", background: "#f5f0f5", color: "#222" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button className="btn small outline" onClick={() => navigate("/admin/dealers")} style={{ whiteSpace: "nowrap" }}>
          ← Back
        </button>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: "#7B2D8B",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, fontWeight: 800, flexShrink: 0, letterSpacing: "0.5px",
        }}>{avatarInitials}</div>
        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{displayName}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#f0fdf4", color: "#15803d", marginRight: 8 }}>
              Registered Customer
            </span>
            {profile.email}
          </div>
        </div>
        {/* Status badge + context-aware action buttons */}
        {(() => {
          const { is_dealer, is_blocked, dealer_application_status: das } = profile;
          const isPending = das === 'pending_details' || das === 'under_review';
          const btn = (action, label, extra = {}) => (
            <button key={action} disabled={appStatusBusy} onClick={() => handleAction(action)}
              style={{ border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: appStatusBusy ? 'wait' : 'pointer', opacity: appStatusBusy ? 0.6 : 1, ...extra }}>
              {label}
            </button>
          );
          let badge = null;
          const actions = [];
          if (is_blocked) {
            badge = { text: '🚫 Blocked', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
            actions.push(btn('unblock', 'Unblock', { background: '#16a34a' }));
          } else if (isPending) {
            badge = das === 'under_review'
              ? { text: 'Dealer App: Under Review', bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' }
              : { text: 'Dealer App: Pending',      bg: '#fef9c3', color: '#854d0e', border: '#fde047' };
            actions.push(btn('approve', '✓ Approve', { background: '#16a34a' }));
            actions.push(btn('reject',  '✕ Reject',  { background: '#dc2626' }));
          } else if (is_dealer || das === 'approved') {
            badge = { text: '✓ Dealer Active', bg: '#dcfce7', color: '#166534', border: '#86efac' };
            actions.push(btn('downgrade', 'Downgrade to Customer', { background: 'none', border: '1.5px solid #dc2626', color: '#dc2626' }));
            actions.push(btn('block',     'Block Dealer',          { background: '#dc2626' }));
          } else {
            // Pure customer
            actions.push(btn('promote', 'Promote to Dealer', { background: '#7B2D8B' }));
            actions.push(btn('block',   'Block Customer',     { background: '#dc2626' }));
          }
          if (!badge && actions.length === 0) return null;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {badge && (
                <span style={{ background: badge.bg, color: badge.color, border: `1.5px solid ${badge.border}`, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  {badge.text}
                </span>
              )}
              {actions}
            </div>
          );
        })()}
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", display: "flex", gap: 0, paddingLeft: 16, overflowX: "auto" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: "12px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === i ? 700 : 400, fontSize: 13,
            color: tab === i ? "var(--red-dark)" : "#555",
            borderBottom: tab === i ? "2px solid var(--red-dark)" : "2px solid transparent",
            whiteSpace: "nowrap", fontFamily: "inherit",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>

      {/* TAB 0: OVERVIEW */}
      {tab === 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Total Orders"    value={orders.length} />
            <StatCard label="Total Spent"     value={`₹${fmt(totalSpent)}`} />
            <StatCard label="Avg Order Value" value={`₹${fmt(avgOrder)}`} />
            <StatCard label="Last Order"      value={lastOrderAt ? fmtDateOnly(lastOrderAt) : "Never"} />
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Account Info</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
              {[
                ["Name",             rawName || "—"],
                ["Phone",            profile.phone || "—"],
                ["Email",            profile.email || "—"],
                ["Account Type",     "Verified Customer"],
                ["Member Since",     profile.created_at ? fmtDateOnly(profile.created_at) : "—"],
                ["Saved Addresses",  addresses.length],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={lbl}>{l}</div>
                  <div style={val}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* TAB 1: ORDERS */}
      {tab === 1 && (
        <div style={card}>
          {orders.length === 0 ? (
            <div style={{ color: "var(--muted)", textAlign: "center", padding: 32 }}>No orders yet.</div>
          ) : (
            <table className="admin-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 20 }}></th>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => [
                  <tr key={o.id} onClick={() => toggleOrder(o.id)} style={{ cursor: "pointer" }}>
                    <td style={{ color: "var(--muted)", fontSize: 11 }}>{expandedOrderId === o.id ? "▼" : "▶"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{o.id.slice(0, 8)}…</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>₹{fmt(o.total)}</td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 8px",
                        background: o.status === "delivered" ? "#eafaf1" : o.status === "pending" ? "#fef9e7" : "#f0f4ff",
                        color:      o.status === "delivered" ? "#27ae60" : o.status === "pending" ? "#e67e22" : "#2563eb",
                      }}>{o.status}</span>
                    </td>
                  </tr>,
                  expandedOrderId === o.id && (
                    <tr key={`${o.id}-d`}>
                      <td colSpan={5} style={{ background: "var(--bg)", padding: "12px 16px" }}>
                        {!orderItemsCache[o.id] ? (
                          <span style={{ color: "var(--muted)" }}>Loading…</span>
                        ) : orderItemsCache[o.id].length === 0 ? (
                          <span style={{ color: "var(--muted)" }}>No items.</span>
                        ) : (
                          <table style={{ width: "100%", fontSize: 12 }}>
                            <thead><tr>
                              <th style={{ textAlign: "left" }}>Product</th>
                              <th style={{ textAlign: "center" }}>Qty</th>
                              <th style={{ textAlign: "right" }}>Price</th>
                              <th style={{ textAlign: "right" }}>Subtotal</th>
                            </tr></thead>
                            <tbody>
                              {orderItemsCache[o.id].map(it => (
                                <tr key={it.id}>
                                  <td style={{ padding: "3px 0" }}>{it.name}</td>
                                  <td style={{ textAlign: "center" }}>{it.qty}</td>
                                  <td style={{ textAlign: "right" }}>₹{fmt(it.price)}</td>
                                  <td style={{ textAlign: "right" }}>₹{fmt(Number(it.price) * it.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 2: ADDRESSES */}
      {tab === 2 && (
        addresses.length === 0 ? (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 32 }}>No saved addresses.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {addresses.map(a => (
              <div key={a.id} style={{ ...card, marginBottom: 0, position: "relative" }}>
                {a.is_default && (
                  <span style={{ position: "absolute", top: 14, right: 16, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#7B2D8B", color: "#fff" }}>
                    Default
                  </span>
                )}
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{a.label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 13 }}>
                  {[
                    ["Recipient",    a.recipient_name],
                    ["Phone",        a.phone],
                    ["Address",      [a.address_line1, a.address_line2].filter(Boolean).join(", ")],
                    ["City / State", `${a.city}, ${a.state}`],
                    ["Pincode",      a.pincode],
                  ].map(([l, v]) => (
                    <div key={l} style={{ gridColumn: l === "Address" ? "1 / -1" : undefined }}>
                      <div style={lbl}>{l}</div>
                      <div style={val}>{v || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      </div>{/* end content wrapper */}
    </div>
  );
}
