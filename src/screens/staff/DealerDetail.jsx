import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { getCurrentPosition, getVideoDuration, uploadVisitMedia } from "../../utils/visitMedia";
import { CameraPhotoSlot, CameraVideoSlot } from "../../components/staff/CameraCapture";
import LocationPermissionBanner from "../../components/staff/LocationPermissionBanner";
import { isDebitEntry, computeAgeingBuckets } from "../../lib/ledgerUtils";
import { fmtCurrency, exportRowsToExcel, exportLedgerStatementPdf, exportFilename, periodToRange } from "../../lib/dealerCrmUtils";
import DealerLedgerTab from "../../components/staff/DealerLedgerTab";
import DealerInsightsTab from "../../components/staff/DealerInsightsTab";

// Dealer CRM screen for Sales staff — reached by tapping a dealer in
// "My Dealers / Parties" on the Sales dashboard. Rebuilt (approved from
// mockup/dealer-crm-mockup.html) into 5 tabs:
//   Overview  — credit/outstanding, this-quarter stats, top products, dues
//   Ledger    — full voucher history with running balance (DealerLedgerTab)
//   Orders    — order history with line-item expand
//   Visits    — the original check-in/check-out workflow, unchanged, just
//               moved under its own tab so Overview has room to breathe
//   Insights  — 9 reports + a per-dealer AI assistant (DealerInsightsTab)
//
// Every RPC here (get_dealer_detail, get_dealer_orders, get_dealer_visits,
// get_my_open_visit, start_dealer_visit, complete_dealer_visit, and the new
// get_dealer_report/get_dealer_ledger/get_order_items_for_staff) re-checks
// that this dealer is within the caller's own scope server-side — a rep
// can't view or check in against another rep's dealer just by knowing/
// guessing its id.

