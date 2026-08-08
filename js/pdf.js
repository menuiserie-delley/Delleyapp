import { computeTotals, withPositionNumbers, lineTotal } from './documents.js';
import { formatDateDE, customerAddressLines } from './utils.js';
import { tr, resolveText } from './i18n.js';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 18;
const MARGIN_R = 18;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const FOOTER_Y = PAGE_H - 14;
const MAX_Y = FOOTER_Y - 6;

let logoDataUrlCache = null;
async function getLogoDataUrl() {
  if (logoDataUrlCache) return logoDataUrlCache;
  const res = await fetch('assets/logo.png');
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  // Logo wird nur ~34mm breit gedruckt — auf ~360px Breite verkleinern hält die PDF-Datei klein.
  const targetW = 360;
  const targetH = Math.round((bitmap.height / bitmap.width) * targetW);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  logoDataUrlCache = canvas.toDataURL('image/png');
  return logoDataUrlCache;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export async function buildDocumentPdf(doc, customer, settings, stage) {
  const lang = doc.lang || settings.sprache || 'de';
  const T = tr(lang).pdf;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const brand = hexToRgb(settings.farbe || '#2e5254');
  const ink = [31, 42, 42];
  const soft = [90, 107, 107];

  let y = 20;
  let logoUrl = null;
  try { logoUrl = await getLogoDataUrl(); } catch (e) { /* ok ohne logo weiter */ }

  function newPage() {
    pdf.addPage();
    drawFooter();
    y = 20;
  }

  function ensureSpace(need) {
    if (y + need > MAX_Y) newPage();
  }

  function drawFooter() {
    pdf.setDrawColor(...soft);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_L, FOOTER_Y - 4, PAGE_W - MARGIN_R, FOOTER_Y - 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...soft);
    const contact = [settings.firma, settings.adresse, settings.plzOrt, settings.email, settings.telefon].filter(Boolean).join('  ·  ');
    pdf.text(contact, PAGE_W / 2, FOOTER_Y, { align: 'center' });
  }

  drawFooter();

  // ---- Kopfzeile ----
  if (logoUrl) {
    try {
      const props = pdf.getImageProperties(logoUrl);
      const w = 52;
      const h = (props.height / props.width) * w;
      pdf.addImage(logoUrl, 'PNG', (PAGE_W - w) / 2, y - 4, w, h);
      y += h - 4;
    } catch (e) { /* ignore */ }
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...ink);
  y += 6;
  pdf.text(settings.firma || '', PAGE_W / 2, y, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...soft);
  const contactLine = [settings.adresse, settings.plzOrt, settings.telefon, settings.email, settings.website].filter(Boolean).join('  ·  ');
  y += 4.6;
  pdf.text(contactLine, PAGE_W / 2, y, { align: 'center' });

  y += 6;
  pdf.setDrawColor(...brand);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  y += 10;

  // ---- Kunde + Titel/Meta ----
  const custY = y;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...soft);
  pdf.text(T.kunde, MARGIN_L, custY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...ink);
  const custLines = customer ? customerAddressLines(customer) : [T.noCustomer];
  custLines.forEach((line, i) => pdf.text(line, MARGIN_L, custY + 6 + i * 4.6));

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(...brand);
  pdf.text(T.stageTitle[stage], PAGE_W - MARGIN_R, custY, { align: 'right' });

  const metaRows = [
    [T.dateLabel[stage] + ':', formatDateDE(doc.datum)],
    [T.nummer, doc.number],
  ];
  if (customer && customer.kundennummer) metaRows.push([T.kundennummer, String(customer.kundennummer)]);
  if (stage === 'rechnung' && doc.faelligAm) metaRows.push([T.faelligAm, formatDateDE(doc.faelligAm)]);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...ink);
  const metaLabelX = PAGE_W - MARGIN_R - 26;
  const metaValueX = PAGE_W - MARGIN_R - 24;
  metaRows.forEach((row, i) => {
    const rowY = custY + 8 + i * 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...soft);
    pdf.text(row[0], metaLabelX, rowY, { align: 'right' });
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...ink);
    pdf.text(row[1], metaValueX, rowY, { align: 'left' });
  });

  y = custY + Math.max(custLines.length * 4.6 + 6, metaRows.length * 5 + 8) + 7;

  // ---- Anrede / Einleitung / Projekt ----
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...ink);
  if (doc.greeting) {
    ensureSpace(6);
    pdf.text(doc.greeting, MARGIN_L, y);
    y += 7;
  }
  if (doc.intro) {
    const lines = pdf.splitTextToSize(doc.intro, CONTENT_W);
    ensureSpace(lines.length * 4.6 + 3);
    pdf.text(lines, MARGIN_L, y);
    y += lines.length * 4.6 + 4.5;
  }
  if (doc.projekt) {
    ensureSpace(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(T.kommission(doc.projekt), MARGIN_L, y);
    pdf.setFont('helvetica', 'normal');
    y += 8;
  }

  // ---- Positionstabelle ----
  const cols = [
    { key: 'pos', label: T.colPos, w: 12, align: 'left' },
    { key: 'description', label: T.colBeschreibung, w: 76, align: 'left' },
    { key: 'qty', label: T.colAnzahl, w: 18, align: 'right' },
    { key: 'unit', label: T.colEinh, w: 16, align: 'left' },
    { key: 'unitPrice', label: T.colPreisEinh, w: 26, align: 'right' },
    { key: 'total', label: T.colTotal, w: 26, align: 'right' },
  ];
  const colX = [];
  { let x = MARGIN_L; for (const c of cols) { colX.push(x); x += c.w; } }

  function drawTableHeader() {
    ensureSpace(9);
    pdf.setFillColor(...brand);
    pdf.rect(MARGIN_L, y, CONTENT_W, 7.5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.6);
    pdf.setTextColor(255, 255, 255);
    cols.forEach((c, i) => {
      const tx = c.align === 'right' ? colX[i] + c.w - 1.5 : colX[i] + 1.5;
      pdf.text(c.label, tx, y + 5, { align: c.align === 'right' ? 'right' : 'left' });
    });
    y += 7.5 + 3;
  }

  drawTableHeader();

  const numbered = withPositionNumbers(doc.items || []);
  pdf.setFontSize(9.2);
  for (const it of numbered) {
    if (it.isHeader) {
      const descLines = pdf.splitTextToSize(it.description || '', cols[1].w + cols[2].w + cols[3].w + cols[4].w + cols[5].w - 2);
      const rowH = Math.max(6, descLines.length * 4.4 + 2);
      ensureSpace(rowH);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...brand);
      pdf.text(it.pos, colX[0] + 1.5, y + 4.4);
      pdf.text(descLines, colX[1] + 1.5, y + 4.4);
      y += rowH + 1.5;
      pdf.setTextColor(...ink);
      continue;
    }
    const descLines = pdf.splitTextToSize(it.description || '', cols[1].w - 3);
    const rowH = Math.max(6, descLines.length * 4.3 + 2);
    ensureSpace(rowH);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...ink);
    pdf.text(it.pos, colX[0] + 1.5, y + 4.3);
    pdf.text(descLines, colX[1] + 1.5, y + 4.3);
    pdf.text(formatQty(it.qty), colX[2] + cols[2].w - 1.5, y + 4.3, { align: 'right' });
    pdf.text(it.unit || '', colX[3] + 1.5, y + 4.3);
    pdf.text(formatMoney(it.unitPrice), colX[4] + cols[4].w - 1.5, y + 4.3, { align: 'right' });
    pdf.text(formatMoney(lineTotal(it)), colX[5] + cols[5].w - 1.5, y + 4.3, { align: 'right' });
    y += rowH;
    pdf.setDrawColor(224, 230, 230);
    pdf.setLineWidth(0.15);
    pdf.line(MARGIN_L, y, MARGIN_L + CONTENT_W, y);
    y += 1.6;
  }

  y += 3;

  // ---- Summen ----
  const totals = computeTotals(doc, settings.mwstSatz);
  ensureSpace(24);
  const boxW = 74;
  const boxX = PAGE_W - MARGIN_R - boxW;
  pdf.setDrawColor(...brand);
  pdf.setLineWidth(0.5);
  pdf.line(boxX, y, boxX + boxW, y);
  y += 5.5;
  totalRow(T.totalExkl, totals.subtotal, false);
  totalRow(T.totalMwst(formatPercent(settings.mwstSatz)), totals.mwst, false);
  y += 1;
  pdf.setDrawColor(220, 220, 220);
  pdf.line(boxX, y, boxX + boxW, y);
  y += 5.5;
  totalRow(T.totalInkl, totals.total, true);
  y += 6;

  function totalRow(label, value, bold) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(bold ? 11 : 9.5);
    pdf.setTextColor(...(bold ? brand : ink));
    pdf.text(label, boxX, y);
    pdf.text(formatMoney(value) + ' CHF', boxX + boxW, y, { align: 'right' });
    y += bold ? 6.5 : 5.5;
  }

  // ---- Stage-spezifische Zusatzinfos ----
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...ink);

  if (stage === 'offerte') {
    if (doc.gueltigBis) infoLine(T.gueltigBis, formatDateDE(doc.gueltigBis));
    if (doc.lieferfrist) infoLine(T.lieferfrist, doc.lieferfrist);
  } else if (stage === 'auftragsbestaetigung') {
    if (doc.lieferfrist) infoLine(T.lieferfrist, doc.lieferfrist);
  } else if (stage === 'rechnung') {
    const zahlungstext = resolveText(lang, settings.textRechnungZahlung, tr(lang).docDefaults.zahlungstext).replace('{frist}', String(settings.zahlungsfristTage));
    ensureSpace(6);
    pdf.text(zahlungstext, MARGIN_L, y);
    y += 6.5;
    infoLine(T.bank, settings.bankName);
    infoLine(T.name, settings.kontoinhaber);
    infoLine(T.iban, settings.iban);
    infoLine(T.zahlungsgrund, T.zahlungsgrundText(doc.number));
  }
  y += 2;

  function infoLine(label, value) {
    ensureSpace(5.2);
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, MARGIN_L, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(value ?? ''), MARGIN_L + 46, y);
    y += 5.2;
  }

  // ---- Schlusstext ----
  if (doc.closing) {
    const paragraphs = doc.closing.split('\n\n');
    for (const p of paragraphs) {
      const lines = pdf.splitTextToSize(p, CONTENT_W);
      ensureSpace(lines.length * 4.4 + 2.5);
      pdf.text(lines, MARGIN_L, y);
      y += lines.length * 4.4 + 2.5;
    }
  }
  y += 2;

  // ---- Unterschrift (nicht bei Rechnung) ----
  if (stage !== 'rechnung') {
    ensureSpace(14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.text(T.datum, MARGIN_L, y);
    pdf.text(T.unterschrift, MARGIN_L + 70, y);
    y += 12;
  }

  // ---- Grussformel ----
  ensureSpace(12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.text(resolveText(lang, settings.grussformel, tr(lang).docDefaults.grussformel), MARGIN_L, y);
  y += 9;
  pdf.setFont('helvetica', 'bold');
  pdf.text(settings.inhaber || '', MARGIN_L, y);

  // Seitenzahlen (nur Inhaltsseiten, nicht der QR-Zahlteil)
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...soft);
    pdf.text(T.seite(i, pageCount), PAGE_W - MARGIN_R, FOOTER_Y, { align: 'right' });
  }

  // ---- Schweizer QR-Zahlteil (nur Rechnung) ----
  if (stage === 'rechnung') {
    pdf.addPage();
    drawSwissQrBill(pdf, { PAGE_W, PAGE_H }, doc, customer, settings, totals.total, lang);
  }

  return pdf;
}

