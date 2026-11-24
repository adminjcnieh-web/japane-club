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

const ricePot = () => `<g filter="url(#ck-sh)"><rect x="46" y="205" width="30" height="15" rx="7" fill="#3b4452"/><rect x="284" y="205" width="30" height="15" rx="7" fill="#3b4452"/>
  <path d="M70 190Q70 304 180 304Q290 304 290 190Z" fill="#46505e"/><ellipse cx="180" cy="190" rx="110" ry="16" fill="#5d6878"/>
  <path d="M80 188Q80 134 180 132Q280 134 280 188Z" fill="#6c788a"/><path d="M104 170Q120 148 160 144" stroke="#a9b6c8" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/><circle cx="180" cy="128" r="10" fill="#3b4452"/></g>`;
const riceMound = () => plate(180, 292, 150) + `<g filter="url(#ck-sh)"><ellipse cx="180" cy="238" rx="92" ry="48" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>`;
const sushiRice = () => plate(180, 290, 160) + `<g filter="url(#ck-sh)"><rect x="100" y="206" width="160" height="66" rx="32" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>`;
const shoyuDish = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="42" ry="22" fill="#fff" stroke="#e2d9c3" stroke-width="3"/><ellipse cx="0" cy="-1" rx="32" ry="14" fill="#3b2418"/><ellipse cx="-8" cy="-5" rx="10" ry="3" fill="#7a5238" opacity=".7"/></g>`;
const nigiriPiece = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><rect x="-80" y="-30" width="160" height="66" rx="32" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/>${fishSlice(0, -8, 1.02)}</g>`;
const MASCOT = `<svg class="ck-mascot" viewBox="0 0 70 76" aria-hidden="true"><ellipse cx="35" cy="72" rx="20" ry="4" fill="#0002"/><path d="M14 30Q4 8 22 6Q26-4 38 4Q54-2 56 12Q68 22 56 32Z" fill="#fff" stroke="#e6dfd2" stroke-width="2"/><rect x="16" y="28" width="38" height="9" rx="3" fill="#fff" stroke="#e6dfd2" stroke-width="2"/><circle cx="35" cy="50" r="22" fill="#fbd9b8" stroke="#e8b98d" stroke-width="2"/><g class="ck-eyes"><ellipse cx="27" cy="49" rx="3" ry="4" fill="#3b2418"/><ellipse cx="43" cy="49" rx="3" ry="4" fill="#3b2418"/></g><circle cx="21" cy="57" r="4" fill="#f4a3a3" opacity=".7"/><circle cx="49" cy="57" r="4" fill="#f4a3a3" opacity=".7"/><path d="M29 58Q35 64 41 58" stroke="#b8272f" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="0" y="0" width="0" height="0"/></svg>`;

