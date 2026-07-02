import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const STATUSES = ["pending", "confirmed", "dispatched", "delivered"];

function dealerLabel(profile) {
  if (!profile) return "—";
  const name = profile.name && profile.name !== "New Dealer" ? profile.name : null;
  return name || profile.email || profile.dealer_code || "Unknown";
}

function SortIcon({ dir }) {
  if (!dir) return <span style={{ opacity: 0.3, marginLeft: 4 }}>⇅</span>;
  return <span style={{ marginLeft: 4 }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsCache, setItemsCache] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);

  // ── Filter / sort state ───────────────────────────────────────────────────
  const [filterOrderId, setFilterOrderId] = useState("");
  const [filterDealer, setFilterDealer] = useState("__all__");
  const [filterStaff, setFilterStaff] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortTotal, setSortTotal] = useState(null);   // null | "asc" | "desc"
  const [sortDate, setSortDate] = useState("desc");   // default newest-first

  const loadOrders = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("orders")
      .select("id, status, total, subtotal, tax, delivery_address, created_at, dealer_id, profiles(name, email, dealer_code, address, staff_assigned)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setOrders(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadOrders(); }, []);

  // Unique dealer options derived from loaded orders
  const dealerOptions = useMemo(() => {
    const seen = new Map();
    orders.forEach((o) => {
      const key = o.dealer_id;
      if (!seen.has(key)) seen.set(key, dealerLabel(o.profiles));
    });
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [orders]);

  // Unique staff options derived from loaded orders
  const staffOptions = useMemo(() => {
    const seen = new Set();
    orders.forEach((o) => {
      const staff = o.profiles?.staff_assigned;
      if (staff) seen.add(staff);
    });
    return Array.from(seen).sort();
  }, [orders]);

  // ── Combined filter + sort ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...orders];

    if (filterOrderId.trim())
      rows = rows.filter((o) => o.id.toLowerCase().includes(filterOrderId.trim().toLowerCase()));

    if (filterDealer !== "__all__")
      rows = rows.filter((o) => o.dealer_id === filterDealer);

    if (filterStaff !== "__all__")
      rows = rows.filter((o) => o.profiles?.staff_assigned === filterStaff);

    if (filterStatus !== "__all__")
      rows = rows.filter((o) => o.status === filterStatus);

    if (filterDateFrom)
      rows = rows.filter((o) => new Date(o.created_at) >= new Date(filterDateFrom));

    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter((o) => new Date(o.created_at) <= to);
    }

    // Sort: total takes priority if set, otherwise date
    if (sortTotal) {
      rows.sort((a, b) => sortTotal === "asc" ? a.total - b.total : b.total - a.total);
    } else if (sortDate) {
      rows.sort((a, b) => {
        const diff = new Date(a.created_at) - new Date(b.created_at);
        return sortDate === "asc" ? diff : -diff;
      });
    }

    return rows;
  }, [orders, filterOrderId, filterDealer, filterStaff, filterStatus, filterDateFrom, filterDateTo, sortTotal, sortDate]);

  const toggleSort = (col) => {
    if (col === "total") {
      setSortTotal((prev) => prev === "asc" ? "desc" : prev === "desc" ? null : "asc");
      setSortDate(null);
    } else {
      setSortDate((prev) => prev === "desc" ? "asc" : "desc");
      setSortTotal(null);
    }
  };

  const handleStatusChange = async (orderId, status, e) => {
    e.stopPropagation();
    setSavingId(orderId);
    await supabase.from("orders").update({ status }).eq("id", orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    setSavingId(null);
  };

  const handleRowClick = async (orderId) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (itemsCache[orderId]) return;
    setItemsLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("id, name, price, qty")
      .eq("order_id", orderId);
    setItemsCache((prev) => ({ ...prev, [orderId]: data || [] }));
    setItemsLoading(false);
  };

  // Shared style for compact in-header controls
  const filterInput = {
    width: "100%", marginTop: 4, padding: "3px 6px", fontSize: 11,
    border: "1px solid #d0c0d0", borderRadius: 4, background: "#fff",
    boxSizing: "border-box",
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Orders</h1>
      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : orders.length === 0 ? (
        <div className="admin-empty">No orders yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr style={{ verticalAlign: "top" }}>
                <th style={{ width: 32, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>#</th>
                <th style={{ width: 24 }}></th>

                {/* Order ID filter */}
                <th>
                  Order ID
                  <input
                    style={filterInput}
                    placeholder="Search…"
                    value={filterOrderId}
                    onChange={(e) => setFilterOrderId(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>

                {/* Dealer dropdown */}
                <th>
                  Dealer
                  <select
                    style={filterInput}
                    value={filterDealer}
                    onChange={(e) => setFilterDealer(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="__all__">All Dealers</option>
                    {dealerOptions.map(({ id, label }) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </th>

                {/* Staff dropdown */}
                <th>
                  Staff Assigned
                  <select
                    style={filterInput}
                    value={filterStaff}
                    onChange={(e) => setFilterStaff(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="__all__">All Staff</option>
                    {staffOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </th>

                {/* Total — sortable */}
                <th style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    onClick={() => toggleSort("total")}>
                  Total <SortIcon dir={sortTotal} />
                </th>

                {/* Date — sortable + date range */}
                <th style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={() => toggleSort("date")}>
                  Placed <SortIcon dir={sortDate} />
                  <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>From</div>
                    <input type="date" style={{ ...filterInput, marginTop: 0 }}
                      value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, marginBottom: 2 }}>To</div>
                    <input type="date" style={{ ...filterInput, marginTop: 0 }}
                      value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                  </div>
                </th>

                {/* Status dropdown */}
                <th>
                  Status
                  <select
                    style={filterInput}
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="__all__">All</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>No orders match the current filters.</td></tr>
              )}
              {filtered.map((o, idx) => {
                const isOpen = expandedId === o.id;
                const items = itemsCache[o.id] || [];
                const profile = o.profiles;

                return [
                  <tr
                    key={o.id}
                    className={`admin-order-row${isOpen ? " expanded" : ""}`}
                    onClick={() => handleRowClick(o.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ width: 32, textAlign: "center", color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td style={{ width: 24, color: "var(--muted)", fontSize: 11 }}>
                      {isOpen ? "▼" : "▶"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {o.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{dealerLabel(profile)}</div>
                      {profile?.email && (
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{profile.email}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: profile?.staff_assigned ? "#333" : "var(--muted)" }}>
                      {profile?.staff_assigned || "—"}
                    </td>
                    <td>Rs. {Number(o.total).toLocaleString()}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                      <select
                        className="admin-select"
                        value={o.status}
                        disabled={savingId === o.id}
                        onChange={(e) => handleStatusChange(o.id, e.target.value, e)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="admin-link"
                        style={{ marginLeft: 10 }}
                        onClick={() => window.open(`/admin/orders/${o.id}/print`, "_blank")}
                      >
                        🖨
                      </button>
                    </td>
                  </tr>,

                  isOpen && (
                    <tr key={`${o.id}-detail`} className="admin-order-detail-row">
                      <td colSpan={8} style={{ padding: 0 }}>
                        <div className="admin-order-detail">
                          <div className="admin-order-detail-section">
                            <div className="admin-order-detail-heading">Dealer Info</div>
                            <div className="admin-order-detail-grid">
                              <span className="od-label">Name</span>
                              <span>{profile?.name || "—"}</span>
                              <span className="od-label">Email</span>
                              <span>{profile?.email || "—"}</span>
                              <span className="od-label">Dealer Code</span>
                              <span>{profile?.dealer_code || "—"}</span>
                              <span className="od-label">Address</span>
                              <span>{o.delivery_address || profile?.address || "—"}</span>
                            </div>
                          </div>

                          <div className="admin-order-detail-section">
                            <div className="admin-order-detail-heading">Order Items</div>
                            {itemsLoading && !itemsCache[o.id] ? (
                              <div className="admin-loading" style={{ padding: "8px 0" }}>Loading items…</div>
                            ) : items.length === 0 ? (
                              <div className="admin-empty" style={{ padding: "8px 0" }}>No items found.</div>
                            ) : (
                              <table className="admin-table od-items-table">
                                <thead>
                                  <tr>
                                    <th>Product</th>
                                    <th>Price</th>
                                    <th>Qty</th>
                                    <th>Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item) => (
                                    <tr key={item.id}>
                                      <td>{item.name}</td>
                                      <td>Rs. {Number(item.price).toLocaleString()}</td>
                                      <td>{item.qty}</td>
                                      <td>Rs. {(Number(item.price) * item.qty).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>

                          <div style={{ width: "100%", paddingTop: 4 }}>
                            <button
                              className="btn small"
                              onClick={() => window.open(`/admin/orders/${o.id}/print`, "_blank")}
                            >
                              🖨 Print Sales Order
                            </button>
                          </div>

                          <div className="admin-order-detail-section od-totals">
                            <span>Subtotal</span><span>Rs. {Number(o.subtotal).toLocaleString()}</span>
                            <span>Tax</span><span>Rs. {Number(o.tax).toLocaleString()}</span>
                            <span className="od-total-label">Total</span>
                            <span className="od-total-value">Rs. {Number(o.total).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
            {filtered.length > 0 && (() => {
              const filteredTotal = filtered.reduce((sum, o) => sum + Number(o.total || 0), 0);
              const hasFilters = filterOrderId.trim() || filterDealer !== "__all__" || filterStatus !== "__all__" || filterDateFrom || filterDateTo;
              return (
                <tfoot>
                  <tr style={{ background: "#f8f4f8", borderTop: "2px solid var(--red-light)" }}>
                    {/* cols: #, arrow, Order ID, Dealer, Staff → span 5 */}
                    <td colSpan={5} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--red-dark)" }}>
                      {hasFilters ? "Filtered" : "All"} Orders: {filtered.length}
                      {hasFilters && orders.length !== filtered.length && (
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginLeft: 8 }}>
                          (of {orders.length} total)
                        </span>
                      )}
                    </td>
                    {/* col: Total */}
                    <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 800, color: "var(--red-dark)", whiteSpace: "nowrap" }}>
                      Rs. {filteredTotal.toLocaleString("en-IN")}
                    </td>
                    {/* cols: Placed, Status → empty */}
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}
    </div>
  );
}
