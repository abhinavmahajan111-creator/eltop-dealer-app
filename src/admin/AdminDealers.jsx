import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import ScrollFade from "../components/ScrollFade";

const BUCKET = "dealer-media";

async function uploadFile(dealerId, key, file) {
  const ext = file.name.split(".").pop();
  const path = `${dealerId}/${key}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function SectionHead({ title }) {
  return (
    <div style={{
      gridColumn: "1 / -1", margin: "18px 0 10px",
      paddingBottom: 6, borderBottom: "2px solid var(--red-light)",
      fontSize: 11, fontWeight: 800, textTransform: "uppercase",
      letterSpacing: "0.8px", color: "var(--red-dark)",
    }}>
      {title}
    </div>
  );
}

function ReadField({ label, value, span, children }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined, marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500, color: value ? "#111" : "var(--muted)", whiteSpace: "pre-wrap" }}>{value || "—"}</div>}
    </div>
  );
}

function EditField({ label, field, value, onChange, type = "text", textarea = false, span = false, readOnly = false, children }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined, marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{label}</div>
      {children ?? (readOnly
        ? <div style={{ fontSize: 14, fontWeight: 500, color: "#111", padding: "8px 0" }}>{value || "—"}</div>
        : textarea
          ? <textarea value={value} onChange={e => onChange(field, e.target.value)} rows={2}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, resize: "vertical", marginBottom: 0 }} />
          : <input type={type} value={value} onChange={e => onChange(field, e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
      )}
    </div>
  );
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ items, index, onClose, onNav }) {
  const item = items[index];
  if (!item) return null;
  const isVideo = item.accept?.includes("video");

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onNav(index + 1);
      if (e.key === "ArrowLeft"  && index > 0)                onNav(index - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, items.length, onClose, onNav]);

  const download = () => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.filename;
    a.target = "_blank";
    a.click();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.85)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}
      >
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{item.label}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={download}
            style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 6, color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ⬇️ Download
          </button>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 6, color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
            ✕
          </button>
        </div>
      </div>

      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onNav(index - 1); }}
          style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", color: "#fff", width: 44, height: 44, fontSize: 22, cursor: "pointer" }}>
          ‹
        </button>
      )}

      <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isVideo
          ? <video src={item.url} controls autoPlay style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8 }} />
          : <img src={item.url} alt={item.label} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
        }
      </div>

      {index < items.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNav(index + 1); }}
          style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", color: "#fff", width: 44, height: 44, fontSize: 22, cursor: "pointer" }}>
          ›
        </button>
      )}

      {items.length > 1 && (
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", bottom: 20, display: "flex", gap: 8 }}>
          {items.map((_, i) => (
            <div key={i} onClick={() => onNav(i)}
              style={{ width: 8, height: 8, borderRadius: "50%", cursor: "pointer", background: i === index ? "#fff" : "rgba(255,255,255,.4)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Media tile ───────────────────────────────────────────────────────────────
function MediaTile({ label, url, uploading, onPick, accept = "image/*", editing, onView }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  const isVideo = accept.includes("video");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div
        style={{
          width: 96, height: 96, borderRadius: 10,
          border: `2px ${editing && !url ? "dashed" : "solid"} ${editing && !url ? "var(--red-light)" : "#eee"}`,
          background: "#f8f4f8", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: url ? undefined : 24, color: "var(--muted)",
          position: "relative", cursor: url ? "pointer" : editing ? "pointer" : "default",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (url) onView?.(); else if (editing) ref.current?.click(); }}
      >
        {uploading
          ? <span style={{ fontSize: 12 }}>⏳</span>
          : url
            ? isVideo
              ? <video src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
              : <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : editing ? <span style={{ fontSize: 24 }}>+</span> : <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
        }

        {url && hovered && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,.55)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
            <button
              onClick={e => { e.stopPropagation(); onView?.(); }}
              title="View"
              style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 6, color: "#fff", padding: "5px 8px", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
              🔍
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                const a = document.createElement("a");
                a.href = url; a.download = label; a.target = "_blank"; a.click();
              }}
              title="Download"
              style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 6, color: "#fff", padding: "5px 8px", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
              ⬇️
            </button>
          </div>
        )}

        {url && editing && !hovered && (
          <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,.45)", borderRadius: 4, padding: "2px 4px" }}>
            <span style={{ color: "#fff", fontSize: 10 }}>✏️</span>
          </div>
        )}
        {editing && <input ref={ref} type="file" accept={accept} style={{ display: "none" }} onChange={e => { e.stopPropagation(); e.target.files[0] && onPick(e.target.files[0]); }} />}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", maxWidth: 96, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

// ─── TypeBadge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const cfg = {
    dealer:   { bg: '#f0ebff', color: '#6b21a8', label: 'Dealer'   },
    deleted:  { bg: '#fdecea', color: '#c0392b', label: 'Deleted'  },
    guest:    { bg: '#e8f4ff', color: '#1565c0', label: 'Guest'    },
    customer: { bg: '#f0fdf4', color: '#15803d', label: 'Customer' },
  };
  const { bg, color, label } = cfg[type] || { bg: '#f5f5f5', color: '#555', label: type };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: bg, color }}>
      {label}
    </span>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function AdminDealers() {
  const navigate = useNavigate();
  const location = useLocation();
  const [allProfiles, setAllProfiles] = useState([]);
  const [allOrders, setAllOrders]     = useState([]);
  const [restoreRequests, setRestoreRequests] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);       // dealer/deleted profile
  const [selectedGuest, setSelectedGuest] = useState(null);   // guest row
  const [typeFilter, setTypeFilter]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing]         = useState(false);
  const [edits, setEdits]             = useState({});
  const [saving, setSaving]           = useState(false);
  const [uploading, setUploading]     = useState({});
  const [newTerritory, setNewTerritory] = useState('');
  const [creditUsed, setCreditUsed]   = useState(null);
  const [lightbox, setLightbox]       = useState(null);
  const [exporting, setExporting]     = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [editingCreditLimit, setEditingCreditLimit] = useState(false);
  const [creditLimitDraft, setCreditLimitDraft]     = useState('');
  const [savingCreditLimit, setSavingCreditLimit]   = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState(null);
  const [deletingId, setDeletingId]           = useState(null);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [typeDropdownPos, setTypeDropdownPos] = useState({ top: 0, left: 0 });
  const typeDropdownRef = useRef(null);        // ref on the trigger <th>
  const typeDropdownBtnRef = useRef(null);     // ref on the trigger <button> for positioning
  const typeDropdownPortalRef = useRef(null);  // ref on the portal div — kept out of the <th> DOM tree
  const [deletedGuests, setDeletedGuests]     = useState([]);

  useEffect(() => {
    if (!location.state?.resetAt) return;
    setTypeFilter('all');
    setSearchQuery('');
    setSelected(null);
    setSelectedGuest(null);
  }, [location.state?.resetAt]);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const close = () => setTypeDropdownOpen(false);
    const onMouseDown = (e) => {
      const inTrigger = typeDropdownRef.current?.contains(e.target);
      const inPortal  = typeDropdownPortalRef.current?.contains(e.target);
      if (!inTrigger && !inPortal) close();
    };
    document.addEventListener('mousedown', onMouseDown);
    // Close on any scroll (prevents stale fixed positioning)
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [typeDropdownOpen]);

  // ─── Data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('id, dealer_id, customer_name, customer_phone, customer_email, total, created_at, status').order('created_at', { ascending: false }),
      supabase.from('restore_requests').select('id, profile_id, contact_value, requested_at, status, profiles(shop_name, owner_name, email)').eq('status', 'pending').order('requested_at', { ascending: false }),
      supabase.from('deleted_guests').select('guest_key, deleted_at, restored_at').is('restored_at', null),
    ]).then(([profRes, ordRes, reqRes, dgRes]) => {
      if (profRes.data) setAllProfiles(profRes.data);
      if (ordRes.data)  setAllOrders(ordRes.data);
      if (reqRes.data)  setRestoreRequests(reqRes.data);
      if (dgRes.data)   setDeletedGuests(dgRes.data);
      setLoading(false);
    });
  }, []);

  // Lazy cleanup: permanently delete profiles soft-deleted over 1 year ago
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('profiles').select('id').not('deleted_at', 'is', null).lt('deleted_at', oneYearAgo)
      .then(async ({ data: expired }) => {
        if (!expired?.length) return;
        const expiredIds = new Set(expired.map(p => p.id));
        for (const p of expired) {
          await supabase.from('orders').update({ dealer_id: null }).eq('dealer_id', p.id);
          await supabase.from('profiles').delete().eq('id', p.id);
        }
        setAllProfiles(prev => prev.filter(p => !expiredIds.has(p.id)));
      });
  }, []);

  // ─── Derived data ───────────────────────────────────────────────────────────
  const deletedGuestKeysSet = useMemo(() => new Set(deletedGuests.map(dg => dg.guest_key)), [deletedGuests]);

  const dealerStatsMap = useMemo(() => {
    const map = {};
    for (const o of allOrders) {
      if (!o.dealer_id) continue;
      if (!map[o.dealer_id]) map[o.dealer_id] = { orderCount: 0, totalSpent: 0, lastOrder: null };
      map[o.dealer_id].orderCount++;
      map[o.dealer_id].totalSpent += Number(o.total) || 0;
      if (!map[o.dealer_id].lastOrder || o.created_at > map[o.dealer_id].lastOrder) {
        map[o.dealer_id].lastOrder = o.created_at;
      }
    }
    return map;
  }, [allOrders]);

  const guestRows = useMemo(() => {
    const map = {};
    for (const o of allOrders) {
      if (o.dealer_id) continue;
      const key = o.customer_phone || o.customer_email || o.customer_name || 'unknown';
      if (!map[key]) map[key] = {
        _key: key,
        name: o.customer_name || '—',
        phone: o.customer_phone || '',
        email: o.customer_email || '',
        orderCount: 0, totalSpent: 0, lastOrder: null, orders: [],
      };
      map[key].orderCount++;
      map[key].totalSpent += Number(o.total) || 0;
      if (!map[key].lastOrder || o.created_at > map[key].lastOrder) map[key].lastOrder = o.created_at;
      map[key].orders.push(o);
    }
    return Object.values(map).map(g => ({
      ...g,
      _type: deletedGuestKeysSet.has(g._key) ? 'deleted' : 'guest',
      _isDeletedGuest: deletedGuestKeysSet.has(g._key),
    })).sort((a, b) => (b.lastOrder || '') > (a.lastOrder || '') ? 1 : -1);
  }, [allOrders, deletedGuestKeysSet]);

  const unifiedRows = useMemo(() => {
    const q = searchQuery.toLowerCase();

    // ── Role-hierarchy dedup: build suppression sets from ALL profiles (typeFilter-agnostic)
    // so that a guest whose email matches any profile (dealer or customer) is suppressed
    // from the guest list regardless of which tab is currently active.
    const dealerEmailSet = new Set(
      allProfiles
        .filter(p => p.is_dealer === true && p.email)
        .map(p => p.email.toLowerCase())
    );
    const customerEmailSet = new Set(
      allProfiles
        .filter(p => p.is_dealer === false && p.email && !dealerEmailSet.has(p.email.toLowerCase()))
        .map(p => p.email.toLowerCase())
    );

    const dealerList = allProfiles
      .filter(p => p.is_dealer === true)
      .filter(p => {
        const type = p.deleted_at ? 'deleted' : 'dealer';
        if (typeFilter !== 'all' && typeFilter !== type) return false;
        if (!q) return true;
        return (
          (p.shop_name || '').toLowerCase().includes(q) ||
          (p.owner_name || '').toLowerCase().includes(q) ||
          (p.email || '').toLowerCase().includes(q) ||
          (p.phone || '').toLowerCase().includes(q) ||
          (p.dealer_code || '').toLowerCase().includes(q)
        );
      })
      .map(p => ({
        ...p,
        _type:       p.deleted_at ? 'deleted' : 'dealer',
        _name:       p.shop_name || p.owner_name || p.email || '—',
        _phone:      p.phone || '',
        _email:      p.email || '',
        _orderCount: dealerStatsMap[p.id]?.orderCount || 0,
        _totalSpent: dealerStatsMap[p.id]?.totalSpent || 0,
        _lastOrder:  dealerStatsMap[p.id]?.lastOrder || p.created_at || null,
      }));

    const customerList = (typeFilter === 'all' || typeFilter === 'customer')
      ? allProfiles
          .filter(p => p.is_dealer === false && !p.deleted_at)
          .filter(p => !p.email || !dealerEmailSet.has(p.email.toLowerCase()))
          .filter(p => !q || (
            (p.name  || '').toLowerCase().includes(q) ||
            (p.email || '').toLowerCase().includes(q) ||
            (p.phone || '').toLowerCase().includes(q)
          ))
          .map(p => ({
            ...p,
            _type:       'customer',
            _name:       p.name  || p.email || '—',
            _phone:      p.phone || '',
            _email:      p.email || '',
            _orderCount: 0,
            _totalSpent: 0,
            _lastOrder:  p.created_at || null,
          }))
      : [];

    const guestMatchesSearch = (g) => !q || (
      g.name.toLowerCase().includes(q) ||
      g.phone.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q)
    );
    const mapGuest = g => ({
      ...g,
      _name:       g.name,
      _phone:      g.phone,
      _email:      g.email,
      _orderCount: g.orderCount,
      _totalSpent: g.totalSpent,
      _lastOrder:  g.lastOrder,
    });

    const activeGuests = (typeFilter === 'all' || typeFilter === 'guest')
      ? guestRows
          .filter(g => !g._isDeletedGuest && guestMatchesSearch(g))
          .filter(g => {
            if (!g.email) return true; // no email = can't match any profile
            const em = g.email.toLowerCase();
            return !dealerEmailSet.has(em) && !customerEmailSet.has(em);
          })
          .map(mapGuest)
      : [];

    const deletedGuestRows = typeFilter === 'deleted'
      ? guestRows.filter(g => g._isDeletedGuest && guestMatchesSearch(g)).map(mapGuest)
      : [];

    const guestList = [...activeGuests, ...deletedGuestRows];

    return [...dealerList, ...customerList, ...guestList].sort((a, b) =>
      (b._lastOrder || '') > (a._lastOrder || '') ? 1 : -1
    );
  }, [allProfiles, guestRows, dealerStatsMap, typeFilter, searchQuery]);

  // ─── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!isSupabaseConfigured) return;
    setExporting(true);
    setExportStatus("Fetching data…");
    try {
      const today = new Date();
      const dateSuffix = `${String(today.getDate()).padStart(2,"0")}${String(today.getMonth()+1).padStart(2,"0")}${today.getFullYear()}`;

      const [profilesRes, ordersRes, itemsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, status, total, created_at, dealer_id, profiles(dealer_code, name, email, shop_name)").order("created_at", { ascending: false }),
        supabase.from("order_items").select("order_id, name, qty, price, net_rate, mrp, dlp, discount1, discount2, hsn_code, products(sku)"),
      ]);
      const profiles   = profilesRes.data  || [];
      const orders     = ordersRes.data    || [];
      const orderItems = itemsRes.data     || [];

      const itemCountMap = {};
      orderItems.forEach(it => { itemCountMap[it.order_id] = (itemCountMap[it.order_id] || 0) + it.qty; });

      setExportStatus("Building Excel…");
      const wb = XLSX.utils.book_new();

      const dealerRows = profiles.map(d => ({
        "ID":                   d.id,
        "Dealer Code":          d.dealer_code || "",
        "Shop Name":            d.shop_name   || "",
        "Alias":                d.alias_name  || "",
        "Owner Name":           d.owner_name  || "",
        "Email":                d.email       || "",
        "Phone 1":              d.phone       || "",
        "Phone 2":              d.phone2      || "",
        "GSTIN":                d.gstin       || "",
        "Registration Type":    d.registration_type || "",
        "Website":              d.website     || "",
        "Staff Assigned":       d.staff_assigned || "",
        "Discount 1 (%)":       d.discount1   ?? "",
        "Discount 2 (%)":       d.discount2   ?? "",
        "Credit Limit (Rs.)":   d.credit_limit ?? "",
        "Billing Address":      d.address     || "",
        "Shop Address":         d.shop_address || "",
        "Godown Address":       d.godown_address || "",
        "Territories":          Array.isArray(d.territory) ? d.territory.join(", ") : "",
        "Latitude":             d.latitude    ?? "",
        "Longitude":            d.longitude   ?? "",
        "Google Business Name": d.google_business_name  || "",
        "Google Maps URL":      d.google_maps_url       || "",
        "Google Rating":        d.google_rating         ?? "",
        "Google Reviews":       d.google_reviews_count  ?? "",
        "Listing Status":       d.google_listing_status || "",
        "Listing Claimed":      d.google_listing_claimed ? "Yes" : "No",
        "Status":               d.deleted_at ? "Deleted" : d.is_blocked ? "Blocked" : "Active",
        "Deleted At":           d.deleted_at ? new Date(d.deleted_at).toLocaleString("en-IN") : "",
        "Created At":           d.created_at ? new Date(d.created_at).toLocaleString("en-IN") : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dealerRows), "Dealers");

      const orderRows = orders.map(o => ({
        "Order ID":     o.id,
        "Dealer Code":  o.profiles?.dealer_code || "",
        "Dealer Name":  o.profiles?.shop_name || o.profiles?.name || "",
        "Dealer Email": o.profiles?.email || "",
        "Order Date":   o.created_at ? new Date(o.created_at).toLocaleString("en-IN") : "",
        "Status":       o.status || "",
        "Total (Rs.)":  Number(o.total) || 0,
        "Items (qty)":  itemCountMap[o.id] || 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "Orders");

      const itemRows = orderItems.map(it => {
        const net = Number(it.net_rate ?? it.price) || 0;
        return {
          "Order ID":       it.order_id,
          "Product Name":   it.name || "",
          "SKU":            it.products?.sku || "",
          "HSN Code":       it.hsn_code || "",
          "Qty":            it.qty || 0,
          "MRP (Rs.)":      it.mrp != null ? Number(it.mrp) : "",
          "DLP (Rs.)":      it.dlp != null ? Number(it.dlp) : "",
          "Disc 1 (%)":     it.discount1 != null ? Number(it.discount1) : "",
          "Disc 2 (%)":     it.discount2 != null ? Number(it.discount2) : "",
          "Net Rate (Rs.)": net,
          "Amount (Rs.)":   net * (it.qty || 0),
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), "Order Items");

      const PHOTO_KEYS = [
        { key: "owner_photo",       label: "Owner Photo"    },
        { key: "staff1_photo",      label: "Staff 1 Photo"  },
        { key: "staff2_photo",      label: "Staff 2 Photo"  },
        { key: "shop_inside_photo", label: "Shop Inside"    },
        { key: "shop_board_photo",  label: "Shop Board"     },
        { key: "shop_video",        label: "Interior Video" },
      ];
      const mediaRows = [];
      profiles.forEach(d => {
        PHOTO_KEYS.forEach(({ key, label }) => {
          if (d[key]) mediaRows.push({
            "Dealer Code": d.dealer_code || d.id.substring(0, 8),
            "Shop Name":   d.shop_name || d.owner_name || "",
            "Photo Type":  label,
            "URL":         d[key],
          });
        });
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(mediaRows.length ? mediaRows : [{ "Dealer Code": "", "Shop Name": "", "Photo Type": "", "URL": "" }]),
        "Media Links"
      );

      setExportStatus("Writing file…");
      XLSX.writeFile(wb, `Eltop_Database_Export_${dateSuffix}.xlsx`);

      // ── Customers export (separate file) ───────────────────────────────────
      setExportStatus("Fetching customers…");
      const [custRes, addrRes, guestOrdersRes] = await Promise.all([
        supabase.from("profiles").select("id, name, phone, email, created_at").eq("is_dealer", false).is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("customer_addresses").select("*").order("created_at", { ascending: true }),
        // Fetch guest orders (no dealer_id) sorted oldest-first so first-seen date is accurate
        supabase.from("orders").select("customer_name, customer_phone, customer_email, created_at, delivery_address").is("dealer_id", null).not("customer_email", "is", null).order("created_at", { ascending: true }),
      ]);
      const customers = custRes.data || [];
      const addrMap   = {};
      (addrRes.data || []).forEach(a => {
        if (!addrMap[a.profile_id]) addrMap[a.profile_id] = [];
        addrMap[a.profile_id].push(a);
      });

      // Emails of registered customers — used to exclude guests who later registered
      const profileEmailSet = new Set(customers.map(c => c.email?.toLowerCase()).filter(Boolean));

      // Deduplicate guest orders by email; keep the earliest order's contact/address data.
      // Orders are already sorted oldest-first, so first Map entry wins.
      const guestMap = new Map();
      (guestOrdersRes.data || []).forEach(o => {
        const key = o.customer_email?.toLowerCase();
        if (!key || profileEmailSet.has(key)) return; // skip if registered customer
        if (!guestMap.has(key)) {
          guestMap.set(key, {
            name:    o.customer_name    || "",
            phone:   o.customer_phone   || "",
            email:   o.customer_email   || "",
            firstAt: o.created_at,
            address: o.delivery_address || "",
          });
        }
      });

      const customerRows = [];

      // Registered customers
      customers.forEach(c => {
        const addrs = addrMap[c.id] || [];
        const base = {
          "Source":             "Registered Customer",
          "Profile ID":         c.id,
          "Account Name":       c.name  || "",
          "Account Phone":      c.phone || "",
          "Account Email":      c.email || "",
          "Account Created At": c.created_at ? new Date(c.created_at).toLocaleString("en-IN") : "",
        };
        if (addrs.length === 0) {
          customerRows.push({ ...base, "Contact Type": "account", "Address Label": "", "Recipient Name": "", "Recipient Phone": "", "Address Line 1": "", "Address Line 2": "", "City": "", "State": "", "Pincode": "", "Is Default": "" });
        } else {
          addrs.forEach(a => customerRows.push({
            ...base,
            "Contact Type":    "delivery",
            "Address Label":   a.label          || "",
            "Recipient Name":  a.recipient_name || "",
            "Recipient Phone": a.phone          || "",
            "Address Line 1":  a.address_line1  || "",
            "Address Line 2":  a.address_line2  || "",
            "City":            a.city           || "",
            "State":           a.state          || "",
            "Pincode":         a.pincode        || "",
            "Is Default":      a.is_default ? "Yes" : "No",
          }));
        }
      });

      // Guest checkout rows — one row per unique email, address from delivery_address text field
      guestMap.forEach(g => {
        customerRows.push({
          "Source":             "Guest Checkout",
          "Profile ID":         "",
          "Account Name":       g.name,
          "Account Phone":      g.phone,
          "Account Email":      g.email,
          "Account Created At": g.firstAt ? new Date(g.firstAt).toLocaleString("en-IN") : "",
          "Contact Type":       "guest",
          "Address Label":      "",
          "Recipient Name":     g.name,
          "Recipient Phone":    g.phone,
          "Address Line 1":     g.address,
          "Address Line 2":     "",
          "City":               "",
          "State":              "",
          "Pincode":            "",
          "Is Default":         "",
        });
      });

      const custWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(custWb, XLSX.utils.json_to_sheet(customerRows.length ? customerRows : [{}]), "Customers");
      XLSX.writeFile(custWb, `customers-export-${dateSuffix}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("Export failed: " + e.message);
    }
    setExportStatus("");
    setExporting(false);
  };

  // ─── Dealer handlers ─────────────────────────────────────────────────────────
  const openDealer = (d) => {
    setSelected(d);
    setEditing(false);
    setEdits({});
    setNewTerritory("");
    setCreditUsed(null);
    setLightbox(null);
    setEditingCreditLimit(false);
    setCreditLimitDraft("");
    if (isSupabaseConfigured) {
      supabase.from("orders").select("total").eq("dealer_id", d.id).in("status", ["pending", "confirmed"])
        .then(({ data }) => {
          if (data) setCreditUsed(data.reduce((sum, o) => sum + Number(o.total || 0), 0));
        });
    }
  };

  const goBack = () => { setSelected(null); setSelectedGuest(null); setEditing(false); setEdits({}); setNewTerritory(""); };

  const startEdit = () => {
    setEdits({
      owner_name:                 selected.owner_name                 || "",
      shop_name:                  selected.shop_name                  || "",
      alias_name:                 selected.alias_name                 || "",
      registration_type:          selected.registration_type          || "Unregistered",
      gstin:                      selected.gstin                      || "",
      phone:                      selected.phone                      || "",
      phone2:                     selected.phone2                     || "",
      address:                    selected.address                    || "",
      shop_address:               selected.shop_address               || "",
      godown_address:             selected.godown_address             || "",
      staff_assigned:             selected.staff_assigned             || "",
      staff1_name:                selected.staff1_name                || "",
      staff2_name:                selected.staff2_name                || "",
      website:                    selected.website                    || "",
      territory:                  Array.isArray(selected.territory) ? [...selected.territory] : [],
      discount1:                  selected.discount1                  ?? 0,
      discount2:                  selected.discount2                  ?? 0,
      credit_limit:               selected.credit_limit               ?? "",
      google_business_name:       selected.google_business_name       || "",
      google_maps_url:            selected.google_maps_url            || "",
      google_rating:              selected.google_rating              ?? "",
      google_reviews_count:       selected.google_reviews_count       ?? "",
      google_listing_status:      selected.google_listing_status      || "Not Listed",
      google_listing_claimed:     selected.google_listing_claimed     ?? false,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEdits({}); setNewTerritory(""); };
  const ev = (field) => edits[field] ?? "";
  const set = (field, val) => setEdits(p => ({ ...p, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    const isRegistered = edits.registration_type === "Registered";
    const payload = {
      owner_name:                 edits.owner_name,
      shop_name:                  edits.shop_name,
      alias_name:                 edits.alias_name,
      registration_type:          edits.registration_type,
      gstin:                      isRegistered ? edits.gstin : null,
      phone:                      edits.phone,
      phone2:                     edits.phone2,
      address:                    edits.address,
      shop_address:               edits.shop_address,
      godown_address:             edits.godown_address,
      staff_assigned:             edits.staff_assigned,
      staff1_name:                edits.staff1_name,
      staff2_name:                edits.staff2_name,
      website:                    edits.website,
      territory:                  edits.territory,
      discount1:                  Number(edits.discount1) || 0,
      discount2:                  Number(edits.discount2) || 0,
      credit_limit:               edits.credit_limit !== "" ? Number(edits.credit_limit) : null,
      google_business_name:       edits.google_business_name || null,
      google_maps_url:            edits.google_maps_url      || null,
      google_rating:              edits.google_rating !== "" ? Number(edits.google_rating) : null,
      google_reviews_count:       edits.google_reviews_count !== "" ? Number(edits.google_reviews_count) : null,
      google_listing_status:      edits.google_listing_status || "Not Listed",
      google_listing_claimed:     !!edits.google_listing_claimed,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", selected.id);
    if (!error) {
      const updated = { ...selected, ...payload };
      setSelected(updated);
      setAllProfiles(prev => prev.map(d => d.id === selected.id ? updated : d));
    }
    setSaving(false);
    setEditing(false);
    setEdits({});
    setNewTerritory("");
  };

  const handleChangeAppStatus = async (newStatus) => {
    const { error } = await supabase.from('profiles')
      .update({ dealer_application_status: newStatus })
      .eq('id', selected.id);
    if (error) { alert('Failed: ' + error.message); return; }
    const updated = { ...selected, dealer_application_status: newStatus };
    setSelected(updated);
    setAllProfiles(prev => prev.map(p => p.id === selected.id ? updated : p));
  };

  const handleToggleBlock = async () => {
    setSaving(true);
    const next = !selected.is_blocked;
    await supabase.from("profiles").update({ is_blocked: next }).eq("id", selected.id);
    const updated = { ...selected, is_blocked: next };
    setSelected(updated);
    setAllProfiles(prev => prev.map(d => d.id === selected.id ? updated : d));
    setSaving(false);
  };

  const handleMediaUpload = async (key, file) => {
    setUploading(p => ({ ...p, [key]: true }));
    try {
      const url = await uploadFile(selected.id, key, file);
      await supabase.from("profiles").update({ [key]: url }).eq("id", selected.id);
      const updated = { ...selected, [key]: url };
      setSelected(updated);
      setAllProfiles(prev => prev.map(d => d.id === selected.id ? updated : d));
    } catch (e) {
      alert("Upload failed: " + e.message);
    }
    setUploading(p => ({ ...p, [key]: false }));
  };

  const fetchLocation = () => {
    if (!navigator.geolocation) { alert("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await supabase.from("profiles").update({ latitude, longitude }).eq("id", selected.id);
        const updated = { ...selected, latitude, longitude };
        setSelected(updated);
        setAllProfiles(prev => prev.map(d => d.id === selected.id ? updated : d));
      },
      () => alert("Location access denied. Please allow location in your browser.")
    );
  };

  const currentTerritories = () => editing ? (edits.territory || []) : (Array.isArray(selected?.territory) ? selected.territory : []);

  const addTerritory = () => {
    const t = newTerritory.trim();
    if (!t) return;
    const list = [...currentTerritories(), t];
    if (editing) {
      set("territory", list);
    } else {
      supabase.from("profiles").update({ territory: list }).eq("id", selected.id);
      setSelected(p => ({ ...p, territory: list }));
      setAllProfiles(prev => prev.map(d => d.id === selected.id ? { ...d, territory: list } : d));
    }
    setNewTerritory("");
  };

  const removeTerritory = (i) => {
    const list = currentTerritories().filter((_, idx) => idx !== i);
    if (editing) {
      set("territory", list);
    } else {
      supabase.from("profiles").update({ territory: list }).eq("id", selected.id);
      setSelected(p => ({ ...p, territory: list }));
      setAllProfiles(prev => prev.map(d => d.id === selected.id ? { ...d, territory: list } : d));
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteConfirm) return;
    const { dealer } = deleteConfirm;
    setDeletingId(dealer.id);
    const deletedAt = new Date().toISOString();
    const { error } = await supabase.from('profiles').update({ deleted_at: deletedAt }).eq('id', dealer.id);
    if (error) { alert('Failed: ' + error.message); setDeletingId(null); setDeleteConfirm(null); return; }
    setAllProfiles(prev => prev.map(p => p.id === dealer.id ? { ...p, deleted_at: deletedAt } : p));
    if (selected?.id === dealer.id) { setSelected(null); setEditing(false); }
    setDeleteConfirm(null);
    setDeletingId(null);
  };

  const handleRestore = async (dealerId) => {
    const { error } = await supabase.from('profiles').update({ deleted_at: null }).eq('id', dealerId);
    if (error) { alert('Restore failed: ' + error.message); return; }
    setAllProfiles(prev => prev.map(p => p.id === dealerId ? { ...p, deleted_at: null } : p));
  };

  const handlePermanentDelete = async (dealer) => {
    if (!window.confirm(`Permanently delete "${dealer.shop_name || dealer.email}"? This cannot be undone.`)) return;
    await supabase.from('orders').update({ dealer_id: null }).eq('dealer_id', dealer.id);
    const { error } = await supabase.from('profiles').delete().eq('id', dealer.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setAllProfiles(prev => prev.filter(p => p.id !== dealer.id));
  };

  const handleSoftDeleteGuest = async () => {
    if (!deleteConfirm?.guest) return;
    const guest = deleteConfirm.guest;
    setDeletingId(`guest-${guest._key}`);
    const { error } = await supabase.from('deleted_guests').upsert(
      { guest_key: guest._key, deleted_at: new Date().toISOString(), restored_at: null },
      { onConflict: 'guest_key' }
    );
    if (error) { alert('Failed: ' + error.message); setDeletingId(null); setDeleteConfirm(null); return; }
    setDeletedGuests(prev => [
      ...prev.filter(dg => dg.guest_key !== guest._key),
      { guest_key: guest._key, deleted_at: new Date().toISOString(), restored_at: null },
    ]);
    if (selectedGuest?._key === guest._key) setSelectedGuest(null);
    setDeleteConfirm(null);
    setDeletingId(null);
  };

  const handleRestoreGuest = async (guestKey) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('deleted_guests').update({ restored_at: now }).eq('guest_key', guestKey);
    if (error) { alert('Restore failed: ' + error.message); return; }
    setDeletedGuests(prev => prev.filter(dg => dg.guest_key !== guestKey));
  };

  const handleApproveRestore = async (req) => {
    await supabase.from('profiles').update({ deleted_at: null }).eq('id', req.profile_id);
    await supabase.from('restore_requests').update({ status: 'approved' }).eq('id', req.id);
    setRestoreRequests(prev => prev.filter(r => r.id !== req.id));
    setAllProfiles(prev => prev.map(p => p.id === req.profile_id ? { ...p, deleted_at: null } : p));
  };

  const handleRejectRestore = async (req) => {
    await supabase.from('restore_requests').update({ status: 'rejected' }).eq('id', req.id);
    setRestoreRequests(prev => prev.filter(r => r.id !== req.id));
  };

  const handleDealerExport = async () => {
    if (!isSupabaseConfigured || !selected) return;
    const d = selected;
    const code = d.dealer_code || d.id.substring(0, 8);
    const today = new Date();
    const filename = `Eltop_${code}_Export_${String(today.getDate()).padStart(2,"0")}${String(today.getMonth()+1).padStart(2,"0")}${today.getFullYear()}.xlsx`;

    try {
      const { data: orders } = await supabase.from("orders").select("id, status, total, created_at, dealer_id").eq("dealer_id", d.id).order("created_at", { ascending: false });
      const orderList = orders || [];
      const orderIds  = orderList.map(o => o.id);
      let itemList = [];
      if (orderIds.length > 0) {
        const { data: items } = await supabase.from("order_items").select("order_id, name, qty, price, net_rate, mrp, dlp, discount1, discount2, hsn_code, products(sku)").in("order_id", orderIds);
        itemList = items || [];
      }

      const wb = XLSX.utils.book_new();

      const infoRows = [
        { "Field": "ID",                   "Value": d.id },
        { "Field": "Dealer Code",          "Value": d.dealer_code || "" },
        { "Field": "Shop Name",            "Value": d.shop_name || "" },
        { "Field": "Alias",                "Value": d.alias_name || "" },
        { "Field": "Owner Name",           "Value": d.owner_name || "" },
        { "Field": "Email",                "Value": d.email || "" },
        { "Field": "Phone 1",              "Value": d.phone || "" },
        { "Field": "Phone 2",              "Value": d.phone2 || "" },
        { "Field": "GSTIN",                "Value": d.gstin || "" },
        { "Field": "Registration Type",    "Value": d.registration_type || "" },
        { "Field": "Website",              "Value": d.website || "" },
        { "Field": "Staff Assigned",       "Value": d.staff_assigned || "" },
        { "Field": "Discount 1 (%)",       "Value": d.discount1 ?? "" },
        { "Field": "Discount 2 (%)",       "Value": d.discount2 ?? "" },
        { "Field": "Credit Limit (Rs.)",   "Value": d.credit_limit ?? "" },
        { "Field": "Billing Address",      "Value": d.address || "" },
        { "Field": "Shop Address",         "Value": d.shop_address || "" },
        { "Field": "Godown Address",       "Value": d.godown_address || "" },
        { "Field": "Territories",          "Value": Array.isArray(d.territory) ? d.territory.join(", ") : "" },
        { "Field": "Latitude",             "Value": d.latitude ?? "" },
        { "Field": "Longitude",            "Value": d.longitude ?? "" },
        { "Field": "Google Business Name", "Value": d.google_business_name || "" },
        { "Field": "Google Maps URL",      "Value": d.google_maps_url || "" },
        { "Field": "Google Rating",        "Value": d.google_rating ?? "" },
        { "Field": "Google Reviews",       "Value": d.google_reviews_count ?? "" },
        { "Field": "Listing Status",       "Value": d.google_listing_status || "" },
        { "Field": "Listing Claimed",      "Value": d.google_listing_claimed ? "Yes" : "No" },
        { "Field": "Status",               "Value": d.deleted_at ? "Deleted" : d.is_blocked ? "Blocked" : "Active" },
        { "Field": "Member Since",         "Value": d.created_at ? new Date(d.created_at).toLocaleString("en-IN") : "" },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), "Dealer Info");

      const orderRows = orderList.map(o => ({
        "Order ID":    o.id,
        "Order Date":  o.created_at ? new Date(o.created_at).toLocaleString("en-IN") : "",
        "Status":      o.status || "",
        "Total (Rs.)": Number(o.total) || 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows.length ? orderRows : [{ "Order ID": "", "Order Date": "", "Status": "", "Total (Rs.)": "" }]), "Orders");

      const itemRows = itemList.map(it => {
        const net = Number(it.net_rate ?? it.price) || 0;
        return {
          "Order ID":       it.order_id,
          "Product Name":   it.name || "",
          "SKU":            it.products?.sku || "",
          "HSN Code":       it.hsn_code || "",
          "Qty":            it.qty || 0,
          "MRP (Rs.)":      it.mrp != null ? Number(it.mrp) : "",
          "DLP (Rs.)":      it.dlp != null ? Number(it.dlp) : "",
          "Disc 1 (%)":     it.discount1 != null ? Number(it.discount1) : "",
          "Disc 2 (%)":     it.discount2 != null ? Number(it.discount2) : "",
          "Net Rate (Rs.)": net,
          "Amount (Rs.)":   net * (it.qty || 0),
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows.length ? itemRows : [{}]), "Order Items");

      const MEDIA_KEYS = [
        { key: "owner_photo",       label: "Owner Photo",    filename: `${code}_owner-photo.jpg`        },
        { key: "staff1_photo",      label: "Staff 1 Photo",  filename: `${code}_staff1-photo.jpg`       },
        { key: "staff2_photo",      label: "Staff 2 Photo",  filename: `${code}_staff2-photo.jpg`       },
        { key: "shop_inside_photo", label: "Shop Inside",    filename: `${code}_shop-inside.jpg`        },
        { key: "shop_board_photo",  label: "Shop Board",     filename: `${code}_shop-board.jpg`         },
        { key: "shop_video",        label: "Interior Video", filename: `${code}_interior-video.mp4`     },
      ];
      const mediaRows = MEDIA_KEYS.filter(m => !!d[m.key]).map(m => ({ "Photo Type": m.label, "URL": d[m.key], "File Name": m.filename }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mediaRows.length ? mediaRows : [{ "Photo Type": "", "URL": "", "File Name": "" }]), "Media Links");

      XLSX.writeFile(wb, filename);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
  };

  // ─── GUEST DETAIL VIEW ────────────────────────────────────────────────────────
  if (selectedGuest) {
    const g = selectedGuest;
    const isDeletedGuest = g._isDeletedGuest;
    const gOrders = [...g.orders].sort((a, b) => b.created_at > a.created_at ? 1 : -1);
    const avgSpent = g.orderCount ? g.totalSpent / g.orderCount : 0;
    const now2 = Date.now();
    const msMonth = 30 * 24 * 3600 * 1000;
    const monthsSpan = g.orders.length > 1
      ? Math.max(1, (now2 - new Date(gOrders[gOrders.length - 1].created_at).getTime()) / msMonth)
      : 1;
    const freq = (g.orderCount / monthsSpan).toFixed(1);

    return (
      <div className="admin-page">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red-dark)", fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Back to Dealers &amp; Customers
          </button>
          {!isDeletedGuest && (
            <button
              className="btn small"
              style={{ background: "var(--red-dark)", color: "#fff", border: "none" }}
              onClick={() => navigate(`/admin/crm/guest/${encodeURIComponent(g._key)}`)}
            >
              View Full CRM →
            </button>
          )}
        </div>

        {isDeletedGuest && (
          <div style={{ background: '#fdecea', border: '1px solid #e74c3c', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: '#7b241c', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700 }}>🗑 Deleted guest</span>
            <span>· Hidden from the active list</span>
            <button className="btn small outline" style={{ marginLeft: 'auto', color: '#27ae60', borderColor: '#27ae60' }}
              onClick={() => handleRestoreGuest(g._key)}>
              ↩ Restore
            </button>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,.07)", maxWidth: 760 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0, background: "#e8f4ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#1565c0" }}>
              {(g.name || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#111" }}>{g.name}</div>
              {g.phone && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>📞 {g.phone}</div>}
              {g.email && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>✉️ {g.email}</div>}
            </div>
            <TypeBadge type="guest" />
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, padding: "20px 0", borderBottom: "1px solid var(--border)" }}>
            {[
              { label: "Orders",     value: g.orderCount },
              { label: "Total Spent", value: `₹${g.totalSpent.toLocaleString("en-IN")}` },
              { label: "Avg Order",  value: `₹${avgSpent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
              { label: "Frequency",  value: `${freq}/mo` },
              g.lastOrder ? { label: "Last Order", value: new Date(g.lastOrder).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) } : null,
            ].filter(Boolean).map(({ label, value }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--red-dark)" }}>{value}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Order History */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--red-dark)", marginBottom: 14 }}>
              Order History
            </div>
            {gOrders.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No orders.</div>
            ) : (
              <ScrollFade className="admin-table-wrap" bg="#fff">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Order ID</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gOrders.map((o, idx) => (
                      <tr key={o.id} style={{ cursor: "pointer" }} className="admin-dealer-row" onClick={() => navigate(`/admin/orders`)}>
                        <td style={{ color: "var(--muted)", fontSize: 12, textAlign: "center" }}>{idx + 1}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 11 }}>{o.id.substring(0, 8)}…</td>
                        <td style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td><span className={`badge ${o.status === 'delivered' ? 'delivered' : o.status === 'pending' ? 'pending' : 'confirmed'}`}>{o.status}</span></td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>₹{Number(o.total).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollFade>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── DEALER / DELETED DETAIL VIEW ────────────────────────────────────────────
  if (selected) {
    const memberSince = new Date(selected.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const regType     = editing ? ev("registration_type") : (selected.registration_type || "Unregistered");
    const d1          = Number(editing ? ev("discount1") : selected.discount1) || 0;
    const d2          = Number(editing ? ev("discount2") : selected.discount2) || 0;
    const territories = currentTerritories();
    const isDeleted   = !!selected.deleted_at;

    const E = (field) => ev(field);
    const S = (field) => selected[field] || "";

    const code = selected.dealer_code || "dealer";
    const mediaItems = [
      { key: "owner_photo",       label: "Owner Photo",          filename: `${code}_owner-photo.jpg`,       accept: "image/*" },
      { key: "staff1_photo",      label: `${selected.staff1_name || "Staff 1"} Photo`, filename: `${code}_staff1-photo.jpg`, accept: "image/*" },
      { key: "staff2_photo",      label: `${selected.staff2_name || "Staff 2"} Photo`, filename: `${code}_staff2-photo.jpg`, accept: "image/*" },
      { key: "shop_inside_photo", label: "Shop Inside",          filename: `${code}_shop-inside.jpg`,       accept: "image/*" },
      { key: "shop_board_photo",  label: "Shop Board",           filename: `${code}_shop-board.jpg`,        accept: "image/*" },
      { key: "shop_video",        label: "Interior Video",       filename: `${code}_interior-video.mp4`,    accept: "video/*" },
    ]
      .filter(m => !!selected[m.key])
      .map(m => ({ ...m, url: selected[m.key] }));

    const openLightbox = (key) => {
      const idx = mediaItems.findIndex(m => m.key === key);
      if (idx !== -1) setLightbox({ items: mediaItems, index: idx });
    };

    return (
      <div className="admin-page">
        {lightbox && (
          <Lightbox
            items={lightbox.items}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onNav={(i) => setLightbox(lb => ({ ...lb, index: i }))}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red-dark)", fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Back to Dealers &amp; Customers
          </button>
          {!editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              {!isDeleted && (
                <button className="btn small" style={{ background: "var(--red-dark)", color: "#fff", border: "none" }}
                  onClick={() => navigate(`/admin/crm/${selected.id}`)}>
                  View Full CRM →
                </button>
              )}
              <button className="btn small outline" onClick={handleDealerExport} title="Export this dealer's data to Excel">
                ⬇️ Export
              </button>
              {!isDeleted && <button className="btn small outline" onClick={startEdit}>Edit</button>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={saving} onClick={handleSave} style={{ minWidth: 90 }}>
                {saving ? "Saving…" : "Save All"}
              </button>
              <button className="btn small outline" onClick={cancelEdit}>Cancel</button>
            </div>
          )}
        </div>

        {isDeleted && (
          <div style={{ background: '#fdecea', border: '1px solid #e74c3c', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: '#7b241c', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700 }}>🗑 Deleted dealer</span>
            <span>· Deleted {new Date(selected.deleted_at).toLocaleDateString('en-IN')}</span>
            <button className="btn small outline" style={{ marginLeft: 'auto', color: '#27ae60', borderColor: '#27ae60' }}
              onClick={() => handleRestore(selected.id)}>
              ↩ Restore
            </button>
            <button className="btn small outline" style={{ color: '#c0392b', borderColor: '#c0392b' }}
              onClick={() => handlePermanentDelete(selected)}>
              🗑 Delete Permanently
            </button>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,.07)", maxWidth: 760 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
              background: "var(--red-light)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 24, fontWeight: 800, color: "var(--red-dark)",
            }}>
              {(selected.shop_name || selected.owner_name || selected.email)?.[0]?.toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#111" }}>
                {selected.shop_name || selected.owner_name || selected.email}
              </div>
              {selected.alias_name && <div style={{ fontSize: 12, color: "var(--muted)" }}>aka {selected.alias_name}</div>}
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {selected.dealer_code || "No Code"} · Member since {memberSince}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <TypeBadge type={isDeleted ? 'deleted' : 'dealer'} />
              {!isDeleted && (
                <span className={`badge ${selected.is_blocked ? "pending" : "delivered"}`}>
                  {selected.is_blocked ? "Blocked" : "Active"}
                </span>
              )}
              {!isDeleted && (() => {
                const appStatus = selected.dealer_application_status || 'pending_details';
                const appStatusColors = {
                  pending_details: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
                  under_review:    { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
                  approved:        { bg: '#dcfce7', color: '#166534', border: '#86efac' },
                  rejected:        { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
                };
                const appStatusLabels = {
                  pending_details: 'Pending',
                  under_review:    'Under Review',
                  approved:        'Approved',
                  rejected:        'Rejected',
                };
                const c = appStatusColors[appStatus] || appStatusColors.pending_details;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>App:</span>
                    <select
                      value={appStatus}
                      onChange={e => handleChangeAppStatus(e.target.value)}
                      style={{
                        background: c.bg, color: c.color, border: `1.5px solid ${c.border}`,
                        borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', outline: 'none', appearance: 'auto',
                      }}
                    >
                      {Object.entries(appStatusLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
            <SectionHead title="Business Information" />

            {editing ? (
              <>
                <EditField label="Shop / Business Name" field="shop_name" value={E("shop_name")} onChange={set} span />
                <EditField label="Alias / Brand Name" field="alias_name" value={E("alias_name")} onChange={set} />
                <EditField label="Owner Name" field="owner_name" value={E("owner_name")} onChange={set} />

                <EditField label="Registration Type" field="registration_type" value={E("registration_type")} onChange={set}>
                  <select value={E("registration_type")} onChange={e => set("registration_type", e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, marginBottom: 0 }}>
                    <option>Registered</option>
                    <option>Unregistered</option>
                    <option>Composite</option>
                  </select>
                </EditField>

                {regType === "Registered" && (
                  <EditField label="GST No." field="gstin" value={E("gstin")} onChange={set} span />
                )}

                <EditField label="Website" field="website" value={E("website")} onChange={set} />
                <EditField label="Staff Assigned" field="staff_assigned" value={E("staff_assigned")} onChange={set} />
                <EditField label="Discount 1 (%)" field="discount1" value={E("discount1")} onChange={set} type="number" />
                <EditField label="Discount 2 (%)" field="discount2" value={E("discount2")} onChange={set} type="number" />
                <EditField label="Credit Limit (Rs.)" field="credit_limit" value={E("credit_limit")} onChange={set} type="number" span />
              </>
            ) : (
              <>
                <ReadField label="Shop / Business Name" value={S("shop_name")} span />
                <ReadField label="Alias / Brand Name" value={S("alias_name")} />
                <ReadField label="Owner Name" value={S("owner_name")} />
                <ReadField label="Registration Type" value={S("registration_type") || "Unregistered"} />
                {(selected.registration_type === "Registered") && (
                  <ReadField label="GST No." value={S("gstin")} span />
                )}
                <ReadField label="Website" value={S("website")} />
                <ReadField label="Staff Assigned" value={S("staff_assigned")} />
                <ReadField label="Discount 1 (%)" value={String(selected.discount1 ?? "—")} />
                <ReadField label="Discount 2 (%)" value={String(selected.discount2 ?? "—")} />
                {(selected.discount1 || selected.discount2) ? (
                  <div style={{ gridColumn: "1 / -1", background: "#f8f4f8", borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "var(--red-dark)", fontWeight: 700 }}>
                    Net Rate = DLP × {((1 - d1 / 100) * (1 - d2 / 100) * 100).toFixed(2)}%
                  </div>
                ) : null}

                <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Credit Limit</div>
                  {editingCreditLimit ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <input
                        type="number"
                        value={creditLimitDraft}
                        onChange={e => setCreditLimitDraft(e.target.value)}
                        placeholder="Enter credit limit"
                        autoFocus
                        style={{ width: 160, marginBottom: 0 }}
                      />
                      <button
                        className="btn small"
                        disabled={savingCreditLimit}
                        onClick={async () => {
                          setSavingCreditLimit(true);
                          const val = creditLimitDraft !== "" ? Number(creditLimitDraft) : null;
                          await supabase.from("profiles").update({ credit_limit: val }).eq("id", selected.id);
                          const updated = { ...selected, credit_limit: val };
                          setSelected(updated);
                          setAllProfiles(prev => prev.map(d => d.id === selected.id ? updated : d));
                          setSavingCreditLimit(false);
                          setEditingCreditLimit(false);
                        }}
                      >
                        {savingCreditLimit ? "…" : "Save"}
                      </button>
                      <button className="btn small outline" onClick={() => setEditingCreditLimit(false)}>Cancel</button>
                    </div>
                  ) : (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                      onMouseEnter={e => e.currentTarget.querySelector(".cl-edit-btn").style.opacity = "1"}
                      onMouseLeave={e => e.currentTarget.querySelector(".cl-edit-btn").style.opacity = "0"}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: selected.credit_limit ? "#111" : "var(--muted)" }}>
                        {selected.credit_limit ? `Rs. ${Number(selected.credit_limit).toLocaleString("en-IN")}` : "Not set"}
                      </div>
                      <button
                        className="cl-edit-btn"
                        onClick={() => { setCreditLimitDraft(selected.credit_limit ?? ""); setEditingCreditLimit(true); }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, opacity: 0, transition: "opacity .15s", padding: "0 2px", lineHeight: 1 }}
                        title="Edit credit limit"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                  {selected.credit_limit && creditUsed !== null && (() => {
                    const limit = Number(selected.credit_limit);
                    const used  = creditUsed;
                    const pct   = Math.min((used / limit) * 100, 100);
                    const over  = used > limit;
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, color: over ? "#c0392b" : "#555" }}>
                          <span>Used: <strong>Rs. {used.toLocaleString("en-IN")}</strong> of Rs. {limit.toLocaleString("en-IN")}</span>
                          <span style={{ fontWeight: 700, color: over ? "#c0392b" : pct > 75 ? "#e67e22" : "#27ae60" }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "#e8e8e8", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: over ? "#c0392b" : pct > 75 ? "#e67e22" : "#27ae60", transition: "width .4s ease" }} />
                        </div>
                        {over && <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 700, marginTop: 4 }}>⚠️ Over credit limit by Rs. {(used - limit).toLocaleString("en-IN")}</div>}
                      </div>
                    );
                  })()}
                  {selected.credit_limit && creditUsed === null && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Loading utilization…</div>
                  )}
                </div>
              </>
            )}

            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Territories</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8, minHeight: 28 }}>
                {territories.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>No territories added.</span>}
                {territories.map((t, i) => (
                  <span key={i} style={{ background: "var(--red-light)", color: "var(--red-dark)", borderRadius: 20, padding: "4px 11px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    {t}
                    <span onClick={() => removeTerritory(i)} style={{ cursor: "pointer", opacity: 0.6, fontWeight: 800, lineHeight: 1 }}>✕</span>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newTerritory}
                  onChange={e => setNewTerritory(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTerritory()}
                  placeholder="Type territory name and press Add…"
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button className="btn small" onClick={addTerritory}>+ Add</button>
              </div>
            </div>

            <SectionHead title="Contact Information" />

            {editing ? (
              <>
                <EditField label="Email" field="email" value={selected.email} onChange={() => {}} readOnly span />
                <EditField label="Phone 1" field="phone" value={E("phone")} onChange={set} type="tel" />
                <EditField label="Phone 2" field="phone2" value={E("phone2")} onChange={set} type="tel" />
              </>
            ) : (
              <>
                <ReadField label="Email" value={selected.email} span />
                <ReadField label="Phone 1" value={S("phone")} />
                <ReadField label="Phone 2" value={S("phone2")} />
              </>
            )}

            <SectionHead title="Addresses & Location" />

            {editing ? (
              <>
                <EditField label="Billing / Registered Address" field="address" value={E("address")} onChange={set} textarea span />
                <EditField label="Shop Address" field="shop_address" value={E("shop_address")} onChange={set} textarea span />
                <EditField label="Godown / Warehouse Address" field="godown_address" value={E("godown_address")} onChange={set} textarea span />
              </>
            ) : (
              <>
                <ReadField label="Billing / Registered Address" value={S("address")} span />
                <ReadField label="Shop Address" value={S("shop_address")} span />
                <ReadField label="Godown / Warehouse Address" value={S("godown_address")} span />
              </>
            )}

            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>GPS Location</div>
              {selected.latitude ? (
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 6 }}>
                  📍 {Number(selected.latitude).toFixed(5)}, {Number(selected.longitude).toFixed(5)}{" "}
                  <a href={`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "var(--red-dark)", fontWeight: 700 }}>
                    View on Maps →
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>No location saved yet.</div>
              )}
              <button className="btn small outline" onClick={fetchLocation}>📡 Fetch My Location</button>
            </div>
          </div>

          <div style={{ borderTop: "2px solid var(--red-light)", paddingTop: 6, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--red-dark)", marginBottom: 18, marginTop: 12 }}>
              Photos &amp; Media
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Staff Members</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <MediaTile label="Staff 1 Photo" url={selected.staff1_photo} uploading={uploading.staff1_photo} onPick={f => handleMediaUpload("staff1_photo", f)} editing={true} onView={() => openLightbox("staff1_photo")} />
                  {editing
                    ? <input value={E("staff1_name")} onChange={e => set("staff1_name", e.target.value)} placeholder="Staff 1 Name" style={{ width: 96, fontSize: 11, textAlign: "center", marginBottom: 0, padding: "4px 6px" }} />
                    : <div style={{ fontSize: 11, color: "#333", fontWeight: 600, textAlign: "center" }}>{selected.staff1_name || "Staff 1"}</div>
                  }
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <MediaTile label="Staff 2 Photo" url={selected.staff2_photo} uploading={uploading.staff2_photo} onPick={f => handleMediaUpload("staff2_photo", f)} editing={true} onView={() => openLightbox("staff2_photo")} />
                  {editing
                    ? <input value={E("staff2_name")} onChange={e => set("staff2_name", e.target.value)} placeholder="Staff 2 Name" style={{ width: 96, fontSize: 11, textAlign: "center", marginBottom: 0, padding: "4px 6px" }} />
                    : <div style={{ fontSize: 11, color: "#333", fontWeight: 600, textAlign: "center" }}>{selected.staff2_name || "Staff 2"}</div>
                  }
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Shop &amp; Owner</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <MediaTile label="Owner Photo"          url={selected.owner_photo}       uploading={uploading.owner_photo}       onPick={f => handleMediaUpload("owner_photo", f)}       editing={true} onView={() => openLightbox("owner_photo")} />
              <MediaTile label="Shop Inside"          url={selected.shop_inside_photo} uploading={uploading.shop_inside_photo} onPick={f => handleMediaUpload("shop_inside_photo", f)} editing={true} onView={() => openLightbox("shop_inside_photo")} />
              <MediaTile label="Shop Board"           url={selected.shop_board_photo}  uploading={uploading.shop_board_photo}  onPick={f => handleMediaUpload("shop_board_photo", f)}  editing={true} onView={() => openLightbox("shop_board_photo")} />
              <MediaTile label="Interior Video (30s)" url={selected.shop_video}        uploading={uploading.shop_video}        onPick={f => handleMediaUpload("shop_video", f)}         editing={true} accept="video/mp4,video/quicktime,video/*" onView={() => openLightbox("shop_video")} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Click any tile to upload or replace. Videos: mp4 / mov, max 30 seconds.</div>
          </div>

          <div style={{ borderTop: "2px solid var(--red-light)", paddingTop: 6, marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--red-dark)", marginBottom: 4, marginTop: 12 }}>
              🗺️ Google Business Listing
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginTop: 8 }}>
              {editing ? (
                <>
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Google Business Name</div>
                    <input value={ev("google_business_name")} onChange={e => set("google_business_name", e.target.value)} placeholder="Name as it appears on Google Maps" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                      Google Maps URL
                      {ev("google_maps_url") && <a href={ev("google_maps_url")} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: "var(--red-dark)", fontWeight: 700, textTransform: "none" }}>Open in Maps 🔗</a>}
                    </div>
                    <input value={ev("google_maps_url")} onChange={e => set("google_maps_url", e.target.value)} placeholder="Paste full Google Maps listing URL here…" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>💡 Tip: Search dealer name on Google Maps and paste the share link here</div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Rating (1–5)</div>
                    <input type="number" min="1" max="5" step="0.1" value={ev("google_rating")} onChange={e => set("google_rating", e.target.value)} placeholder="e.g. 4.3" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Total Reviews</div>
                    <input type="number" min="0" value={ev("google_reviews_count")} onChange={e => set("google_reviews_count", e.target.value)} placeholder="e.g. 42" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Listing Status</div>
                    <select value={ev("google_listing_status")} onChange={e => set("google_listing_status", e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, marginBottom: 0 }}>
                      <option>Active</option>
                      <option>Unclaimed</option>
                      <option>Suspended</option>
                      <option>Not Listed</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
                    <input type="checkbox" id="gl_claimed" checked={!!edits.google_listing_claimed} onChange={e => set("google_listing_claimed", e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--red-dark)", cursor: "pointer" }} />
                    <label htmlFor="gl_claimed" style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", userSelect: "none" }}>Listing Claimed</label>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Google Business Name</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: selected.google_business_name ? "#111" : "var(--muted)" }}>{selected.google_business_name || "—"}</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Google Maps URL</div>
                    {selected.google_maps_url
                      ? <a href={selected.google_maps_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--red-dark)", fontWeight: 600, wordBreak: "break-all" }}>Open Listing in Maps 🔗</a>
                      : <div style={{ fontSize: 14, color: "var(--muted)" }}>—</div>
                    }
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Rating</div>
                    {selected.google_rating != null
                      ? <div style={{ fontSize: 15, fontWeight: 700, color: "#e67e22" }}>
                          {"★".repeat(Math.round(Number(selected.google_rating)))}{"☆".repeat(5 - Math.round(Number(selected.google_rating)))}
                          {" "}<span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>{Number(selected.google_rating).toFixed(1)}</span>
                        </div>
                      : <div style={{ fontSize: 14, color: "var(--muted)" }}>—</div>
                    }
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Total Reviews</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: selected.google_reviews_count != null ? "#111" : "var(--muted)" }}>
                      {selected.google_reviews_count != null ? `${selected.google_reviews_count} reviews` : "—"}
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Listing Status</div>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                      background: selected.google_listing_status === "Active" ? "#e8f8f0" : selected.google_listing_status === "Suspended" ? "#fdecea" : "#f5f5f5",
                      color: selected.google_listing_status === "Active" ? "#27ae60" : selected.google_listing_status === "Suspended" ? "#c0392b" : "#777",
                    }}>
                      {selected.google_listing_status || "Not Listed"}
                    </span>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Listing Claimed</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: selected.google_listing_claimed ? "#27ae60" : "#c0392b" }}>
                      {selected.google_listing_claimed ? "✓ Yes, claimed" : "✗ Not claimed"}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {!isDeleted && (
            <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                className="btn small outline"
                style={{ color: selected.is_blocked ? "#27ae60" : "#c0392b", borderColor: selected.is_blocked ? "#27ae60" : "#c0392b" }}
                disabled={saving} onClick={handleToggleBlock}
              >
                {saving ? "…" : selected.is_blocked ? "✓ Unblock Dealer" : "⊘ Block Dealer"}
              </button>
              <span style={{ fontSize: 12, color: "var(--muted)", flex: 1 }}>
                {selected.is_blocked ? "This dealer is currently blocked from placing orders." : "Dealer can place orders normally."}
              </span>
              <button
                className="btn small outline"
                style={{ color: '#c0392b', borderColor: '#c0392b' }}
                onClick={() => setDeleteConfirm({ dealer: selected })}
              >
                🗑 Move to Bin
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── MASTER LIST ─────────────────────────────────────────────────────────────
  const dealerCount   = allProfiles.filter(p => !p.deleted_at && p.is_dealer === true).length;
  const customerCount = allProfiles.filter(p => !p.deleted_at && p.is_dealer === false).length;
  const deletedCount  = allProfiles.filter(p =>  p.deleted_at).length + guestRows.filter(g => g._isDeletedGuest).length;
  const guestCount    = guestRows.filter(g => !g._isDeletedGuest).length;

  // DEBUG — remove after confirming dropdown renders correctly
  console.log('[AdminDealers] counts', { dealerCount, customerCount, guestCount, deletedCount, allProfilesLen: allProfiles.length });
  console.log('[AdminDealers] dropdown options', ['all','dealer','customer','guest','deleted']);

  return (
    <div className="admin-page">
      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, maxWidth: 420, width: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Move to Recycle Bin?</div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 24, lineHeight: 1.5 }}>
              <strong>
                {deleteConfirm.guest
                  ? (deleteConfirm.guest._name || deleteConfirm.guest._email || deleteConfirm.guest._key)
                  : (deleteConfirm.dealer.shop_name || deleteConfirm.dealer.email)}
              </strong> will be moved to the Recycle Bin. Orders are not affected.
              {!deleteConfirm.guest && ' You can restore within 1 year.'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn small outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn small" style={{ background: '#c0392b', border: 'none', color: '#fff' }}
                disabled={!!deletingId}
                onClick={deleteConfirm.guest ? handleSoftDeleteGuest : handleSoftDelete}>
                {deletingId ? 'Moving…' : 'Move to Bin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Title + Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 className="admin-title" style={{ margin: 0 }}>Dealers &amp; Customers</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {exportStatus && (
            <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>{exportStatus}</span>
          )}
          <input
            type="text"
            placeholder="Search name, phone, email…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: 220, marginBottom: 0, fontSize: 13 }}
          />
          <button
            className="btn small outline"
            onClick={() => setTypeFilter(f => f === 'deleted' ? 'all' : 'deleted')}
            style={{
              display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: 700,
              ...(typeFilter === 'deleted'
                ? { background: "var(--red-dark)", color: "#fff", borderColor: "var(--red-dark)" }
                : { borderColor: "var(--muted)", color: "var(--muted)" }),
            }}
          >
            🗑 Deleted{deletedCount > 0 ? ` (${deletedCount})` : ''}
          </button>
          <button
            className="btn small outline"
            onClick={handleExport}
            disabled={exporting || loading}
            style={{ display: "flex", alignItems: "center", gap: 6, borderColor: "var(--red-dark)", color: "var(--red-dark)", fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {exporting ? "⏳ Exporting…" : "⬇️ Export All Data"}
          </button>
        </div>
      </div>

      {/* Restore Requests banner */}
      {restoreRequests.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#92400e', marginBottom: 14 }}>
            📬 Restore Requests ({restoreRequests.length} pending)
          </div>
          {restoreRequests.map(req => (
            <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #fde68a' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {req.profiles?.shop_name || req.profiles?.owner_name || req.profiles?.email || '—'}
                </div>
                <div style={{ fontSize: 11, color: '#92400e' }}>
                  Contact: {req.contact_value} · {new Date(req.requested_at).toLocaleDateString('en-IN')}
                </div>
              </div>
              <button className="btn small" style={{ background: '#27ae60', border: 'none', color: '#fff' }}
                onClick={() => handleApproveRestore(req)}>✓ Approve &amp; Restore</button>
              <button className="btn small outline" style={{ color: '#c0392b', borderColor: '#c0392b' }}
                onClick={() => handleRejectRestore(req)}>Reject</button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Loading…</div>
      ) : unifiedRows.length === 0 ? (
        <div className="admin-empty">
          {searchQuery || typeFilter !== 'all' ? 'No results match your filter.' : 'No dealers or customers yet.'}
        </div>
      ) : (
        <ScrollFade className="admin-table-wrap" bg="#fff">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 90 }} ref={typeDropdownRef}>
                  <button
                    ref={typeDropdownBtnRef}
                    onClick={() => {
                      if (typeDropdownBtnRef.current) {
                        const r = typeDropdownBtnRef.current.getBoundingClientRect();
                        setTypeDropdownPos({ top: r.bottom + 6, left: r.left });
                      }
                      setTypeDropdownOpen(o => !o);
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px',
                      color: typeFilter !== 'all' ? 'var(--red-dark)' : 'inherit',
                      display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                    }}
                    title="Filter by type"
                  >
                    {typeFilter === 'all'      ? 'Type'
                     : typeFilter === 'dealer'   ? 'Type: Dealers'
                     : typeFilter === 'customer' ? 'Type: Customers'
                     : typeFilter === 'guest'    ? 'Type: Guests'
                     : 'Type: Deleted'}
                    {' '}▾
                  </button>
                </th>
                <th>Name</th>
                <th>App Status</th>
                <th>Phone</th>
                <th>Email</th>
                <th style={{ textAlign: 'right' }}>Orders</th>
                <th style={{ textAlign: 'right' }}>Spent</th>
                <th>Last Order</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {unifiedRows.map((row, idx) => (
                <tr
                  key={row._type === 'guest' ? `guest-${row._key}` : row.id}
                  onClick={() => {
                    if (row._type === 'guest') setSelectedGuest(row);
                    else if (row._type === 'customer') navigate(`/admin/crm/customer/${row.id}`);
                    else openDealer(row);
                  }}
                  style={{ cursor: 'pointer' }}
                  className="admin-dealer-row"
                >
                  <td style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>{idx + 1}</td>
                  <td><TypeBadge type={row._type} /></td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{row._name}</div>
                    {row._type !== 'guest' && row.dealer_code && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{row.dealer_code}</div>
                    )}
                  </td>
                  <td>
                    {row._type === 'dealer' ? (() => {
                      const s = row.dealer_application_status || 'pending_details';
                      const appColors = { pending_details: { bg: '#fef3c7', color: '#92400e' }, under_review: { bg: '#dbeafe', color: '#1e40af' }, approved: { bg: '#dcfce7', color: '#166534' }, rejected: { bg: '#fee2e2', color: '#991b1b' } };
                      const appLabels = { pending_details: 'Pending', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected' };
                      const c = appColors[s] || appColors.pending_details;
                      return <span style={{ background: c.bg, color: c.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{appLabels[s] || s}</span>;
                    })() : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{row._phone || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row._email || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{row._orderCount || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {row._totalSpent ? `₹${Number(row._totalSpent).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {row._lastOrder ? new Date(row._lastOrder).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <button
                      title="Move to Recycle Bin"
                      onClick={e => {
                        e.stopPropagation();
                        if (row._type === 'guest') setDeleteConfirm({ guest: row });
                        else if (row._type === 'dealer') setDeleteConfirm({ dealer: row });
                      }}
                      style={{ background: 'none', border: 'none', cursor: (row._type === 'deleted' || row._type === 'customer') ? 'default' : 'pointer', color: (row._type === 'deleted' || row._type === 'customer') ? '#ccc' : '#c0392b', fontSize: 15, padding: '2px 6px', borderRadius: 6 }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollFade>
      )}

      {/* Type-filter dropdown rendered via portal so it's never clipped by overflow:auto ancestors */}
      {typeDropdownOpen && createPortal(
        <div
          ref={typeDropdownPortalRef}
          style={{
            position: 'fixed', top: typeDropdownPos.top, left: typeDropdownPos.left,
            zIndex: 9999, background: '#fff', border: '1.5px solid var(--border)',
            borderRadius: 10, boxShadow: '0 4px 18px rgba(0,0,0,.12)', minWidth: 170,
          }}
        >
          {[
            { value: 'all',      label: 'All Types',  count: dealerCount + customerCount + guestCount + deletedCount },
            { value: 'dealer',   label: 'Dealers',    count: dealerCount   },
            { value: 'customer', label: 'Customers',  count: customerCount },
            { value: 'guest',    label: 'Guests',     count: guestCount    },
            { value: 'deleted',  label: 'Deleted',    count: deletedCount  },
          ].map(opt => (
            <div
              key={opt.value}
              onClick={() => { setTypeFilter(opt.value); setTypeDropdownOpen(false); }}
              style={{
                padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: typeFilter === opt.value ? 'var(--red-light)' : '#fff',
                color: typeFilter === opt.value ? 'var(--red-dark)' : '#111',
                borderRadius: opt.value === 'all' ? '10px 10px 0 0' : opt.value === 'deleted' ? '0 0 10px 10px' : 0,
              }}
              onMouseEnter={e => { if (typeFilter !== opt.value) e.currentTarget.style.background = '#f9f9f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = typeFilter === opt.value ? 'var(--red-light)' : '#fff'; }}
            >
              <span>{opt.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, marginLeft: 8 }}>{opt.count}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
