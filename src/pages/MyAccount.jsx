import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import AddressForm from "../components/AddressForm";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(s) {
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDateOnly(s) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function StatCard({ label, value, sub, onClick, active }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      onClick={onClick}
      onPointerDown={() => onClick && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        background: active ? "#7B2D8B" : pressed ? "#f5eefb" : "#fff",
        borderRadius: 12,
        padding: "14px 14px 12px",
        boxShadow: active ? "0 4px 16px rgba(123,45,139,.25)" : "0 2px 8px rgba(0,0,0,.06)",
        minWidth: 0,
        cursor: onClick ? "pointer" : "default",
        border: active ? "2px solid #7B2D8B" : pressed ? "2px solid #7B2D8B" : "2px solid transparent",
        transition: "all 0.12s",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.75)" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: active ? "#fff" : "#DC2626" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: active ? "rgba(255,255,255,0.7)" : "#94a3b8", marginTop: 2 }}>{sub}</div>}
      {onClick && (
        <div style={{ position: "absolute", top: "50%", right: 10, transform: "translateY(-50%)", color: active ? "rgba(255,255,255,0.6)" : "#cbd5e1", fontSize: 14, lineHeight: 1 }}>›</div>
      )}
    </div>
  );
}

const TABS = ["My Orders", "Overview", "Profile & Addresses"];
const EMPTY_ADDR = { label: "", recipient_name: "", phone: "", address_line1: "", address_line2: "", city: "", state: "", pincode: "", is_default: false };

