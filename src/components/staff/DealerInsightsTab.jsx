import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { computeAgeingBuckets } from "../../lib/ledgerUtils";
import {
  fmtCurrency, fmtCurrency2, exportRowsToExcel, exportTableToPdf, exportFilename,
  buildDealerAiSystemPrompt, askAi,
} from "../../lib/dealerCrmUtils";
import PeriodPicker from "./PeriodPicker";

// Insights tab — approved from mockup/dealer-crm-mockup.html: an "Ask AI
// about this dealer" card at the top, then a tap-to-expand list of report
// names grouped under Sales / Payments & Credit / Operations. Each report
// fetches lazily (only once opened) via the single get_dealer_report RPC,
// keeping its own independent period picker + PDF/Excel export.

const ITEM_CARD = { background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 12, marginBottom: 8, overflow: "hidden" };
const GROUP_LABEL = { fontSize: 10.5, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 2px 6px" };

function fmtExportValue(key, v) {
  if (typeof v !== "number") return v;
  const k = key.toLowerCase();
  if (k.includes("amount") || k.includes("value") || k.includes("collected") || k.includes("due") || ["cgst", "sgst", "igst"].includes(k)) {
    return fmtCurrency2(v);
  }
  return String(v);
}

function toExportRows(reportKey, data, range) {
  switch (reportKey) {
    case "sales_trend":
      return (data || []).map((d) => ({ Month: d.month_label, Amount: Number(d.amount) }));
    case "top_products":
      return (data || []).map((d) => ({ Product: d.name, Qty: d.qty, Orders: d.orders_count, Amount: Number(d.amount) }));
    case "ageing": {
      const b = computeAgeingBuckets(data || [], range?.to);
      return [
        { Bucket: "0-30 days", Amount: b.buckets["0-30"] },
        { Bucket: "31-60 days", Amount: b.buckets["31-60"] },
        { Bucket: "61-90 days", Amount: b.buckets["61-90"] },
        { Bucket: "90+ days", Amount: b.buckets["90+"] },
      ];
    }
    case "payment_collection":
      return [{ Metric: "Collected", Value: data.collected }, { Metric: "Still Due", Value: data.still_due }];
    case "gst_summary":
      return [
        { Metric: "Taxable Value", Value: data.taxable_value },
        { Metric: "CGST", Value: data.cgst },
        { Metric: "SGST", Value: data.sgst },
        { Metric: "IGST", Value: data.igst },
        { Metric: "Total Invoice Value", Value: data.total_invoice_value },
      ];
    case "order_status":
      return [
        { Metric: "Pending", Value: data.pending },
        { Metric: "Confirmed", Value: data.confirmed },
        { Metric: "Dispatched", Value: data.dispatched },
        { Metric: "Delivered", Value: data.delivered },
      ];
    case "returns":
      return [
        { Metric: "Credit Notes Issued", Value: data.count },
        { Metric: "Total Value Returned", Value: data.total_value },
        { Metric: "Most Common Reason", Value: data.top_reason || "—" },
      ];
    case "order_frequency":
      return [
        { Metric: "Avg Days Between Orders", Value: data.avg_days_between_orders ?? "—" },
        { Metric: "Days Since Last Order", Value: data.days_since_last_order ?? "—" },
        { Metric: "Active Months", Value: `${data.active_months} of ${data.total_months}` },
      ];
    case "visit_conversion":
      return [
        { Metric: "Visits Made", Value: data.visits_count },
        { Metric: "Led to an Order", Value: data.converted_count },
        { Metric: "Conversion Rate", Value: `${data.conversion_rate}%` },
      ];
    default:
      return [];
  }
}

export default function DealerInsightsTab({ dealerId, dealerCode, dealer, orders, visits }) {
  return (
    <div>
      <AiCard dealerId={dealerId} dealer={dealer} orders={orders} visits={visits} />

      <div style={{ fontSize: 11, color: "#888", textAlign: "center", padding: "0 0 12px" }}>
        Or browse ready-made reports — tap to open, period filter and export live inside.
      </div>

      <div style={GROUP_LABEL}>Sales</div>
      <ReportItem icon="📈" name="Sales Trend" reportKey="sales_trend" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_6m" render={SalesTrendView} />
      <ReportItem icon="🏆" name="Product-wise Sales" reportKey="top_products" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_6m" render={TopProductsView} />

      <div style={GROUP_LABEL}>Payments &amp; Credit</div>
      <ReportItem icon="💰" name="Payment Collection" reportKey="payment_collection" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_6m" render={PaymentCollectionView} />
      <ReportItem icon="⏳" name="Outstanding Ageing" reportKey="ageing" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="today" singleDate render={AgeingView} />
      <ReportItem icon="🧮" name="GST Summary" reportKey="gst_summary" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="this_quarter" render={GstSummaryView} />
      <ReportItem icon="↩️" name="Returns / Credit Notes" reportKey="returns" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_6m" render={ReturnsView} />

      <div style={GROUP_LABEL}>Operations</div>
      <ReportItem icon="📦" name="Order Status Breakdown" reportKey="order_status" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_3m" render={OrderStatusView} />
      <ReportItem icon="⏱️" name="Order Frequency" reportKey="order_frequency" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_6m" render={OrderFrequencyView} />
      <ReportItem icon="🤝" name="Visit → Order Conversion" reportKey="visit_conversion" dealerId={dealerId} dealerCode={dealerCode} defaultPeriodKey="last_6m" render={VisitConversionView} />
    </div>
  );
}

// ── Generic accordion + fetch/export shell ─────────────────────────────

function ReportItem({ icon, name, reportKey, dealerId, dealerCode, defaultPeriodKey, singleDate, render }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !range) return;
    let cancelled = false;
    setLoading(true);
    supabase.rpc("get_dealer_report", { p_dealer_id: dealerId, p_report: reportKey, p_from: range.from, p_to: range.to })
      .then(({ data: d, error }) => {
        if (cancelled) return;
        setData(error ? null : d);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, range, dealerId, reportKey]);

  const handleExportPdf = () => {
    const rows = toExportRows(reportKey, data, range);
    if (!rows.length) return;
    const cols = Object.keys(rows[0]).map((k) => ({ header: k, key: k, format: (v) => fmtExportValue(k, v) }));
    exportTableToPdf({
      filename: exportFilename(dealerCode, name.replace(/\s+/g, "_"), "pdf"),
      title: name,
      subtitle: singleDate ? `As of ${range?.to || "—"}` : `${range?.from || "—"} to ${range?.to || "—"}`,
      columns: cols,
      rows,
    });
  };

  const handleExportExcel = () => {
    const rows = toExportRows(reportKey, data, range);
    if (!rows.length) return;
    exportRowsToExcel({ filename: exportFilename(dealerCode, name.replace(/\s+/g, "_"), "xlsx"), sheetName: name.slice(0, 28), rows });
  };

  return (
    <div style={ITEM_CARD}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", cursor: "pointer" }}>
        <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "#333" }}>{name}</span>
        <span style={{ fontSize: 12, color: "#ccc", flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px dashed #eadcec", paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#888" }}>{singleDate ? "As of" : "Period"}</span>
            <PeriodPicker onChange={setRange} defaultKey={defaultPeriodKey} singleDate={singleDate} small />
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 12.5 }}>Loading…</div>
          ) : data == null ? (
            <div style={{ textAlign: "center", padding: 20, color: "#999", fontSize: 12.5 }}>No data for this period.</div>
          ) : (
            render(data, range)
          )}
          {data != null && (
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button onClick={handleExportPdf} style={EXPORT_BTN}>📄</button>
              <button onClick={handleExportExcel} style={EXPORT_BTN}>📊</button>
              <span style={{ fontSize: 11, color: "#888", alignSelf: "center", marginLeft: 4 }}>Export this report</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const EXPORT_BTN = { width: 26, height: 26, borderRadius: 7, border: "1.5px solid #7B2D8B", background: "#fff", color: "#7B2D8B", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };

// ── Per-report views ────────────────────────────────────────────────────

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: "#faf5fb", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: color || "#222" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "#888", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function KvRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f2e6f4", fontSize: 12 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 800, color: "#333" }}>{value}</span>
    </div>
  );
}