// ===========================================================================
// Schweizer QR-Rechnung (Zahlteil + Empfangsschein)
// Payload-Format gemäss "Swiss Implementation Guidelines QR-bill" (SIX / SIX Group).
// Die Feldnamen im Payload selbst (SPC/EPD/NON usw.) sind sprachunabhängige Codes.
// ===========================================================================

function onlyDigitsAndLetters(s) {
  return (s || '').replace(/[^A-Za-z0-9]/g, '');
}

function splitStreetNumber(address) {
  const m = (address || '').trim().match(/^(.*?)\s+(\d+[a-zA-Z]?)$/);
  if (m) return [m[1].trim(), m[2].trim()];
  return [(address || '').trim(), ''];
}

function splitPlzOrt(plzOrt) {
  const m = (plzOrt || '').trim().match(/^(\d{4})\s+(.*)$/);
  if (m) return [m[1], m[2].trim()];
  return ['', (plzOrt || '').trim()];
}

function buildQrBillPayload(doc, customer, settings, amount) {
  const iban = onlyDigitsAndLetters(settings.iban).toUpperCase();
  const [crStreet, crNumber] = splitStreetNumber(settings.adresse);
  const [crPlz, crOrt] = splitPlzOrt(settings.plzOrt);

  const lines = [
    'SPC', '0200', '1',
    iban,
    'S', settings.kontoinhaber || settings.firma || '', crStreet, crNumber, crPlz, crOrt, 'CH',
    '', '', '', '', '', '', '', // Ultimate creditor (unbenutzt)
    amount > 0 ? amount.toFixed(2) : '', 'CHF',
  ];

  if (customer && (customer.adresse || customer.plzOrt)) {
    const [dbStreet, dbNumber] = splitStreetNumber(customer.adresse);
    const [dbPlz, dbOrt] = splitPlzOrt(customer.plzOrt);
    const debtorName = customer.firma || [customer.vorname, customer.nachname].filter(Boolean).join(' ');
    lines.push('S', debtorName, dbStreet, dbNumber, dbPlz, dbOrt, 'CH');
  } else {
    lines.push('', '', '', '', '', '', '');
  }

  lines.push('NON', '', `${doc.number}`.slice(0, 140), 'EPD');
  return lines.join('\n');
}

