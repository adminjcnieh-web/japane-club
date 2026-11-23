// Game "Dapur Jepang" (gaya Cooking Mama): memasak langkah demi langkah dengan gerakan jari.
// Semua gambar berupa SVG buatan sendiri (tanpa emoji / gambar eksternal), jalan di browser tanpa server.
import { pageHead } from '../ui.js';
import { esc } from '../utils.js';

const W = 360, H = 380;
const NS = 'http://www.w3.org/2000/svg';
let introSeen = false;
export const resetCookIntro = () => { introSeen = false; };

// ---------- gambar dasar ----------
const DEFS = `<defs>
  <linearGradient id="ck-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9cfa6"/><stop offset="1" stop-color="#d4aa72"/></linearGradient>
  <linearGradient id="ck-rice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#efe8d6"/></linearGradient>
  <linearGradient id="ck-fish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a76"/><stop offset="1" stop-color="#f0623f"/></linearGradient>
  <linearGradient id="ck-pot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f9478"/><stop offset=".5" stop-color="#8fb394"/><stop offset="1" stop-color="#5b7d63"/></linearGradient>
  <linearGradient id="ck-cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9eef5"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#d6dde8"/></linearGradient>
  <filter id="ck-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#5a3a14" flood-opacity=".28"/></filter>
</defs>`;
const counter = () => `<rect width="${W}" height="${H}" fill="url(#ck-wood)"/>` + [0, 95, 190, 285].map((y) => `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#8a5a2b" stroke-opacity=".16" stroke-width="2"/>`).join('');
const plate = (cx, cy, rx) => `<g filter="url(#ck-sh)"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.27}" fill="#fff"/><ellipse cx="${cx}" cy="${cy - 2}" rx="${rx * 0.78}" ry="${rx * 0.2}" fill="#f1ece3"/></g>`;

function ballPath(t, cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const d = (((a - Math.PI / 2) % (2 * Math.PI / 3)) + 2 * Math.PI / 3) % (2 * Math.PI / 3);
    const phi = d > Math.PI / 3 ? d - 2 * Math.PI / 3 : d;
    const A = R * 0.62;
    const tri = Math.min(A / Math.cos(phi), A * 1.9);
    const r = R * (1 - t) + (0.7 * tri + 0.3 * R) * t;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + t * 6 + Math.sin(a) * r).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}
