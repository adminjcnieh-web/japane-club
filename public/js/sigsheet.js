// Daftar hadir bertanda tangan (PDF): baris = anggota, kolom = pertemuan. Tanda tangan = hadir; kosong = tidak hadir.
import { Pdf, textWidth, fit } from './pdf.js';

const PW = 841.89;
const PH = 595.28;
const MARGIN = 28;
const ROW_H = 30;
const HEAD_H = 34;
const TABLE_TOP = 80;
const NO_W = 24;
const NAME_W = 150;
const TOT_W = 44;
const MAX_COLS = 8;
const INK = [0.12, 0.16, 0.3];
const LINE = [0.62, 0.62, 0.62];
const HEAD_FILL = [0.93, 0.9, 0.83];

const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** PNG (base64) -> piksel abu-abu kecil, dipakai sebagai gambar PDF. Hanya jalan di browser. */
async function decodeSignature(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const k = Math.min(1, 240 / bmp.width);
  const w = Math.max(8, Math.round(bmp.width * k));
  const h = Math.max(8, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
  bmp.close?.();
  return { w, h, gray };
}

/**
 * data  : hasil GET /api/reports/signatures
 * meta  : { periodLabel, createdLabel, clubName }
 * decode: (opsional) pengganti decodeSignature, untuk pengujian di luar browser
 */
export async function buildSignaturePdf(data, meta, decode = decodeSignature) {
  const pdf = new Pdf();
  const { meetings, members, cells } = data;

  // gambar tanda tangan (satu kali per sel yang punya gambar)
  const imgs = new Map();
  for (const m of members) {
    for (const mt of meetings) {
      const c = cells[m.uid]?.[mt.id];
      if (c?.sig) {
        try {
          const d = await decode(c.sig);
          imgs.set(`${m.uid}|${mt.id}`, { name: pdf.addGrayImage(d.w, d.h, d.gray), w: d.w, h: d.h });
        } catch { /* gambar rusak: sel dibiarkan menampilkan teks */ }
      }
    }
  }

  const presentOf = (uid) => meetings.filter((mt) => { const s = cells[uid]?.[mt.id]?.status; return s === 'hadir' || s === 'terlambat'; }).length;

  // rencana halaman: tiap blok (maks 8 pertemuan) x kelompok anggota
  const blocks = [];
  for (let i = 0; i < meetings.length; i += MAX_COLS) blocks.push(meetings.slice(i, i + MAX_COLS));
  if (!blocks.length) blocks.push([]);
  const rowsPerPage = Math.floor((PH - TABLE_TOP - HEAD_H - 46) / ROW_H);
  const plan = [];
  for (const cols of blocks) {
    for (let i = 0; i < Math.max(1, members.length); i += rowsPerPage) plan.push({ cols, rows: members.slice(i, i + rowsPerPage), start: i });
  }

  plan.forEach((pg, pi) => {
    const page = pdf.addPage(PW, PH);
    page.text(meta.clubName || 'Japanese Club', MARGIN, 36, { size: 17, bold: true, color: INK });
    page.text('Daftar Hadir Bertanda Tangan', MARGIN, 54, { size: 11, bold: true });
    page.text(meta.periodLabel, MARGIN, 69, { size: 9 });
    page.text(`Dibuat ${meta.createdLabel}`, PW - MARGIN, 36, { size: 8, align: 'right', color: [0.4, 0.4, 0.4] });
    page.text(`Halaman ${pi + 1}/${plan.length}`, PW - MARGIN, 575, { size: 8, align: 'right', color: [0.4, 0.4, 0.4] });
    page.text('Tanda tangan = hadir. Kosong = tidak hadir. "Izin"/"Sakit" dicatat pengurus. "Hadir*" = dicatat pengurus tanpa tanda tangan.', MARGIN, 575, { size: 7.5, color: [0.4, 0.4, 0.4] });

    if (!meetings.length || !members.length) {
      page.text(!meetings.length ? 'Tidak ada pertemuan pada periode ini.' : 'Tidak ada anggota untuk ditampilkan.', MARGIN, TABLE_TOP + 40, { size: 11 });
      return;
    }

    const nCols = pg.cols.length;
    const usable = PW - MARGIN * 2;
    const meetW = Math.min(104, (usable - NO_W - NAME_W - TOT_W) / nCols);
    const tableW = NO_W + NAME_W + nCols * meetW + TOT_W;
    const x0 = MARGIN;
    const xNo = x0, xName = x0 + NO_W, xMeet = xName + NAME_W, xTot = xMeet + nCols * meetW;

    // judul kolom
    page.rect(x0, TABLE_TOP, tableW, HEAD_H, { fill: HEAD_FILL, stroke: LINE });
    page.text('No', xNo + NO_W / 2, TABLE_TOP + 21, { size: 8, bold: true, align: 'center' });
    page.text('Nama', xName + 6, TABLE_TOP + 21, { size: 8.5, bold: true });
    pg.cols.forEach((mt, i) => {
      const cx = xMeet + i * meetW + meetW / 2;
      page.text(dm(mt.date), cx, TABLE_TOP + 15, { size: 9, bold: true, align: 'center' });
      page.text(fit(mt.name, 6.5, meetW - 6), cx, TABLE_TOP + 26, { size: 6.5, align: 'center', color: [0.3, 0.3, 0.3] });
    });
    page.text('Hadir', xTot + TOT_W / 2, TABLE_TOP + 21, { size: 8, bold: true, align: 'center' });

    // baris anggota
    pg.rows.forEach((m, ri) => {
      const y = TABLE_TOP + HEAD_H + ri * ROW_H;
      page.rect(x0, y, tableW, ROW_H, { stroke: LINE });
      page.text(String(pg.start + ri + 1), xNo + NO_W / 2, y + 18, { size: 8, align: 'center' });
      page.text(fit(m.name, 9, NAME_W - 10, true), xName + 6, y + (m.kelas ? 13 : 18), { size: 9, bold: true });
      if (m.kelas) page.text(m.kelas, xName + 6, y + 24, { size: 7, color: [0.4, 0.4, 0.4] });
      pg.cols.forEach((mt, ci) => {
        const cx = xMeet + ci * meetW;
        page.line(cx, y, cx, y + ROW_H, { color: LINE });
        const c = cells[m.uid]?.[mt.id];
        const img = imgs.get(`${m.uid}|${mt.id}`);
        if (img) {
          const k = Math.min((meetW - 10) / img.w, (ROW_H - 6) / img.h);
          page.image(img.name, cx + (meetW - img.w * k) / 2, y + (ROW_H - img.h * k) / 2, img.w * k, img.h * k);
        } else if (c?.status === 'izin') page.text('Izin', cx + meetW / 2, y + 18, { size: 8, align: 'center', color: [0.1, 0.35, 0.65] });
        else if (c?.status === 'sakit') page.text('Sakit', cx + meetW / 2, y + 18, { size: 8, align: 'center', color: [0.5, 0.3, 0.65] });
        else if (c && (c.status === 'hadir' || c.status === 'terlambat')) {
          page.text(c.signRequired && !c.signed ? 'belum ttd' : 'Hadir*', cx + meetW / 2, y + 18, { size: 7.5, align: 'center', color: [0.65, 0.4, 0.1] });
        }
      });
      page.line(xTot, y, xTot, y + ROW_H, { color: LINE });
      page.text(`${presentOf(m.uid)}/${meetings.length}`, xTot + TOT_W / 2, y + 18, { size: 8.5, bold: true, align: 'center' });
    });
  });

  return new Blob([await pdf.build()], { type: 'application/pdf' });
}

export { textWidth };
