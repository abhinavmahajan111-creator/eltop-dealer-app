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
  ghost:  [185, 160, 200],  // muted on dark bg
};

// ── Canvas helpers ─────────────────────────────────────────────────────────

// Crop an image to its top `frac` fraction (for half-body mascot)
async function fetchCropTop(url, frac = 0.62) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cropH = Math.floor(img.naturalHeight * frac);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = cropH;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Remove near-white background from a logo so it renders cleanly on coloured bg.
// Near-white pixels (R,G,B all > 220) become transparent; others stay as-is.
async function fetchRemoveBg(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
        if (r > 220 && g > 220 && b > 220) {
          // Scale alpha: pure white → 0, edge pixels → partial
          const whiteness = Math.min(r, g, b);
          const alpha = Math.round(255 * (1 - (whiteness - 220) / 35));
          d.data[i + 3] = Math.max(0, Math.min(d.data[i + 3], alpha));
        }
      }
      ctx.putImageData(d, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Fetch any URL as a base64 data URL (for product images)
async function fetchB64(url) {
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

// ── Product image helpers ──────────────────────────────────────────────────

function getFirstImageUrl(p) {
  let urls = p.image_urls;
  if (urls != null) {
    if (typeof urls === 'string') { try { urls = JSON.parse(urls); } catch {} }
    if (Array.isArray(urls) && urls.length > 0) return urls[0];
    if (typeof urls === 'string' && urls.length > 0) return urls;
  }
  return p.image_url || null;
}

function imgFmt(b64) {
  if (!b64) return 'JPEG';
  if (b64.startsWith('data:image/png'))  return 'PNG';
  if (b64.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

// ── Formatting ─────────────────────────────────────────────────────────────

function inr(val) {
  const n = Number(val);
  return isNaN(n) || val == null ? '-' : 'Rs.' + n.toLocaleString('en-IN');
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {'customer'|'dealer'|'admin'} opts.role
 * @param {Array<{id:number,pct:number}>} opts.discountCols  - admin only
 * @param {boolean} opts.includeDiscountCols
 */
export async function generatePriceListPDF({ role = 'customer', discountCols = [], includeDiscountCols = false }) {
  // 1. Fetch products (include image fields for the image column)
  const { data, error } = await supabase
    .from('products')
    .select('id, name, mrp, dlp, price, standard_packing, unit, hsn_code, category, image_urls, image_url')
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

  // 3. Pre-fetch all product images in parallel (best-effort; failures silently skipped)
  const imageMap = new Map();
  await Promise.all(products.map(async (p) => {
    const url = getFirstImageUrl(p);
    if (!url) return;
    const b64 = await fetchB64(url);
    if (b64) imageMap.set(p.id, b64);
  }));

  // 4. Fetch header brand assets in parallel
  const origin = window.location.origin;
  const [eltopLogo, fanmanHalf] = await Promise.all([
    fetchRemoveBg(origin + '/assets/ELTOP%20LOGO.png'),      // white bg → transparent
    fetchCropTop(origin + '/assets/fan%20man%20eltop.png', 0.62), // upper half only
  ]);

  // 5. PDF document setup (A4 portrait)
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const PW  = 210;   // page width mm
  const PH  = 297;   // page height mm
  const HDR = 28;    // header height mm
  const ML  = 12;    // margin left
  const MR  = 12;    // margin right
  const CW  = PW - ML - MR;  // 186mm content width

  // Product image column dimensions
  const IMG_COL_W = 20;  // column width in mm
  const IMG_SIZE  = 16;  // rendered image size (square) in mm
  const ROW_MIN_H = 20;  // min row height to accommodate the image

  // ── Per-page drawers ──────────────────────────────────────────────────────

  function drawHeader() {
    // Purple bar
    doc.setFillColor(...C.dark);
    doc.rect(0, 0, PW, HDR, 'F');

    // Fanman half-body at LEFT edge (thumbs-up hand points right into content)
    if (fanmanHalf) {
      const fanW = 30;  // mm wide
      // Position slightly left of ML so it bleeds to the edge naturally
      doc.addImage(fanmanHalf, 'PNG', ML - 6, 0, fanW, HDR, 'fanman', 'FAST');
    }

    // ELTOP LOGO (white bg removed → red on purple) after fanman
    const logoX = ML + 26;
    if (eltopLogo) {
      // Logo aspect ≈ 3.5 : 1 → at 52mm wide → ~15mm tall; center vertically
      const logoW = 52;
      const logoH = 15;
      const logoY = (HDR - logoH) / 2;
      doc.addImage(eltopLogo, 'PNG', logoX, logoY, logoW, logoH, 'eltop-logo', 'FAST');
    } else {
      // Fallback text if asset couldn't be loaded
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...C.white);
      doc.text('ELTOP', logoX, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('BY EMBASSY', logoX, 18.5);
    }

    // "PRICE LIST" subtitle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text('PRICE LIST', logoX, HDR - 4);

    // Date — right-aligned
    const dt = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.ghost);
    doc.text(dt, PW - MR, HDR - 4, { align: 'right' });
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
    doc.text(`${pageNum} / ${totalPages}`, PW - MR, fy + 9.5, { align: 'right' });
  }

  // 6. Column definitions (Image is always first)
  const showDLP  = role !== 'customer';
  const showDisc = role === 'admin' && includeDiscountCols && discountCols.length > 0;

  // Fixed widths
  const packW = 20;
  const mrpW  = 22;
  const dlpW  = showDLP  ? 22 : 0;
  const hsnW  = 22;
  const discW = showDisc ? discountCols.length * 21 : 0;
  const itemW = Math.max(35, CW - IMG_COL_W - packW - mrpW - dlpW - hsnW - discW);

  // Column headers (all center-aligned via headStyles.halign below)
  const colHeaders = ['', 'Item', 'Packing', 'MRP'];
  if (showDLP)  colHeaders.push('DLP');
  colHeaders.push('HSN Code');
  if (showDisc) discountCols.forEach(dc => colHeaders.push(`${dc.pct}% off`));

  // Column styles
  const colStyles = {};
  let ci = 0;
  colStyles[ci++] = { cellWidth: IMG_COL_W, halign: 'center', valign: 'middle' }; // Image
  colStyles[ci++] = { cellWidth: itemW,     halign: 'left',   valign: 'middle' }; // Item name
  colStyles[ci++] = { cellWidth: packW,     halign: 'center', valign: 'middle' }; // Packing
  colStyles[ci++] = { cellWidth: mrpW,      halign: 'center', valign: 'middle' }; // MRP
  if (showDLP)  colStyles[ci++] = { cellWidth: dlpW, halign: 'center', valign: 'middle' };
  colStyles[ci++] = { cellWidth: hsnW,  halign: 'center', valign: 'middle' }; // HSN
  if (showDisc) discountCols.forEach(() => { colStyles[ci++] = { cellWidth: 21, halign: 'center', valign: 'middle' }; });

  // Build a data row for one product ('') = image cell placeholder
  function buildRow(p) {
    const row = ['', p.name || '-', p.standard_packing ? `${p.standard_packing} pcs` : '-', inr(p.mrp)];
    if (showDLP)  row.push(inr(p.dlp ?? p.price));
    row.push(p.hsn_code || '-');
    if (showDisc) {
      const dlp = Number(p.dlp ?? p.price ?? 0);
      discountCols.forEach(dc => row.push(dlp > 0 ? inr(Math.round(dlp * (1 - dc.pct / 100))) : '-'));
    }
    return row;
  }

  // 7. First page header
  drawHeader();
  let y = HDR + 5;

  // Customer 15% discount banner
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

  // 8. Render each category
  for (const [cat, items] of catMap) {
    if (!items.length) continue;

    // Page overflow check — need space for pill + table header + at least one image row
    if (y > PH - 13 - 42) {
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

    // Render product table for this category
    autoTable(doc, {
      head: [colHeaders],
      body: items.map(buildRow),
      startY: y,
      theme: 'plain',
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
        textColor: C.ink,
        font: 'helvetica',
        overflow: 'linebreak',
        lineColor: [220, 205, 235],
        lineWidth: 0.1,
        minCellHeight: ROW_MIN_H,
        valign: 'middle',
      },
      headStyles: {
        fillColor: C.lavLt,
        textColor: C.dark,
        fontStyle: 'bold',
        fontSize: 7,
        lineWidth: 0,
        halign: 'center',     // ALL headers center-aligned
        minCellHeight: 8,     // header rows are shorter than body rows
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: C.strip },
      columnStyles: colStyles,
      margin: { left: ML, right: MR, top: HDR + 5, bottom: 17 },
      tableWidth: CW,

      // Draw page header when autotable paginates to a new page
      willDrawPage: (data) => {
        if (data.pageNumber > 1) drawHeader();
      },

      // Draw product image in the first column of each body row
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return;
        const p = items[data.row.index];
        if (!p) return;
        const b64 = imageMap.get(p.id);
        if (!b64) return;
        // Centre the image within the cell
        const sz = Math.min(IMG_SIZE, data.cell.height - 3, data.cell.width - 3);
        const ix = data.cell.x + (data.cell.width  - sz) / 2;
        const iy = data.cell.y + (data.cell.height - sz) / 2;
        try {
          doc.addImage(b64, imgFmt(b64), ix, iy, sz, sz, `prod-${p.id}`, 'FAST');
        } catch { /* silently skip if image can't be embedded */ }
      },
    });

    y = doc.lastAutoTable.finalY + 5;
  }

  // 9. Terms & Conditions section
  if (y > PH - 13 - 55) {
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

  // 10. Footer + page numbers on every page
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // 11. Save PDF
  const label = role === 'customer' ? 'Customer' : role === 'dealer' ? 'Dealer' : 'Admin';
  doc.save(`Eltop-Price-List-${label}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