function drawSwissQrBill(pdf, { PAGE_W, PAGE_H }, doc, customer, settings, amount, lang) {
  const Q = tr(lang).pdf.qr;
  const top = PAGE_H - 105;
  const receiptW = 62;
  const ink = [0, 0, 0];
  const soft = [90, 90, 90];

  // Perforationslinien
  pdf.setDrawColor(...soft);
  pdf.setLineWidth(0.15);
  pdf.setLineDashPattern([1, 1], 0);
  pdf.line(0, top, PAGE_W, top);
  pdf.line(receiptW, top, receiptW, PAGE_H);
  pdf.setLineDashPattern([], 0);

  // ---------------- Empfangsschein (links) ----------------
  let ry = top + 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...ink);
  pdf.text(Q.empfangsschein, 5, ry);

  ry += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.text(Q.kontoZahlbarAn, 5, ry);
  ry += 3.5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const creditorLines = [formatIbanDisplay(settings.iban), settings.kontoinhaber || settings.firma, settings.adresse, settings.plzOrt].filter(Boolean);
  creditorLines.forEach(line => { pdf.text(line, 5, ry); ry += 3.3; });

  ry += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.text(Q.zahlbarDurchAdresse, 5, ry);
  ry += 3.5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const debtorLines = customer ? customerAddressLines(customer) : [];
  debtorLines.forEach(line => { pdf.text(line, 5, ry); ry += 3.3; });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.text(Q.waehrung, 5, top + 80);
  pdf.text(Q.betrag, 20, top + 80);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('CHF', 5, top + 85);
  if (amount > 0) pdf.text(formatMoney(amount), 20, top + 85);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.text(Q.annahmestelle, receiptW - 5, top + 92, { align: 'right' });

  // ---------------- Zahlteil (rechts) ----------------
  const zx = receiptW + 5;
  let zy = top + 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(Q.zahlteil, zx, zy);

  const qrSize = 46;
  const qrX = zx;
  const qrY = top + 17;
  drawQrCodeModules(pdf, buildQrBillPayload(doc, customer, settings, amount), qrX, qrY, qrSize);
  drawSwissCrossMarker(pdf, qrX + qrSize / 2, qrY + qrSize / 2);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...ink);
  pdf.text(Q.waehrung, zx, top + 68);
  pdf.text(Q.betrag, zx + 15, top + 68);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text('CHF', zx, top + 74);
  if (amount > 0) pdf.text(formatMoney(amount), zx + 15, top + 74);

  const infoX = receiptW + 67;
  let iy = top + 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text(Q.kontoZahlbarAn, infoX, iy);
  iy += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  [formatIbanDisplay(settings.iban), settings.kontoinhaber || settings.firma, settings.adresse, settings.plzOrt].filter(Boolean).forEach(line => {
    pdf.text(line, infoX, iy); iy += 3.8;
  });

  iy += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text(Q.zahlbarDurch, infoX, iy);
  iy += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const zDebtor = customer ? customerAddressLines(customer) : [];
  if (zDebtor.length) {
    zDebtor.forEach(line => { pdf.text(line, infoX, iy); iy += 3.8; });
  } else {
    pdf.setDrawColor(...soft);
    pdf.setLineWidth(0.15);
    pdf.rect(infoX, iy - 3, 65, 22);
  }

  iy += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...ink);
  pdf.text(Q.zusatzInfo, infoX, iy);
  iy += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(Q.rechnungPrefix(doc.number), infoX, iy);
}

