// PENGGANTI pustaka pihak ketiga, HANYA untuk pengujian di sandbox tanpa internet.
// - qrcode-generator -> matriks QR asli dari OpenCV lewat /__qr
// - jsQR             -> dekode asli OpenCV lewat /__decode
// - Chart.js         -> perekam konfigurasi (grafik TIDAK digambar)
// - ExcelJS          -> shim berisi subset API yang dipakai reports.js (isi sel dicatat, file .xlsx asli TIDAK dibuat)
export const STUBS = {
  qrcode: `
window.qrcode = function () {
  let text = '', m = null;
  return {
    addData(t) { text = t; },
    make() { const x = new XMLHttpRequest(); x.open('GET', '/__qr?text=' + encodeURIComponent(text), false); x.send(); m = JSON.parse(x.responseText); (window.__qrTexts = window.__qrTexts || []).push(text); },
    getModuleCount() { return m.length; },
    isDark(r, c) { return !!m[r][c]; },
  };
};`,
  jsqr: `
window.jsQR = function (data, w, h) {
  const x = new XMLHttpRequest(); x.open('POST', '/__decode?w=' + w + '&h=' + h, false); x.send(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  const r = JSON.parse(x.responseText); return r.data ? { data: r.data } : null;
};`,
  chart: `
window.__charts = [];
window.Chart = function (canvas, cfg) { window.__charts.push({ type: cfg.type, labels: cfg.data.labels, data: cfg.data.datasets.map(d => d.data) }); this.destroy = function () {}; };
window.Chart.defaults = { font: {}, color: '' };`,
  exceljs: `
(function () {
  class Cell { constructor() { this.value = null; } }
  class Row {
    constructor(ws, n) { this.ws = ws; this.n = n; this.cells = new Map(); this.height = 15; }
    getCell(k) { const col = typeof k === 'number' ? k : this.ws.keyIndex(k); if (!this.cells.has(col)) this.cells.set(col, new Cell()); return this.cells.get(col); }
    set values(arr) { arr.forEach((v, i) => { if (v !== undefined) this.getCell(i + 1).value = v; }); }
    eachCell(a, b) { const cb = typeof a === 'function' ? a : b; const full = typeof a === 'object' && a && a.includeEmpty; const keys = full ? Array.from({ length: Math.max(0, ...this.cells.keys()) }, (_, i) => i + 1) : [...this.cells.keys()].sort((x, y) => x - y); keys.forEach((c) => cb(this.getCell(c), c)); }
  }
  class WS {
    constructor(name) { this.name = name; this.rows = new Map(); this._cols = []; this.views = []; this.autoFilter = null; this.pageSetup = null; this.merges = []; }
    keyIndex(k) { const i = this._cols.findIndex((c) => c.key === k); if (i < 0) throw new Error('kolom tidak dikenal: ' + k); return i + 1; }
    set columns(defs) { this._cols = defs; defs.forEach((d, i) => { if (d.header) this.getRow(1).getCell(i + 1).value = d.header; }); }
    getRow(n) { if (!this.rows.has(n)) this.rows.set(n, new Row(this, n)); return this.rows.get(n); }
    addRow(obj) { const n = Math.max(0, ...this.rows.keys()) + 1; const r = this.getRow(n); if (Array.isArray(obj)) r.values = obj; else for (const [k, v] of Object.entries(obj)) r.getCell(k).value = v; return r; }
    getCell(addr, c2) { if (typeof addr === 'number') return this.getRow(addr).getCell(c2); const m = /^([A-Z]+)(\\d+)$/.exec(addr); const col = m[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0); return this.getRow(Number(m[2])).getCell(col); }
    mergeCells(...r) { this.merges.push(r.join(',')); }
    getColumn(c) { this._colObjs = this._colObjs || {}; return (this._colObjs[c] = this._colObjs[c] || { width: 8 }); }
    addConditionalFormatting(x) { (this.cf = this.cf || []).push(x); }
  }
  class Workbook {
    constructor() { this.sheets = []; const self = this; this.xlsx = { async writeBuffer() { return new TextEncoder().encode(JSON.stringify(self.dump())); } }; }
    addWorksheet(name) { const ws = new WS(name); this.sheets.push(ws); return ws; }
    dump() { return this.sheets.map((ws) => ({ name: ws.name, widths: Object.fromEntries(Object.entries(ws._colObjs || {}).map(([k, v]) => [k, v.width])), cf: ws.cf ? ws.cf.length : 0, frozen: ws.views[0] && ws.views[0].state === 'frozen', filter: ws.autoFilter, merges: ws.merges, rows: [...ws.rows.keys()].sort((a, b) => a - b).map((n) => { const r = ws.rows.get(n); const o = {}; r.eachCell((c, i) => { o[i] = c.value instanceof Date ? 'DATE:' + c.value.toISOString() : c.value; }); return o; }) })); }
  }
  window.ExcelJS = { Workbook };
})();`,
};

export const CDN = {
  'chart.umd.min.js': 'chart',
  'jsQR.js': 'jsqr',
  'qrcode.js': 'qrcode',
  'exceljs.min.js': 'exceljs',
};