function SalesTrendView(data) {
  if (!data.length) return <Empty />;
  const max = Math.max(1, ...data.map((d) => Number(d.amount) || 0));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100, paddingTop: 16 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 8.5, color: "#7B2D8B", fontWeight: 800, marginBottom: 3, whiteSpace: "nowrap" }}>{fmtCurrency(d.amount)}</div>
          <div style={{ width: "100%", maxWidth: 26, background: "linear-gradient(180deg, #a13ea9 0%, #7B2D8B 100%)", borderRadius: "5px 5px 0 0", height: `${Math.max(4, (Number(d.amount) / max) * 100)}%` }} />
          <div style={{ fontSize: 9.5, color: "#999", fontWeight: 700, marginTop: 6 }}>{d.month_label}</div>
        </div>
      ))}
    </div>
  );
}

function TopProductsView(data) {
  if (!data.length) return <Empty />;
  return (
    <div>
      {data.slice(0, 10).map((p, i) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < data.length - 1 ? "1px solid #f2e6f4" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, background: "#f3e6f6", color: "#7B2D8B", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 8, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>{p.qty} pcs across {p.orders_count} orders</div>
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7B2D8B", flexShrink: 0, marginLeft: 8 }}>{fmtCurrency(p.amount)}</div>
        </div>
      ))}
    </div>
  );
}

