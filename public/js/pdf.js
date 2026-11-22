// Penulis PDF minimal (tanpa pustaka luar): teks Helvetica, garis, kotak, dan gambar abu-abu.
// Dipakai untuk "Daftar hadir bertanda tangan". Berjalan di browser maupun Node (untuk pengujian).
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

/** Lebar teks (poin) untuk Helvetica; huruf tebal diperkirakan sedikit lebih lebar. */
export function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? W[c - 32] : 556;
  }
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

/** Potong teks dengan "..." agar muat dalam lebar tertentu. */
export function fit(str, size, maxW, bold = false) {
  let s = String(str);
  if (textWidth(s, size, bold) <= maxW) return s;
  while (s.length > 1 && textWidth(s + '...', size, bold) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '...';
}

function winAnsi(str) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.charCodeAt(0);
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += '\\' + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += '\\' + c.toString(8).padStart(3, '0');
    else out += '?';
  }
  return out;
}
const n2 = (x) => (Math.round(x * 100) / 100).toString();

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class Pdf {
  constructor() {
    this.pages = [];
    this.images = [];
  }

  /** gray: Uint8Array w*h (0 = hitam, 255 = putih). Mengembalikan nama gambar. */
  addGrayImage(w, h, gray) {
    this.images.push({ w, h, gray });
    return `Im${this.images.length}`;
  }

  addPage(width = 595.28, height = 841.89) {
    const page = new Page(this, width, height);
    this.pages.push(page);
    return page;
  }

  async build() {
    const enc = new TextEncoder();
    const chunks = [];
    let offset = 0;
    const offsets = [];
    const push = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); offset += u.length; };
    const beginObj = (n) => { offsets[n] = offset; push(`${n} 0 obj\n`); };

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const imgBase = 5;
    const pageBase = imgBase + this.images.length;
    const pageObj = (i) => pageBase + i * 2;
    const contentObj = (i) => pageBase + i * 2 + 1;
    const total = pageBase + this.pages.length * 2;

    beginObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    beginObj(2); push(`<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`);
    beginObj(3); push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    beginObj(4); push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');

    for (let i = 0; i < this.images.length; i++) {
      const im = this.images[i];
      const z = await deflate(im.gray);
      const data = z || im.gray;
      beginObj(imgBase + i);
      push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''} /Length ${data.length} >>\nstream\n`);
      push(data);
      push('\nendstream\nendobj\n');
    }

    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i];
      const content = enc.encode(p.ops.join('\n'));
      const xobjs = [...p.used].map((name) => `/${name} ${imgBase + Number(name.slice(2)) - 1} 0 R`).join(' ');
      beginObj(pageObj(i));
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(p.width)} ${n2(p.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjs ? ` /XObject << ${xobjs} >>` : ''} >> /Contents ${contentObj(i)} 0 R >>\nendobj\n`);
      beginObj(contentObj(i));
      push(`<< /Length ${content.length} >>\nstream\n`);
      push(content);
      push('\nendstream\nendobj\n');
    }

    const xrefAt = offset;
    push(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

    const out = new Uint8Array(offset);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }
}

class Page {
  constructor(pdf, width, height) {
    this.pdf = pdf;
    this.width = width;
    this.height = height;
    this.ops = [];
    this.used = new Set();
  }

  /** y diukur dari ATAS halaman (lebih mudah dipikirkan). */
  #Y(y) { return this.height - y; }

  text(str, x, y, { size = 10, bold = false, align = 'left', color = [0, 0, 0] } = {}) {
    const w = textWidth(str, size, bold);
    const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    this.ops.push(`BT ${color.map(n2).join(' ')} rg /${bold ? 'F2' : 'F1'} ${n2(size)} Tf ${n2(px)} ${n2(this.#Y(y))} Td (${winAnsi(str)}) Tj ET`);
  }

  line(x1, y1, x2, y2, { width = 0.5, color = [0.6, 0.6, 0.6] } = {}) {
    this.ops.push(`${color.map(n2).join(' ')} RG ${n2(width)} w ${n2(x1)} ${n2(this.#Y(y1))} m ${n2(x2)} ${n2(this.#Y(y2))} l S`);
  }

  rect(x, y, w, h, { fill = null, stroke = null, width = 0.5 } = {}) {
    const op = fill && stroke ? 'B' : fill ? 'f' : 'S';
    const parts = [];
    if (fill) parts.push(`${fill.map(n2).join(' ')} rg`);
    if (stroke) parts.push(`${stroke.map(n2).join(' ')} RG ${n2(width)} w`);
    this.ops.push(`${parts.join(' ')} ${n2(x)} ${n2(this.#Y(y + h))} ${n2(w)} ${n2(h)} re ${op}`);
  }

  image(name, x, y, w, h) {
    this.used.add(name);
    this.ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(this.#Y(y + h))} cm /${name} Do Q`);
  }
}
