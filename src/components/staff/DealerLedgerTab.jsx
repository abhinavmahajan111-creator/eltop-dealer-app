import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { isDebitEntry } from "../../lib/ledgerUtils";
import { fmtCurrency2, fmtDateShort, exportRowsToExcel, exportTableToPdf, exportFilename } from "../../lib/dealerCrmUtils";
import PeriodPicker from "./PeriodPicker";

// Ledger tab — real dealer_ledger rows for a period, with a running balance
// computed forward from an opening balance, a Tally-style expand on every
// voucher (Balance before -> this voucher's impact -> Balance after, then
// voucher-type-specific detail), and PDF/Excel export. Vertical card list
// by design (approved from mockup) — never side-scrolls on a phone.
//
// Note: dealer_ledger has no order_id column linking a sales-invoice row
// back to its orders/order_items — see get_dealer_report's comments — so a
// Sales voucher here shows its amount/narration only; full line items are
// one tap away on the Orders tab.

const CARD = { background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, marginBottom: 10, overflow: "hidden" };

function voucherLabel(row) {
  const map = { sales_invoice: "Sales", order: "Sales", receipt: "Receipt", payment: "Receipt", payment_out: "Payment Out", credit_note: "Credit Note", journal: "Journal" };
  return map[row.voucher_type] || map[row.type] || row.type;
}

function voucherParticulars(row) {
  if (row.type === "order") return "Sales";
  if (row.type === "payment") return row.method ? `Payment — ${row.method}` : "Payment";
  if (row.type === "credit_note") return "Credit Note";
  if (row.type === "journal") return row.dr_account || row.cr_account || "Journal";
  return voucherLabel(row);
}