const riceBall = (t, extra = '') => `<g filter="url(#ck-sh)"><path d="${ballPath(t, 180, 212, 75)}" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3" stroke-linejoin="round"/>${extra}</g>`;
const noriBand = () => `<clipPath id="ck-nc"><path d="${ballPath(1, 180, 212, 75)}"/></clipPath><g clip-path="url(#ck-nc)"><rect x="90" y="226" width="180" height="90" fill="#1f3a2c"/><path d="M95 244H265M95 262H265M95 280H265" stroke="#2f5a43" stroke-width="2" opacity=".7"/></g>`;
const umeDot = (x = 180, y = 205) => `<circle cx="${x}" cy="${y}" r="15" fill="#b8272f"/><circle cx="${x - 5}" cy="${y - 5}" r="4" fill="#e9707a" opacity=".8"/>`;
const wasabiBlob = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-18 4Q-20-12-4-14Q12-18 18-6Q24 10 6 14Q-14 18-18 4Z" fill="#8ec07c"/><path d="M-8-4Q0-9 8-3" stroke="#c6e6b8" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;
const fishSlice = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-84 6Q-90-26-40-30Q20-38 70-26Q96-18 90 8Q80 32 20 34Q-60 40-84 6Z" fill="url(#ck-fish)"/><path d="M-58-8Q-10-26 50-14M-66 10Q-10-8 64 4M-50 24Q0 10 56 20" stroke="#ffe6d6" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/></g>`;
const noriSheet = (x, y) => `<g transform="translate(${x} ${y})" filter="url(#ck-sh)"><rect x="-62" y="-36" width="124" height="72" rx="5" fill="#1f3a2c"/><path d="M-56-18H56M-56 0H56M-56 18H56" stroke="#2f5a43" stroke-width="2" opacity=".7"/></g>`;
const umeItem = () => `<g filter="url(#ck-sh)"><circle r="17" fill="#b8272f"/><circle cx="-6" cy="-6" r="5" fill="#e9707a" opacity=".8"/></g>`;
const leafSpoon = () => `<g filter="url(#ck-sh)"><rect x="-8" y="-4" width="96" height="9" rx="4" fill="#b98a55" transform="rotate(-18)"/><ellipse cx="-4" cy="2" rx="30" ry="14" fill="#c99a63"/><path d="M-22 0Q-8-14 6-4Q-2 10-18 8ZM-6 -2Q8-12 20 0Q8 12-6 -2Z" fill="#5f8a3b"/><path d="M-14 4Q0-6 14 2" stroke="#8fb85e" stroke-width="2" fill="none"/></g>`;

const POT_D = 'M95,150 Q80,300 180,305 Q280,300 265,150 Z';
const teapot = (lid = false) => `<g filter="url(#ck-sh)">
  <path d="M268 170Q335 168 326 238Q320 285 276 276" stroke="#4f6e57" stroke-width="13" fill="none" stroke-linecap="round"/>
  <path d="M96 205Q58 196 34 150L58 142Q82 176 108 176Z" fill="#5b7d63"/>
  <path d="${POT_D}" fill="url(#ck-pot)"/>
  <ellipse cx="180" cy="150" rx="85" ry="14" fill="${lid ? '#5b7d63' : '#3f5a47'}"/>
  ${lid ? `<ellipse cx="180" cy="145" rx="80" ry="11" fill="#7aa081"/><circle cx="180" cy="134" r="9" fill="#4f6e57"/>` : ''}
</g>`;
const CUP_D = 'M110,190 L125,300 Q180,320 235,300 L250,190 Z';
const cupBase = () => `<g filter="url(#ck-sh)"><ellipse cx="180" cy="312" rx="105" ry="22" fill="#f4efe6"/><path d="M247 205Q290 205 284 245Q278 280 238 272" stroke="#d6dde8" stroke-width="11" fill="none" stroke-linecap="round"/><path d="${CUP_D}" fill="url(#ck-cup)"/></g>`;
const BOWL_D = 'M50,150 Q50,310 180,310 Q310,310 310,150 Z';
const bowlBase = () => `<g filter="url(#ck-sh)"><path d="${BOWL_D}" fill="#7a2f20"/><path d="M62 175Q64 285 180 296Q290 288 298 175" fill="none" stroke="#c9694d" stroke-width="6" opacity=".6"/></g>`;

/** Hidangan jadi (dipakai sebagai gambar menu dan layar hasil). */
function dishSvg(id, steam = false) {
  const steamPath = steam ? `<g class="ck-steam"><path d="M150 120Q135 95 152 75Q168 55 152 35" /><path d="M190 125Q175 100 192 80Q208 60 192 40"/><path d="M228 120Q213 95 230 75Q246 55 230 35"/></g>` : '';
  let body = '';
  if (id === 'onigiri') body = plate(180, 292, 150) + riceBall(1, noriBand());
  else if (id === 'sushi') body = plate(180, 290, 160) + `<g filter="url(#ck-sh)"><rect x="100" y="206" width="160" height="66" rx="32" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>${wasabiBlob(180, 210, 0.8)}${fishSlice(180, 214, 1.02)}<g><rect x="262" y="252" width="62" height="22" rx="11" fill="#fff" stroke="#e2d9c3"/><ellipse cx="293" cy="260" rx="22" ry="6" fill="#3b2418"/></g>`;
  else body = `<g>${cupBase()}<clipPath id="ck-dc"><path d="${CUP_D}"/></clipPath><g clip-path="url(#ck-dc)"><rect x="100" y="205" width="160" height="120" fill="#9cb04a"/></g><ellipse cx="180" cy="190" rx="70" ry="11" fill="#b6c866"/></g>${steamPath}`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hidangan jadi">${DEFS}${counter()}${body}</svg>`;
}

// ---------- mesin gerakan ----------
function svgPoint(svg, e) {
  const r = svg.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
const mk = (html) => { const g = document.createElementNS(NS, 'g'); g.innerHTML = html; return g; };

/** Menjalankan satu tahap; mengembalikan fungsi pembersih. done(score 0..1, pesan). */
function runStage(host, spec, done) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('ck-svg');
  svg.dataset.type = spec.type;
  host.replaceChildren(svg);
  let alive = true, raf = 0, finished = false;
  const stop = () => { alive = false; cancelAnimationFrame(raf); };
  const finish = (score, msg) => { if (finished) return; finished = true; svg.classList.add('ck-finished'); done(score, msg); };
  const loop = (fn) => {
    let last = performance.now();
    const f = (now) => {
      if (!alive || !svg.isConnected) return;
      fn(Math.min(0.05, (now - last) / 1000), now);
      last = now;
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
  };

  if (spec.type === 'hold') {
    const c = { bowl: { d: BOWL_D, top: 150, bottom: 310, base: bowlBase() }, pot: { d: POT_D, top: 150, bottom: 305, base: teapot(false) }, cup: { d: CUP_D, top: 190, bottom: 305, base: cupBase() } }[spec.vessel];
    const [lo, hi] = spec.zone;
    const yAt = (l) => c.bottom - l * (c.bottom - c.top);
    const fillColor = spec.kind === 'rice' ? 'url(#ck-rice)' : spec.color;
    svg.innerHTML = `${DEFS}${counter()}${c.base}
      <clipPath id="ck-hc"><path d="${c.d}"/></clipPath>
      <g clip-path="url(#ck-hc)"><rect id="lv" x="0" width="${W}" y="${c.bottom}" height="0" fill="${fillColor}"/></g>
      <rect x="30" width="300" y="${yAt(hi)}" height="${yAt(lo) - yAt(hi)}" fill="#3fa564" opacity=".28"/>
      <line x1="30" x2="330" y1="${yAt(hi)}" y2="${yAt(hi)}" stroke="#2f8a50" stroke-width="2" stroke-dasharray="6 5"/>
      <line x1="30" x2="330" y1="${yAt(lo)}" y2="${yAt(lo)}" stroke="#2f8a50" stroke-width="2" stroke-dasharray="6 5"/>
      <g id="src">${spec.kind === 'rice'
        ? `<g transform="translate(180 52) rotate(-8)" filter="url(#ck-sh)"><rect x="-8" y="-6" width="16" height="64" rx="6" fill="#c99a63"/><ellipse cx="0" cy="-8" rx="44" ry="22" fill="#d9ae78"/><ellipse cx="0" cy="-10" rx="34" ry="14" fill="#fffdf5"/></g>`
        : `<g transform="translate(150 46) rotate(-28)" filter="url(#ck-sh)"><path d="M-56-8Q-60-44 -16-44Q40-44 46-8Q50 28 0 30Q-52 30-56-8Z" fill="#2f3b4a"/><path d="M40 0L84 -26L90-14L48 14Z" fill="#2f3b4a"/><path d="M-30-24Q0-34 30-24" stroke="#6b7c92" stroke-width="4" fill="none" stroke-linecap="round"/></g>`}</g>
      <line id="st" x1="180" x2="180" y1="82" y2="150" stroke="${spec.kind === 'rice' ? '#fffdf5' : '#bfe6ff'}" stroke-width="${spec.kind === 'rice' ? 10 : 7}" stroke-linecap="round" stroke-dasharray="${spec.kind === 'rice' ? '2 11' : ''}" opacity="0"/>`;
    const lv = svg.querySelector('#lv'), st = svg.querySelector('#st');
    let level = 0, holding = false;
    const draw = () => {
      lv.setAttribute('y', yAt(level)); lv.setAttribute('height', c.bottom - yAt(level) + 4);
      st.setAttribute('y2', Math.max(100, yAt(level))); st.setAttribute('opacity', holding ? 1 : 0);
      svg.dataset.level = level.toFixed(3);
    };
    const release = () => {
      if (!holding || finished) return;
      holding = false; draw();
      const mid = (lo + hi) / 2, half = (hi - lo) / 2, err = Math.abs(level - mid);
      const score = err <= half ? 1 : Math.max(0.25, 1 - (err - half) / 0.3);
      finish(score, err <= half ? 'Pas sekali!' : level < lo ? 'Agak kurang' : 'Agak kebanyakan');
    };
    svg.addEventListener('pointerdown', (e) => { e.preventDefault(); if (finished) return; svg.setPointerCapture?.(e.pointerId); holding = true; });
    svg.addEventListener('pointerup', release); svg.addEventListener('pointercancel', release);
    loop((dt) => {
      if (holding && !finished) { level = Math.min(1, level + spec.speed * dt); if (level >= 1) release(); }
      draw();
    });
    draw();
  }

  else if (spec.type === 'tap') {
    const n = spec.count; let k = 0; const t0 = performance.now();
    const shape = (t) => {
      if (spec.shape === 'ball') return riceBall(t);
      const w = 120 + t * 80, h = 110 - t * 44;
      return `<g filter="url(#ck-sh)"><rect x="${180 - w / 2}" y="${236 - h / 2}" width="${w}" height="${h}" rx="${Math.min(h / 2, 34 + (1 - t) * 40)}" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>`;
    };
    const draw = () => {
      svg.innerHTML = `${DEFS}${counter()}${plate(180, 295, spec.shape === 'ball' ? 150 : 160)}<g id="sh" class="ck-pulse">${shape(k / n)}</g>
        <g>${Array.from({ length: n }, (_, i) => `<circle cx="${180 - (n - 1) * 12 + i * 24}" cy="352" r="7" fill="${i < k ? '#b8272f' : '#f4efe6'}" stroke="#b8272f" stroke-width="2"/>`).join('')}</g>
        <g class="ck-hand" transform="translate(${236} ${150 - (k % 2) * 14})"><path d="M0 0Q12-18 28-6Q40 6 26 20L6 28Q-8 14 0 0Z" fill="#f2c9a0" stroke="#d9a574" stroke-width="2"/></g>`;
      svg.dataset.count = k;
    };
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (finished) return;
      k++; draw();
      if (k >= n) { const s = (performance.now() - t0) / 1000; finish(s <= n * 0.8 ? 1 : s <= n * 1.4 ? 0.8 : 0.6, 'Padat dan rapi!'); }
    });
    draw();
  }

  else if (spec.type === 'drag') {
    const [tx, ty] = spec.to, [fx, fy] = spec.from;
    svg.innerHTML = `${DEFS}${counter()}${spec.base()}<g id="aft"></g>
      <circle class="drag-target" cx="${tx}" cy="${ty}" r="${spec.r}" fill="none" stroke="#b8272f" stroke-width="3" stroke-dasharray="7 6"/>
      <g id="it" class="drag-item" transform="translate(${fx} ${fy})" style="cursor:grab">${spec.item()}</g>`;
    const it = svg.querySelector('#it'), aft = svg.querySelector('#aft'), tg = svg.querySelector('.drag-target');
    let drag = null, misses = 0;
    const move = (x, y) => it.setAttribute('transform', `translate(${x} ${y})`);
    svg.addEventListener('pointerdown', (e) => {
      if (finished) return; e.preventDefault();
      const p = svgPoint(svg, e);
      if (Math.hypot(p.x - fx, p.y - fy) > 70) return;
      svg.setPointerCapture?.(e.pointerId); drag = { dx: fx - p.x, dy: fy - p.y }; it.classList.remove('ck-back');
    });
    svg.addEventListener('pointermove', (e) => { if (!drag) return; const p = svgPoint(svg, e); move(p.x + drag.dx, p.y + drag.dy); });
    const up = (e) => {
      if (!drag) return;
      const p = svgPoint(svg, e); const x = p.x + drag.dx, y = p.y + drag.dy; drag = null;
      const d = Math.hypot(x - tx, y - ty);
      if (d <= spec.r) {
        move(tx, ty); tg.setAttribute('opacity', 0);
        const base = d < 18 ? 1 : d < 34 ? 0.85 : 0.7;
        aft.innerHTML = spec.after(); it.setAttribute('opacity', 0);
        finish(Math.max(0.5, base - misses * 0.1), d < 18 ? 'Tepat!' : 'Cukup bagus');
      } else { misses++; it.classList.add('ck-back'); move(fx, fy); }
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }

  else if (spec.type === 'cut') {
    const xs = spec.lines; let cuts = new Set(); let last = null;
    const fx0 = 40, fx1 = 320;
    const edges = [fx0, ...xs, fx1];
    const draw = () => {
      const gap = cuts.size * 5;
      const segs = edges.slice(0, -1).map((x0, i) => {
        const x1 = edges[i + 1], off = (i - (edges.length - 2) / 2) * gap;
        return `<clipPath id="ck-s${i}"><rect x="${x0}" y="100" width="${x1 - x0}" height="200"/></clipPath><g transform="translate(${off} 0)"><g clip-path="url(#ck-s${i})"><g transform="translate(180 195) scale(1.55 1.4)">${fishSlice(0, 0, 1).replace('<g transform="translate(0 0) scale(1)">', '<g>')}</g></g></g>`;
      }).join('');
      svg.innerHTML = `${DEFS}${counter()}<g filter="url(#ck-sh)"><rect x="14" y="110" width="332" height="190" rx="16" fill="#e9c07c" stroke="#c99a4d" stroke-width="3"/></g>${segs}
        ${xs.map((x, i) => `<line class="cut-line" data-i="${i}" x1="${x}" x2="${x}" y1="118" y2="292" stroke="${cuts.has(i) ? 'none' : '#fff'}" stroke-width="4" stroke-dasharray="8 7" opacity=".95"/>`).join('')}
        <g id="kn" opacity="0" transform="translate(0 0)"><path d="M0 0L90-8L96 6L8 22Z" fill="#dfe6ee" stroke="#9aa7b6" stroke-width="2"/><rect x="92" y="-6" width="60" height="16" rx="6" fill="#6b3f22" transform="rotate(-4 92 -6)"/></g>`;
      svg.dataset.cuts = cuts.size;
    };
    draw();
    svg.addEventListener('pointerdown', (e) => { if (finished) return; e.preventDefault(); svg.setPointerCapture?.(e.pointerId); last = svgPoint(svg, e); });
    svg.addEventListener('pointermove', (e) => {
      if (!last || finished) return;
      const p = svgPoint(svg, e);
      const kn = svg.querySelector('#kn'); if (kn) { kn.setAttribute('opacity', 1); kn.setAttribute('transform', `translate(${p.x - 10} ${p.y - 6})`); }
      let changed = false;
      xs.forEach((lx, i) => {
        if (!cuts.has(i) && (last.x - lx) * (p.x - lx) <= 0 && p.y > 112 && p.y < 300 && last.x !== p.x) { cuts.add(i); changed = true; }
      });
      last = p;
      if (changed) {
        const kx = p.x, ky = p.y; draw();
        const kn2 = svg.querySelector('#kn'); kn2.setAttribute('opacity', 1); kn2.setAttribute('transform', `translate(${kx - 10} ${ky - 6})`);
        if (cuts.size === xs.length) finish(1, 'Irisan rapi!');
      }
    });
    const up = () => { last = null; svg.querySelector('#kn')?.setAttribute('opacity', 0); };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }

  else if (spec.type === 'timing') {
    const [lo, hi] = spec.zone; let p = 0, running = true;
    svg.innerHTML = `${DEFS}${counter()}${teapot(true)}<g class="ck-steam" transform="translate(30 20)"><path d="M150 120Q135 95 152 75Q168 55 152 35" /><path d="M190 125Q175 100 192 80Q208 60 192 40"/></g>
      <rect x="40" y="326" width="280" height="22" rx="11" fill="#f4efe6" stroke="#b98a55" stroke-width="2"/>
      <rect x="${40 + lo * 280}" y="326" width="${(hi - lo) * 280}" height="22" fill="#3fa564" opacity=".5"/>
      <rect id="bar" x="40" y="326" width="0" height="22" rx="11" fill="#b8272f" opacity=".75"/>
      <g id="mk"><path d="M0 316L-9 300H9Z" fill="#b8272f"/></g>`;
    const bar = svg.querySelector('#bar'), mkr = svg.querySelector('#mk');
    const draw = () => { bar.setAttribute('width', Math.max(0, p * 280)); mkr.setAttribute('transform', `translate(${40 + p * 280} 0)`); svg.dataset.p = p.toFixed(3); };
    const stopAt = () => {
      if (!running) return; running = false;
      const s = p >= lo && p <= hi ? 1 : p > lo - 0.12 && p < hi + 0.12 ? 0.7 : 0.4;
      finish(s, s === 1 ? 'Tehnya pas!' : p < lo ? 'Agak kurang seduh' : 'Agak terlalu pekat');
    };
    svg.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!finished) stopAt(); });
    loop((dt) => { if (!running) return; p = Math.min(1, p + dt / spec.seconds); draw(); if (p >= 1) { running = false; finish(0.3, 'Terlalu lama diseduh'); } });
    draw();
  }

  return stop;
}

