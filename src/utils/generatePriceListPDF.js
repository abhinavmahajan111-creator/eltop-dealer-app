import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';

// Brand colours (RGB)
const C = {
  dark:  [107, 58, 115],   // #6B3A73
  med:   [150, 85, 158],   // #96559E
  lavLt: [240, 228, 253],  // light lavender for table header
  strip: [248, 244, 252],  // alternate row tint
  white: [255, 255, 255],
  ink:   [34,  34,  34],
  ghost: [185, 160, 200],  // muted on dark bg
};

// ── Canvas helpers ─────────────────────────────────────────────────────────

// Crop image to upper `frac` fraction (for half-body mascot in header)
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

// Convert logo to pure white on transparent background:
//   - Near-white pixels (R,G,B all > 220) → transparent (remove background)
//   - All other visible pixels → white (so red/black text becomes white on coloured bg)
async function fetchLogoWhite(url) {
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
        const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2], a = d.data[i + 3];
        if (a < 10) continue; // already transparent
        const brightness = (r + g + b) / 3;
        if (brightness > 220) {
          // Near-white → fade to transparent (soft edge for anti-aliasing)
          d.data[i + 3] = Math.round(a * (1 - (brightness - 220) / 35));
        } else {
          // Any coloured pixel (red, black, etc.) → turn pure white
          d.data[i]     = 255;
          d.data[i + 1] = 255;
          d.data[i + 2] = 255;
        }
      }
      ctx.putImageData(d, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Fetch any URL as base64 data URL (used for product thumbnails)
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
  // 1. Fetch products (image fields included for thumbnail column)
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

  // 3. Pre-fetch all product images in parallel (failures silently skipped)
  const imageMap = new Map();
  await Promise.all(products.map(async (p) => {
    const url = getFirstImageUrl(p);
    if (!url) return;
    const b64 = await fetchB64(url);
    if (b64) imageMap.set(p.id, b64);
  }));

  // 4. Fetch header brand assets in parallel
  //    - eltopLogo:   ELTOP LOGO.png → white text on transparent bg
  //    - fanmanHalf:  fan man eltop.png → cropped to upper 62% (half-body)
  //    - fanmanFull:  fan man eltop.png → full body for watermark
  const origin = window.location.origin;
  const [eltopLogo, fanmanHalf, fanmanFull] = await Promise.all([
    fetchLogoWhite(origin + '/assets/ELTOP%20LOGO.png'),
    fetchCropTop(origin + '/assets/fan%20man%20eltop.png', 0.62),
    fetchB64(origin + '/assets/fan%20man%20eltop.png'),
  ]);

  // 5. PDF document setup (A4 portrait)
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const PW  = 210;   // page width mm
  const PH  = 297;   // page height mm
  const HDR = 28;    // header height mm
  const ML  = 12;    // margin left/right
  const MR  = 12;
  const CW  = PW - ML - MR;   // 186mm content width

  // Product image column
  const IMG_COL_W = 20;  // column width mm
  const IMG_SIZE  = 15;  // rendered image size (square) mm — fixed, independent of cell height

  // ── Per-page drawers ──────────────────────────────────────────────────────

  function drawHeader() {
    // Purple bar
    doc.setFillColor(...C.dark);
    doc.rect(0, 0, PW, HDR, 'F');

    // Fanman half-body at LEFT edge (his character-left/thumbs-up hand faces right → into content)
    if (fanmanHalf) {
      const fanW = 28;
      doc.addImage(fanmanHalf, 'PNG', ML - 5, 0, fanW, HDR, 'fanman-hdr', 'FAST');
    }

    // ELTOP LOGO (white on transparent) — horizontally centred in the full header
    const logoW = 52;
    const logoH = 14; // ELTOP LOGO aspect ≈ 3.7:1 → 52mm wide → ~14mm tall
    const logoX = (PW - logoW) / 2;
    const logoY = (HDR - logoH - 7) / 2; // leave room for "PRICE LIST" text below

    if (eltopLogo) {
      doc.addImage(eltopLogo, 'PNG', logoX, logoY, logoW, logoH, 'eltop-logo', 'FAST');
    } else {
      // Fallback text only if asset unavailable
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...C.white);
      doc.text('ELTOP  BY EMBASSY', PW / 2, logoY + 9, { align: 'center' });
    }

    // "PRICE LIST" label — centred below the logo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text('PRICE LIST', PW / 2, logoY + logoH + 5, { align: 'center' });

    // Date — right-aligned at bottom of header
    const dt = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.ghost);
    doc.text(dt, PW - MR, HDR - 3, { align: 'right' });
  }

  // Subtle Fanman watermark — full body, ~8% opacity, centred in content area
  function drawWatermark() {
    if (!fanmanFull) return;
    try {
      const wmW = 85;
      const wmH = 130;   // fanman full-body aspect ≈ 0.65:1
      // Centre in the content area between header and footer
      const contentMidY = HDR + (PH - 13 - HDR) / 2;
      const wmX = (PW - wmW) / 2;
      const wmY = contentMidY - wmH / 2;
      doc.setGState(doc.GState({ opacity: 0.08, 'stroke-opacity': 0.08 }));
      doc.addImage(fanmanFull, 'PNG', wmX, wmY, wmW, wmH, 'fanman-wm', 'FAST');
      doc.setGState(doc.GState({ opacity: 1, 'stroke-opacity': 1 })); // reset
    } catch { /* silently skip if GState not available */ }
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

  const packW = 20;
  const mrpW  = 22;
  const dlpW  = showDLP  ? 22 : 0;
  const hsnW  = 22;
  const discW = showDisc ? discountCols.length * 21 : 0;
  const itemW = Math.max(35, CW - IMG_COL_W - packW - mrpW - dlpW - hsnW - discW);

  const colHeaders = ['', 'Item', 'Packing', 'MRP'];
  if (showDLP)  colHeaders.push('DLP');
  colHeaders.push('HSN Code');
  if (showDisc) discountCols.forEach(dc => colHeaders.push(`${dc.pct}% off`));

  const colStyles = {};
  let ci = 0;
  colStyles[ci++] = { cellWidth: IMG_COL_W, halign: 'center', valign: 'middle' }; // Image
  colStyles[ci++] = { cellWidth: itemW,     halign: 'left',   valign: 'middle' }; // Item
  colStyles[ci++] = { cellWidth: packW,     halign: 'center', valign: 'middle' }; // Packing
  colStyles[ci++] = { cellWidth: mrpW,      halign: 'center', valign: 'middle' }; // MRP
  if (showDLP)  colStyles[ci++] = { cellWidth: dlpW, halign: 'center', valign: 'middle' };
  colStyles[ci++] = { cellWidth: hsnW, halign: 'center', valign: 'middle' };       // HSN
  if (showDisc) discountCols.forEach(() => { colStyles[ci++] = { cellWidth: 21, halign: 'center', valign: 'middle' }; });

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

  // 7. First page: header then watermark (watermark goes below header, table content on top)
  drawHeader();
  drawWatermark();
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

    // Add new page if not enough room for pill + table header + one image row
    if (y > PH - 13 - 45) {
      doc.addPage();
      drawHeader();
      drawWatermark();
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

    autoTable(doc, {
      head: [colHeaders],
      body: items.map(buildRow),
      startY: y,
      theme: 'plain',
      rowPageBreak: 'avoid',  // ROOT CAUSE FIX: never squeeze a row to fit — move whole row to next page
      styles: {
        fontSize: 7,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: C.ink,
        font: 'helvetica',
        overflow: 'linebreak',
        lineColor: [220, 205, 235],
        lineWidth: 0.1,
        minCellHeight: 19,  // ensure every row is tall enough to hold a thumbnail
        valign: 'middle',
      },
      headStyles: {
        fillColor: C.lavLt,
        textColor: C.dark,
        fontStyle: 'bold',
        fontSize: 7,
        lineWidth: 0,
        halign: 'center',
        minCellHeight: 8,
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: C.strip },
      columnStyles: colStyles,
      margin: { left: ML, right: MR, top: HDR + 5, bottom: 17 },
      tableWidth: CW,

      // On autotable-triggered page breaks, draw header + watermark before table content
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          drawHeader();
          drawWatermark();
        }
      },

      // Draw product thumbnail in image column (column 0) of every body row.
      // ROOT CAUSE FIX: image size uses IMG_SIZE and column width only — NOT data.cell.height.
      // data.cell.height can be wrong for the last row on a page (squeezed by autotable before
      // rowPageBreak:avoid kicks in), so we use a fixed size independent of cell height.
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return;
        const p = items[data.row.index];
        if (!p) return;
        const b64 = imageMap.get(p.id);
        if (!b64) return;
        // Fixed square size — never depends on cell.height so it's consistent on every row
        const sz = Math.min(IMG_SIZE, data.cell.width - 4);
        const ix = data.cell.x + (data.cell.width  - sz) / 2;
        const iy = data.cell.y + (data.cell.height - sz) / 2;
        try {
          doc.addImage(b64, imgFmt(b64), ix, iy, sz, sz, `prod-${p.id}`, 'FAST');
        } catch { /* skip silently if image can't be embedded */ }
      },
    });

    y = doc.lastAutoTable.finalY + 5;
  }

  // 9. Terms & Conditions
  if (y > PH - 13 - 55) {
    doc.addPage();
    drawHeader();
    drawWatermark();
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

  // 10. Footer on every page (drawn last so it renders on top of content and watermark)
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // 11. Save
  const label = role === 'customer' ? 'Customer' : role === 'dealer' ? 'Dealer' : 'Admin';
  doc.save(`Eltop-Price-List-${label}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