export default function DealerLedgerTab({ dealerId, dealerCode }) {
  const [range, setRange] = useState(null);
  const [rows, setRows] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    setLoading(true);
    const dayBefore = range.from
      ? new Date(new Date(range.from).getTime() - 86400000).toISOString().slice(0, 10)
      : null;
    Promise.all([
      supabase.rpc("get_dealer_balance_asof", { p_dealer_id: dealerId, p_asof: dayBefore }),
      supabase.rpc("get_dealer_ledger", { p_dealer_id: dealerId, p_from: range.from, p_to: range.to }),
    ]).then(([balRes, ledgerRes]) => {
      if (cancelled) return;
      setOpeningBalance(Number(balRes.data || 0));
      setRows(ledgerRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dealerId, range]);

  let running = openingBalance;
  const withBalance = rows.map((r) => {
    const before = running;
    const debit = isDebitEntry(r);
    const amt = Number(r.amount) || 0;
    running = debit ? running + amt : running - amt;
    return { ...r, _before: before, _after: running, _debit: debit };
  });
  const closingBalance = running;

  const handleExportPdf = () => {
    exportTableToPdf({
      filename: exportFilename(dealerCode, "Ledger", "pdf"),
      title: "Ledger Statement",
      subtitle: `${range?.from || "—"} to ${range?.to || "—"}  ·  Opening ${fmtCurrency2(Math.abs(openingBalance))} ${openingBalance >= 0 ? "Dr" : "Cr"}  ·  Closing ${fmtCurrency2(Math.abs(closingBalance))} ${closingBalance >= 0 ? "Dr" : "Cr"}`,
      columns: [
        { header: "Date", key: "voucher_date", format: fmtDateShort },
        { header: "Particulars", key: "_particulars" },
        { header: "Voucher No", key: "voucher_no" },
        { header: "Debit", key: "_dr", format: (v) => (v ? fmtCurrency2(v) : "") },
        { header: "Credit", key: "_cr", format: (v) => (v ? fmtCurrency2(v) : "") },
        { header: "Balance", key: "_after", format: (v) => `${fmtCurrency2(Math.abs(v))} ${v >= 0 ? "Dr" : "Cr"}` },
      ],
      rows: withBalance.map((r) => ({ ...r, _particulars: voucherParticulars(r), _dr: r._debit ? r.amount : null, _cr: !r._debit ? r.amount : null })),
    });
  };

  const handleExportExcel = () => {
    exportRowsToExcel({
      filename: exportFilename(dealerCode, "Ledger", "xlsx"),
      sheetName: "Ledger",
      rows: withBalance.map((r) => ({
        Date: fmtDateShort(r.voucher_date || r.created_at),
        Particulars: voucherParticulars(r),
        "Voucher Type": voucherLabel(r),
        "Voucher No": r.voucher_no || "",
        Narration: r.narration || r.reason || "",
        Debit: r._debit ? Number(r.amount) : "",
        Credit: !r._debit ? Number(r.amount) : "",
        "Balance After": Math.abs(r._after),
        "Dr/Cr": r._after >= 0 ? "Dr" : "Cr",
      })),
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <PeriodPicker onChange={setRange} defaultKey="last_3m" />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <ExportBtn label="📄 Export PDF" onClick={handleExportPdf} />
        <ExportBtn label="📊 Export Excel" onClick={handleExportExcel} />
      </div>

      <BalanceStrip label="Opening Balance" value={openingBalance} />

      {loading ? (
        <div style={{ textAlign: "center", padding: 30, color: "#999", fontSize: 13 }}>Loading…</div>
      ) : withBalance.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "#999", fontSize: 13 }}>No vouchers in this period.</div>
      ) : (
        withBalance.map((r) => (
          <VoucherCard key={r.id} row={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
        ))
      )}

      <BalanceStrip label="Closing Balance" value={closingBalance} highlight />
    </div>
  );
}

function ExportBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", borderRadius: 9, border: "1.5px solid #7B2D8B", background: "#fff", color: "#7B2D8B", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}

function BalanceStrip({ label, value, highlight }) {
  const dr = value >= 0;
  return (
    <div style={{ background: highlight ? "#f3e6f6" : "#faf5fb", border: `1.5px solid ${highlight ? "#7B2D8B" : "#e6d3ea"}`, borderRadius: 12, padding: "10px 14px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#7B2D8B" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: "#333" }}>{fmtCurrency2(Math.abs(value))} {dr ? "Dr" : "Cr"}</span>
    </div>
  );
}

function VoucherCard({ row, open, onToggle }) {
  const amt = Number(row.amount) || 0;
  const dr = row._debit;
  return (
    <div style={CARD}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", cursor: "pointer" }}>
        <div style={{ fontSize: 10.5, color: "#999", fontWeight: 700, width: 42, flexShrink: 0, lineHeight: 1.3 }}>
          {fmtDateShort(row.voucher_date || row.created_at)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333" }}>{voucherParticulars(row)}</div>
          <div style={{ fontSize: 10, color: "#999", fontWeight: 600, marginTop: 1 }}>
            {voucherLabel(row)}{row.voucher_no ? ` · ${row.voucher_no}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: dr ? "#d64545" : "#2fa84f" }}>
            {dr ? "−" : "+"} {fmtCurrency2(amt)}
          </div>
          <div style={{ fontSize: 10, color: "#7B2D8B", fontWeight: 800, marginTop: 3, background: "#f3e6f6", borderRadius: 6, padding: "1.5px 7px", display: "inline-block" }}>
            Bal {fmtCurrency2(Math.abs(row._after))} {row._after >= 0 ? "Dr" : "Cr"}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#ccc", marginLeft: 2, flexShrink: 0 }}>{open ? "▴" : "▾"}</div>
      </div>
      {open && (
        <div style={{ padding: "10px 14px 12px", borderTop: "1px dashed #eadcec", background: "#fcfafd" }}>
          <BalanceImpact before={row._before} amount={amt} debit={dr} after={row._after} />
          <VoucherDetail row={row} />
        </div>
      )}
    </div>
  );
}

function BalanceImpact({ before, amount, debit, after }) {
  return (
    <div style={{ background: "#faf5fb", border: "1.3px solid #e6d3ea", borderRadius: 9, padding: "8px 10px", marginBottom: 10 }}>
      <ImpactRow label="Balance before" value={`${fmtCurrency2(Math.abs(before))} ${before >= 0 ? "Dr" : "Cr"}`} />
      <ImpactRow label="This voucher" value={`${debit ? "−" : "+"} ${fmtCurrency2(amount)} ${debit ? "Dr" : "Cr"}`} color={debit ? "#d64545" : "#2fa84f"} />
      <ImpactRow label="Balance after" value={`${fmtCurrency2(Math.abs(after))} ${after >= 0 ? "Dr" : "Cr"}`} strong />
    </div>
  );
}

function ImpactRow({ label, value, color, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10.5, padding: "2.5px 0", ...(strong ? { borderTop: "1.3px solid #d9b8e0", marginTop: 4, paddingTop: 6 } : {}) }}>
      <span style={{ fontWeight: strong ? 800 : 600, color: strong ? "#7B2D8B" : "#999", fontSize: strong ? 11 : 10.5 }}>{label}</span>
      <span style={{ fontWeight: 800, color: color || (strong ? "#7B2D8B" : "#555"), fontSize: strong ? 13 : 10.5 }}>{value}</span>
    </div>
  );
}

function VoucherDetail({ row }) {
  if (row.type === "order") {
    return (
      <>
        <DetailLabel />
        <DetailRow label="Voucher type" value="Sales Invoice" />
        {row.narration && <DetailRow label="Narration" value={row.narration} />}
        <div style={{ fontSize: 10, color: "#aaa", marginTop: 8, lineHeight: 1.5 }}>
          Full item breakdown isn't linked from the ledger — open this invoice from the Orders tab for line items.
        </div>
      </>
    );
  }
  if (row.type === "payment") {
    return (
      <>
        <DetailLabel />
        <DetailRow label="Method" value={row.method || "—"} />
        <DetailRow label="Reference" value={row.reference_no || "—"} />
        {row.narration && <DetailRow label="Narration" value={row.narration} />}
      </>
    );
  }
  if (row.type === "credit_note") {
    return (
      <>
        <DetailLabel />
        <DetailRow label="Reason" value={row.reason || "—"} />
      </>
    );
  }
  return (
    <>
      <DetailLabel />
      <DetailRow label="Dr account" value={row.dr_account || "—"} />
      <DetailRow label="Cr account" value={row.cr_account || "—"} />
      {row.narration && <DetailRow label="Narration" value={row.narration} />}
    </>
  );
}

function DetailLabel() {
  return <div style={{ fontSize: 9.5, fontWeight: 800, color: "#b9a3bf", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Voucher Details</div>;
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 11, color: "#888", padding: "3px 0" }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 800, color: "#444", textAlign: "right" }}>{value}</span>
    </div>
  );
}