function formatIbanDisplay(iban) {
  const clean = onlyDigitsAndLetters(iban).toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

function drawQrCodeModules(pdf, payload, x, y, sizeMm) {
  const qr = window.qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const moduleSize = sizeMm / count;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, sizeMm, sizeMm, 'F');
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        pdf.rect(x + c * moduleSize, y + r * moduleSize, moduleSize, moduleSize, 'F');
      }
    }
  }
}

function drawSwissCrossMarker(pdf, cx, cy) {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(cx - 4.5, cy - 4.5, 9, 9, 'F');
  pdf.setFillColor(0, 0, 0);
  pdf.rect(cx - 4, cy - 4, 8, 8, 'F');
  pdf.setFillColor(220, 0, 30);
  pdf.rect(cx - 3.5, cy - 3.5, 7, 7, 'F');
  pdf.setFillColor(255, 255, 255);
  pdf.rect(cx - 2.15, cy - 0.6, 4.3, 1.2, 'F');
  pdf.rect(cx - 0.6, cy - 2.15, 1.2, 4.3, 'F');
}

function formatMoney(v) {
  return (Number(v) || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatQty(v) {
  const n = Number(v) || 0;
  return n % 1 === 0 ? String(n) : n.toLocaleString('de-CH', { maximumFractionDigits: 2 });
}
function formatPercent(v) {
  const n = Number(v) || 0;
  return n % 1 === 0 ? String(n) : n.toLocaleString('de-CH', { maximumFractionDigits: 1 });
}

export function pdfFilename(doc, stage) {
  const lang = doc.lang || 'de';
  const label = tr(lang).pdf.stageTitle[stage].replace(/\s+/g, '_');
  return `${label}_${doc.number}.pdf`;
}

export async function generateDocumentPdf(doc, customer, settings, stage, { download } = {}) {
  const pdf = await buildDocumentPdf(doc, customer, settings, stage);
  if (download) pdf.save(pdfFilename(doc, stage));
  return pdf;
}