// ---------- resep ----------
const POTR = { vessel: 'pot', kind: 'water', color: '#d3ec9c', speed: 0.5 };
const RECIPES = [
  { id: 'onigiri', jp: 'おにぎり', name: 'Onigiri', blurb: 'Nasi kepal segitiga berisi umeboshi',
    stages: [
      { type: 'hold', vessel: 'bowl', kind: 'rice', speed: 0.5, zone: [0.62, 0.84], jp: 'ごはん', ro: 'gohan', id: 'nasi', text: 'Tahan layar untuk menyendok nasi. Lepas saat nasi sampai di area hijau.' },
      { type: 'tap', shape: 'ball', count: 8, jp: 'にぎる', ro: 'nigiru', id: 'menggenggam', text: 'Ketuk cepat 8 kali untuk mengepal nasi menjadi segitiga.' },
      { type: 'drag', jp: 'うめぼし', ro: 'umeboshi', id: 'acar plum', text: 'Seret umeboshi ke tengah nasi.', from: [70, 340], to: [180, 205], r: 46, base: () => plate(180, 292, 150) + riceBall(1), item: umeItem, after: () => umeDot() },
      { type: 'drag', jp: 'のり', ro: 'nori', id: 'rumput laut kering', text: 'Seret nori untuk membungkus onigiri.', from: [75, 335], to: [180, 255], r: 50, base: () => plate(180, 292, 150) + riceBall(1), item: () => noriSheet(0, 0), after: () => noriBand() },
    ] },
  { id: 'ocha', jp: 'おちゃ', name: 'Ocha', blurb: 'Teh hijau hangat ala Jepang',
    stages: [
      { type: 'drag', jp: 'ちゃば', ro: 'chaba', id: 'daun teh', text: 'Seret sendok daun teh ke dalam teko.', from: [70, 335], to: [180, 150], r: 48, base: () => teapot(false), item: leafSpoon, after: () => `<path d="M130 148Q160 130 190 146Q220 130 235 150Q200 160 130 148Z" fill="#5f8a3b"/>` },
      { type: 'hold', ...POTR, zone: [0.6, 0.82], jp: 'おゆ', ro: 'oyu', id: 'air panas', text: 'Tahan untuk menuang air panas ke teko. Lepas di area hijau.' },
      { type: 'timing', zone: [0.6, 0.82], seconds: 5, jp: 'むらす', ro: 'murasu', id: 'menyeduh', text: 'Tunggu tehnya meresap. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'hold', vessel: 'cup', kind: 'tea', color: '#9cb04a', speed: 0.45, zone: [0.68, 0.88], jp: 'ちゃわん', ro: 'chawan', id: 'cangkir', text: 'Tahan untuk menuang teh ke cangkir. Jangan sampai penuh!' },
    ] },
  { id: 'sushi', jp: 'すし', name: 'Sushi', blurb: 'Nigiri ikan segar dengan wasabi',
    stages: [
      { type: 'tap', shape: 'rect', count: 6, jp: 'ごはん', ro: 'gohan', id: 'nasi', text: 'Ketuk cepat 6 kali untuk menekan nasi sushi.' },
      { type: 'cut', lines: [110, 180, 250], jp: 'さかな', ro: 'sakana', id: 'ikan', text: 'Geser jari dari kiri ke kanan melewati garis putus-putus untuk memotong ikan.' },
      { type: 'drag', jp: 'わさび', ro: 'wasabi', id: 'wasabi', text: 'Seret wasabi ke atas nasi.', from: [70, 335], to: [180, 214], r: 40, base: () => plate(180, 290, 160) + `<g filter="url(#ck-sh)"><rect x="100" y="206" width="160" height="66" rx="32" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>`, item: () => wasabiBlob(0, 0, 1.3), after: () => wasabiBlob(180, 212, 0.8) },
      { type: 'drag', jp: 'のせる', ro: 'noseru', id: 'meletakkan', text: 'Seret irisan ikan ke atas nasi.', from: [95, 340], to: [180, 214], r: 50, base: () => plate(180, 290, 160) + `<g filter="url(#ck-sh)"><rect x="100" y="206" width="160" height="66" rx="32" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>` + wasabiBlob(180, 212, 0.8), item: () => fishSlice(0, 0, 0.9), after: () => fishSlice(180, 214, 1.02) },
    ] },
];
const BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// ---------- tampilan ----------
function intro(container) {
  if (introSeen) return;
  introSeen = true;
  const el = document.createElement('div');
  el.className = 'cook-intro';
  el.innerHTML = `<div class="ci-curtain l"></div><div class="ci-curtain r"></div>
    <div class="ci-title"><div class="ci-jp">料理</div><div class="ci-sub">Dapur Jepang</div></div>
    <svg class="ci-steam" viewBox="0 0 200 120" aria-hidden="true"><path d="M60 110Q45 85 62 65Q78 45 62 20"/><path d="M100 110Q85 85 102 65Q118 45 102 20"/><path d="M140 110Q125 85 142 65Q158 45 142 20"/></svg>`;
  container.appendChild(el);
  const kill = () => el.remove();
  el.addEventListener('click', kill);
  setTimeout(kill, 2600);
}

export async function cookMenuView({ container }) {
  container.innerHTML = `<div class="cook-wrap"><p style="margin-bottom:12px"><a href="#/learn" class="small">← Belajar</a></p>` +
    pageHead({ title: 'Dapur Jepang', subtitle: 'Masak hidangan khas Jepang dengan gerakan jarimu. Setiap langkah punya nama bahasa Jepangnya.' }) +
    `<div class="cat-grid">${RECIPES.map((r, i) => `<a class="cat-card cook-card" href="#/cook/${r.id}" style="--i:${i}"><div class="cook-thumb">${dishSvg(r.id)}</div><span class="cat-jp">${esc(r.jp)}</span><h3>${esc(r.name)}</h3><p>${esc(r.blurb)}</p><span class="small muted">${r.stages.length} langkah</span></a>`).join('')}</div></div>`;
  intro(container.firstElementChild);
}

export async function cookPlayView({ container, params }) {
  const rec = BY_ID[params.id];
  if (!rec) { location.hash = '#/cook'; return; }
  let idx = 0, scores = [], stopStage = null;
  const wrap = document.createElement('div');
  wrap.className = 'cook-wrap';
  container.replaceChildren(wrap);
  const back = `<p style="margin-bottom:12px"><a href="#/cook" class="small">← Pilih hidangan</a></p>`;

  const recipeCard = () => {
    wrap.innerHTML = back + pageHead({ title: `${rec.jp} (${rec.name})`, subtitle: rec.blurb }) +
      `<div class="cook-recipe"><div class="cook-thumb big">${dishSvg(rec.id)}</div>
        <ol class="cook-steps">${rec.stages.map((s) => `<li><strong class="jp">${esc(s.jp)}</strong> <span class="muted">${esc(s.ro)} = ${esc(s.id)}</span></li>`).join('')}</ol>
        <button class="btn btn-primary btn-lg" id="start">Mulai memasak</button></div>`;
    wrap.querySelector('#start').addEventListener('click', () => { idx = 0; scores = []; stage(); });
  };

  const stage = () => {
    stopStage?.();
    if (idx >= rec.stages.length) return result();
    const s = rec.stages[idx];
    wrap.innerHTML = back + `<div class="cook-head"><span class="small muted">Langkah ${idx + 1} dari ${rec.stages.length}</span>
      <div class="cook-word"><strong class="jp">${esc(s.jp)}</strong><span>${esc(s.ro)} = ${esc(s.id)}</span></div>
      <p class="cook-prompt">${esc(s.text)}</p><div class="meter"><i style="width:${(idx / rec.stages.length) * 100}%"></i></div></div>
      <div class="cook-board" id="board"></div><div class="cook-flash" id="flash" role="status"></div>`;
    const board = wrap.querySelector('#board'), flash = wrap.querySelector('#flash');
    stopStage = runStage(board, s, (score, msg) => {
      scores.push(score);
      flash.textContent = msg; flash.classList.add('show');
      setTimeout(() => { if (wrap.isConnected) { idx++; stage(); } }, 1000);
    });
  };

  const result = () => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stars = avg >= 0.88 ? 3 : avg >= 0.65 ? 2 : 1;
    const star = (on, i) => `<svg class="cook-star ${on ? 'on' : ''}" style="--d:${i * 0.25}s" viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.5 5.8 21l1.4-7L2 9.3l7-.8z"/></svg>`;
    wrap.innerHTML = back + pageHead({ title: `${rec.jp} sudah jadi!`, subtitle: stars === 3 ? 'Luar biasa, masakanmu sempurna.' : stars === 2 ? 'Enak! Coba lagi supaya lebih rapi.' : 'Sudah jadi. Coba lagi dengan gerakan lebih pelan dan tepat.' }) +
      `<div class="cook-done"><div class="cook-thumb big served">${dishSvg(rec.id, rec.id === 'ocha')}</div>
        <div class="cook-stars" aria-label="${stars} dari 3 bintang">${[0, 1, 2].map((i) => star(i < stars, i)).join('')}</div>
        <h2>Kosakata yang kamu pakai</h2>
        <ul class="cook-vocab">${rec.stages.map((s) => `<li><strong class="jp">${esc(s.jp)}</strong> <span class="muted">${esc(s.ro)} = ${esc(s.id)}</span></li>`).join('')}</ul>
        <div class="cook-actions"><button class="btn btn-primary btn-lg" id="again">Masak lagi</button> <a class="btn btn-lg" href="#/cook">Hidangan lain</a></div></div>`;
    wrap.querySelector('#again').addEventListener('click', () => { idx = 0; scores = []; stage(); });
  };

  recipeCard();
  return () => stopStage?.();
}
