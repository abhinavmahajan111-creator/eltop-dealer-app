import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';

// Brand colours (RGB)
const C = {
  dark:  [107, 58, 115],   // #6B3A73
  med:   [150, 85, 158],   // #96559E
  lavLt: [240, 228, 253],  // light lavender
  strip: [248, 244, 252],  // alternate row tint
  white: [255, 255, 255],
  ink:   [34,  34,  34],
  ghost: [185, 160, 200],  // muted on dark bg
};

// Company data (sourced from Store.jsx footer — single source of truth)
const COMPANY = {
  name:     'Embassy Electricals (India) Pvt. Ltd.',
  line1:    'Kh. No. 154/632, Phirni Road,',
  line2:    'Pooth Khurd, Bawana Ind. Area, Delhi - 110039',
  phone:    '+91 93101 59139',
  tollfree: '1800-123-0906',
  whatsapp: '+91 93101 59139',
  email:    'embassyelectricindia@gmail.com',
  gstin:    '07AAGCE1173M1ZH',
  udyam:    'UDYAM-DL-06-0006878',
  website:  'www.EltopByEmbassy.com',
};

// ── Canvas helpers ─────────────────────────────────────────────────────────

// Crop image to top `frac` fraction (half-body mascot for header)
async function fetchCropTop(url, frac = 0.62) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const h = Math.floor(img.naturalHeight * frac);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Convert logo to white-on-transparent:
//   near-white pixels → transparent (bg removal)
//   all other pixels  → pure white (so red/black text becomes white on coloured bg)
async function fetchLogoWhite(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const r = d.data[i], g = d.data[i+1], b = d.data[i+2], a = d.data[i+3];
        if (a < 10) continue;
        const bright = (r + g + b) / 3;
        if (bright > 220) {
          d.data[i+3] = Math.round(a * (1 - (bright - 220) / 35)); // fade to transparent
        } else {
          d.data[i] = d.data[i+1] = d.data[i+2] = 255; // coloured → white
        }
      }
      ctx.putImageData(d, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Fetch any URL as base64 (for product thumbnails)
async function fetchB64(url) {
  try {
    const blob = await fetch(url).then(r => r.blob());
    return new Promise(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.onerror   = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Misc helpers ───────────────────────────────────────────────────────────

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

function inr(val) {
  const n = Number(val);
  return isNaN(n) || val == null ? '-' : 'Rs.' + n.toLocaleString('en-IN');
}

function setGS(doc, opacity) {
  try { doc.setGState(doc.GState({ opacity, 'stroke-opacity': opacity })); } catch {}
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {'customer'|'dealer'|'admin'} opts.role
 * @param {Array<{id:number,pct:number}>} opts.discountCols
 * @param {boolean} opts.includeDiscountCols
 */
export async function generatePriceListPDF({ role = 'customer', discountCols = [], includeDiscountCols = false, returnBlob = false }) {
  // 1. Fetch products
  const { data, error } = await supabase
    .from('products')
    .select('id, name, mrp, dlp, price, standard_packing, unit, hsn_code, category, image_urls, image_url')
    .order('category', { nullsFirst: false })
    .order('name');
  if (error) throw new Error('Could not load products: ' + error.message);
  const products = data || [];

  // 2. Group by category
  const catMap = new Map();
  for (const p of products) {
    const cat = (p.category || 'OTHERS').toUpperCase();
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(p);
  }

  // 3. Pre-fetch all thumbnails in parallel
  const imageMap = new Map();
  await Promise.all(products.map(async p => {
    const url = getFirstImageUrl(p);
    if (!url) return;
    const b64 = await fetchB64(url);
    if (b64) imageMap.set(p.id, b64);
  }));

  // 4. Fetch brand assets
  const origin = window.location.origin;
  const [eltopLogo, fanmanHalf, fanmanFull] = await Promise.all([
    fetchLogoWhite(origin + '/assets/ELTOP%20LOGO.png'),
    fetchCropTop(origin + '/assets/fan%20man%20eltop.png', 0.62),
    fetchB64(origin + '/assets/fan%20man%20eltop.png'),
  ]);

  // 5. PDF setup
  const doc  = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const PW   = 210;
  const PH   = 297;
  const HDR  = 28;
  const ML   = 12;
  const MR   = 12;
  const CW   = PW - ML - MR;  // 186mm
  const IMG_COL_W = 20;
  const IMG_SIZE  = 15;

  // ── Page drawers ───────────────────────────────────────────────────────────

  // Content-page header: Fanman + "PRICE LIST" grouped LEFT, logo CENTERED, date RIGHT
  function drawHeader() {
    doc.setFillColor(...C.dark);
    doc.rect(0, 0, PW, HDR, 'F');

    // Fanman half-body at left edge (character's left hand / thumbs-up points right into content)
    if (fanmanHalf) {
      doc.addImage(fanmanHalf, 'PNG', ML - 5, 0, 28, HDR, 'fanman-hdr', 'FAST');
    }

    // "PRICE LIST" label — grouped with Fanman at bottom-left of header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('PRICE LIST', ML, HDR - 3.5);

    // ELTOP LOGO (white) — horizontally centred in the full header
    const logoW = 52;
    const logoH = 14;  // aspect ≈ 3.7:1
    const logoX = (PW - logoW) / 2;
    const logoY = (HDR - logoH) / 2;
    if (eltopLogo) {
      doc.addImage(eltopLogo, 'PNG', logoX, logoY, logoW, logoH, 'eltop-logo', 'FAST');
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...C.white);
      doc.text('ELTOP  BY EMBASSY', PW / 2, HDR / 2 + 3, { align: 'center' });
    }

    // Date — right-aligned bottom
    const dt = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.ghost);
    doc.text(dt, PW - MR, HDR - 3.5, { align: 'right' });
  }

  // Subtle full-body Fanman watermark centred in content area at 8% opacity
  function drawWatermark() {
    if (!fanmanFull) return;
    try {
      const wmW = 85; const wmH = 130;
      const wmX = (PW - wmW) / 2;
      const wmY = HDR + (PH - 13 - HDR) / 2 - wmH / 2;
      setGS(doc, 0.08);
      doc.addImage(fanmanFull, 'PNG', wmX, wmY, wmW, wmH, 'fanman-wm', 'FAST');
      setGS(doc, 1);
    } catch {}
  }

  // Standard footer for content pages
  function drawFooter(pageNum, totalContentPages) {
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
    doc.text(`${pageNum} / ${totalContentPages}`, PW - MR, fy + 9.5, { align: 'right' });
  }

  // COVER PAGE (page 1) — full purple, logo, RATELIST + year, 8-product collage
  function drawCoverPage() {
    const year = new Date().getFullYear();

    // Full brand-purple background
    doc.setFillColor(...C.dark);
    doc.rect(0, 0, PW, PH, 'F');

    // ELTOP LOGO — large, white, centred near top
    const cvLogoW = 72; const cvLogoH = Math.round(cvLogoW / 3.7);
    if (eltopLogo) {
      doc.addImage(eltopLogo, 'PNG', (PW - cvLogoW) / 2, 14, cvLogoW, cvLogoH, 'eltop-logo-cv', 'FAST');
    }

    // Thin divider under logo
    doc.setDrawColor(150, 120, 170);
    doc.setLineWidth(0.4);
    doc.line(ML + 20, 14 + cvLogoH + 5, PW - MR - 20, 14 + cvLogoH + 5);

    let cy = 14 + cvLogoH + 10;

    // "RATELIST" in large white bold
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.setTextColor(...C.white);
    doc.text('RATELIST', PW / 2, cy + 12, { align: 'center' });
    cy += 18;

    // Year in lavender (lighter, large)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...C.lavLt);
    doc.text(String(year), PW / 2, cy + 8, { align: 'center' });
    cy += 16;

    // 8-product collage — 4 cols × 2 rows
    const imgW = 43; const imgH = 43; const gapX = 2.7; const gapY = 3;
    const gridX = ML + (CW - 4 * imgW - 3 * gapX) / 2; // centre the grid in content width
    const collage = products.filter(p => imageMap.has(p.id)).slice(0, 8);

    collage.forEach((p, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const cx2 = gridX + col * (imgW + gapX);
      const cy2 = cy + row * (imgH + gapY);
      // Subtle white frame
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cx2, cy2, imgW, imgH, 2, 2, 'F');
      // Product image inside frame (1mm inset)
      const b64 = imageMap.get(p.id);
      if (b64) {
        try { doc.addImage(b64, imgFmt(b64), cx2 + 1, cy2 + 1, imgW - 2, imgH - 2, `cv-img-${p.id}`, 'FAST'); } catch {}
      }
    });
    cy += 2 * imgH + gapY + 10; // move past collage + small gap

    // Tagline
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...C.lavLt);
    doc.text('Fans  |  Geysers  |  Home Appliances', PW / 2, cy, { align: 'center' });
    cy += 7;

    // Website sub-line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ghost);
    doc.text(COMPANY.website, PW / 2, cy, { align: 'center' });

    // Fanman full-body — bottom-right, large
    if (fanmanFull) {
      const fW = 55; const fH = 88;
      doc.addImage(fanmanFull, 'PNG', PW - MR - fW, PH - fH - 18, fW, fH, 'fanman-cv', 'FAST');
    }

    // Company name at bottom-left
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ghost);
    doc.text(COMPANY.name, ML, PH - 18);
    doc.text(COMPANY.phone + '  |  Toll Free: ' + COMPANY.tollfree, ML, PH - 12);

    // Bottom strip
    doc.setFillColor(55, 25, 68);
    doc.rect(0, PH - 6, PW, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.ghost);
    doc.text(COMPANY.gstin + '  |  ' + COMPANY.udyam, PW / 2, PH - 2, { align: 'center' });
  }

  // BACK PAGE (last) — company info from webapp footer
  function drawBackPage() {
    // Full dark purple background
    doc.setFillColor(55, 25, 68);
    doc.rect(0, 0, PW, PH, 'F');

    let by = 18;

    // ELTOP LOGO — white, centred
    const bLogoW = 65; const bLogoH = Math.round(bLogoW / 3.7);
    if (eltopLogo) {
      doc.addImage(eltopLogo, 'PNG', (PW - bLogoW) / 2, by, bLogoW, bLogoH, 'eltop-logo-bk', 'FAST');
    }
    by += bLogoH + 8;

    // Thin divider
    doc.setDrawColor(130, 100, 150);
    doc.setLineWidth(0.3);
    doc.line(ML + 15, by, PW - MR - 15, by);
    by += 10;

    // HEAD OFFICE heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.lavLt);
    doc.text('HEAD OFFICE', PW / 2, by, { align: 'center' });
    by += 8;

    // Company name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.white);
    doc.text(COMPANY.name, PW / 2, by, { align: 'center' });
    by += 7;

    // Address
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.ghost);
    doc.text(COMPANY.line1, PW / 2, by, { align: 'center' });
    by += 5;
    doc.text(COMPANY.line2, PW / 2, by, { align: 'center' });
    by += 10;

    // Contact pills row
    const pills = [
      { label: 'Toll Free', value: COMPANY.tollfree },
      { label: 'WhatsApp', value: COMPANY.whatsapp },
    ];
    const pillW = 74; const pillH = 14; const pillGap = 6;
    const pillsStartX = (PW - (pills.length * pillW + (pills.length - 1) * pillGap)) / 2;
    pills.forEach((pill, idx) => {
      const px = pillsStartX + idx * (pillW + pillGap);
      doc.setFillColor(107, 58, 115);
      doc.roundedRect(px, by, pillW, pillH, 3, 3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...C.ghost);
      doc.text(pill.label, px + pillW / 2, by + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.white);
      doc.text(pill.value, px + pillW / 2, by + 10, { align: 'center' });
    });
    by += pillH + 9;

    // Email + GSTIN
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ghost);
    doc.text(COMPANY.email, PW / 2, by, { align: 'center' });
    by += 5.5;
    doc.text('GSTIN: ' + COMPANY.gstin + '  |  Udyam: ' + COMPANY.udyam, PW / 2, by, { align: 'center' });
    by += 5.5;
    doc.setTextColor(...C.lavLt);
    doc.text(COMPANY.website, PW / 2, by, { align: 'center' });
    by += 14;

    // Divider
    doc.setDrawColor(130, 100, 150);
    doc.setLineWidth(0.3);
    doc.line(ML + 15, by, PW - MR - 15, by);
    by += 12;

    // Fanman — centred, large
    if (fanmanFull) {
      const bFanW = 58; const bFanH = 92;
      const fanX  = (PW - bFanW) / 2;
      doc.addImage(fanmanFull, 'PNG', fanX, by, bFanW, bFanH, 'fanman-bk', 'FAST');
      by += bFanH + 10;
    }

    // Social handles (text-based)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.ghost);
    doc.text('Follow us:', PW / 2, by, { align: 'center' });
    by += 5.5;
    doc.text('@eltopbyembassy  |  youtube.com/eltop  |  instagram.com/eltopfans', PW / 2, by, { align: 'center' });
    by += 5;

    // Bottom copyright strip
    doc.setFillColor(30, 10, 40);
    doc.rect(0, PH - 10, PW, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...C.ghost);
    doc.text(
      `© ${new Date().getFullYear()} Embassy Electricals (India) Pvt. Ltd. All rights reserved.`,
      PW / 2, PH - 4, { align: 'center' }
    );
  }

  // BLANK NOTES PAGE — for printing fold padding
  function drawNotesPage() {
    doc.setFillColor(...C.strip);
    doc.rect(0, 0, PW, PH, 'F');

    // "Notes" heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.med);
    doc.text('Notes', PW / 2, 22, { align: 'center' });

    // Ruled lines
    doc.setDrawColor(205, 188, 222);
    doc.setLineWidth(0.25);
    for (let ly = 32; ly <= PH - 20; ly += 9) {
      doc.line(ML, ly, PW - MR, ly);
    }

    // Faint Eltop logo bottom-right
    if (eltopLogo) {
      setGS(doc, 0.12);
      doc.addImage(eltopLogo, 'PNG', PW - MR - 38, PH - 18, 28, 8, 'eltop-logo-notes', 'FAST');
      setGS(doc, 1);
    }
  }

  // 6. Column definitions
  const showDLP  = role !== 'customer';
  const showDisc = role === 'admin' && includeDiscountCols && discountCols.length > 0;

  const packW = 20; const mrpW = 22;
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
  colStyles[ci++] = { cellWidth: IMG_COL_W, halign: 'center', valign: 'middle' };
  colStyles[ci++] = { cellWidth: itemW,     halign: 'left',   valign: 'middle' };
  colStyles[ci++] = { cellWidth: packW,     halign: 'center', valign: 'middle' };
  colStyles[ci++] = { cellWidth: mrpW,      halign: 'center', valign: 'middle' };
  if (showDLP)  colStyles[ci++] = { cellWidth: dlpW, halign: 'center', valign: 'middle' };
  colStyles[ci++] = { cellWidth: hsnW,  halign: 'center', valign: 'middle' };
  if (showDisc) discountCols.forEach(() => { colStyles[ci++] = { cellWidth: 21, halign: 'center', valign: 'middle' }; });

  function buildRow(p) {
    const row = ['', p.name || '-', p.standard_packing ? `${p.standard_packing} pcs` : '-', inr(p.mrp)];
    if (showDLP) row.push(inr(p.dlp ?? p.price));
    row.push(p.hsn_code || '-');
    if (showDisc) {
      const dlp = Number(p.dlp ?? p.price ?? 0);
      discountCols.forEach(dc => row.push(dlp > 0 ? inr(Math.round(dlp * (1 - dc.pct / 100))) : '-'));
    }
    return row;
  }

  // ── 7. BUILD PDF ───────────────────────────────────────────────────────────

  // PAGE 1: Cover (jsPDF always starts with 1 page)
  drawCoverPage();

  // PAGE 2+: Content starts here
  doc.addPage();
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

  // Categories
  for (const [cat, items] of catMap) {
    if (!items.length) continue;

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
      rowPageBreak: 'avoid',  // never squeeze rows — move whole row to next page
      styles: {
        fontSize: 7,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: C.ink,
        font: 'helvetica',
        overflow: 'linebreak',
        lineColor: [220, 205, 235],
        lineWidth: 0.1,
        minCellHeight: 19,
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
      willDrawPage: (data) => {
        if (data.pageNumber > 1) { drawHeader(); drawWatermark(); }
      },
      // Image column — fixed size (never depends on cell.height to avoid last-row shrink bug)
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 0) return;
        const p = items[data.row.index];
        if (!p) return;
        const b64 = imageMap.get(p.id);
        if (!b64) return;
        const sz = Math.min(IMG_SIZE, data.cell.width - 4);
        const ix = data.cell.x + (data.cell.width  - sz) / 2;
        const iy = data.cell.y + (data.cell.height - sz) / 2;
        try { doc.addImage(b64, imgFmt(b64), ix, iy, sz, sz, `prod-${p.id}`, 'FAST'); } catch {}
      },
    });

    y = doc.lastAutoTable.finalY + 5;
  }

  // Terms & Conditions
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
  for (const t of terms) { doc.text('*  ' + t, ML + 2, y); y += 4.5; }

  // ── 8. PRINTING PADDING — total pages must be multiple of 4 ───────────────
  // Cover (page 1) + content pages + Notes pages + Back page = must be 4k.
  // Formula: blankNeeded = (4 - (currentTotal + 1) % 4) % 4
  // where +1 accounts for the back page we're about to add.
  const afterContent = doc.internal.getNumberOfPages(); // cover + content
  const blankNeeded  = (4 - (afterContent + 1) % 4) % 4;

  for (let b = 0; b < blankNeeded; b++) {
    doc.addPage();
    drawNotesPage();
  }

  // ── 9. BACK PAGE (always last) ────────────────────────────────────────────
  doc.addPage();
  drawBackPage();

  // ── 10. FOOTER on every content page (skip cover=1, skip back=totalPDF) ──
  const totalPDF     = doc.internal.getNumberOfPages();
  const contentPages = totalPDF - 2; // exclude cover and back
  for (let i = 2; i <= totalPDF - 1; i++) {
    doc.setPage(i);
    drawFooter(i - 1, contentPages);
  }

  // ── 11. Output ────────────────────────────────────────────────────────────
  const label    = role === 'customer' ? 'Customer' : role === 'dealer' ? 'Dealer' : 'Admin';
  const filename = `Eltop-Price-List-${label}-${new Date().getFullYear()}.pdf`;
  if (returnBlob) {
    return { blob: doc.output('blob'), filename };
  }
  doc.save(filename);
}