function PaymentCollectionView(data) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <StatBox label="Collected" value={fmtCurrency(data.collected)} color="#2fa84f" />
      <StatBox label="Still due" value={fmtCurrency(data.still_due)} color="#d64545" />
    </div>
  );
}

function AgeingView(rows, range) {
  const b = computeAgeingBuckets(rows, range?.to);
  const bucketColor = { "0-30": "#2fa84f", "31-60": "#c98400", "61-90": "#e07a2f", "90+": "#d64545" };
  return (
    <div>
      {Object.entries(b.buckets).map(([key, val]) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#666", width: 62, flexShrink: 0 }}>{key} days</span>
          <div style={{ flex: 1, height: 9, background: "#f3ecf5", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 999, background: bucketColor[key], width: b.total > 0 ? `${(val / b.total) * 100}%` : "0%" }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#333", width: 72, textAlign: "right", flexShrink: 0 }}>{fmtCurrency(val)}</span>
        </div>
      ))}
      {b.oldest && (
        <div style={{ fontSize: 10.5, color: "#999", marginTop: 8 }}>
          Oldest unpaid: {b.oldest.voucherNo || "—"}, {b.oldest.daysOverdue} days overdue
        </div>
      )}
    </div>
  );
}

function GstSummaryView(data) {
  return (
    <div>
      <KvRow label="Taxable value" value={fmtCurrency(data.taxable_value)} />
      <KvRow label="CGST" value={fmtCurrency(data.cgst)} />
      <KvRow label="SGST" value={fmtCurrency(data.sgst)} />
      {Number(data.igst) > 0 && <KvRow label="IGST" value={fmtCurrency(data.igst)} />}
      <KvRow label="Total invoice value" value={fmtCurrency(data.total_invoice_value)} />
    </div>
  );
}

function ReturnsView(data) {
  return (
    <div>
      <KvRow label="Credit notes issued" value={data.count} />
      <KvRow label="Total value returned" value={fmtCurrency(data.total_value)} />
      <KvRow label="Most common reason" value={data.top_reason || "—"} />
    </div>
  );
}