export default function MyAccount() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, signOut } = useApp();

  const [tab, setTab] = useState(() => searchParams.get("tab") === "profile" ? 2 : 0);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsCache, setOrderItemsCache] = useState({});
  const [periodFilter, setPeriodFilter] = useState("lifetime");
  const [filterOrderId, setFilterOrderId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterTotal, setFilterTotal] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null); // { type: "ok"|"err", text }

  // Address state
  const [addresses, setAddresses] = useState([]);
  const [addrLoading, setAddrLoading] = useState(true);
  const [addrForm, setAddrForm] = useState(null); // null = closed, EMPTY_ADDR = new, {...row} = editing
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrError, setAddrError] = useState("");

  const email = session?.user?.email || "";
  const userId = session?.user?.id;

  // Fetch orders
  useEffect(() => {
    if (!isSupabaseConfigured || !email) { setLoading(false); return; }
    supabase
      .from("orders")
      .select("id, customer_name, customer_phone, customer_email, total, created_at, status, delivery_address, payment_id, email_verified")
      .ilike("customer_email", email)
      .is("dealer_id", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data || []);
        setLoading(false);
      });
  }, [email]);

  // Fetch profile row (name + phone)
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileName(data.name || "");
          setProfilePhone(data.phone || "");
        }
      });
  }, [userId]);

  // Fetch saved addresses
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) { setAddrLoading(false); return; }
    supabase
      .from("customer_addresses")
      .select("*")
      .eq("profile_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("[MyAccount] address fetch:", error);
        setAddresses(data || []);
        setAddrLoading(false);
      });
  }, [userId]);

  const toggleOrder = async (orderId) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, name, qty, price").eq("order_id", orderId);
    setOrderItemsCache(prev => ({ ...prev, [orderId]: data || [] }));
  };

  async function saveProfile() {
    if (!profileName.trim()) { setProfileMsg({ type: "err", text: "Name is required." }); return; }
    if (!/^\d{10}$/.test(profilePhone.trim())) { setProfileMsg({ type: "err", text: "Phone must be 10 digits." }); return; }
    setProfileSaving(true);
    setProfileMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ name: profileName.trim(), phone: profilePhone.trim() })
      .eq("id", userId);
    setProfileSaving(false);
    setProfileMsg(error
      ? { type: "err", text: error.message }
      : { type: "ok",  text: "Profile saved." });
  }

  async function saveAddress(form) {
    setAddrSaving(true);
    setAddrError("");
    const isDefault = Boolean(form.is_default);

    if (isDefault) {
      const { error: clearErr } = await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("profile_id", userId);
      if (clearErr) { setAddrError(clearErr.message); setAddrSaving(false); return; }
    }

    const payload = {
      profile_id:     userId,
      label:          form.label.trim(),
      recipient_name: form.recipient_name.trim(),
      phone:          form.phone.trim(),
      address_line1:  form.address_line1.trim(),
      address_line2:  form.address_line2?.trim() || "",
      city:           form.city.trim(),
      state:          form.state.trim(),
      pincode:        form.pincode.trim(),
      is_default:     isDefault,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("customer_addresses").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("customer_addresses").insert(payload));
    }

    if (error) { setAddrError(error.message); setAddrSaving(false); return; }

    const { data } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("profile_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    setAddresses(data || []);
    setAddrForm(null);
    setAddrSaving(false);
  }

  async function deleteAddress(id) {
    if (!window.confirm("Delete this address?")) return;
    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setAddresses(prev => prev.filter(a => a.id !== id));
  }

  const customerName = profileName.trim() || orders[0]?.customer_name || email;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;
  const lastOrder = orders[0] ? fmtDateOnly(orders[0].created_at) : "Never";

  const card       = { background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 16 };
  const lbl        = { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 };
  const val        = { fontSize: 14, fontWeight: 500 };
  const inputStyle = { display: "block", marginTop: 4, width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
  const btnOutline = { background: "none", border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, background: "#f8f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#94a3b8" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ fontFamily: "inherit", minHeight: "100vh", background: "#f8f4f8", color: "#222" }}>
      <style>{`
        .ma-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        .ma-filter-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 0; }
        .ma-col-date { white-space: nowrap; }
        @media (max-width: 639px) {
          .ma-stat-grid { gap: 8px; }
          .ma-stat-grid > div { padding: 10px 10px !important; min-width: 0 !important; }
          .ma-stat-grid > div > div:first-child { font-size: 9px !important; }
          .ma-stat-grid > div > div:nth-child(2) { font-size: 17px !important; }
          .ma-stat-grid > div > div:nth-child(3) { font-size: 10px !important; }
          .ma-filter-grid { grid-template-columns: 1fr 1fr; }
          .ma-col-date { display: none; }
        }
        @media (max-width: 400px) {
          .ma-filter-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header — two rows */}
      <div style={{ background: "#7B2D8B", color: "#fff", padding: "14px 20px 12px" }}>
        {/* Row 1: name + email */}
        <div style={{ marginBottom: 10, overflowWrap: "break-word", wordBreak: "break-all" }}>
          <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>{customerName}</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{email}</div>
        </div>
        {/* Row 2: Back (left) + Logout (right) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => navigate("/store")}
            style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}
          >
            ← Back to Store
          </button>
          <button
            onClick={async () => { await signOut(); navigate("/store"); }}
            style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", paddingLeft: 16, overflowX: "auto" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: "12px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === i ? 700 : 400, fontSize: 13,
            color: tab === i ? "#7B2D8B" : "#555",
            borderBottom: tab === i ? "2px solid #7B2D8B" : "2px solid transparent",
            whiteSpace: "nowrap",
            fontFamily: "inherit",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>

        {/* TAB 0: MY ORDERS */}
        {tab === 0 && (() => {
          const now = new Date();
          const thisMonth = orders.filter(o => {
            const d = new Date(o.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
          const last3 = orders.filter(o => new Date(o.created_at) >= new Date(Date.now() - 90 * 24 * 3600 * 1000));

          // Date range takes precedence over period cards when active
          const dateRangeActive = filterDateFrom || filterDateTo;
          const periodBase = dateRangeActive
            ? orders
            : periodFilter === "this_month" ? thisMonth
            : periodFilter === "last_3_months" ? last3
            : orders;

          // Apply all four filters with AND logic
          const displayedOrders = periodBase.filter(o => {
            if (filterOrderId && !o.id.toLowerCase().includes(filterOrderId.toLowerCase())) return false;
            if (filterDateFrom && new Date(o.created_at) < new Date(filterDateFrom)) return false;
            if (filterDateTo   && new Date(o.created_at) > new Date(filterDateTo + "T23:59:59")) return false;
            if (filterTotal !== "" && Number(o.total) !== Number(filterTotal)) return false;
            if (filterStatus && o.status !== filterStatus) return false;
            return true;
          });

          const distinctStatuses = [...new Set(orders.map(o => o.status).filter(Boolean))].sort();

          const anyFilterActive = filterOrderId || filterDateFrom || filterDateTo || filterTotal !== "" || filterStatus;

          function clearAll() {
            setFilterOrderId("");
            setFilterDateFrom("");
            setFilterDateTo("");
            setFilterTotal("");
            setFilterStatus("");
            setPeriodFilter("lifetime");
          }

          const filterInp = {
            padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 8,
            fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", width: "100%",
            outline: "none", background: "#fff",
          };

          return (
            <>
              {/* Summary cards */}
              <div className="ma-stat-grid">
                <StatCard label="This Month"    value={thisMonth.length} sub={`₹${fmt(thisMonth.reduce((s, o) => s + Number(o.total), 0))}`}
                  onClick={() => { setPeriodFilter("this_month");    setFilterDateFrom(""); setFilterDateTo(""); }}
                  active={!dateRangeActive && periodFilter === "this_month"} />
                <StatCard label="Last 3 Months" value={last3.length}     sub={`₹${fmt(last3.reduce((s, o) => s + Number(o.total), 0))}`}
                  onClick={() => { setPeriodFilter("last_3_months"); setFilterDateFrom(""); setFilterDateTo(""); }}
                  active={!dateRangeActive && periodFilter === "last_3_months"} />
                <StatCard label="Lifetime"      value={orders.length}    sub={`₹${fmt(totalRevenue)}`}
                  onClick={() => { setPeriodFilter("lifetime");      setFilterDateFrom(""); setFilterDateTo(""); }}
                  active={!dateRangeActive && periodFilter === "lifetime"} />
              </div>

              {/* Filter bar */}
              <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 12 }}>
                <div className="ma-filter-grid" style={{ marginBottom: anyFilterActive ? 10 : 0 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Order ID</div>
                    <input
                      style={filterInp}
                      placeholder="e.g. 616e…"
                      value={filterOrderId}
                      onChange={e => setFilterOrderId(e.target.value)}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Date From</div>
                    <input
                      style={filterInp}
                      type="date"
                      value={filterDateFrom}
                      onChange={e => { setFilterDateFrom(e.target.value); if (e.target.value) setPeriodFilter("lifetime"); }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Date To</div>
                    <input
                      style={filterInp}
                      type="date"
                      value={filterDateTo}
                      onChange={e => { setFilterDateTo(e.target.value); if (e.target.value) setPeriodFilter("lifetime"); }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Total (₹)</div>
                    <input
                      style={filterInp}
                      type="number"
                      placeholder="e.g. 1200"
                      value={filterTotal}
                      onChange={e => setFilterTotal(e.target.value)}
                      min="0"
                    />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 200px" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>Status</div>
                    <select
                      style={{ ...filterInp, appearance: "auto" }}
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {distinctStatuses.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {anyFilterActive && (
                    <div style={{ marginTop: 16 }}>
                      <button
                        onClick={clearAll}
                        style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#7B2D8B" }}
                      >
                        Clear filters ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Orders table */}
              <div style={card}>
                {displayedOrders.length === 0 ? (
                  <div style={{ color: "#94a3b8", textAlign: "center", padding: 32 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                    {orders.length === 0 ? (
                      <>No orders yet.{" "}<button onClick={() => navigate("/store")} style={{ background: "none", border: "none", color: "#7B2D8B", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Shop now →</button></>
                    ) : (
                      <>No orders match the current filters.{" "}<button onClick={clearAll} style={{ background: "none", border: "none", color: "#7B2D8B", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Clear filters</button></>
                    )}
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                        {[["Order ID",""], ["Date","ma-col-date"], ["Total",""], ["Status",""]].map(([h, cls], i) => (
                          <th key={i} className={cls} style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedOrders.map(o => [
                        <tr key={o.id} onClick={() => toggleOrder(o.id)} style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer" }}>
                          <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11 }}>
                            <span style={{ marginRight: 6, color: "#94a3b8", fontSize: 10 }}>{expandedOrderId === o.id ? "▼" : "▶"}</span>
                            {o.id.slice(0, 8)}…
                          </td>
                          <td className="ma-col-date" style={{ padding: "8px", whiteSpace: "nowrap" }}>{fmtDate(o.created_at)}</td>
                          <td style={{ padding: "8px", fontWeight: 600 }}>₹{fmt(o.total)}</td>
                          <td style={{ padding: "8px" }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 8px",
                              background: o.status === "delivered" ? "#eafaf1" : o.status === "pending" ? "#fef9e7" : "#f0f4ff",
                              color:      o.status === "delivered" ? "#27ae60" : o.status === "pending" ? "#e67e22" : "#2563eb",
                            }}>{o.status}</span>
                          </td>
                        </tr>,
                        expandedOrderId === o.id && (
                          <tr key={`${o.id}-d`}>
                            <td colSpan={4} style={{ background: "#f8f4f8", padding: "12px 16px" }}>
                              {!orderItemsCache[o.id] ? (
                                <div style={{ color: "#94a3b8" }}>Loading…</div>
                              ) : orderItemsCache[o.id].length === 0 ? (
                                <div style={{ color: "#94a3b8" }}>No items.</div>
                              ) : (
                                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase" }}>
                                      <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 600 }}>Item</th>
                                      <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600 }}>Qty</th>
                                      <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 600 }}>Price</th>
                                      <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 600 }}>Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {orderItemsCache[o.id].map(it => (
                                      <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                                        <td style={{ padding: "6px 0", color: "#334155" }}>{it.name}</td>
                                        <td style={{ textAlign: "center", color: "#64748b" }}>{it.qty}</td>
                                        <td style={{ textAlign: "right" }}>₹{fmt(it.price)}</td>
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
                            </td>
                          </tr>
                        ),
                      ])}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}

        {/* TAB 1: OVERVIEW */}
        {tab === 1 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
              <StatCard label="Total Orders"    value={orders.length}          onClick={() => setTab(0)} />
              <StatCard label="Total Spent"     value={`₹${fmt(totalRevenue)}`} onClick={() => setTab(0)} />
              <StatCard label="Avg Order Value" value={`₹${fmt(avgOrder)}`}    onClick={() => setTab(0)} />
              <StatCard label="Last Order"      value={lastOrder}
                onClick={() => { setTab(0); if (orders[0]) setExpandedOrderId(orders[0].id); }} />
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>Account Details</div>
              {[
                ["Name",         customerName],
                ["Email",        email || "—"],
                ["Account Type", "Verified Customer"],
                ["Payment",      "Prepaid (Razorpay)"],
                ["First Order",  orders.length ? fmtDateOnly(orders[orders.length - 1].created_at) : "—"],
                ["Member Since", orders.length ? fmtDateOnly(orders[orders.length - 1].created_at) : "—"],
              ].map(([l, v], i) => (
                <div key={l} style={{ paddingTop: 12, paddingBottom: 12, borderTop: i === 0 ? "none" : "0.5px solid #e2e8f0", marginTop: i === 0 ? 8 : 0 }}>
                  <div style={lbl}>{l}</div>
                  <div style={{ ...val, overflowWrap: "break-word", wordBreak: "break-all" }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* TAB 2: PROFILE & ADDRESSES */}
        {tab === 2 && (
          <div style={{ maxWidth: 600 }}>

            {/* Edit basic info */}
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>Basic Info</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 13, color: "#555" }}>
                  Full Name *
                  <input
                    value={profileName}
                    onChange={e => { setProfileName(e.target.value); setProfileMsg(null); }}
                    placeholder="Your name"
                    style={inputStyle}
                  />
                </label>
                <label style={{ fontSize: 13, color: "#555" }}>
                  Phone (10 digits)
                  <input
                    value={profilePhone}
                    onChange={e => { setProfilePhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setProfileMsg(null); }}
                    placeholder="9876543210"
                    inputMode="numeric"
                    style={inputStyle}
                  />
                </label>
                {profileMsg && (
                  <div style={{ fontSize: 13, color: profileMsg.type === "ok" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                    {profileMsg.text}
                  </div>
                )}
                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  style={{ alignSelf: "flex-start", background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: profileSaving ? "not-allowed" : "pointer", opacity: profileSaving ? 0.7 : 1, fontFamily: "inherit" }}
                >
                  {profileSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {/* Saved addresses */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Saved Addresses</div>
                {!addrForm && (
                  <button
                    onClick={() => { setAddrForm({ ...EMPTY_ADDR }); setAddrError(""); }}
                    style={{ background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    + Add New Address
                  </button>
                )}
              </div>

              {addrForm && (
                <AddressForm
                  form={addrForm}
                  onChange={setAddrForm}
                  onSave={saveAddress}
                  onCancel={() => { setAddrForm(null); setAddrError(""); }}
                  saving={addrSaving}
                  error={addrError}
                />
              )}

              {!addrForm && (addrLoading ? (
                <div style={{ color: "#94a3b8", fontSize: 13 }}>Loading…</div>
              ) : addresses.length === 0 ? (
                <div style={{ color: "#94a3b8", textAlign: "center", padding: 24, fontSize: 13 }}>
                  No saved addresses yet. Add one above to speed up checkout.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {addresses.map(a => (
                    <div key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", position: "relative" }}>
                      {a.is_default && (
                        <span style={{ position: "absolute", top: 10, right: 12, background: "#7B2D8B", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 8px" }}>
                          Default
                        </span>
                      )}
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{a.label}</div>
                      <div style={{ fontSize: 13, color: "#444" }}>{a.recipient_name} · {a.phone}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ""}, {a.city}, {a.state} – {a.pincode}
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                        <button onClick={() => { setAddrForm({ ...a }); setAddrError(""); }} style={btnOutline}>Edit</button>
                        <button onClick={() => deleteAddress(a.id)} style={{ ...btnOutline, color: "#dc2626", borderColor: "#fca5a5" }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
