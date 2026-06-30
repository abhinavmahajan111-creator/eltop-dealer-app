import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ── Amount in words (Indian numbering system) ─────────────────────────────────
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function toWords(n) {
  if (n === 0) return "";
  if (n < 20) return ONES[n] + " ";
  if (n < 100) return TENS[Math.floor(n / 10)] + (ONES[n % 10] ? " " + ONES[n % 10] : "") + " ";
  return ONES[Math.floor(n / 100)] + " Hundred " + toWords(n % 100);
}

function amountInWords(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return "Zero Rupees Only";
  const crore = Math.floor(n / 10000000);
  const lakh  = Math.floor((n % 10000000) / 100000);
  const thou  = Math.floor((n % 100000) / 1000);
  const rest  = n % 1000;
  let w = "";
  if (crore) w += toWords(crore) + "Crore ";
  if (lakh)  w += toWords(lakh)  + "Lakh ";
  if (thou)  w += toWords(thou)  + "Thousand ";
  if (rest)  w += toWords(rest);
  return "Rupees " + w.trim() + " Only";
}

// ── Styles (inline so they survive new-tab and print) ─────────────────────────
const s = {
  page:    { fontFamily: "Arial, sans-serif", fontSize: 12, color: "#000", maxWidth: 800, margin: "0 auto", padding: 24, background: "#fff" },
  noprint: { display: "flex", gap: 10, marginBottom: 16 },
  btn:     { padding: "8px 20px", border: "1px solid #333", borderRadius: 4, cursor: "pointer", fontSize: 13, background: "#fff" },
  btnPrint:{ padding: "8px 20px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, background: "#333", color: "#fff" },
  box:     { border: "1px solid #000", borderCollapse: "collapse", width: "100%" },
  td:      { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" },
  th:      { border: "1px solid #000", padding: "4px 6px", textAlign: "center", fontWeight: "bold", background: "#f0f0f0" },
  center:  { textAlign: "center" },
  right:   { textAlign: "right" },
  bold:    { fontWeight: "bold" },
  small:   { fontSize: 10 },
  heading: { fontSize: 16, fontWeight: "bold", textAlign: "center" },
  sub:     { fontSize: 11, textAlign: "center", color: "#333" },
};

// ── Placeholder bank details (admin can fill in real ones later) ──────────────
const BANK = {
  holder:  "Embassy Electricals (India) Pvt Ltd",
  name:    "Union Bank of India",
  branch:  "Ashok Vihar",
  acNo:    "255215130000001",
  ifsc:    "UBIN0825522",
};

const COMPANY = {
  name:    "EMBASSY ELECTRICALS (INDIA) Pvt. Ltd.",
  address: "Kh. No. 154/632, Phirni Road, Pooth Khurd, Bawana Ind. Area, Delhi - 110039",
  gstin:   "07AAGCE1173M1ZH",
  state:   "Delhi, Code: 07",
  email:   "embassyelectricindia@gmail.com",
  website: "www.EltopByEmbassy.com",
  udyam:   "UDYAM-DL-06-0006878 (MEDIUM)",
};

export default function SalesOrder() {
  const { id } = useParams();
  const [order,   setOrder]   = useState(null);
  const [items,   setItems]   = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) { setError("Supabase not configured."); setLoading(false); return; }

    Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      supabase.from("order_items").select("*, products(image_urls, sku)").eq("order_id", id),
    ]).then(async ([orderRes, itemsRes]) => {
      if (orderRes.error || !orderRes.data) { setError("Order not found."); setLoading(false); return; }
      const ord = orderRes.data;
      setOrder(ord);
      setItems(itemsRes.data || []);

      const { data: prof } = await supabase
        .from("profiles")
        .select("name, email, gstin, address, dealer_code")
        .eq("id", ord.dealer_id)
        .single();
      setProfile(prof);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading Sales Order…</div>;
  if (error)   return <div style={{ padding: 40, color: "red" }}>{error}</div>;

  const totalQty   = items.reduce((s, i) => s + i.qty, 0);
  const dateStr    = new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const voucherNo  = order.id.toUpperCase();
  const dealerName = profile?.name && profile.name !== "New Dealer" ? profile.name : profile?.email || "—";

  // Per-line GST calculations (Net Rate is GST-inclusive at 18%)
  const grossTotal  = items.reduce((s, it) => s + Number(it.net_rate ?? it.price) * it.qty, 0);
  const totalBasic  = items.reduce((s, it) => s + (Number(it.net_rate ?? it.price) / 1.18) * it.qty, 0);
  const totalCgst   = totalBasic * 0.09;
  const totalSgst   = totalBasic * 0.09;
  const grandTotal  = Math.round(grossTotal);
  const roundingOff = grandTotal - grossTotal;

  return (
    <div style={s.page}>
      {/* ── Toolbar (hidden on print) ── */}
      <div style={s.noprint} className="so-noprint">
        <button style={s.btnPrint} onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button style={s.btn} onClick={() => window.close()}>✕ Close</button>
      </div>

      {/* ── Header ── */}
      <table style={{ ...s.box, marginBottom: 0 }}>
        <tbody>
          <tr>
            <td style={{ ...s.td, width: "50%", borderRight: "1px solid #000" }}>
              <div style={{ fontSize: 15, fontWeight: "bold" }}>{COMPANY.name}</div>
              <div style={s.small}>{COMPANY.address}</div>
              <div style={s.small}>GSTIN/UIN: {COMPANY.gstin}</div>
              <div style={s.small}>State: {COMPANY.state}</div>
              <div style={s.small}>{COMPANY.email} | {COMPANY.website}</div>
              <div style={s.small}>Udyam Reg. No.: {COMPANY.udyam}</div>
            </td>
            <td style={{ ...s.td, textAlign: "center", borderLeft: "none" }}>
              <div style={{ fontSize: 18, fontWeight: "bold", letterSpacing: 2 }}>SALES ORDER</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Consignee + Order Meta ── */}
      <table style={{ ...s.box, marginTop: -1 }}>
        <tbody>
          <tr>
            {/* Consignee / Buyer */}
            <td style={{ ...s.td, width: "55%", verticalAlign: "top" }}>
              <div style={s.bold}>Consignee / Buyer</div>
              <div style={{ marginTop: 4, fontWeight: "bold" }}>{dealerName}</div>
              <div style={s.small}>{profile?.address || order.delivery_address || "—"}</div>
              <div style={s.small}>GSTIN/UIN: {profile?.gstin || "—"}</div>
              <div style={s.small}>State: —</div>
              <div style={s.small}>Dealer Code: {profile?.dealer_code || "—"}</div>
              <div style={s.small}>Email: {profile?.email || "—"}</div>
            </td>

            {/* Order meta */}
            <td style={{ ...s.td, verticalAlign: "top" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {[
                    ["Voucher No.",          voucherNo.slice(0, 13) + "…"],
                    ["Dated",                dateStr],
                    ["Mode of Payment",      "Credit"],
                    ["Buyer's Ref / Order No.", "—"],
                    ["Dispatched through",   "—"],
                    ["Destination",          order.delivery_address?.split(",").slice(-1)[0]?.trim() || "—"],
                    ["Terms of Delivery",    "Ex-Warehouse"],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td style={{ paddingRight: 6, color: "#555", whiteSpace: "nowrap" }}>{label}</td>
                      <td style={{ fontWeight: "bold" }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Items Table ── */}
      <table style={{ ...s.box, marginTop: -1 }}>
        <thead>
          <tr>
            {["Sl No", "Description of Goods", "Qty", "MRP", "DLP", "Disc %", "Net Rate", "Amount"].map((h) => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const thumb    = item.products?.image_urls?.[0];
            const netRate  = Number(item.net_rate ?? item.price);
            const dlp      = Number(item.dlp ?? item.price);
            const mrp      = item.mrp != null ? Number(item.mrp) : null;
            const d1       = item.discount1 != null ? Number(item.discount1) : null;
            const d2       = item.discount2 != null ? Number(item.discount2) : null;
            const discStr  = d1 != null
              ? (d2 ? `${d1}% + ${d2}%` : `${d1}%`)
              : "—";
            const lineAmt  = netRate * item.qty;
            return (
              <tr key={item.id}>
                <td style={{ ...s.td, ...s.center }}>{i + 1}</td>
                <td style={s.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {thumb && (
                      <img src={thumb} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0, border: "1px solid #eee" }} />
                    )}
                    <div>
                      <div style={s.bold}>{item.name}</div>
                      {item.hsn_code && <div style={s.small}>HSN: {item.hsn_code}</div>}
                      {item.products?.sku && <div style={s.small}>SKU: {item.products.sku}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ ...s.td, ...s.center }}>{item.qty}</td>
                <td style={{ ...s.td, ...s.right }}>{mrp != null ? `₹${mrp.toLocaleString("en-IN")}` : "—"}</td>
                <td style={{ ...s.td, ...s.right }}>₹{dlp.toLocaleString("en-IN")}</td>
                <td style={{ ...s.td, ...s.center }}>{discStr}</td>
                <td style={{ ...s.td, ...s.right }}>₹{netRate.toFixed(2)}</td>
                <td style={{ ...s.td, ...s.right }}>₹{lineAmt.toFixed(2)}</td>
              </tr>
            );
          })}

          {/* Padding rows */}
          {items.length < 7 &&
            Array.from({ length: 7 - items.length }).map((_, i) => (
              <tr key={`pad-${i}`}>
                {Array.from({ length: 8 }).map((__, j) => <td key={j} style={s.td}>&nbsp;</td>)}
              </tr>
            ))}
        </tbody>

        <tfoot>
          <tr>
            <td style={{ ...s.td, ...s.bold }} colSpan={2}>Total</td>
            <td style={{ ...s.td, ...s.center, ...s.bold }}>{totalQty}</td>
            <td style={s.td}></td><td style={s.td}></td><td style={s.td}></td><td style={s.td}></td>
            <td style={{ ...s.td, ...s.right, ...s.bold }}>
              ₹{grossTotal.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── Amount in words ── */}
      <table style={{ ...s.box, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={s.td}>
              <span style={s.bold}>Amount Chargeable (in words): </span>
              <span style={{ fontStyle: "italic" }}>{amountInWords(grandTotal)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── GST Breakup ── */}
      <table style={{ ...s.box, marginTop: -1 }}>
        <thead>
          <tr>
            <th style={s.th}>HSN/SAC</th>
            <th style={s.th}>Taxable Value</th>
            <th style={s.th}>CGST Rate</th>
            <th style={s.th}>CGST Amt</th>
            <th style={s.th}>SGST Rate</th>
            <th style={s.th}>SGST Amt</th>
            <th style={s.th}>Total Tax</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const groups = {};
            items.forEach((it) => {
              const hsn = it.hsn_code || "—";
              if (!groups[hsn]) groups[hsn] = 0;
              groups[hsn] += (Number(it.net_rate ?? it.price) / 1.18) * it.qty;
            });
            return Object.entries(groups).map(([hsn, basic]) => {
              const cgst = basic * 0.09;
              const sgst = basic * 0.09;
              return (
                <tr key={hsn}>
                  <td style={{ ...s.td, ...s.center }}>{hsn}</td>
                  <td style={{ ...s.td, ...s.right }}>₹{basic.toFixed(2)}</td>
                  <td style={{ ...s.td, ...s.center }}>9%</td>
                  <td style={{ ...s.td, ...s.right }}>₹{cgst.toFixed(2)}</td>
                  <td style={{ ...s.td, ...s.center }}>9%</td>
                  <td style={{ ...s.td, ...s.right }}>₹{sgst.toFixed(2)}</td>
                  <td style={{ ...s.td, ...s.right }}>₹{(cgst + sgst).toFixed(2)}</td>
                </tr>
              );
            });
          })()}
          <tr style={{ background: "#f5f5f5" }}>
            <td style={{ ...s.td, ...s.bold }}>Total</td>
            <td style={{ ...s.td, ...s.right, ...s.bold }}>₹{totalBasic.toFixed(2)}</td>
            <td style={s.td}></td>
            <td style={{ ...s.td, ...s.right, ...s.bold }}>₹{totalCgst.toFixed(2)}</td>
            <td style={s.td}></td>
            <td style={{ ...s.td, ...s.right, ...s.bold }}>₹{totalSgst.toFixed(2)}</td>
            <td style={{ ...s.td, ...s.right, ...s.bold }}>₹{(totalCgst + totalSgst).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Grand Total with rounding ── */}
      <table style={{ ...s.box, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={s.td} rowSpan={3}>
              <span style={s.bold}>Amount Chargeable (in words):</span><br />
              <span style={{ fontStyle: "italic" }}>{amountInWords(grandTotal)}</span>
            </td>
            <td style={{ ...s.td, width: 160 }}>Sum Total</td>
            <td style={{ ...s.td, ...s.right, width: 120 }}>₹{grossTotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td style={s.td}>Rounding Off</td>
            <td style={{ ...s.td, ...s.right }}>{roundingOff >= 0 ? "+" : ""}₹{roundingOff.toFixed(2)}</td>
          </tr>
          <tr>
            <td style={{ ...s.td, ...s.bold, background: "#f0f0f0" }}>Grand Total</td>
            <td style={{ ...s.td, ...s.right, ...s.bold, fontSize: 14, background: "#f0f0f0" }}>
              ₹{grandTotal.toLocaleString("en-IN")}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Footer: Bank + Signature ── */}
      <table style={{ ...s.box, marginTop: -1 }}>
        <tbody>
          <tr>
            <td style={{ ...s.td, width: "60%", verticalAlign: "top" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={s.bold}>Company's Bank Details</div>
                  <table style={{ marginTop: 6, fontSize: 11, borderCollapse: "collapse" }}>
                    <tbody>
                      {[
                        ["A/c Holder",  BANK.holder],
                        ["Bank Name",   BANK.name],
                        ["Branch",      BANK.branch],
                        ["A/c No.",     BANK.acNo],
                        ["IFS Code",    BANK.ifsc],
                      ].map(([l, v]) => (
                        <tr key={l}>
                          <td style={{ paddingRight: 10, color: "#555" }}>{l}:</td>
                          <td style={s.bold}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <img src="/assets/upi-qr.png" alt="UPI QR" style={{ width: 120, height: 120, display: "block" }} />
                  <div style={{ ...s.small, marginTop: 2 }}>Scan to Pay</div>
                </div>
              </div>
            </td>
            <td style={{ ...s.td, textAlign: "center", verticalAlign: "bottom", paddingTop: 20 }}>
              <div>for <strong>{COMPANY.name}</strong></div>
              <div style={{ position: "relative", height: 100, margin: "8px auto 0", width: 120 }}>
                <img
                  src="/assets/company-stamp.png"
                  alt="Company Stamp"
                  style={{ width: 110, height: 110, objectFit: "contain", position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", mixBlendMode: "multiply", opacity: 1, filter: "contrast(3) brightness(0.25) saturate(2)" }}
                />
              </div>
              <div style={{ borderTop: "1px solid #000", paddingTop: 4, marginTop: 4 }}>
                Authorised Signatory
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ ...s.td, ...s.center, ...s.small, background: "#f9f9f9" }}>
              This is a Computer Generated Document
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Print-only CSS injected via style tag ── */}
      <style>{`
        @media print {
          .so-noprint { display: none !important; }
          body { margin: 0; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