function OrderStatusView(data) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <StatBox label="Pending" value={data.pending} color="#c98400" />
      <StatBox label="Confirmed" value={data.confirmed} color="#3a5fc9" />
      <StatBox label="Dispatched" value={data.dispatched} color="#7B2D8B" />
      <StatBox label="Delivered" value={data.delivered} color="#2fa84f" />
    </div>
  );
}

function OrderFrequencyView(data) {
  return (
    <div>
      <KvRow label="Avg. days between orders" value={data.avg_days_between_orders != null ? `${data.avg_days_between_orders} days` : "—"} />
      <KvRow label="Days since last order" value={data.days_since_last_order != null ? `${data.days_since_last_order} days` : "—"} />
      <KvRow label="Active months (ordered ≥1)" value={`${data.active_months} of ${data.total_months}`} />
    </div>
  );
}

function VisitConversionView(data) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
        <StatBox label="Visits made" value={data.visits_count} />
        <StatBox label="Led to an order" value={data.converted_count} />
      </div>
      <KvRow label="Conversion rate" value={`${data.conversion_rate}%`} />
      <div style={{ fontSize: 10, color: "#aaa", marginTop: 6, lineHeight: 1.5 }}>
        Estimated: an order placed within 2 days of a visit counts as converted — visits aren't directly linked to the order they led to.
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ textAlign: "center", padding: 16, color: "#999", fontSize: 12.5 }}>No data for this period.</div>;
}

// ── Per-dealer AI card ──────────────────────────────────────────────────

const SUGGESTED_PROMPTS = ["Top products", "Kab tak due clear hoga?", "Compare to last quarter"];

function AiCard({ dealerId, dealer, orders, visits }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState(null);

  const ensureContext = async () => {
    if (context) return context;
    const [ledgerRes, productsRes] = await Promise.all([
      supabase.rpc("get_dealer_ledger", { p_dealer_id: dealerId, p_from: null, p_to: null }),
      supabase.rpc("get_dealer_report", { p_dealer_id: dealerId, p_report: "top_products", p_from: null, p_to: null }),
    ]);
    const built = buildDealerAiSystemPrompt({
      dealer, orders, visits,
      ledgerRows: ledgerRes.data || [],
      topProducts: productsRes.data || [],
    });
    setContext(built);
    return built;
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    const systemPrompt = await ensureContext();
    const reply = await askAi(systemPrompt, newMessages);
    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    setSending(false);
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #f7ecf9 0%, #fdf8fe 100%)", border: "1.5px solid #7B2D8B", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#7B2D8B", marginBottom: 10 }}>
        ✨ Ask AI about {dealer?.name || "this dealer"}
      </div>

      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#7B2D8B" : "#fff",
                color: m.role === "user" ? "#fff" : "#333",
                border: m.role === "user" ? "none" : "1.3px solid #e6d3ea",
                borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                padding: "8px 12px", fontSize: 11.5, lineHeight: 1.55, maxWidth: "90%", marginBottom: 6, whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && <div style={{ alignSelf: "flex-start", fontSize: 11, color: "#999", padding: "4px 0" }}>Thinking…</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SUGGESTED_PROMPTS.map((p) => (
          <div key={p} onClick={() => send(p)} style={{ fontSize: 10.5, fontWeight: 700, color: "#7B2D8B", background: "#fff", border: "1.3px solid #d9b8e0", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}>
            {p}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 999, padding: "5px 5px 5px 14px" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about this dealer — any language..."
          disabled={sending}
          style={{ flex: 1, border: "none", outline: "none", fontSize: 11.5, background: "transparent", minWidth: 0 }}
        />
        <div onClick={() => send()} style={{ width: 28, height: 28, borderRadius: "50%", background: "#7B2D8B", color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>➤</div>
      </div>
      <div style={{ fontSize: 9.5, color: "#999", textAlign: "center", marginTop: 8 }}>
        Hindi, English, Hinglish — jis bhi language mein poochho, usi mein jawaab milega.
      </div>
    </div>
  );
}