const CARD_STYLE = {
  background: "#fff",
  border: "1.5px solid #7B2D8B",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const TABS = [
  { key: "overview", label: "📊 Overview" },
  { key: "ledger", label: "📒 Ledger" },
  { key: "orders", label: "🧾 Orders" },
  { key: "visits", label: "📍 Visits" },
  { key: "insights", label: "📈 Insights" },
];

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ status }) {
  const label = (status || "unknown").replace(/_/g, " ");
  const colors = {
    delivered: { bg: "#e6f7ec", fg: "#2fa84f" },
    dispatched: { bg: "#e6f0fb", fg: "#3564c9" },
    out_for_delivery: { bg: "#e6f0fb", fg: "#3564c9" },
    confirmed: { bg: "#fff4e0", fg: "#c98400" },
    pending: { bg: "#f3f3f3", fg: "#888" },
    cancelled: { bg: "#fdeaea", fg: "#d64545" },
  };
  const c = colors[status] || { bg: "#f3f3f3", fg: "#888" };
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, textTransform: "capitalize",
      background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export default function DealerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState("overview");

  const [dealer, setDealer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Overview tab extras — this quarter's stats, top 3 products, ageing.
  const [orderStats, setOrderStats] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [ageingRows, setAgeingRows] = useState([]);

  // Whichever dealer (anywhere) the rep currently has an open check-in at.
  const [openVisit, setOpenVisit] = useState(null);
  const [openVisitLoading, setOpenVisitLoading] = useState(true);

  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState(null);

  // Whether the rep has started their day (bike/vehicle meter-reading
  // photo) yet today — required before checking in at any shop.
  const [dayStart, setDayStart] = useState(null);
  const [loadingDayStart, setLoadingDayStart] = useState(true);

  const [boardFile, setBoardFile] = useState(null);
  const [shopFile, setShopFile] = useState(null);
  const [cardFile, setCardFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkOutStatus, setCheckOutStatus] = useState(null);

  const loadVisits = () => {
    supabase.rpc("get_dealer_visits", { p_dealer_id: id, p_limit: 10 }).then(({ data, error }) => {
      if (!error) setVisits(data || []);
    });
  };

  const loadOpenVisit = () => {
    setOpenVisitLoading(true);
    supabase.rpc("get_my_open_visit").then(({ data, error }) => {
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        setOpenVisit(row || null);
      }
      setOpenVisitLoading(false);
    });
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !id) { setLoading(false); setOpenVisitLoading(false); return; }
    let cancelled = false;
    const quarter = periodToRange("this_quarter");
    Promise.all([
      supabase.rpc("get_dealer_detail", { p_dealer_id: id }),
      supabase.rpc("get_dealer_orders", { p_dealer_id: id, p_limit: 20 }),
      supabase.rpc("get_dealer_visits", { p_dealer_id: id, p_limit: 10 }),
      supabase.rpc("get_my_open_visit"),
      supabase.rpc("get_my_day_start"),
      supabase.rpc("get_dealer_report", { p_dealer_id: id, p_report: "order_stats", p_from: quarter.from, p_to: quarter.to }),
      supabase.rpc("get_dealer_report", { p_dealer_id: id, p_report: "top_products", p_from: quarter.from, p_to: quarter.to }),
      supabase.rpc("get_dealer_report", { p_dealer_id: id, p_report: "ageing", p_from: null, p_to: quarter.to }),
    ]).then(([detailRes, ordersRes, visitsRes, openRes, dayStartRes, statsRes, productsRes, ageingRes]) => {
      if (cancelled) return;
      if (detailRes.error) {
        setError(detailRes.error.message);
      } else {
        const row = Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data;
        if (!row) {
          setError("This dealer isn't in your assigned list.");
        } else {
          setDealer(row);
        }
      }
      if (!ordersRes.error) setOrders(ordersRes.data || []);
      if (!visitsRes.error) setVisits(visitsRes.data || []);
      if (!openRes.error) {
        const row = Array.isArray(openRes.data) ? openRes.data[0] : openRes.data;
        setOpenVisit(row || null);
      }
      if (!dayStartRes.error) {
        const row = Array.isArray(dayStartRes.data) ? dayStartRes.data[0] : dayStartRes.data;
        setDayStart(row || null);
      }
      if (!statsRes.error) setOrderStats(statsRes.data || null);
      if (!productsRes.error) setTopProducts((productsRes.data || []).slice(0, 3));
      if (!ageingRes.error) setAgeingRows(ageingRes.data || []);
      setLoading(false);
      setOpenVisitLoading(false);
      setLoadingDayStart(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const isCheckedInHere = openVisit && openVisit.dealer_id === id;
  const isCheckedInElsewhere = openVisit && openVisit.dealer_id !== id;

  const handleCheckIn = async () => {
    setCheckInStatus(null);
    setCheckingIn(true);
    try {
      const pos = await getCurrentPosition();
      const { data, error } = await supabase.rpc("start_dealer_visit", {
        p_dealer_id: id,
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setCheckInStatus({ type: "error", message: error?.message || result?.message || "Couldn't check in." });
      } else {
        setCheckInStatus(null);
        loadOpenVisit();
        loadVisits();
      }
    } catch (err) {
      setCheckInStatus({ type: "error", message: err.message || "Couldn't check in." });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckOutStatus(null);
    if (!boardFile || !shopFile || !cardFile || !videoFile) {
      setCheckOutStatus({ type: "error", message: "Board photo, shop photo, card photo, and a short video are all required to check out." });
      return;
    }
    setCheckingOut(true);
    try {
      const pos = await getCurrentPosition();

      // Soft, non-blocking duration check — recording auto-stops at 5s via
      // CameraVideoSlot, this just catches anything unexpectedly long.
      const duration = await getVideoDuration(videoFile);
      if (duration != null && duration > 8) {
        setCheckOutStatus({ type: "error", message: `That video is ${Math.round(duration)}s — please re-record it.` });
        setCheckingOut(false);
        return;
      }

      // Each file is already geo-tagged — CameraPhotoSlot burns the tag in
      // at capture time — so this just uploads them straight through.
      const [boardUrl, shopUrl, cardUrl, videoUrl] = await Promise.all([
        uploadVisitMedia(boardFile, { folder: id, kind: "board" }),
        uploadVisitMedia(shopFile, { folder: id, kind: "shop" }),
        uploadVisitMedia(cardFile, { folder: id, kind: "card" }),
        uploadVisitMedia(videoFile, { folder: id, kind: "video" }),
      ]);

      const { data, error } = await supabase.rpc("complete_dealer_visit", {
        p_visit_id: openVisit.visit_id,
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
        p_board_photo_url: boardUrl,
        p_shop_photo_url: shopUrl,
        p_card_photo_url: cardUrl,
        p_video_url: videoUrl,
        p_notes: checkoutNotes,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setCheckOutStatus({ type: "error", message: error?.message || result?.message || "Couldn't check out." });
      } else {
        setCheckOutStatus(null);
        setBoardFile(null); setShopFile(null); setCardFile(null); setVideoFile(null); setCheckoutNotes("");
        loadOpenVisit();
        loadVisits();
      }
    } catch (err) {
      setCheckOutStatus({ type: "error", message: err.message || "Couldn't check out." });
    } finally {
      setCheckingOut(false);
    }
  };

  const handleExportStatement = async (format) => {
    const { data } = await supabase.rpc("get_dealer_ledger", { p_dealer_id: id, p_from: null, p_to: null });
    const ledgerRows = data || [];

    if (format === "excel") {
      const rows = ledgerRows.map((r) => ({
        Date: formatDate(r.voucher_date || r.created_at),
        Particulars: r.type === "order" ? "Sales" : r.type === "payment" ? "Payment" : r.type === "credit_note" ? "Credit Note" : "Journal",
        "Voucher No": r.voucher_no || "",
        Debit: isDebitEntry(r) ? Number(r.amount) : "",
        Credit: !isDebitEntry(r) ? Number(r.amount) : "",
      }));
      exportRowsToExcel({ filename: exportFilename(dealer?.dealer_code, "Statement", "xlsx"), sheetName: "Statement", rows });
      return;
    }

    // All-time statement, so opening balance is always 0 — the running
    // balance is built forward the same way DealerLedgerTab does.
    let running = 0;
    const withBalance = ledgerRows.map((r) => {
      const debit = isDebitEntry(r);
      running = debit ? running + Number(r.amount || 0) : running - Number(r.amount || 0);
      return { ...r, _debit: debit, _after: running };
    });

    exportLedgerStatementPdf({
      dealer,
      dealerCode: dealer?.dealer_code,
      fromLabel: "the beginning",
      toLabel: "today",
      openingBalance: 0,
      closingBalance: running,
      rows: withBalance,
      filename: exportFilename(dealer?.dealer_code, "Statement", "pdf"),
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", color: "#999" }}>
        Loading…
      </div>
    );
  }

  if (error || !dealer) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div style={{ padding: "18px 24px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#7B2D8B", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ← Back
          </button>
        </div>
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#999", fontSize: 13.5 }}>
          {error || "Dealer not found."}
        </div>
      </div>
    );
  }

  const territories = Array.isArray(dealer.territory) ? dealer.territory : [];
  const creditLimit = Number(dealer.credit_limit || 0);
  const outstanding = Number(dealer.outstanding || 0);
  const usedPct = creditLimit > 0 ? Math.min(100, Math.round((outstanding / creditLimit) * 100)) : null;
  const netRate = (dealer.discount1 || dealer.discount2)
    ? ((1 - (dealer.discount1 || 0) / 100) * (1 - (dealer.discount2 || 0) / 100) * 100).toFixed(2)
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 18px 0", color: "#fff" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
            border: "2px solid rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>
            {initials(dealer.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dealer.name}</div>
            <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 1 }}>{dealer.dealer_code || "—"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
            {dealer.phone && <a href={`tel:${dealer.phone}`} style={ICON_BTN}>📞</a>}
            {dealer.email && <a href={`mailto:${dealer.email}`} style={ICON_BTN}>✉️</a>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 16, background: "rgba(255,255,255,0.14)", borderRadius: 12, padding: 4, overflowX: "auto" }}>
          {TABS.map((t) => (
            <div
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: 9, fontSize: 11.5, fontWeight: 800,
                cursor: "pointer", whiteSpace: "nowrap",
                background: tab === t.key ? "#fff" : "transparent",
                color: tab === t.key ? "#7B2D8B" : "#fff",
                opacity: tab === t.key ? 1 : 0.75,
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
        <div style={{ height: 16 }} />
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 20px 60px" }}>
        {tab === "overview" && (
          <OverviewTab
            dealer={dealer} outstanding={outstanding} creditLimit={creditLimit} usedPct={usedPct} netRate={netRate}
            territories={territories} orderStats={orderStats} topProducts={topProducts} ageingRows={ageingRows}
            onExportStatement={handleExportStatement}
          />
        )}

        {tab === "ledger" && <DealerLedgerTab dealerId={id} dealerCode={dealer.dealer_code} dealer={dealer} />}

        {tab === "orders" && <OrdersTab orders={orders} dealerCode={dealer.dealer_code} />}

        {tab === "visits" && (
          <VisitsTab
            openVisitLoading={openVisitLoading} isCheckedInElsewhere={isCheckedInElsewhere} isCheckedInHere={isCheckedInHere}
            openVisit={openVisit} navigate={navigate} boardFile={boardFile} setBoardFile={setBoardFile}
            shopFile={shopFile} setShopFile={setShopFile} cardFile={cardFile} setCardFile={setCardFile}
            videoFile={videoFile} setVideoFile={setVideoFile} checkoutNotes={checkoutNotes} setCheckoutNotes={setCheckoutNotes}
            checkingOut={checkingOut} handleCheckOut={handleCheckOut} checkOutStatus={checkOutStatus}
            loadingDayStart={loadingDayStart} dayStart={dayStart} checkingIn={checkingIn} handleCheckIn={handleCheckIn}
            checkInStatus={checkInStatus} visits={visits} formatTime={formatTime} formatDateTime={formatDateTime}
          />
        )}

        {tab === "insights" && <DealerInsightsTab dealerId={id} dealerCode={dealer.dealer_code} dealer={dealer} orders={orders} visits={visits} />}
      </div>
    </div>
  );
}

const ICON_BTN = { width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, textDecoration: "none" };

// ── Overview tab ─────────────────────────────────────────────────────────

function OverviewTab({ dealer, outstanding, creditLimit, usedPct, netRate, territories, orderStats, topProducts, ageingRows, onExportStatement }) {
  const health = ageingHealth(ageingRows);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => onExportStatement("pdf")} style={STMT_BTN}>📄 Statement PDF</button>
        <button onClick={() => onExportStatement("excel")} style={STMT_BTN}>📊 Statement Excel</button>
      </div>

      <div style={CARD_STYLE}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          <span>Outstanding</span>
          <span style={{ color: outstanding > 0 ? "#d64545" : "#2fa84f" }}>{fmtCurrency(outstanding)}</span>
        </div>
        {creditLimit > 0 && (
          <>
            <div style={{ height: 8, background: "#f0eaf2", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${usedPct}%`, background: usedPct >= 90 ? "#d64545" : "linear-gradient(90deg, #7B2D8B, #c65fd3)", borderRadius: 999 }} />
            </div>
            <div style={{ fontSize: 11.5, color: "#999", marginTop: 6 }}>
              {usedPct}% of {fmtCurrency(creditLimit)} credit limit used
            </div>
          </>
        )}
        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "#999" }}>Payment health</span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: health.bg, color: health.fg }}>{health.label}</span>
        </div>
        {netRate && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#7B2D8B", fontWeight: 700, background: "#f8f4f8", borderRadius: 8, padding: "8px 12px" }}>
            Net Rate = DLP × {netRate}% (Disc. {dealer.discount1 || 0}% + {dealer.discount2 || 0}%)
          </div>
        )}
      </div>

      {orderStats && (
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>This Quarter</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatBox label="Last order value" value={orderStats.last_order_value != null ? fmtCurrency(orderStats.last_order_value) : "—"} />
            <StatBox label="Orders pending" value={orderStats.orders_pending} />
            <StatBox label="Total orders (lifetime)" value={orderStats.total_orders_lifetime} />
            <StatBox label="Avg order value" value={fmtCurrency(orderStats.avg_order_value)} />
          </div>
        </div>
      )}

      {topProducts.length > 0 && (
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Top Products Ordered</div>
          {topProducts.map((p, i) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < topProducts.length - 1 ? "1px solid #f2e6f4" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: "#f3e6f6", color: "#7B2D8B", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 8, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10.5, color: "#999" }}>{p.qty} pcs across {p.orders_count} orders</div>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#7B2D8B", flexShrink: 0 }}>{fmtCurrency(p.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {health.dues && (
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Dues</div>
          <DueRow label="Oldest unpaid invoice" value={health.dues.voucherNo || "—"} />
          <DueRow label="Days overdue" value={health.dues.daysOverdue > 0 ? `${health.dues.daysOverdue} days` : "Not overdue"} strong={health.dues.daysOverdue > 30} />
        </div>
      )}

      <div style={CARD_STYLE}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Contact</div>
        {dealer.phone && (
          <a href={`tel:${dealer.phone}`} style={{ display: "block", fontSize: 13.5, color: "#222", textDecoration: "none", marginBottom: 6 }}>
            📞 {dealer.phone}{dealer.phone2 ? ` / ${dealer.phone2}` : ""}
          </a>
        )}
        {dealer.email && (
          <a href={`mailto:${dealer.email}`} style={{ display: "block", fontSize: 13.5, color: "#222", textDecoration: "none", marginBottom: 6 }}>
            ✉️ {dealer.email}
          </a>
        )}
        {dealer.address && (
          <div style={{ fontSize: 13.5, color: "#666", lineHeight: 1.5 }}>📍 {dealer.address}</div>
        )}
        {dealer.gstin && (
          <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>GSTIN: {dealer.gstin}</div>
        )}
        {territories.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {territories.map((t) => (
              <span key={t} style={{ fontSize: 11, fontWeight: 700, color: "#7B2D8B", background: "#f3e6f6", borderRadius: 999, padding: "3px 10px" }}>{t}</span>
            ))}
          </div>
        )}
        {!dealer.phone && !dealer.email && !dealer.address && (
          <div style={{ fontSize: 12.5, color: "#aaa" }}>No contact details on file yet.</div>
        )}
      </div>
    </div>
  );
}

const STMT_BTN = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", borderRadius: 9, border: "1.5px solid #7B2D8B", background: "#fff", color: "#7B2D8B", fontSize: 11.5, fontWeight: 800, cursor: "pointer" };

function StatBox({ label, value }) {
  return (
    <div style={{ background: "#faf5fb", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#222" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "#888", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DueRow({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 12, color: "#888" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: strong ? "#d64545" : "#333" }}>{value}</span>
    </div>
  );
}

// Real payment-health signal computed from actual ageing — deliberately not
// a fabricated "credit rating" (no such data exists; see ageing bucket calc
// in ledgerUtils.js). Good/Watch/Overdue purely from days-overdue.
function ageingHealth(rows) {
  const b = computeAgeingBuckets(rows || [], null);
  if (!b.oldest) return { label: "🟢 Good — no invoice overdue", bg: "#e6f7ec", fg: "#2fa84f", dues: null };
  if (b.oldest.daysOverdue > 30) return { label: "🔴 Overdue", bg: "#fdeaea", fg: "#d64545", dues: b.oldest };
  if (b.oldest.daysOverdue > 0) return { label: "🟡 Watch", bg: "#fff4e0", fg: "#c98400", dues: b.oldest };
  return { label: "🟢 Good — no invoice overdue", bg: "#e6f7ec", fg: "#2fa84f", dues: b.oldest };
}

// ── Orders tab ───────────────────────────────────────────────────────────

function OrdersTab({ orders, dealerCode }) {
  const [openId, setOpenId] = useState(null);
  const [items, setItems] = useState({});

  const toggle = (order) => {
    if (openId === order.id) { setOpenId(null); return; }
    setOpenId(order.id);
    if (!items[order.id]) {
      supabase.rpc("get_order_items_for_staff", { p_order_id: order.id }).then(({ data, error }) => {
        if (!error) setItems((prev) => ({ ...prev, [order.id]: data || [] }));
      });
    }
  };

  const handleExport = (format) => {
    const rows = orders.map((o) => ({
      Date: formatDate(o.created_at),
      Amount: Number(o.total || 0),
      Status: o.status,
    }));
    if (format === "excel") {
      exportRowsToExcel({ filename: exportFilename(dealerCode, "Orders", "xlsx"), sheetName: "Orders", rows });
    } else {
      exportTableToPdf({
        filename: exportFilename(dealerCode, "Orders", "pdf"),
        title: "Order History",
        columns: [
          { header: "Date", key: "Date" },
          { header: "Amount", key: "Amount", format: (v) => fmtCurrency(v) },
          { header: "Status", key: "Status" },
        ],
        rows,
      });
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => handleExport("pdf")} style={STMT_BTN}>📄 Export PDF</button>
        <button onClick={() => handleExport("excel")} style={STMT_BTN}>📊 Export Excel</button>
      </div>
      <div style={{ background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        {orders.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No orders yet.</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
              <div onClick={() => toggle(o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtCurrency(o.total)}</div>
                  <div style={{ fontSize: 11.5, color: "#999", marginTop: 1 }}>{formatDate(o.created_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge status={o.status} />
                  <span style={{ fontSize: 12, color: "#ccc" }}>{openId === o.id ? "▴" : "▾"}</span>
                </div>
              </div>
              {openId === o.id && (
                <div style={{ padding: "0 16px 14px", fontSize: 12, color: "#666", lineHeight: 1.7 }}>
                  {!items[o.id] ? (
                    "Loading items…"
                  ) : items[o.id].length === 0 ? (
                    "No line items found."
                  ) : (
                    items[o.id].map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{it.name} × {it.qty}</span>
                        <span style={{ fontWeight: 700, color: "#333" }}>{fmtCurrency(it.qty * it.price)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Visits tab (original check-in/check-out workflow, unchanged) ────────

function VisitsTab({
  openVisitLoading, isCheckedInElsewhere, isCheckedInHere, openVisit, navigate,
  boardFile, setBoardFile, shopFile, setShopFile, cardFile, setCardFile, videoFile, setVideoFile,
  checkoutNotes, setCheckoutNotes, checkingOut, handleCheckOut, checkOutStatus,
  loadingDayStart, dayStart, checkingIn, handleCheckIn, checkInStatus,
  visits, formatTime, formatDateTime,
}) {
  return (
    <div>
      <div style={CARD_STYLE}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Visit</div>
        <div style={{ fontSize: 11.5, color: "#999", marginBottom: 12, lineHeight: 1.5 }}>
          You must be within 100m of this dealer to check in or out. A dealer's first-ever check-in sets its saved location.
        </div>

        <LocationPermissionBanner />

        {openVisitLoading ? (
          <div style={{ fontSize: 12.5, color: "#999" }}>Checking visit status…</div>
        ) : isCheckedInElsewhere ? (
          <div>
            <div style={{ fontSize: 12.5, color: "#c98400", fontWeight: 600, background: "#fff8ea", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.5 }}>
              You're checked in at <b>{openVisit.dealer_name}</b> since {formatTime(openVisit.check_in_at)}. Check out there before starting a visit here.
            </div>
            <button
              onClick={() => navigate(`/staff/sales/dealer/${openVisit.dealer_id}`)}
              style={{ width: "100%", padding: "10px", border: "1.5px solid #7B2D8B", borderRadius: 8, background: "#fff", color: "#7B2D8B", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Go check out at {openVisit.dealer_name}
            </button>
          </div>
        ) : isCheckedInHere ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2fa84f", marginBottom: 12 }}>
              🟢 Checked in since {formatTime(openVisit.check_in_at)} — complete check-out below.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <CameraPhotoSlot label="Shop board" file={boardFile} onChange={setBoardFile} disabled={checkingOut} />
              <CameraPhotoSlot label="Shop interior" file={shopFile} onChange={setShopFile} disabled={checkingOut} />
              <CameraPhotoSlot label="Dealer card" file={cardFile} onChange={setCardFile} disabled={checkingOut} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <CameraVideoSlot file={videoFile} onChange={setVideoFile} disabled={checkingOut} />
            </div>
            <textarea
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              placeholder="Notes for this visit (optional)"
              rows={2}
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eee", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 10, boxSizing: "border-box" }}
            />
            <button
              onClick={handleCheckOut}
              disabled={checkingOut}
              style={{
                width: "100%", padding: "11px", border: "none", borderRadius: 8,
                background: checkingOut ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 13.5, fontWeight: 700,
                cursor: checkingOut ? "default" : "pointer",
              }}
            >
              {checkingOut ? "Checking out…" : "Check Out"}
            </button>
            {checkOutStatus && (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: checkOutStatus.type === "success" ? "#2fa84f" : "#d64545" }}>
                {checkOutStatus.message}
              </div>
            )}
          </>
        ) : loadingDayStart ? (
          <div style={{ fontSize: 12.5, color: "#999" }}>Checking your day status…</div>
        ) : dayStart?.ended_at ? (
          <div style={{ fontSize: 12.5, color: "#888", fontWeight: 600, background: "#f2f2f2", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
            Your day has ended — you can't check in anywhere else until you start a new day tomorrow.
          </div>
        ) : !dayStart ? (
          <div>
            <div style={{ fontSize: 12.5, color: "#c98400", fontWeight: 600, background: "#fff8ea", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.5 }}>
              You haven't started your day yet. Start your day first (a quick meter-reading photo) before checking in here.
            </div>
            <button
              onClick={() => navigate("/staff/sales/day-checkin")}
              style={{ width: "100%", padding: "10px", border: "1.5px solid #7B2D8B", borderRadius: 8, background: "#fff", color: "#7B2D8B", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              🛵 Start Day
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: "#999", marginBottom: 12 }}>
              Tap below to confirm — you must be within 100m of this dealer.
            </div>
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              style={{
                width: "100%", padding: "11px", border: "none", borderRadius: 8,
                background: checkingIn ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 13.5, fontWeight: 700,
                cursor: checkingIn ? "default" : "pointer",
              }}
            >
              {checkingIn ? "Checking in…" : "📍 Check In"}
            </button>
            {checkInStatus && (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: checkInStatus.type === "success" ? "#2fa84f" : "#d64545" }}>
                {checkInStatus.message}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 12px" }}>Recent Visits</div>
      <div style={{ background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        {visits.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No visits logged yet.</div>
        ) : (
          visits.map((v) => (
            <div key={v.id} style={{ padding: "13px 16px", borderBottom: "1px solid #f2f2f2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{v.staff_name}</div>
                <div style={{ fontSize: 11, color: "#999" }}>{formatDateTime(v.check_in_at || v.visited_at)}</div>
              </div>
              <div style={{ marginTop: 3 }}>
                {v.status === "open" ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "2px 8px" }}>Still checked in</span>
                ) : (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#2fa84f", background: "#e6f7ec", borderRadius: 999, padding: "2px 8px" }}>
                    Checked out{v.check_out_at ? ` ${formatTime(v.check_out_at)}` : ""}
                  </span>
                )}
              </div>
              {v.notes && <div style={{ fontSize: 12.5, color: "#666", marginTop: 6, lineHeight: 1.5 }}>{v.notes}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                {v.duty_on_photo_url && <a href={v.duty_on_photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>Duty-on photo</a>}
                {v.board_photo_url && <a href={v.board_photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>Board photo</a>}
                {v.shop_photo_url && <a href={v.shop_photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>Shop photo</a>}
                {v.card_photo_url && <a href={v.card_photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>Card photo</a>}
                {v.video_url && <a href={v.video_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>Video</a>}
                {v.latitude != null && v.longitude != null && (
                  <a href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>
                    📍 Location
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
