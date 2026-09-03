// Shared helpers for the staff-facing Dealer CRM screen (DealerDetail.jsx
// and its Ledger/Insights tab components): period-picker date math,
// formatters, PDF/Excel export, and the AI-assistant context builders.
//
// Export uses the same libraries already installed for this purpose
// elsewhere in the app — jsPDF + jspdf-autotable (src/utils/generatePriceListPDF.js)
// for a real downloadable PDF, and xlsx (src/admin/AdminDealers.jsx) for
// Excel — rather than introducing a new dependency.

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Period picker ───────────────────────────────────────────────────────

export const PERIOD_OPTIONS = [
  { key: "last_30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_3m", label: "Last 3 months" },
  { key: "this_quarter", label: "This quarter" },
  { key: "last_6m", label: "Last 6 months" },
  { key: "this_year", label: "This year" },
  { key: "last_12m", label: "Last 12 months" },
  { key: "all_time", label: "All time" },
  { key: "custom", label: "Custom range" },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Returns { from, to } as YYYY-MM-DD strings (or nulls for "all_time").
export function periodToRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today":
      return { from: isoDate(today), to: isoDate(today) };
    case "last_30d": {
      const f = new Date(today); f.setDate(f.getDate() - 29);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "this_month": {
      const f = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "last_3m": {
      const f = new Date(today); f.setMonth(f.getMonth() - 3);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "this_quarter": {
      const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
      const f = new Date(today.getFullYear(), qStartMonth, 1);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "last_6m": {
      const f = new Date(today); f.setMonth(f.getMonth() - 6);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "this_year": {
      const f = new Date(today.getFullYear(), 0, 1);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "last_12m": {
      const f = new Date(today); f.setMonth(f.getMonth() - 12);
      return { from: isoDate(f), to: isoDate(today) };
    }
    case "all_time":
      return { from: null, to: null };
    default:
      return { from: null, to: null };
  }
}

// ── Formatters ──────────────────────────────────────────────────────────

export function fmtCurrency(n) {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function fmtCurrency2(n) {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Export ──────────────────────────────────────────────────────────────

export function exportRowsToExcel({ filename, sheetName = "Report", rows }) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export function exportTableToPdf({ filename, title, subtitle, columns, rows }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.setTextColor(123, 45, 139);
  doc.text("Eltop by Embassy Electricals", 40, 40);
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(title, 40, 58);
  let startY = 72;
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text(subtitle, 40, 72);
    startY = 84;
  }
  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => (c.format ? c.format(r[c.key]) : r[c.key] ?? ""))),
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [123, 45, 139], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 245, 251] },
    margin: { left: 40, right: 40 },
  });
  doc.save(filename);
}

// Same company letterhead data generatePriceListPDF.js uses (there it's
// sourced from Store.jsx's footer — the app's single source of truth for
// this static business info). Duplicated as a small constant here rather
// than importing across modules with independently-configured jsPDF docs.
const COMPANY_INFO = {
  name: "Embassy Electricals (India) Pvt. Ltd.",
  addressLines: ["Kh. No. 154/632, Phirni Road, Pooth Khurd,", "Bawana Ind. Area, Delhi - 110039"],
  gstin: "07AAGCE1173M1ZH",
  udyam: "UDYAM-DL-06-0006878",
  email: "embassyelectricindia@gmail.com",
  website: "www.EltopByEmbassy.com",
};