// ---------- bahan & alat tambahan ----------
const slab = (c1, c2, st) => (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><defs><linearGradient id="g${c1.slice(1)}${c2.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><path d="M-84 6Q-90-26-40-30Q20-38 70-26Q96-18 90 8Q80 32 20 34Q-60 40-84 6Z" fill="url(#g${c1.slice(1)}${c2.slice(1)})"/><path d="M-58-8Q-10-26 50-14M-66 10Q-10-8 64 4M-50 24Q0 10 56 20" stroke="${st}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".75"/></g>`;
const SLAB = { telur: slab('#ffd84d', '#e8a800', '#fff2a8'), tahu: slab('#fffdf0', '#ece3c2', '#ffffff'), cha: slab('#c47a56', '#7a3f2a', '#f0c4a6'), tako: slab('#d0607a', '#8f2f4a', '#f6c9d3') };
const SOUP_D = 'M70,170 Q70,290 180,290 Q290,290 290,170 Z';
const soupPot = (broth, extra = '') => `<g filter="url(#ck-sh)"><rect x="42" y="196" width="30" height="15" rx="7" fill="#3b4452"/><rect x="288" y="196" width="30" height="15" rx="7" fill="#3b4452"/><path d="${SOUP_D}" fill="#46505e"/><ellipse cx="180" cy="170" rx="110" ry="18" fill="#5d6878"/><ellipse cx="180" cy="171" rx="100" ry="13" fill="${broth || '#2c333d'}"/></g>${extra}`;
const pan = (fill = '#ffd34d', extra = '') => `<g filter="url(#ck-sh)"><rect x="285" y="228" width="72" height="20" rx="10" fill="#2a2e35"/><ellipse cx="165" cy="238" rx="140" ry="82" fill="#2f343d"/><ellipse cx="165" cy="236" rx="122" ry="68" fill="#4a505b"/>${fill ? `<ellipse cx="165" cy="236" rx="112" ry="60" fill="${fill}" opacity=".95"/>` : ''}</g>${extra}`;
const HOLES = [[95, 205], [180, 205], [265, 205], [95, 265], [180, 265], [265, 265]];
const takoPan = ({ batter = false, tako = false, balls = 0, sauce = false } = {}) => `<g filter="url(#ck-sh)"><rect x="322" y="222" width="38" height="18" rx="9" fill="#2a2e35"/><rect x="25" y="150" width="310" height="170" rx="24" fill="#3a3f48"/></g>` + HOLES.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="38" ry="26" fill="#1f2228"/>${batter ? `<ellipse cx="${x}" cy="${y}" rx="34" ry="22" fill="#f5df9a"/>` : ''}${tako ? `<circle cx="${x - 8}" cy="${y + 2}" r="8" fill="#c0526b"/>` : ''}${i < balls ? `<circle cx="${x}" cy="${y - 6}" r="31" fill="#e8a43c" stroke="#c4801f" stroke-width="2"/><ellipse cx="${x - 9}" cy="${y - 17}" rx="10" ry="5" fill="#fff" opacity=".4"/>${sauce ? `<path d="M${x - 24} ${y - 12}L${x - 8} ${y - 24}L${x + 4} ${y - 8}L${x + 20} ${y - 22}" stroke="#5a2a14" stroke-width="5" fill="none" stroke-linecap="round"/>` : ''}` : ''}`).join('');
const eggScene = (t) => { const n = Math.round(t * 3); return `<g filter="url(#ck-sh)"><ellipse cx="180" cy="250" rx="135" ry="72" fill="#a9452f"/><ellipse cx="180" cy="240" rx="122" ry="58" fill="#fff3d6"/></g>${[0, 1, 2].map((i) => i < n ? `<ellipse cx="${130 + i * 50}" cy="${232 + (i % 2) * 14}" rx="26" ry="22" fill="#ffc82e" stroke="#e6a800" stroke-width="2"/><ellipse cx="${122 + i * 50}" cy="${224 + (i % 2) * 14}" rx="7" ry="4" fill="#fff" opacity=".6"/>` : `<g class="ck-pulse"><ellipse cx="${100 + i * 80}" cy="90" rx="26" ry="33" fill="#fff7ec" stroke="#e5d6bf" stroke-width="2"/></g>`).join('')}`; };
const rollScene = (p) => { const L = 100 + p * 120; return pan('#f4c430', '') + `<g filter="url(#ck-sh)"><rect x="${L - 10}" y="190" width="${Math.max(0, 290 - L)}" height="${90 - p * 50}" rx="10" fill="#ffd84d" opacity="${1 - p * 0.4}"/><rect x="60" y="${196 - p * 6}" width="${L - 40}" height="${74 + p * 4}" rx="30" fill="#ffd84d" stroke="#e8a800" stroke-width="3"/><path d="M${70 + 16} ${210}Q${60 + (L - 40) / 2} 200 ${L + 10} 214M${86} 240Q${60 + (L - 40) / 2} 232 ${L + 4} 246" stroke="#fff2a8" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/></g><path d="M110 340H250M126 328L110 340L126 352M234 328L250 340L234 352" stroke="#b8272f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="ck-hint"/>`; };
const DANGO_C = ['#f6b6c8', '#ffffff', '#a9d58a'];
const dangoBalls = (r = 38, n = 3, extra = '') => `<g filter="url(#ck-sh)">${[0, 1, 2].slice(0, n).map((i) => `<circle cx="${120 + i * 60}" cy="236" r="${r}" fill="${DANGO_C[i]}" stroke="#e2d9c3" stroke-width="2"/><ellipse cx="${108 + i * 60}" cy="${222}" rx="${r * 0.3}" ry="${r * 0.16}" fill="#fff" opacity=".55"/>`).join('')}</g>${extra}`;
const dangoScene = (t) => { const n = Math.round(t * 3); return plate(180, 292, 160) + (n ? dangoBalls(14 + t * 24, n) : '') ; };
const skewerLine = `<path d="M50 236H320" stroke="#c99a63" stroke-width="7" stroke-linecap="round"/><path d="M318 236L336 236" stroke="#c99a63" stroke-width="7" stroke-linecap="round"/>`;
const glaze = `<path d="M92 214Q130 262 178 218Q226 262 268 214" stroke="#7a4a24" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>`;
const noodleBundle = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)" stroke="#f0d078" stroke-width="7" fill="none" stroke-linecap="round"><path d="M-46-18Q-24-34-2-18T42-18"/><path d="M-50 0Q-26-16-2 0T46 0"/><path d="M-46 18Q-22 2 2 18T48 18"/><path d="M-40 34Q-16 18 8 34T52 34"/></g>`;
const noodlesTop = `<g stroke="#f0d078" stroke-width="6" fill="none" stroke-linecap="round"><path d="M110 190Q135 172 160 190T210 190"/><path d="M104 214Q130 196 156 214T208 214"/><path d="M116 238Q142 220 168 238T220 238"/><path d="M132 166Q156 150 180 166T228 166"/></g>`;
const chashuRound = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><ellipse rx="34" ry="26" fill="#d89a78"/><ellipse rx="30" ry="22" fill="#c47a56"/><path d="M-20-4Q0-14 20-4M-18 8Q0 0 18 8" stroke="#f0c4a6" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>`;
const eggHalf = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><ellipse rx="26" ry="32" fill="#fffaf0" stroke="#e5d6bf" stroke-width="2"/><ellipse rx="13" ry="14" fill="#ffb52e"/><ellipse cx="-4" cy="-4" rx="4" ry="3" fill="#fff" opacity=".6"/></g>`;
const ramenBowl = ({ broth = true, noodles = true, chashu = false, egg = false, negi = false } = {}) => `<g filter="url(#ck-sh)"><circle cx="180" cy="206" r="136" fill="#b8272f"/><circle cx="180" cy="206" r="124" fill="#8a1c23"/><circle cx="180" cy="206" r="116" fill="${broth ? '#d9a441' : '#6a1a1d'}"/></g>${broth && noodles ? noodlesTop : ''}${chashu ? chashuRound(238, 200, 0.95) + chashuRound(224, 244, 0.8) : ''}${egg ? eggHalf(130, 232, 0.9) : ''}${negi ? '<g fill="#5fa84a"><circle cx="150" cy="178" r="4"/><circle cx="196" cy="156" r="4"/><circle cx="250" cy="170" r="4"/><circle cx="180" cy="262" r="4"/><circle cx="120" cy="206" r="4"/><circle cx="214" cy="224" r="4"/></g>' : ''}`;
const shrimp = (x, y, s = 1, c1 = '#ff8a5c', c2 = '#e0502b', tail = true) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><path d="M-70 8Q-70-26-24-30Q40-34 62-8Q72 6 56 16Q40 24 18 12Q-30 6-50 30Q-70 30-70 8Z" fill="${c1}"/><path d="M-34-14Q-4-26 30-14M-44 2Q-10-8 36 4" stroke="${c2}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>${tail ? `<path d="M56 14L84 0L78 24L90 34L60 30Z" fill="${c2}"/>` : ''}</g>`;
const crisp = (x, y, s = 1) => shrimp(x, y, s, '#f0b64a', '#c4801f', true);
const battered = (x, y, s = 1) => shrimp(x, y, s, '#f3dfa0', '#d8b95c', true);
const misoSpoon = () => `<g filter="url(#ck-sh)"><rect x="-6" y="-4" width="92" height="9" rx="4" fill="#b98a55" transform="rotate(-18)"/><ellipse cx="-4" cy="2" rx="28" ry="15" fill="#c99a63"/><ellipse cx="-4" cy="-3" rx="22" ry="10" fill="#9c5f33"/></g>`;
const tofuCubes = (x = 0, y = 0, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><rect x="-34" y="-8" width="26" height="26" rx="5" fill="#fffdf0" stroke="#ece3c2"/><rect x="-6" y="-16" width="26" height="26" rx="5" fill="#fffdf0" stroke="#ece3c2"/><rect x="8" y="6" width="26" height="26" rx="5" fill="#fffdf0" stroke="#ece3c2"/></g>`;
const wakameItem = (x = 0, y = 0, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)" fill="#2f6b3a"><path d="M-36 4Q-34-14-14-10Q0-20 12-6Q30-10 30 8Q18 20 0 14Q-20 22-36 4Z"/><path d="M-4 24Q4 8 24 14Q38 22 22 34Q6 38-4 24Z" fill="#3f8a4c"/></g>`;
const takoChunks = (x = 0, y = 0, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><circle cx="-16" cy="4" r="12" fill="#c0526b"/><circle cx="10" cy="-6" r="12" fill="#d0607a"/><circle cx="14" cy="16" r="11" fill="#b04560"/></g>`;
const sauceBottle = () => `<g filter="url(#ck-sh)" transform="rotate(35)"><rect x="-16" y="-30" width="32" height="62" rx="10" fill="#7a3a1a"/><rect x="-8" y="-46" width="16" height="18" rx="4" fill="#e8c860"/><rect x="-12" y="-6" width="24" height="22" rx="4" fill="#f4e6c0" opacity=".85"/></g>`;
const skewerItem = () => `<g filter="url(#ck-sh)"><rect x="-90" y="-3.5" width="170" height="7" rx="3.5" fill="#c99a63"/><path d="M80-3.5L100 0L80 3.5Z" fill="#c99a63"/></g>`;
const batterBowl = (fill) => `<g filter="url(#ck-sh)"><ellipse cx="180" cy="250" rx="135" ry="70" fill="#a9452f"/><ellipse cx="180" cy="242" rx="122" ry="58" fill="${fill}"/></g>`;

// ---------- bahan & alat gelombang 3 ----------
SLAB.ayam = slab('#f6dcae', '#d9a867', '#fff0cc');
SLAB.udon = slab('#fffaf0', '#efe4cc', '#ffffff');
SLAB.kol = slab('#c6e8a0', '#8fbf5d', '#e9f7d6');
const chawanTop = (fill, foam = false) => `<g filter="url(#ck-sh)"><ellipse cx="180" cy="250" rx="135" ry="72" fill="#3b4452"/><ellipse cx="180" cy="240" rx="122" ry="58" fill="${fill}"/>${foam ? '<g fill="#d9eaa6" opacity=".9"><circle cx="140" cy="232" r="9"/><circle cx="170" cy="222" r="7"/><circle cx="205" cy="236" r="10"/><circle cx="235" cy="228" r="7"/><circle cx="185" cy="252" r="8"/><circle cx="150" cy="255" r="6"/></g>' : ''}</g>`;
const wagashi = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><circle r="24" fill="#f6b6c8" stroke="#e48fa6" stroke-width="2"/><path d="M-4-16Q8-26 14-14Q4-8-4-16Z" fill="#7fb05a"/><ellipse cx="-8" cy="-8" rx="6" ry="3" fill="#fff" opacity=".5"/></g>`;
const grill = (sk = '#f3d9a8', glaze = false, n = 3) => `<g filter="url(#ck-sh)"><rect x="25" y="165" width="310" height="160" rx="16" fill="#2f2a28"/><rect x="40" y="180" width="280" height="130" rx="8" fill="#e0561f"/><rect x="40" y="180" width="280" height="130" rx="8" fill="#ffb347" opacity=".35"/></g><g stroke="#2f2a28" stroke-width="4">${[70, 110, 150, 190, 230, 270].map((x) => `<line x1="${x}" y1="180" x2="${x}" y2="310"/>`).join('')}</g>` + [0, 1, 2].slice(0, n).map((i) => yakiSkewer(180, 205 + i * 42, sk, glaze)).join('');
const yakiSkewer = (x, y, c, glaze = false) => `<g transform="translate(${x} ${y})"><path d="M-110 0H110" stroke="#c99a63" stroke-width="6" stroke-linecap="round"/>${[-66, -22, 22, 66].map((dx) => `<circle cx="${dx}" cy="0" r="18" fill="${c}" stroke="#a8743a" stroke-width="2"/>${glaze ? `<path d="M${dx - 12} -6Q${dx} 8 ${dx + 12} -6" stroke="#5a2a14" stroke-width="5" fill="none" stroke-linecap="round"/>` : ''}`).join('')}</g>`;
const chickenRow = (c = '#f6dcae') => [100, 150, 210, 260].map((x) => `<circle cx="${x}" cy="236" r="22" fill="${c}" stroke="#a8743a" stroke-width="2"/>`).join('');
const lerpHex = (a, b, t) => { const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const udonBowl = ({ broth = true, noodles = false, negi = false, kama = false } = {}) => `<g filter="url(#ck-sh)"><circle cx="180" cy="206" r="136" fill="#2f3b4a"/><circle cx="180" cy="206" r="124" fill="#f4efe6"/><circle cx="180" cy="206" r="116" fill="${broth ? '#e0bd72' : '#f4efe6'}"/></g>${noodles ? '<g stroke="#fffaf0" stroke-width="10" fill="none" stroke-linecap="round"><path d="M108 188Q134 168 160 188T212 188"/><path d="M104 214Q130 194 156 214T208 214"/><path d="M116 240Q142 220 168 240T220 240"/><path d="M136 164Q160 146 184 164T232 164"/></g>' : ''}${kama ? '<g transform="translate(236 210)" filter="url(#ck-sh)"><circle r="26" fill="#fff"/><path d="M-18 0A18 18 0 0 1 18 0A9 9 0 0 1 0 0A9 9 0 0 0 -18 0Z" fill="#f4a3b4"/></g>' : ''}${negi ? '<g fill="#5fa84a"><circle cx="150" cy="176" r="4"/><circle cx="196" cy="154" r="4"/><circle cx="212" cy="236" r="4"/><circle cx="120" cy="210" r="4"/><circle cx="170" cy="262" r="4"/></g>' : ''}`;
const flattenScene = (p) => `<g filter="url(#ck-sh)"><ellipse cx="180" cy="250" rx="${40 + p * 130}" ry="${30 + p * 38}" fill="#fff8ea" stroke="#e5d9bd" stroke-width="3"/></g><g filter="url(#ck-sh)"><rect x="${60 + p * 6}" y="${196 - p * 10}" width="240" height="26" rx="13" fill="#c99a63" stroke="#a8743a" stroke-width="2"/><rect x="${44 + p * 6}" y="${204 - p * 10}" width="26" height="10" rx="5" fill="#a8743a"/><rect x="${290 + p * 6}" y="${204 - p * 10}" width="26" height="10" rx="5" fill="#a8743a"/></g><path d="M110 340H250M126 328L110 340L126 352M234 328L250 340L234 352" stroke="#b8272f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="ck-hint"/>`;
const wrapper = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><circle r="56" fill="#fbf2dc" stroke="#e5d6b2" stroke-width="3"/></g>`;
const fillingBlob = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><path d="M-22 4Q-24-14-6-14Q14-20 22-6Q28 10 8 14Q-14 18-22 4Z" fill="#c98a6a"/><circle cx="-6" cy="-2" r="4" fill="#6fa14a"/><circle cx="8" cy="4" r="3" fill="#6fa14a"/></g>`;
const gyozaShape = (x, y, s = 1, gold = false) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#ck-sh)"><path d="M-42 10Q-30-34 0-34Q30-34 42 10Q0 26-42 10Z" fill="${gold ? '#e8c068' : '#fbf2dc'}" stroke="${gold ? '#b8862e' : '#d9c28f'}" stroke-width="2.5"/>${gold ? '<path d="M-38 12Q0 26 38 12" stroke="#a8691e" stroke-width="5" fill="none"/>' : ''}<path d="M-26-24Q-24-10-28 0M-12-30Q-10-14-14 -2M4-32Q6-16 2-4M20-28Q22-14 18-2" stroke="${gold ? '#b8862e' : '#d9c28f'}" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
const gyozaRow = (gold = false, cx = 165, cy = 236) => [[-70, 8], [-24, -12], [24, 8], [70, -12]].map(([dx, dy]) => gyozaShape(cx + dx, cy + dy, 0.78, gold)).join('');
const foldScene = (p) => { const k = 1 - p; return `<g filter="url(#ck-sh)" transform="translate(180 236)"><path d="M-72 0A72 72 0 0 0 72 0Z" fill="#fbf2dc" stroke="#e5d6b2" stroke-width="3"/><g transform="scale(1 ${k})"><path d="M-72 0A72 72 0 0 1 72 0Z" fill="#fbf2dc" stroke="#e5d6b2" stroke-width="3"/></g><path d="M-30 -2Q0 -22 30 -2Q0 10 -30 -2Z" fill="#c98a6a" opacity="${0.9 * k}"/>${p > 0.55 ? '<path d="M-48 -4Q-46-18-50 -8M-28-18Q-26-30-30-22M-6-24Q-4-36-8-28M16-22Q18-34 14-26M38-12Q40-24 36-16" stroke="#d9c28f" stroke-width="3" fill="none" stroke-linecap="round"/>' : ''}</g><path d="M110 340H250M126 328L110 340L126 352M234 328L250 340L234 352" stroke="#b8272f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="ck-hint"/>`; };
const pancake = (x, y, rx, ry, t) => `<g filter="url(#ck-sh)"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${lerpHex('#efe0a0', '#c98b3a', t)}" stroke="#a8691e" stroke-width="2"/><g fill="#9cc86a" opacity=".8"><circle cx="${x - rx * 0.5}" cy="${y - ry * 0.2}" r="5"/><circle cx="${x + rx * 0.2}" cy="${y - ry * 0.4}" r="4"/><circle cx="${x + rx * 0.5}" cy="${y + ry * 0.2}" r="5"/><circle cx="${x - rx * 0.1}" cy="${y + ry * 0.3}" r="4"/></g></g>`;
const flipScene = (t) => { const k = Math.round(t * 3); return pan(null, pancake(165, 236 - (k % 2) * 8, 112, 58 - (k % 2) * 6, k / 3)); };
const okoSauce = `<ellipse cx="180" cy="236" rx="104" ry="42" fill="#6a2f14" opacity=".92"/>`;
const mayo = `<path d="M96 222Q120 204 144 232T192 222T240 234T264 222" stroke="#fff6dc" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M110 248Q134 232 158 252T206 244T250 252" stroke="#fff6dc" stroke-width="7" fill="none" stroke-linecap="round"/>`;

/** Hidangan jadi (dipakai sebagai gambar menu dan layar hasil). */
function dishSvg(id, steam = false) {
  const steamPath = steam ? `<g class="ck-steam"><path d="M150 120Q135 95 152 75Q168 55 152 35" /><path d="M190 125Q175 100 192 80Q208 60 192 40"/><path d="M228 120Q213 95 230 75Q246 55 230 35"/></g>` : '';
  let body = '';
  if (id === 'onigiri') body = plate(180, 292, 150) + riceBall(1, noriBand());
  else if (id === 'sushi') body = plate(180, 290, 160) + `<g filter="url(#ck-sh)"><rect x="100" y="206" width="160" height="66" rx="32" fill="url(#ck-rice)" stroke="#e2d9c3" stroke-width="3"/></g>${wasabiBlob(180, 210, 0.8)}${fishSlice(180, 214, 1.02)}<g><rect x="262" y="252" width="62" height="22" rx="11" fill="#fff" stroke="#e2d9c3"/><ellipse cx="293" cy="260" rx="22" ry="6" fill="#3b2418"/></g>`;
  else if (id === 'ocha') body = `<g>${cupBase()}<clipPath id="ck-dc"><path d="${CUP_D}"/></clipPath><g clip-path="url(#ck-dc)"><rect x="100" y="205" width="160" height="120" fill="#9cb04a"/></g><ellipse cx="180" cy="190" rx="70" ry="11" fill="#b6c866"/></g>${steamPath}`;
  else if (id === 'tamagoyaki') body = plate(180, 290, 160) + [0, 1, 2, 3].map((i) => `<g filter="url(#ck-sh)"><rect x="${62 + i * 58}" y="205" width="56" height="78" rx="16" fill="#ffd84d" stroke="#e8a800" stroke-width="3"/><path d="M${74 + i * 58} 225Q${90 + i * 58} 214 ${106 + i * 58} 228M${74 + i * 58} 250Q${90 + i * 58} 240 ${106 + i * 58} 254" stroke="#fff2a8" stroke-width="5" fill="none" stroke-linecap="round"/></g>`).join('');
  else if (id === 'misoshiru') body = `<g filter="url(#ck-sh)"><path d="M70 200Q70 312 180 312Q290 312 290 200Z" fill="#b8272f"/><ellipse cx="180" cy="200" rx="110" ry="22" fill="#8a1c23"/><ellipse cx="180" cy="203" rx="100" ry="15" fill="#c99a63"/></g>${tofuCubes(160, 200, 0.7)}${wakameItem(215, 205, 0.55)}<g class="ck-steam"><path d="M150 150Q135 125 152 105Q168 85 152 65" /><path d="M200 155Q185 130 202 110Q218 90 202 70"/></g>`;
  else if (id === 'takoyaki') body = plate(180, 292, 168) + [[105, 240], [180, 222], [255, 240], [142, 272], [218, 272]].map(([x, y]) => `<g filter="url(#ck-sh)"><circle cx="${x}" cy="${y}" r="38" fill="#e8a43c" stroke="#c4801f" stroke-width="2"/></g><path d="M${x - 28} ${y - 14}L${x - 10} ${y - 28}L${x + 4} ${y - 8}L${x + 24} ${y - 26}" stroke="#5a2a14" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="${x - 12}" cy="${y + 8}" r="2.6" fill="#2f7a3b"/><circle cx="${x + 12}" cy="${y + 4}" r="2.6" fill="#2f7a3b"/>`).join('');
  else if (id === 'dango') body = plate(180, 292, 160) + skewerLine + dangoBalls(38, 3, glaze);
  else if (id === 'ramen') body = ramenBowl({ chashu: true, egg: true, negi: true }) + `<g class="ck-steam"><path d="M130 120Q115 95 132 75Q148 55 132 35" /><path d="M180 120Q165 95 182 75Q198 55 182 35"/><path d="M230 120Q215 95 232 75Q248 55 232 35"/></g>`;
  else if (id === 'tempura') body = plate(180, 292, 165) + crisp(150, 236, 1.05) + crisp(205, 262, 0.95) + `<g filter="url(#ck-sh)"><ellipse cx="290" cy="262" rx="26" ry="10" fill="#fff" stroke="#e2d9c3"/></g>`;
  else if (id === 'matcha') body = plate(180, 292, 150) + chawanTop('#7fa83a', true) + wagashi(286, 292, 1) + `<g class="ck-steam"><path d="M150 140Q135 115 152 95Q168 75 152 55" /><path d="M200 145Q185 120 202 100Q218 80 202 60"/></g>`;
  else if (id === 'yakitori') body = plate(180, 292, 165) + [0, 1, 2].map((i) => yakiSkewer(180, 215 + i * 36, '#c47a3c', true)).join('');
  else if (id === 'udon') body = udonBowl({ noodles: true, negi: true, kama: true }) + `<g class="ck-steam"><path d="M130 120Q115 95 132 75Q148 55 132 35" /><path d="M200 120Q185 95 202 75Q218 55 202 35"/></g>`;
  else if (id === 'gyoza') body = plate(180, 290, 165) + gyozaRow(true, 150, 236) + `<g filter="url(#ck-sh)"><ellipse cx="292" cy="266" rx="28" ry="11" fill="#fff" stroke="#e2d9c3"/><ellipse cx="292" cy="265" rx="20" ry="7" fill="#3b2418"/></g>`;
  else if (id === 'okonomiyaki') body = plate(180, 290, 170) + pancake(180, 236, 128, 54, 1) + okoSauce + mayo + '<g fill="#2f7a3b"><circle cx="120" cy="230" r="3"/><circle cx="170" cy="250" r="3"/><circle cx="220" cy="224" r="3"/><circle cx="250" cy="244" r="3"/></g>';
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
    const c = { bowl: { d: BOWL_D, top: 150, bottom: 310, base: bowlBase() }, pot: { d: POT_D, top: 150, bottom: 305, base: teapot(false) }, cup: { d: CUP_D, top: 190, bottom: 305, base: cupBase() }, soup: { d: SOUP_D, top: 170, bottom: 290, base: soupPot(null) } }[spec.vessel];
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
      <line id="st" x1="180" x2="180" y1="82" y2="150" stroke="${spec.kind === 'rice' ? '#fffdf5' : spec.stream || '#bfe6ff'}" stroke-width="${spec.kind === 'rice' ? 10 : 7}" stroke-linecap="round" stroke-dasharray="${spec.kind === 'rice' ? '2 11' : ''}" opacity="0"/>`;
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
    const grains = [];
    const draw = () => {
      const dots = `<g>${Array.from({ length: n }, (_, i) => `<circle cx="${180 - (n - 1) * 12 + i * 24}" cy="356" r="7" fill="${i < k ? '#b8272f' : '#f4efe6'}" stroke="#b8272f" stroke-width="2"/>`).join('')}</g>`;
      if (spec.scene) {
        svg.innerHTML = `${DEFS}${counter()}${spec.scene(k / n)}${dots}`;
      } else if (spec.sprinkle) {
        const [x0, y0, x1, y1] = spec.area;
        svg.innerHTML = `${DEFS}${counter()}${spec.base()}<g>${grains.map((g) => `<ellipse cx="${g.x}" cy="${g.y}" rx="${g.r * 1.5}" ry="${g.r}" fill="${g.c}" transform="rotate(${g.a} ${g.x} ${g.y})"/>`).join('')}</g>
          <g class="ck-shaker" transform="translate(${(x0 + x1) / 2 + 10} 100) rotate(${k % 2 ? 148 : 128})"><rect x="-18" y="-4" width="36" height="52" rx="8" fill="#e8eef4" stroke="#aab6c4" stroke-width="2"/><rect x="-14" y="-12" width="28" height="12" rx="4" fill="#8a96a6"/><circle cx="-6" cy="-6" r="1.6" fill="#fff"/><circle cx="2" cy="-7" r="1.6" fill="#fff"/><circle cx="8" cy="-5" r="1.6" fill="#fff"/></g>${dots}`;
      } else {
        svg.innerHTML = `${DEFS}${counter()}${plate(180, 295, spec.shape === 'ball' ? 150 : 160)}<g id="sh" class="ck-pulse">${shape(k / n)}</g>${dots}
        <g class="ck-hand" transform="translate(${236} ${150 - (k % 2) * 14})"><path d="M0 0Q12-18 28-6Q40 6 26 20L6 28Q-8 14 0 0Z" fill="#f2c9a0" stroke="#d9a574" stroke-width="2"/></g>`;
      }
      svg.dataset.count = k;
    };
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (finished) return;
      k++;
      if (spec.sprinkle) { const [x0, y0, x1, y1] = spec.area; for (let g = 0; g < 7; g++) grains.push({ x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0), r: 2.4 + Math.random() * 1.6, a: Math.random() * 180, c: spec.grains[g % spec.grains.length] }); }
      draw();
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
        return `<clipPath id="ck-s${i}"><rect x="${x0}" y="100" width="${x1 - x0}" height="200"/></clipPath><g transform="translate(${off} 0)"><g clip-path="url(#ck-s${i})"><g transform="translate(180 195) scale(1.55 1.4)">${(spec.slab || fishSlice)(0, 0, 1)}</g></g></g>`;
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

  else if (spec.type === 'swipe') {
    let p = 0, last = null;
    const draw = () => { svg.innerHTML = `${DEFS}${counter()}${spec.scene(p)}`; svg.dataset.p = p.toFixed(2); };
    svg.addEventListener('pointerdown', (e) => { if (finished) return; e.preventDefault(); svg.setPointerCapture?.(e.pointerId); last = svgPoint(svg, e); });
    svg.addEventListener('pointermove', (e) => {
      if (!last || finished) return;
      const q = svgPoint(svg, e); p = Math.min(1, p + Math.abs(q.x - last.x) / spec.dist); last = q; draw();
      if (p >= 1) finish(1, spec.done || 'Tergulung rapi!');
    });
    const up = () => { last = null; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    draw();
  }

  else if (spec.type === 'circle') {
    const cx = 180, cy = 196, turns = spec.turns, wash = spec.skin === 'wash';
    const [L0, L1] = spec.liq || (wash ? [[236, 232, 212], [205, 234, 246]] : [[196, 216, 122], [196, 216, 122]]);
    const useGrains = spec.grains ?? wash;
    const t0 = performance.now(); let total = 0, prev = null, ang = 0, down = false;
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const grains = useGrains ? Array.from({ length: 26 }, (_, i) => { const r = 20 + ((i * 37) % 80), a = i * 2.4; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, (i * 53) % 180]; }) : [];
    svg.innerHTML = `${DEFS}${counter()}<g filter="url(#ck-sh)"><circle cx="${cx}" cy="${cy}" r="132" fill="${spec.rim || (wash ? '#7a2f20' : '#4f6e57')}"/><circle cx="${cx}" cy="${cy}" r="118" id="liq" fill="rgb(${L0})"/></g>
      <g id="sw"><g opacity=".6" stroke="#fff" fill="none" stroke-width="5" stroke-linecap="round"><path d="M${cx - 90} ${cy}A90 90 0 0 1 ${cx} ${cy - 90}"/><path d="M${cx + 70} ${cy}A70 70 0 0 1 ${cx} ${cy + 70}"/><path d="M${cx - 40} ${cy + 20}A45 45 0 0 1 ${cx + 20} ${cy - 40}"/></g>${grains.map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.4" fill="#fffdf2" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g>
      <circle cx="${cx}" cy="${cy}" r="76" fill="none" stroke="#b8272f" stroke-width="3" stroke-dasharray="7 7" opacity=".8"/>
      <g id="fg" transform="translate(${cx + 76} ${cy})">${wash ? `<circle r="16" fill="#f2c9a0" stroke="#d9a574" stroke-width="2"/><circle cx="-4" cy="-5" r="5" fill="#fff" opacity=".35"/>` : `<g filter="url(#ck-sh)"><rect x="-6" y="-8" width="12" height="96" rx="6" fill="#c99a63" transform="rotate(-24)"/><ellipse rx="10" ry="12" fill="#b98a55"/></g>`}</g>
      <rect x="60" y="342" width="240" height="14" rx="7" fill="#f4efe6" stroke="#b98a55" stroke-width="2"/><rect id="pb" x="60" y="342" width="0" height="14" rx="7" fill="#b8272f"/>`;
    const liq = svg.querySelector('#liq'), sw = svg.querySelector('#sw'), fg = svg.querySelector('#fg'), pb = svg.querySelector('#pb');
    const upd = () => {
      const p = Math.min(1, total / (turns * 2 * Math.PI));
      pb.setAttribute('width', p * 240); sw.setAttribute('transform', `rotate(${ang} ${cx} ${cy})`);
      liq.setAttribute('fill', `rgb(${[0, 1, 2].map((i) => lerp(L0[i], L1[i], p))})`);
      svg.dataset.turns = (total / (2 * Math.PI)).toFixed(2); return p;
    };
    svg.addEventListener('pointerdown', (e) => { if (finished) return; e.preventDefault(); svg.setPointerCapture?.(e.pointerId); down = true; const p = svgPoint(svg, e); prev = Math.atan2(p.y - cy, p.x - cx); });
    svg.addEventListener('pointermove', (e) => {
      if (!down || finished) return;
      const p = svgPoint(svg, e), r = Math.hypot(p.x - cx, p.y - cy);
      fg.setAttribute('transform', `translate(${p.x} ${p.y})`);
      const a = Math.atan2(p.y - cy, p.x - cx); let d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      prev = a;
      if (r > 22 && r < 130) { total += Math.abs(d); ang += (d * 180) / Math.PI; }
      if (upd() >= 1) finish((performance.now() - t0) / 1000 <= turns * 3 ? 1 : 0.8, 'Lembut dan merata!');
    });
    const up = () => { down = false; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }

  else if (spec.type === 'timing') {
    const [lo, hi] = spec.zone; let p = 0, running = true;
    svg.innerHTML = `${DEFS}${counter()}${{ ricepot: () => ricePot(), soup: () => soupPot(spec.broth || '#e9d9a6'), pan: () => pan(spec.panFill, spec.panExtra || ''), tako: () => takoPan({ batter: true, tako: true }), grill: () => grill('#f3d9a8') }[spec.view]?.() || teapot(true)}<g class="ck-steam" transform="translate(30 20)"><path d="M150 120Q135 95 152 75Q168 55 152 35" /><path d="M190 125Q175 100 192 80Q208 60 192 40"/></g>
      <rect x="40" y="326" width="280" height="22" rx="11" fill="#f4efe6" stroke="#b98a55" stroke-width="2"/>
      <rect x="${40 + lo * 280}" y="326" width="${(hi - lo) * 280}" height="22" fill="#3fa564" opacity=".5"/>
      <rect id="bar" x="40" y="326" width="0" height="22" rx="11" fill="#b8272f" opacity=".75"/>
      <g id="mk"><path d="M0 316L-9 300H9Z" fill="#b8272f"/></g>`;
    const bar = svg.querySelector('#bar'), mkr = svg.querySelector('#mk');
    const draw = () => { bar.setAttribute('width', Math.max(0, p * 280)); mkr.setAttribute('transform', `translate(${40 + p * 280} 0)`); svg.dataset.p = p.toFixed(3); };
    const stopAt = () => {
      if (!running) return; running = false;
      const s = p >= lo && p <= hi ? 1 : p > lo - 0.12 && p < hi + 0.12 ? 0.7 : 0.4;
      finish(s, s === 1 ? 'Waktunya pas!' : p < lo ? 'Agak kurang lama' : 'Agak terlalu lama');
    };
    svg.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!finished) stopAt(); });
    loop((dt) => { if (!running) return; p = Math.min(1, p + dt / spec.seconds); draw(); if (p >= 1) { running = false; finish(0.3, 'Terlalu lama'); } });
    draw();
  }

  return stop;
}

// ---------- resep ----------
const SESAME = ['#2a2a2a', '#f5ecd2'];
const RECIPES = [
  { id: 'onigiri', jp: 'おにぎり', name: 'Onigiri', blurb: 'Nasi kepal segitiga berisi umeboshi, 8 langkah',
    stages: [
      { type: 'circle', skin: 'wash', turns: 3, jp: 'とぐ', ro: 'togu', id: 'mencuci beras', text: 'Putar jarimu melingkar di air untuk mencuci beras sampai jernih.' },
      { type: 'timing', view: 'ricepot', zone: [0.62, 0.84], seconds: 5, jp: 'たく', ro: 'taku', id: 'menanak nasi', text: 'Tunggu nasi matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'hold', vessel: 'bowl', kind: 'rice', speed: 0.5, zone: [0.62, 0.84], jp: 'ごはん', ro: 'gohan', id: 'nasi', text: 'Tahan layar untuk menyendok nasi. Lepas saat nasi sampai di area hijau.' },
      { type: 'tap', sprinkle: true, count: 5, base: riceMound, area: [100, 215, 260, 265], grains: ['#ffffff', '#e4e0d4'], jp: 'しお', ro: 'shio', id: 'garam', text: 'Ketuk 5 kali untuk menaburkan garam di atas nasi.' },
      { type: 'tap', shape: 'ball', count: 8, jp: 'にぎる', ro: 'nigiru', id: 'menggenggam', text: 'Ketuk cepat 8 kali untuk mengepal nasi menjadi segitiga.' },
      { type: 'drag', jp: 'うめぼし', ro: 'umeboshi', id: 'acar plum', text: 'Seret umeboshi ke tengah nasi.', from: [70, 340], to: [180, 205], r: 46, base: () => plate(180, 292, 150) + riceBall(1), item: umeItem, after: () => umeDot() },
      { type: 'drag', jp: 'のり', ro: 'nori', id: 'rumput laut kering', text: 'Seret nori untuk membungkus onigiri.', from: [75, 335], to: [180, 255], r: 50, base: () => plate(180, 292, 150) + riceBall(1), item: () => noriSheet(0, 0), after: () => noriBand() },
      { type: 'tap', sprinkle: true, count: 5, base: () => plate(180, 292, 150) + riceBall(1, noriBand()), area: [140, 160, 220, 215], grains: SESAME, jp: 'ごま', ro: 'goma', id: 'wijen', text: 'Ketuk 5 kali untuk menaburkan wijen sebagai hiasan.' },
    ] },
  { id: 'ocha', jp: 'おちゃ', name: 'Ocha', blurb: 'Teh hijau hangat ala Jepang, 7 langkah',
    stages: [
      { type: 'hold', vessel: 'pot', kind: 'water', color: '#bfe6ff', speed: 0.5, zone: [0.6, 0.82], jp: 'みず', ro: 'mizu', id: 'air', text: 'Tahan untuk mengisi ketel dengan air. Lepas di area hijau.' },
      { type: 'timing', zone: [0.62, 0.84], seconds: 5, jp: 'わかす', ro: 'wakasu', id: 'mendidihkan', text: 'Tunggu air mendidih. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'ちゃば', ro: 'chaba', id: 'daun teh', text: 'Seret sendok daun teh ke dalam teko.', from: [70, 335], to: [180, 150], r: 48, base: () => teapot(false), item: leafSpoon, after: () => `<path d="M130 148Q160 130 190 146Q220 130 235 150Q200 160 130 148Z" fill="#5f8a3b"/>` },
      { type: 'hold', vessel: 'pot', kind: 'water', color: '#d3ec9c', speed: 0.5, zone: [0.6, 0.82], jp: 'おゆ', ro: 'oyu', id: 'air panas', text: 'Tahan untuk menuang air panas ke teko. Lepas di area hijau.' },
      { type: 'timing', zone: [0.6, 0.82], seconds: 5, jp: 'むらす', ro: 'murasu', id: 'menyeduh', text: 'Tunggu tehnya meresap. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'circle', skin: 'stir', turns: 2, jp: 'かきまぜる', ro: 'kakimazeru', id: 'mengaduk', text: 'Putar sendok pelan-pelan untuk mengaduk tehnya.' },
      { type: 'hold', vessel: 'cup', kind: 'tea', color: '#9cb04a', speed: 0.45, zone: [0.68, 0.88], jp: 'ちゃわん', ro: 'chawan', id: 'cangkir', text: 'Tahan untuk menuang teh ke cangkir. Jangan sampai penuh!' },
    ] },
  { id: 'sushi', jp: 'すし', name: 'Sushi', blurb: 'Nigiri ikan segar dengan wasabi, 8 langkah',
    stages: [
      { type: 'circle', skin: 'wash', turns: 3, jp: 'とぐ', ro: 'togu', id: 'mencuci beras', text: 'Putar jarimu melingkar di air untuk mencuci beras sampai jernih.' },
      { type: 'timing', view: 'ricepot', zone: [0.62, 0.84], seconds: 5, jp: 'たく', ro: 'taku', id: 'menanak nasi', text: 'Tunggu nasi matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'tap', sprinkle: true, count: 4, base: riceMound, area: [100, 215, 260, 265], grains: ['#f3d98b', '#fbeab0'], jp: 'す', ro: 'su', id: 'cuka', text: 'Ketuk 4 kali untuk memercikkan cuka sushi ke nasi.' },
      { type: 'tap', shape: 'rect', count: 6, jp: 'しゃり', ro: 'shari', id: 'nasi sushi', text: 'Ketuk cepat 6 kali untuk menekan nasi sushi.' },
      { type: 'cut', lines: [110, 180, 250], jp: 'さかな', ro: 'sakana', id: 'ikan', text: 'Geser jari dari kiri ke kanan melewati garis putus-putus untuk memotong ikan.' },
      { type: 'drag', jp: 'わさび', ro: 'wasabi', id: 'wasabi', text: 'Seret wasabi ke atas nasi.', from: [70, 335], to: [180, 214], r: 40, base: sushiRice, item: () => wasabiBlob(0, 0, 1.3), after: () => wasabiBlob(180, 212, 0.8) },
      { type: 'drag', jp: 'のせる', ro: 'noseru', id: 'meletakkan', text: 'Seret irisan ikan ke atas nasi.', from: [95, 340], to: [180, 214], r: 50, base: () => sushiRice() + wasabiBlob(180, 212, 0.8), item: () => fishSlice(0, 0, 0.9), after: () => fishSlice(180, 214, 1.02) },
      { type: 'drag', jp: 'つける', ro: 'tsukeru', id: 'mencelup', text: 'Seret sushi untuk dicelup ke kecap asin.', from: [110, 290], to: [268, 268], r: 46, base: () => plate(150, 300, 150) + shoyuDish(268, 270, 1.4), item: () => nigiriPiece(0, 0, 0.5), after: () => nigiriPiece(268, 258, 0.5) },
    ] },
  { id: 'tamagoyaki', jp: 'たまごやき', name: 'Tamagoyaki', blurb: 'Telur gulung manis, 7 langkah',
    stages: [
      { type: 'tap', scene: eggScene, count: 3, jp: 'たまご', ro: 'tamago', id: 'telur', text: 'Ketuk 3 kali untuk memecahkan telur ke mangkuk.' },
      { type: 'tap', sprinkle: true, count: 4, base: () => eggScene(1), area: [100, 215, 260, 265], grains: ['#ffffff', '#f6efe0'], jp: 'さとう', ro: 'satou', id: 'gula', text: 'Ketuk 4 kali untuk menaburkan gula.' },
      { type: 'circle', skin: 'stir', turns: 3, liq: [[255, 196, 60], [255, 222, 110]], rim: '#a9452f', jp: 'まぜる', ro: 'mazeru', id: 'mengocok', text: 'Putar sumpit melingkar untuk mengocok telur sampai rata.' },
      { type: 'hold', vessel: 'bowl', kind: 'tea', color: '#ffd34d', stream: '#ffd34d', speed: 0.5, zone: [0.6, 0.82], jp: 'そそぐ', ro: 'sosogu', id: 'menuang', text: 'Tahan untuk menuang adonan telur. Lepas di area hijau.' },
      { type: 'timing', view: 'pan', panFill: '#ffd34d', zone: [0.6, 0.82], seconds: 5, jp: 'やく', ro: 'yaku', id: 'memanggang', text: 'Tunggu telur matang di wajan. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'swipe', dist: 700, scene: rollScene, jp: 'まく', ro: 'maku', id: 'menggulung', text: 'Geser jarimu ke kiri dan kanan berulang kali untuk menggulung telur.' },
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.telur, jp: 'きる', ro: 'kiru', id: 'memotong', text: 'Geser jari dari kiri ke kanan untuk memotong gulungan telur.' },
    ] },
  { id: 'misoshiru', jp: 'みそしる', name: 'Miso-shiru', blurb: 'Sup pasta miso dengan tahu dan wakame, 8 langkah',
    stages: [
      { type: 'hold', vessel: 'soup', kind: 'tea', color: '#e8d9a8', stream: '#e8d9a8', speed: 0.5, zone: [0.6, 0.82], jp: 'みず', ro: 'mizu', id: 'air', text: 'Tahan untuk mengisi panci dengan air kaldu. Lepas di area hijau.' },
      { type: 'timing', view: 'soup', broth: '#e8d9a8', zone: [0.62, 0.84], seconds: 5, jp: 'にる', ro: 'niru', id: 'merebus', text: 'Tunggu air mendidih. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'みそ', ro: 'miso', id: 'pasta kedelai', text: 'Seret sendok miso ke dalam panci.', from: [70, 335], to: [180, 175], r: 60, base: () => soupPot('#e8d9a8'), item: misoSpoon, after: () => '<ellipse cx="180" cy="172" rx="40" ry="8" fill="#a0673a" opacity=".8"/>' },
      { type: 'circle', skin: 'stir', turns: 3, liq: [[232, 217, 168], [196, 150, 90]], rim: '#46505e', jp: 'とかす', ro: 'tokasu', id: 'melarutkan', text: 'Putar sendok melingkar untuk melarutkan miso.' },
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.tahu, jp: 'きる', ro: 'kiru', id: 'memotong', text: 'Geser jari dari kiri ke kanan untuk memotong tahu.' },
      { type: 'drag', jp: 'とうふ', ro: 'toufu', id: 'tahu', text: 'Seret potongan tahu ke dalam panci.', from: [90, 335], to: [180, 178], r: 60, base: () => soupPot('#c99a63'), item: () => tofuCubes(0, 0, 1.2), after: () => tofuCubes(180, 176, 0.8) },
      { type: 'drag', jp: 'わかめ', ro: 'wakame', id: 'rumput laut', text: 'Seret wakame ke dalam panci.', from: [80, 335], to: [180, 178], r: 60, base: () => soupPot('#c99a63', tofuCubes(180, 176, 0.8)), item: () => wakameItem(0, 0, 1.2), after: () => wakameItem(215, 176, 0.6) },
      { type: 'hold', vessel: 'bowl', kind: 'tea', color: '#c99a63', stream: '#c99a63', speed: 0.45, zone: [0.62, 0.84], jp: 'おわん', ro: 'owan', id: 'mangkuk', text: 'Tahan untuk menuang sup ke mangkuk. Lepas di area hijau.' },
    ] },
  { id: 'takoyaki', jp: 'たこやき', name: 'Takoyaki', blurb: 'Bola adonan isi gurita, 8 langkah',
    stages: [
      { type: 'circle', skin: 'stir', turns: 3, liq: [[250, 242, 205], [250, 230, 165]], rim: '#a9452f', jp: 'まぜる', ro: 'mazeru', id: 'mengaduk adonan', text: 'Putar sendok melingkar untuk mengaduk adonan.' },
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.tako, jp: 'たこ', ro: 'tako', id: 'gurita', text: 'Geser jari dari kiri ke kanan untuk memotong gurita.' },
      { type: 'drag', jp: 'いれる', ro: 'ireru', id: 'memasukkan', text: 'Seret potongan gurita ke cetakan.', from: [80, 335], to: [180, 235], r: 90, base: () => takoPan({ batter: true }), item: () => takoChunks(0, 0, 1.3), after: () => takoPan({ batter: true, tako: true }) },
      { type: 'tap', sprinkle: true, count: 5, base: () => takoPan({ batter: true, tako: true }), area: [50, 175, 310, 295], grains: ['#5fa84a', '#8fcf6f'], jp: 'ねぎ', ro: 'negi', id: 'daun bawang', text: 'Ketuk 5 kali untuk menaburkan daun bawang.' },
      { type: 'timing', view: 'tako', zone: [0.62, 0.84], seconds: 5, jp: 'やく', ro: 'yaku', id: 'memanggang', text: 'Tunggu adonan setengah matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'tap', scene: (t) => takoPan({ batter: true, tako: true, balls: Math.round(t * 6) }), count: 6, jp: 'ひっくりかえす', ro: 'hikkurikaesu', id: 'membalik', text: 'Ketuk 6 kali untuk membalik bola satu per satu.' },
      { type: 'drag', jp: 'ソース', ro: 'sousu', id: 'saus', text: 'Seret botol saus ke atas takoyaki.', from: [80, 100], to: [180, 235], r: 90, base: () => takoPan({ batter: true, tako: true, balls: 6 }), item: sauceBottle, after: () => takoPan({ batter: true, tako: true, balls: 6, sauce: true }) },
      { type: 'tap', sprinkle: true, count: 5, base: () => takoPan({ batter: true, tako: true, balls: 6, sauce: true }), area: [50, 175, 310, 295], grains: ['#2f7a3b', '#e8c9a0'], jp: 'あおのり', ro: 'aonori', id: 'rumput laut hijau', text: 'Ketuk 5 kali untuk menaburkan aonori dan katsuobushi.' },
    ] },
  { id: 'dango', jp: 'だんご', name: 'Dango', blurb: 'Bola tepung beras tusuk dengan saus manis, 6 langkah',
    stages: [
      { type: 'circle', skin: 'wash', grains: false, liq: [[244, 240, 232], [255, 250, 242]], rim: '#c99a63', turns: 3, jp: 'こねる', ro: 'koneru', id: 'menguleni adonan', text: 'Putar jarimu melingkar untuk menguleni adonan tepung beras.' },
      { type: 'tap', scene: dangoScene, count: 6, jp: 'まるめる', ro: 'marumeru', id: 'membulatkan', text: 'Ketuk 6 kali untuk membulatkan adonan menjadi 3 bola.' },
      { type: 'timing', view: 'soup', broth: '#cfe8f3', zone: [0.62, 0.84], seconds: 5, jp: 'ゆでる', ro: 'yuderu', id: 'merebus', text: 'Tunggu bola dango matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'さす', ro: 'sasu', id: 'menusuk', text: 'Seret tusukan menembus ketiga dango.', from: [140, 320], to: [180, 236], r: 70, base: () => plate(180, 292, 160) + dangoBalls(38, 3), item: skewerItem, after: () => skewerLine + dangoBalls(38, 3) },
      { type: 'drag', jp: 'たれ', ro: 'tare', id: 'saus manis', text: 'Seret botol saus manis ke atas dango.', from: [70, 110], to: [180, 230], r: 80, base: () => plate(180, 292, 160) + skewerLine + dangoBalls(38, 3), item: sauceBottle, after: () => plate(180, 292, 160) + skewerLine + dangoBalls(38, 3, glaze) },
      { type: 'tap', sprinkle: true, count: 5, base: () => plate(180, 292, 160) + skewerLine + dangoBalls(38, 3, glaze), area: [85, 205, 275, 262], grains: ['#d7b86a', '#e8cf8f'], jp: 'きなこ', ro: 'kinako', id: 'tepung kedelai', text: 'Ketuk 5 kali untuk menaburkan kinako.' },
    ] },
  { id: 'ramen', jp: 'ラーメン', name: 'Ramen', blurb: 'Mie kuah dengan chashu dan telur, 9 langkah',
    stages: [
      { type: 'hold', vessel: 'soup', kind: 'tea', color: '#cfe8f3', stream: '#bfe6ff', speed: 0.5, zone: [0.6, 0.82], jp: 'みず', ro: 'mizu', id: 'air', text: 'Tahan untuk mengisi panci dengan air. Lepas di area hijau.' },
      { type: 'timing', view: 'soup', broth: '#cfe8f3', zone: [0.62, 0.84], seconds: 5, jp: 'にる', ro: 'niru', id: 'merebus', text: 'Tunggu air mendidih. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'めん', ro: 'men', id: 'mie', text: 'Seret mie ke dalam panci.', from: [80, 335], to: [180, 178], r: 60, base: () => soupPot('#cfe8f3'), item: () => noodleBundle(0, 0, 1.2), after: () => noodleBundle(180, 176, 0.9) },
      { type: 'circle', skin: 'stir', turns: 2, liq: [[207, 232, 243], [240, 226, 170]], rim: '#46505e', jp: 'ほぐす', ro: 'hogusu', id: 'mengurai', text: 'Putar sumpit melingkar untuk mengurai mie.' },
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.cha, jp: 'チャーシュー', ro: 'chaashuu', id: 'daging panggang', text: 'Geser jari dari kiri ke kanan untuk mengiris chashu.' },
      { type: 'hold', vessel: 'bowl', kind: 'tea', color: '#d9a441', stream: '#d9a441', speed: 0.45, zone: [0.62, 0.84], jp: 'スープ', ro: 'suupu', id: 'kuah', text: 'Tahan untuk menuang kuah ke mangkuk. Lepas di area hijau.' },
      { type: 'drag', jp: 'のせる', ro: 'noseru', id: 'meletakkan', text: 'Seret irisan chashu ke atas ramen.', from: [80, 335], to: [235, 205], r: 60, base: () => ramenBowl(), item: () => chashuRound(0, 0, 1.1), after: () => chashuRound(238, 200, 0.95) + chashuRound(224, 244, 0.8) },
      { type: 'drag', jp: 'たまご', ro: 'tamago', id: 'telur', text: 'Seret telur rebus ke atas ramen.', from: [290, 335], to: [130, 232], r: 60, base: () => ramenBowl({ chashu: true }), item: () => eggHalf(0, 0, 1.1), after: () => eggHalf(130, 232, 0.9) },
      { type: 'tap', sprinkle: true, count: 5, base: () => ramenBowl({ chashu: true, egg: true }), area: [100, 150, 260, 260], grains: ['#5fa84a', '#8fcf6f'], jp: 'ねぎ', ro: 'negi', id: 'daun bawang', text: 'Ketuk 5 kali untuk menaburkan daun bawang.' },
    ] },
  { id: 'tempura', jp: 'てんぷら', name: 'Tempura', blurb: 'Udang goreng tepung renyah, 7 langkah',
    stages: [
      { type: 'circle', skin: 'stir', turns: 3, liq: [[250, 244, 214], [247, 232, 170]], rim: '#a9452f', jp: 'ころも', ro: 'koromo', id: 'adonan tepung', text: 'Putar sumpit melingkar untuk mengaduk adonan tepung.' },
      { type: 'drag', jp: 'えび', ro: 'ebi', id: 'udang', text: 'Seret udang ke dalam adonan tepung.', from: [80, 335], to: [180, 240], r: 80, base: () => batterBowl('#f7e9b8'), item: () => shrimp(0, 0, 0.9), after: () => battered(180, 240, 0.9) },
      { type: 'timing', view: 'pan', panFill: '#f6d36b', zone: [0.62, 0.84], seconds: 5, jp: 'あぶら', ro: 'abura', id: 'minyak', text: 'Tunggu minyak panas. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'いれる', ro: 'ireru', id: 'memasukkan', text: 'Seret udang bertepung ke minyak panas.', from: [80, 335], to: [165, 236], r: 80, base: () => pan('#f6d36b'), item: () => battered(0, 0, 0.8), after: () => battered(165, 236, 0.85) },
      { type: 'timing', view: 'pan', panFill: '#f6d36b', panExtra: crisp(165, 236, 0.85), zone: [0.62, 0.84], seconds: 5, jp: 'あげる', ro: 'ageru', id: 'menggoreng', text: 'Tunggu udang keemasan. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'さら', ro: 'sara', id: 'piring', text: 'Seret tempura ke piring.', from: [80, 335], to: [180, 250], r: 80, base: () => plate(180, 290, 165), item: () => crisp(0, 0, 0.8), after: () => crisp(170, 244, 1) },
      { type: 'tap', sprinkle: true, count: 4, base: () => plate(180, 290, 165) + crisp(170, 244, 1), area: [110, 200, 250, 260], grains: ['#ffffff', '#ebe6da'], jp: 'しお', ro: 'shio', id: 'garam', text: 'Ketuk 4 kali untuk menaburkan sedikit garam.' },
    ] },
  { id: 'matcha', jp: 'まっちゃ', name: 'Matcha', blurb: 'Teh matcha kocok dengan manisan wagashi, 6 langkah',
    stages: [
      { type: 'hold', vessel: 'pot', kind: 'water', color: '#bfe6ff', speed: 0.5, zone: [0.6, 0.82], jp: 'みず', ro: 'mizu', id: 'air', text: 'Tahan untuk mengisi ketel dengan air. Lepas di area hijau.' },
      { type: 'timing', zone: [0.62, 0.84], seconds: 5, jp: 'わかす', ro: 'wakasu', id: 'mendidihkan', text: 'Tunggu air mendidih. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'tap', sprinkle: true, count: 4, base: () => chawanTop('#ede8d6'), area: [100, 215, 260, 265], grains: ['#6f9a35', '#8fbf4d'], jp: 'ふるう', ro: 'furuu', id: 'mengayak', text: 'Ketuk 4 kali untuk mengayak bubuk matcha ke mangkuk.' },
      { type: 'hold', vessel: 'bowl', kind: 'tea', color: '#7fa83a', stream: '#bfe6ff', speed: 0.45, zone: [0.6, 0.82], jp: 'おゆ', ro: 'oyu', id: 'air panas', text: 'Tahan untuk menuang air panas ke mangkuk. Lepas di area hijau.' },
      { type: 'circle', skin: 'stir', turns: 4, liq: [[170, 196, 110], [112, 160, 52]], rim: '#3b4452', jp: 'たてる', ro: 'tateru', id: 'mengocok teh', text: 'Putar kocokan bambu dengan cepat sampai berbusa.' },
      { type: 'drag', jp: 'わがし', ro: 'wagashi', id: 'manisan Jepang', text: 'Seret manisan ke piring di samping matcha.', from: [70, 335], to: [286, 296], r: 56, base: () => plate(180, 292, 150) + chawanTop('#7fa83a', true), item: () => wagashi(0, 0, 1.3), after: () => wagashi(286, 292, 1) },
    ] },
  { id: 'yakitori', jp: 'やきとり', name: 'Yakitori', blurb: 'Sate ayam bakar dengan saus tare, 6 langkah',
    stages: [
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.ayam, jp: 'とり', ro: 'tori', id: 'ayam', text: 'Geser jari dari kiri ke kanan untuk memotong daging ayam.' },
      { type: 'drag', jp: 'くし', ro: 'kushi', id: 'tusukan', text: 'Seret tusukan menembus potongan ayam.', from: [140, 320], to: [180, 236], r: 70, base: () => plate(180, 292, 160) + chickenRow(), item: skewerItem, after: () => '<path d="M50 236H320" stroke="#c99a63" stroke-width="6" stroke-linecap="round"/>' + chickenRow() },
      { type: 'timing', view: 'grill', zone: [0.62, 0.84], seconds: 5, jp: 'やく', ro: 'yaku', id: 'memanggang', text: 'Tunggu ayam setengah matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'tap', scene: (t) => grill(lerpHex('#f6dcae', '#c47a3c', t)), count: 4, jp: 'ひっくりかえす', ro: 'hikkurikaesu', id: 'membalik', text: 'Ketuk 4 kali untuk membalik tusukan di atas bara.' },
      { type: 'drag', jp: 'タレ', ro: 'tare', id: 'saus manis asin', text: 'Seret botol saus ke atas tusukan.', from: [80, 100], to: [180, 245], r: 90, base: () => grill('#c47a3c'), item: sauceBottle, after: () => grill('#c47a3c', true) },
      { type: 'tap', sprinkle: true, count: 4, base: () => grill('#c47a3c', true), area: [80, 190, 280, 295], grains: ['#c23a2b', '#e2634f'], jp: 'しちみ', ro: 'shichimi', id: 'bumbu cabai', text: 'Ketuk 4 kali untuk menaburkan bumbu shichimi.' },
    ] },
  { id: 'udon', jp: 'うどん', name: 'Udon', blurb: 'Mie tebal buatan sendiri dalam kuah hangat, 7 langkah',
    stages: [
      { type: 'circle', skin: 'wash', grains: false, liq: [[250, 244, 228], [255, 250, 238]], rim: '#c99a63', turns: 3, jp: 'こねる', ro: 'koneru', id: 'menguleni', text: 'Putar jarimu melingkar untuk menguleni adonan.' },
      { type: 'swipe', dist: 700, scene: flattenScene, done: 'Tipis dan rata!', jp: 'のばす', ro: 'nobasu', id: 'menipiskan', text: 'Geser jarimu kiri dan kanan untuk menggilas adonan sampai tipis.' },
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.udon, jp: 'きる', ro: 'kiru', id: 'memotong', text: 'Geser jari dari kiri ke kanan untuk memotong mie.' },
      { type: 'timing', view: 'soup', broth: '#cfe8f3', zone: [0.62, 0.84], seconds: 5, jp: 'ゆでる', ro: 'yuderu', id: 'merebus', text: 'Tunggu mie matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'hold', vessel: 'bowl', kind: 'tea', color: '#e0bd72', stream: '#e0bd72', speed: 0.45, zone: [0.62, 0.84], jp: 'だし', ro: 'dashi', id: 'kuah kaldu', text: 'Tahan untuk menuang kuah kaldu ke mangkuk. Lepas di area hijau.' },
      { type: 'drag', jp: 'めん', ro: 'men', id: 'mie', text: 'Seret mie ke dalam mangkuk.', from: [80, 335], to: [180, 206], r: 90, base: () => udonBowl(), item: () => noodleBundle(0, 0, 1.2), after: () => udonBowl({ noodles: true }) },
      { type: 'tap', sprinkle: true, count: 5, base: () => udonBowl({ noodles: true, kama: true }), area: [100, 150, 260, 260], grains: ['#5fa84a', '#8fcf6f'], jp: 'ねぎ', ro: 'negi', id: 'daun bawang', text: 'Ketuk 5 kali untuk menaburkan daun bawang.' },
    ] },
  { id: 'gyoza', jp: 'ぎょうざ', name: 'Gyoza', blurb: 'Pangsit panggang isi daging dan sayur, 7 langkah',
    stages: [
      { type: 'circle', skin: 'stir', turns: 3, liq: [[214, 150, 140], [190, 120, 110]], rim: '#a9452f', jp: 'あん', ro: 'an', id: 'isian', text: 'Putar sendok melingkar untuk mengaduk isian daging dan sayur.' },
      { type: 'drag', jp: 'かわ', ro: 'kawa', id: 'kulit pangsit', text: 'Seret isian ke tengah kulit pangsit.', from: [70, 335], to: [180, 236], r: 50, base: () => wrapper(180, 236, 1.3), item: () => fillingBlob(0, 0, 1.3), after: () => fillingBlob(180, 236, 1.5) },
      { type: 'swipe', dist: 500, scene: foldScene, done: 'Tertutup rapat!', jp: 'とじる', ro: 'tojiru', id: 'melipat dan menutup', text: 'Geser jarimu kiri dan kanan untuk melipat dan menutup pangsit.' },
      { type: 'drag', jp: 'ならべる', ro: 'naraberu', id: 'menata', text: 'Seret pangsit ke wajan.', from: [80, 335], to: [165, 236], r: 90, base: () => pan(null), item: () => gyozaShape(0, 0, 1.2), after: () => pan(null, gyozaRow(false)) },
      { type: 'timing', view: 'pan', panFill: null, panExtra: gyozaRow(false), zone: [0.62, 0.84], seconds: 5, jp: 'やく', ro: 'yaku', id: 'memanggang', text: 'Tunggu dasar pangsit keemasan. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'drag', jp: 'さら', ro: 'sara', id: 'piring', text: 'Seret pangsit matang ke piring.', from: [80, 335], to: [150, 236], r: 90, base: () => plate(180, 290, 165), item: () => gyozaShape(0, 0, 1.2, true), after: () => gyozaRow(true, 150, 236) },
      { type: 'tap', sprinkle: true, count: 4, base: () => plate(180, 290, 165) + gyozaRow(true, 150, 236), area: [90, 200, 240, 260], grains: ['#2a2a2a', '#f5ecd2'], jp: 'ごま', ro: 'goma', id: 'wijen', text: 'Ketuk 4 kali untuk menaburkan wijen.' },
    ] },
  { id: 'okonomiyaki', jp: 'おこのみやき', name: 'Okonomiyaki', blurb: 'Pancake gurih berisi kol dengan saus dan mayo, 7 langkah',
    stages: [
      { type: 'cut', lines: [110, 180, 250], slab: SLAB.kol, jp: 'キャベツ', ro: 'kyabetsu', id: 'kol', text: 'Geser jari dari kiri ke kanan untuk mencincang kol.' },
      { type: 'circle', skin: 'stir', turns: 3, liq: [[236, 240, 200], [200, 222, 140]], rim: '#a9452f', jp: 'まぜる', ro: 'mazeru', id: 'mengaduk', text: 'Putar sendok melingkar untuk mencampur adonan dan kol.' },
      { type: 'hold', vessel: 'bowl', kind: 'tea', color: '#e8e0a0', stream: '#e8e0a0', speed: 0.5, zone: [0.6, 0.82], jp: 'そそぐ', ro: 'sosogu', id: 'menuang', text: 'Tahan untuk menuang adonan. Lepas di area hijau.' },
      { type: 'timing', view: 'pan', panFill: null, panExtra: pancake(165, 236, 112, 58, 0.2), zone: [0.62, 0.84], seconds: 5, jp: 'やく', ro: 'yaku', id: 'memanggang', text: 'Tunggu bagian bawah matang. Ketuk saat penunjuk ada di area hijau.' },
      { type: 'tap', scene: flipScene, count: 3, jp: 'ひっくりかえす', ro: 'hikkurikaesu', id: 'membalik', text: 'Ketuk 3 kali untuk membalik pancake dengan spatula.' },
      { type: 'drag', jp: 'ソース', ro: 'sousu', id: 'saus', text: 'Seret botol saus ke atas okonomiyaki.', from: [80, 100], to: [180, 236], r: 90, base: () => plate(180, 290, 170) + pancake(180, 236, 128, 54, 1), item: sauceBottle, after: () => okoSauce + mayo },
      { type: 'tap', sprinkle: true, count: 5, base: () => plate(180, 290, 170) + pancake(180, 236, 128, 54, 1) + okoSauce + mayo, area: [90, 205, 270, 265], grains: ['#2f7a3b', '#e8c9a0'], jp: 'かつおぶし', ro: 'katsuobushi', id: 'serpihan ikan', text: 'Ketuk 5 kali untuk menaburkan aonori dan katsuobushi.' },
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
      <div class="meter"><i style="width:${(idx / rec.stages.length) * 100}%"></i></div></div>
      <div class="cook-coach">${MASCOT}<p class="cook-bubble cook-prompt" id="bubble">${esc(s.text)}</p></div>
      <div class="cook-boardwrap"><div class="cook-board" id="board"></div><div class="cook-flash" id="flash" role="status"></div></div>`;
    const board = wrap.querySelector('#board'), flash = wrap.querySelector('#flash'), coach = wrap.querySelector('.cook-coach');
    stopStage = runStage(board, s, (score, msg) => {
      scores.push(score);
      flash.textContent = msg; flash.classList.add('show');
      coach.classList.add('happy');
      wrap.querySelector('#bubble').textContent = score >= 0.85 ? 'Hebat! Lanjut ya.' : 'Lumayan! Terus semangat.';
      const wrapEl = wrap.querySelector('.cook-boardwrap');
      for (let i = 0; i < 12; i++) {
        const sp = document.createElement('i'); sp.className = 'spark';
        sp.style.setProperty('--a', `${(i / 12) * 360}deg`); sp.style.setProperty('--d', `${60 + Math.random() * 50}px`);
        wrapEl.appendChild(sp); setTimeout(() => sp.remove(), 900);
      }
      setTimeout(() => { if (wrap.isConnected) { idx++; stage(); } }, 1100);
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
