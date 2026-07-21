import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';

// Brand colours (RGB)
const C = {
  dark:   [107, 58, 115],   // #6B3A73
  med:    [150, 85, 158],   // #96559E
  lavLt:  [240, 228, 253],  // light lavender for table header
  strip:  [248, 244, 252],  // alternate row tint
  white:  [255, 255, 255],
  ink:    [34,  34,  34],
  ghost:  [190, 165, 205],  // muted on dark bg
};

async function fetchBase64(url) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror   = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function inr(val) {
  const n = Number(val);
  return isNaN(n) || val == null ? '-' : 'Rs.' + n.toLocaleString('en-IN');
}

/**
 * @param {object} opts
 * @param {'customer'|'dealer'|'admin'} opts.role
 * @param {Array<{id:number,pct:number}>} opts.discountCols  - admin only
 * @param {boolean} opts.includeDiscountCols
 */
export async function generatePriceListPDF({ role = 'customer', discountCols = [], includeDiscountCols = false }) {
  // 1. Fetch fresh products from Supabase
  const { data, error } = await supabase
    .from('products')
    .select('id, name, mrp, dlp, price, standard_packing, unit, hsn_code, category')
    .order('category', { nullsFirst: false })
    .order('name');

  if (error) throw new Error('Could not load products: ' + error.message);
  const products = data || [];

  // 2. Group by category (uppercase)
  const catMap = new Map();
  for (const p of products) {
    const cat = (p.category || 'OTHERS').toUpperCase();
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(p);
  }

  // 3. PDF setup
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const PW = 210;   // page width mm
  const PH = 297;   // page height mm
  const HDR = 26;   // header height
  const ML  = 12;   // margin left
  const MR  = 12;   // margin right
  const CW  = PW - ML - MR;  // content width = 186mm

  // 4. Fetch fanman mascot
  const fanman = await fetchBase64(window.location.origin + '/assets/fan%20man%20eltop.png');

  // ── Helpers ────────────────────────────────────────────────────────────────

  function drawHeader() {
    doc.setFillColor(...C.dark);
    doc.rect(0, 0, PW, HDR, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.white);
    doc.text('ELTOP', ML, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('BY EMBASSY', ML, 15.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('PRICE LIST', ML, 21);

    const dt = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.ghost);
    doc.text(dt, ML + 39, 21);

    // Fanman
    if (fanman) {
      doc.setFillColor(118, 64, 128);
      doc.rect(PW - 32, 0, 32, HDR, 'F');
      doc.addImage(fanman, 'PNG', PW - 31, 0, 26, HDR, undefined, 'FAST');
    }
  }

  function drawFooter(pageNum, totalPages) {
    const fy = PH - 13;
    doc.setFillColor(...C.dark);
    doc.rect(0, fy, PW, 13, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('EMBASSY ELECTRICALS', ML, fy + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...C.ghost);
    doc.text('Prices subject to change without prior notice  |  All prices inclusive of applicable taxes', ML, fy + 9.5);

    doc.setTextColor(...C.white);
    doc.text(`${pageNum} / ${totalPages}`, PW - ML - 10, fy + 9.5, { align: 'right' });
  }

  // 5. Column setup
  const showDLP  = role !== 'customer';
  const showDisc = role === 'admin' && includeDiscountCols && discountCols.length > 0;

  const colHeaders = ['Item', 'Packing', 'MRP'];
  if (showDLP) colHeaders.push('DLP');
  colHeaders.push('HSN Code');
  if (showDisc) discountCols.forEach(dc => colHeaders.push(`${dc.pct}% off`));

  // Fixed widths: Packing=22, MRP=24, DLP=24, HSN=25, each disc=23
  const fixedW = 22 + 24 + (showDLP ? 24 : 0) + 25 + (showDisc ? discountCols.length * 23 : 0);
  const itemW  = Math.max(CW - fixedW, 45);

  const colStyles = { 0: { cellWidth: itemW, halign: 'left' } };
  let ci = 1;
  colStyles[ci++] = { cellWidth: 22, halign: 'center' };  // Packing
  colStyles[ci++] = { cellWidth: 24, halign: 'right'  };  // MRP
  if (showDLP)  colStyles[ci++] = { cellWidth: 24, halign: 'right' };   // DLP
  colStyles[ci++] = { cellWidth: 25, halign: 'center' };  // HSN
  if (showDisc) discountCols.forEach(() => { colStyles[ci++] = { cellWidth: 23, halign: 'right' }; });

  function buildRow(p) {
    const dlp = Number(p.dlp ?? p.price ?? 0);
    const row = [
      p.name || '-',
      p.standard_packing ? String(p.standard_packing) + ' pcs' : '-',
      inr(p.mrp),
    ];
    if (showDLP)  row.push(inr(p.dlp ?? p.price));
    row.push(p.hsn_code || '-');
    if (showDisc) discountCols.forEach(dc => {
      row.push(dlp > 0 ? inr(Math.round(dlp * (1 - dc.pct / 100))) : '-');
    });
    return row;
  }

  // 6. Draw first page
  drawHeader();
  let y = HDR + 5;

  // Customer discount note banner
  if (role === 'customer') {
    doc.setFillColor(...C.lavLt);
    doc.roundedRect(ML, y, CW, 11, 2, 2, 'F');
    doc.setFillColor(...C.dark);
    doc.rect(ML, y, 2.5, 11, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    doc.text('Login karke order karne par is price list par 15% discount milta hai!', ML + 5, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.med);
    doc.text('Register / Login at our dealer portal to get exclusive discounts on every order.', ML + 5, y + 8.5);

    y += 15;
  }

  // 7. Render categories
  for (const [cat, items] of catMap) {
    if (!items.length) continue;

    // Overflow check — need space for pill + table header + at least 1 row
    if (y > PH - 13 - 35) {
      doc.addPage();
      drawHeader();
      y = HDR + 5;
    }

    // Category pill
    doc.setFillColor(...C.dark);
    doc.roundedRect(ML, y, CW, 6.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(cat, ML + 3, y + 4.6);
    y += 9;

    // Table
    autoTable(doc, {
      head: [colHeaders],
      body: items.map(buildRow),
      startY: y,
      theme: 'plain',
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
        textColor: C.ink,
        font: 'helvetica',
        overflow: 'linebreak',
        lineColor: [220, 205, 235],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: C.lavLt,
        textColor: C.dark,
        fontStyle: 'bold',
        fontSize: 7,
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: C.strip },
      columnStyles: colStyles,
      margin: { left: ML, right: MR, top: HDR + 5, bottom: 17 },
      tableWidth: CW,
      willDrawPage: (data) => {
        if (data.pageNumber > 1) drawHeader();
      },
    });

    y = doc.lastAutoTable.finalY + 5;
  }

  // 8. Terms & Conditions
  if (y > PH - 13 - 50) {
    doc.addPage();
    drawHeader();
    y = HDR + 5;
  }

  doc.setFillColor(...C.dark);
  doc.roundedRect(ML, y, CW, 6.5, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.white);
  doc.text('TERMS & CONDITIONS', ML + 3, y + 4.6);
  y += 11;

  const terms = [
    'All prices are inclusive of applicable GST unless stated otherwise.',
    'Prices are subject to change without prior notice.',
    'Goods supplied in standard packing only — no part packing.',
    'Payment terms as per agreement with Embassy Electricals.',
    'Goods once sold will not be taken back without prior approval.',
    'All disputes are subject to Delhi jurisdiction.',
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.ink);
  for (const t of terms) {
    doc.text('*  ' + t, ML + 2, y);
    y += 4.5;
  }

  // 9. Footer + page numbers on every page
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // 10. Save
  const label = role === 'customer' ? 'Customer' : role === 'dealer' ? 'Dealer' : 'Admin';
  doc.save(`Eltop-Price-List-${label}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