// Tally-style ledger statement PDF — a proper letterhead (company name/
// address/GSTIN), a party block (dealer name/address/GSTIN — the dealer's
// GSTIN comes straight from profiles.gstin via get_dealer_detail, never
// invented; the line is simply omitted when a dealer has none on file),
// the period, then a fully-bordered ledger table: Opening Balance, every
// voucher with its Vch Type/No. and running Balance, a Total row, and a
// Closing Balance row — replacing the old bare flat table. Shared by the
// Overview tab's "Statement" export and the Ledger tab's own export, so
// every PDF a rep generates from this screen looks like one document.
export function exportLedgerStatementPdf({ dealer, dealerCode, fromLabel, toLabel, openingBalance, closingBalance, rows, filename }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  let y = 42;

  const center = (text, size, color, bold) => {
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(text, PW / 2, y, { align: "center" });
    y += size * 1.05 + 3;
  };

  // ── Letterhead ──
  center(COMPANY_INFO.name, 13, [123, 45, 139], true);
  COMPANY_INFO.addressLines.forEach((line) => center(line, 8.5, [110, 110, 110], false));
  center(`GSTIN: ${COMPANY_INFO.gstin}  |  UDYAM: ${COMPANY_INFO.udyam}`, 8.5, [110, 110, 110], false);
  center(`${COMPANY_INFO.email}  |  ${COMPANY_INFO.website}`, 8.5, [110, 110, 110], false);

  y += 6;
  doc.setDrawColor(220, 200, 228);
  doc.line(40, y, PW - 40, y);
  y += 18;

  // ── Party block ──
  center("Ledger Statement", 11, [30, 30, 30], true);
  y += 2;
  center(dealer?.name || "Dealer", 12, [30, 30, 30], true);
  const code = dealer?.dealer_code || dealerCode;
  if (code) center(code, 8.5, [140, 140, 140], false);
  const addr = dealer?.shop_address || dealer?.address;
  if (addr) center(addr, 8.5, [140, 140, 140], false);
  if (dealer?.gstin) center(`GSTIN: ${dealer.gstin}`, 8.5, [140, 140, 140], false);
  y += 4;
  center(`Period: ${fromLabel} to ${toLabel}`, 9, [123, 45, 139], true);
  y += 6;

  // ── Ledger table ──
  const dr = (v) => (v > 0.004 ? fmtCurrency2(v) : "");
  const cr = (v) => (v < -0.004 ? fmtCurrency2(-v) : "");
  const bal = (v) => `${fmtCurrency2(Math.abs(v))} ${v >= 0 ? "Dr" : "Cr"}`;

  const totalDebit = rows.reduce((s, r) => s + (r._debit ? Number(r.amount) : 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (!r._debit ? Number(r.amount) : 0), 0);

  const openRow = [
    { content: "Opening Balance", colSpan: 4, styles: { fontStyle: "bold" } },
    { content: dr(openingBalance), styles: { fontStyle: "bold", halign: "right" } },
    { content: cr(openingBalance), styles: { fontStyle: "bold", halign: "right" } },
    { content: bal(openingBalance), styles: { fontStyle: "bold", halign: "right" } },
  ];
  const voucherRows = rows.map((r) => [
    fmtDateShort(r.voucher_date || r.created_at),
    voucherParticularsForExport(r),
    voucherLabelForExport(r),
    r.voucher_no || "",
    { content: r._debit ? fmtCurrency2(r.amount) : "", styles: { halign: "right" } },
    { content: !r._debit ? fmtCurrency2(r.amount) : "", styles: { halign: "right" } },
    { content: bal(r._after), styles: { halign: "right" } },
  ]);
  const totalRow = [
    { content: "Total", colSpan: 4, styles: { fontStyle: "bold", fillColor: [248, 240, 249] } },
    { content: fmtCurrency2(totalDebit), styles: { fontStyle: "bold", halign: "right", fillColor: [248, 240, 249] } },
    { content: fmtCurrency2(totalCredit), styles: { fontStyle: "bold", halign: "right", fillColor: [248, 240, 249] } },
    { content: "", styles: { fillColor: [248, 240, 249] } },
  ];
  const closeRow = [
    { content: "Closing Balance", colSpan: 4, styles: { fontStyle: "bold", fillColor: [243, 230, 246], textColor: [123, 45, 139] } },
    { content: dr(closingBalance), styles: { fontStyle: "bold", halign: "right", fillColor: [243, 230, 246], textColor: [123, 45, 139] } },
    { content: cr(closingBalance), styles: { fontStyle: "bold", halign: "right", fillColor: [243, 230, 246], textColor: [123, 45, 139] } },
    { content: bal(closingBalance), styles: { fontStyle: "bold", halign: "right", fillColor: [243, 230, 246], textColor: [123, 45, 139] } },
  ];

  autoTable(doc, {
    startY: y,
    head: [["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit", "Balance"]],
    body: [openRow, ...voucherRows, totalRow, closeRow],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 5, lineColor: [225, 210, 228], lineWidth: 0.6 },
    headStyles: { fillColor: [123, 45, 139], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(160, 160, 160);
      doc.text(`Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, 40, ph - 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, PW - 40, ph - 20, { align: "right" });
    },
  });

  doc.save(filename);
}

function voucherLabelForExport(row) {
  const map = { sales_invoice: "Sales", order: "Sales", receipt: "Receipt", payment: "Receipt", payment_out: "Payment Out", credit_note: "Credit Note", journal: "Journal" };
  return map[row.voucher_type] || map[row.type] || row.type;
}

function voucherParticularsForExport(row) {
  if (row.type === "order") return "Sales";
  if (row.type === "payment") return row.method ? `Payment — ${row.method}` : "Payment";
  if (row.type === "credit_note") return "Credit Note";
  if (row.type === "journal") return row.dr_account || row.cr_account || "Journal";
  return voucherLabelForExport(row);
}

function dateSuffix() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
}

export function exportFilename(dealerCode, label, ext) {
  const safe = (dealerCode || "dealer").replace(/[^a-zA-Z0-9-]/g, "_");
  return `Eltop_${safe}_${label}_${dateSuffix()}.${ext}`;
}

// ── AI assistant ────────────────────────────────────────────────────────
// The chat backend already exists (api/chat.js — proxies to an LLM and
// shapes the reply like Anthropic's response format) and is already live
// in production, used today by admin/DealerCRM.jsx's "AI Assistant" tab.
// This reuses that exact same endpoint — no new backend/infra needed.

const LANGUAGE_INSTRUCTION =
  "IMPORTANT: Always reply in the same language and script the sales rep used to ask their question — Hindi (Devanagari), Hinglish (Roman-script Hindi), English, or any other language — matching it exactly. Never default to English if they asked in another language. Keep answers short, specific, and numbers-first — this is read on a phone between dealer visits.";

export function buildDealerAiSystemPrompt({ dealer, orders = [], ledgerRows = [], visits = [], topProducts = [] }) {
  const outstanding = Number(dealer?.outstanding || 0);
  const totalOrders = orders.length;
  const totalValue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const lastOrder = orders[0];

  const ledgerLines = ledgerRows.slice(-15).map((r) => {
    const dr = r.type === "order" || (r.type === "journal" && r.dr_dealer);
    const sign = dr ? "Dr" : "Cr";
    return `  ${fmtDateShort(r.voucher_date || r.created_at)} — ${r.voucher_type || r.type} ${r.voucher_no || ""}: ₹${Number(r.amount).toLocaleString("en-IN")} ${sign}`;
  }).join("\n") || "  No ledger entries yet.";

  const productLines = topProducts.slice(0, 8)
    .map((p) => `  ${p.name} — ${p.qty} units across ${p.orders_count} orders, ₹${Number(p.amount).toLocaleString("en-IN")}`)
    .join("\n") || "  No orders yet.";

  const visitLines = visits.slice(0, 5)
    .map((v) => `  ${fmtDateShort(v.check_in_at || v.visited_at)} by ${v.staff_name}${v.notes ? ` — ${v.notes}` : ""}`)
    .join("\n") || "  No visits logged yet.";

  const context = `
DEALER: ${dealer?.name || "—"} (${dealer?.dealer_code || "—"})
Outstanding: ₹${outstanding.toLocaleString("en-IN")} of ₹${Number(dealer?.credit_limit || 0).toLocaleString("en-IN")} credit limit
Total orders: ${totalOrders} | Total order value: ₹${totalValue.toLocaleString("en-IN")}
Last order: ${lastOrder ? `₹${Number(lastOrder.total).toLocaleString("en-IN")} on ${fmtDateShort(lastOrder.created_at)} (${lastOrder.status})` : "None yet"}

TOP PRODUCTS ORDERED:
${productLines}

RECENT LEDGER ENTRIES (most recent last):
${ledgerLines}

RECENT VISITS:
${visitLines}
`.trim();

  return `You are a CRM assistant for a sales rep at Eltop by Embassy Electricals, helping them understand ONE specific dealer they're about to visit or just spoke with. Only answer using the data given below — never invent figures. ${LANGUAGE_INSTRUCTION}\n\n${context}`;
}

export function buildDashboardAiSystemPrompt({ repName, dealers = [], agingByDealer = [], visitsToday = [] }) {
  const overdue = agingByDealer
    .filter((d) => d.aging && d.aging.daysOld >= 30)
    .sort((a, b) => b.aging.totalOutstanding - a.aging.totalOutstanding)
    .slice(0, 15)
    .map((d) => `  ${d.name} (${d.dealer_code || "—"}) — ₹${d.aging.totalOutstanding.toLocaleString("en-IN")}, ${d.aging.daysOld} days`)
    .join("\n") || "  None currently 30+ days overdue.";

  const dealerLines = dealers.slice(0, 40)
    .map((d) => `  ${d.name} (${d.dealer_code || "—"}) — outstanding ₹${Number(d.outstanding || 0).toLocaleString("en-IN")}`)
    .join("\n") || "  No dealers assigned.";

  const visitLines = visitsToday
    .map((v) => `  ${v.dealer_name || v.dealer_id} — ${v.status === "open" ? "checked in, not yet out" : "completed"}`)
    .join("\n") || "  No visits logged today yet.";

  const context = `
SALES REP: ${repName || "—"}

ASSIGNED DEALERS (${dealers.length}):
${dealerLines}

DEALERS 30+ DAYS OVERDUE:
${overdue}

TODAY'S VISITS:
${visitLines}
`.trim();

  return `You are a CRM assistant for a field sales rep at Eltop by Embassy Electricals, helping them understand their whole dealer book — not just one dealer. Only answer using the data given below — never invent figures, and say so plainly if something asked isn't in the data provided. ${LANGUAGE_INSTRUCTION}\n\n${context}`;
}

export async function askAi(systemPrompt, history) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        system: systemPrompt,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const json = await res.json();
    return json.content?.[0]?.text || "Sorry, I couldn't get a response.";
  } catch {
    return "Error connecting to AI assistant — check your connection and try again.";
  }
}
