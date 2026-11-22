// Musik latar generatif bernuansa Jepang (lo-fi, kedai teh, taman zen). Seluruh suara dibuat oleh kode
// lewat Web Audio: tanpa file audio, tanpa hak cipta, tanpa unduhan. Bunyi dasar: petikan mirip koto,
// bel kecil, pad lembut, hujan, dan sedikit derak kaset.
//
// Pemutaran otomatis (permintaan pemilik): volume awal 8%. Jika browser memblokirnya, musik mulai
// pada sentuhan/klik pertama. Tidak ada trik untuk menembus blokir. Semua pilihan tersimpan.
import { icon } from './icons.js';
import { esc } from './utils.js';

const KEY = 'jcms.music.v1';
const LOOP_SECONDS = 240;
const DEFAULTS = { vol: 8, muted: false, track: 0, autoplay: true, hidden: null };

function loadPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...DEFAULTS }; }
}
function savePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* penyimpanan diblokir */ } }

const hz = (n) => 440 * 2 ** ((n - 69) / 12); // nomor MIDI -> Hz
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- Bahan suara ----------
function makeKit(ctx, dry, wet) {
  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();
  const send = (node, amount = 0.3) => {
    node.connect(dry);
    const s = ctx.createGain(); s.gain.value = amount; node.connect(s); s.connect(wet);
  };
  return {
    noiseBuf,
    /** Petikan ala koto. */
    pluck(midi, t, { gain = 0.2, dur = 2.4, bright = 2600, rev = 0.45 } = {}) {
      const f = hz(midi);
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'triangle'; o2.type = 'sine';
      o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      o2.frequency.value = f * 2; g2.gain.value = 0.22;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(600, t + dur * 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); send(lp, rev);
      o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    },
    /** Pad hangat dengan serang/lepas lambat. */
    pad(midis, t, dur, { gain = 0.035, cutoff = 900 } = {}) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(3, dur * 0.3)); g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 3.5);
      for (const m of midis) for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 3.6);
      }
      lp.connect(g); send(g, 0.5);
    },
    /** Bel kecil (furin). */
    bell(midi, t, gain = 0.06) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      for (const [mul, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
        const o = ctx.createOscillator(), ga = ctx.createGain();
        o.type = 'sine'; o.frequency.value = hz(midi) * mul; ga.gain.value = a;
        o.connect(ga); ga.connect(g); o.start(t); o.stop(t + 4.1);
      }
      send(g, 0.7);
    },
    /** Tetes air. */
    drop(t, gain = 0.05) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(1100 + Math.random() * 500, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); send(g, 0.6); o.start(t); o.stop(t + 0.4);
    },
    sub(midi, t, dur, gain = 0.16) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(midi);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dry); o.start(t); o.stop(t + dur + 0.05);
    },
    kick(t, gain = 0.32) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(dry); o.start(t); o.stop(t + 0.3);
    },
    burst(t, dur, { freq = 7000, q = 0.7, gain = 0.05, type = 'highpass', rev = 0.15 } = {}) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); send(g, rev); s.start(t, Math.random() * 1.5, dur + 0.05); s.stop(t + dur + 0.05);
    },
    crackle(t) { this.burst(t, 0.006 + Math.random() * 0.01, { freq: 2500 + Math.random() * 3000, gain: 0.012 + Math.random() * 0.02, rev: 0 }); },
    /** Hujan: kebisingan tersaring, mengalir selama lagu. Mengembalikan fungsi pembersih. */
    rain(gain = 0.09) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.35;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const g = ctx.createGain(); g.gain.value = gain;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.09; lg.gain.value = gain * 0.25;
      lfo.connect(lg); lg.connect(g.gain);
      s.connect(bp); bp.connect(hp); hp.connect(g); g.connect(dry);
      s.start(); lfo.start();
      return () => { try { s.stop(); lfo.stop(); } catch { /* sudah berhenti */ } g.disconnect(); };
    },
  };
}

// ---------- Lagu ----------
const TRACKS = [
  {
    id: 'ocha', name: 'Ocha di Sore Hari', note: 'Koto lembut dan lo-fi hangat',
    stepDur: 60 / 66 / 2, // delapanan, 66 bpm
    init: () => ({ idx: 3, chords: [[50, 57, 64], [55, 62, 71], [52, 59, 66], [50, 57, 64]] }),
    step(n, t, k, s) {
      const scale = [62, 64, 67, 69, 71, 74, 76]; // D E G A B D E (skala Yo)
      if (n % 32 === 0) k.pad(s.chords[(n / 32) % s.chords.length].map((m) => m), t, 13, { gain: 0.03, cutoff: 800 });
      if (n % 32 === 0) k.sub(38 + ((n / 32) % 2) * 5, t, 5, 0.12);
      const beat = n % 2 === 0;
      if (Math.random() < (beat ? 0.5 : 0.18)) {
        s.idx = Math.max(0, Math.min(scale.length - 1, s.idx + pick([-2, -1, -1, 0, 1, 1, 2])));
        k.pluck(scale[s.idx] + (Math.random() < 0.08 ? -12 : 0), t, { gain: 0.16 + Math.random() * 0.05 });
      }
      if (Math.random() < 0.03) k.bell(pick([86, 88, 91]), t, 0.04);
      if (Math.random() < 0.3) k.crackle(t + Math.random() * 0.4);
    },
  },
  {
    id: 'zen', name: 'Taman Zen', note: 'Ambient tenang, bel dan tetes air',
    stepDur: 0.5,
    init: () => ({ chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [45, 52, 57, 60]] }),
    step(n, t, k, s) {
      const scale = [69, 71, 72, 76, 77, 81, 83]; // A B C E F (hirajoshi)
      if (n % 32 === 0) k.pad(s.chords[(n / 32) % s.chords.length], t, 17, { gain: 0.035, cutoff: 700 });
      if (Math.random() < 0.09) k.bell(pick(scale), t, 0.05);
      if (Math.random() < 0.07) k.drop(t + Math.random() * 0.3, 0.045);
      if (n % 16 === 8 && Math.random() < 0.7) k.pluck(pick([57, 60, 64, 65]), t, { gain: 0.11, dur: 3.4, rev: 0.7 });
    },
  },
  {
    id: 'ame', name: 'Kedai Teh Saat Hujan', note: 'Hujan di jendela, koto jarang',
    stepDur: 0.55,
    init: (k) => ({ stopRain: k.rain(0.085), idx: 2 }),
    done: (s) => s.stopRain?.(),
    step(n, t, k, s) {
      const scale = [64, 65, 69, 71, 72, 76, 77]; // E F A B C (skala In)
      if (n % 24 === 0) k.sub(40, t, 9, 0.09);
      if (n % 2 === 0 && Math.random() < 0.2) {
        s.idx = Math.max(0, Math.min(scale.length - 1, s.idx + pick([-2, -1, 0, 1, 2])));
        k.pluck(scale[s.idx], t, { gain: 0.13, dur: 3 });
      }
      if (Math.random() < 0.05) k.drop(t, 0.035);
      if (Math.random() < 0.15) k.crackle(t + Math.random() * 0.5);
    },
  },
  {
    id: 'sakura', name: 'Sakura Lo-fi', note: 'Ketukan santai 74 bpm',
    stepDur: 60 / 74 / 4,
    swing: 0.035,
    init: () => ({ chords: [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 52]], bass: [36, 33, 29, 31], idx: 2 }),
    step(n, t, k, s) {
      const bar = Math.floor(n / 16) % 4, st = n % 16;
      const scale = [60, 62, 65, 67, 69, 72, 74, 76]; // C D F G A
      if (st === 0) { k.pad(s.chords[bar], t, 3.1, { gain: 0.03, cutoff: 1100 }); }
      if (st === 0 || st === 10) { k.kick(t, 0.28); k.sub(s.bass[bar] + (st === 10 ? 7 : 0), t, 0.7, 0.13); }
      if (st === 8) k.burst(t, 0.12, { freq: 1800, q: 0.9, gain: 0.07, type: 'bandpass' });
      if (st % 4 === 2) k.burst(t, 0.04, { freq: 8000, gain: 0.025 });
      if ([0, 3, 6, 8, 11, 14].includes(st) && Math.random() < 0.38) {
        s.idx = Math.max(0, Math.min(scale.length - 1, s.idx + pick([-2, -1, 1, 2, 0])));
        k.pluck(scale[s.idx], t, { gain: 0.15, dur: 1.8, rev: 0.35 });
      }
      if (Math.random() < 0.4) k.crackle(t + Math.random() * 0.2);
    },
  },
];
export const TRACK_LIST = TRACKS.map(({ id, name, note }) => ({ id, name, note }));

// ---------- Mesin ----------
function createEngine() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 9000;
  const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
  warm.connect(comp); comp.connect(master); master.connect(analyser); master.connect(ctx.destination);
  const dry = ctx.createGain();
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  const verb = ctx.createConvolver();
  { // impuls gema sintetis 2,4 detik
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
    verb.buffer = ir;
  }
  dry.connect(warm); wet.connect(verb); verb.connect(warm);
  const kit = makeKit(ctx, dry, wet);
  let run = null;
  const e = {
    ctx, analyser,
    setGain(v, tc = 0.08) { master.gain.setTargetAtTime(v, ctx.currentTime, tc); },
    start(index) {
      e.stop();
      const track = TRACKS[index];
      const state = track.init(kit);
      let t = ctx.currentTime + 0.15, n = 0;
      const pump = () => {
        while (t < ctx.currentTime + 0.7) {
          const sw = track.swing && n % 2 === 1 ? track.swing : 0;
          track.step(n, t + sw, kit, state);
          t += track.stepDur; n++;
        }
      };
      pump();
      run = { timer: setInterval(pump, 150), track, state };
    },
    stop() {
      if (!run) return;
      clearInterval(run.timer);
      run.track.done?.(run.state);
      run = null;
    },
    get running() { return !!run; },
  };
  return e;
}

// ---------- Antarmuka ----------
export function initMusic(host = document.body) {
  const prefs = loadPrefs();
  if (prefs.hidden === null) prefs.hidden = window.matchMedia('(max-width: 860px)').matches;
  prefs.track = Math.min(Math.max(0, Number(prefs.track) || 0), TRACKS.length - 1);
  prefs.vol = Math.min(100, Math.max(0, Number(prefs.vol) || 0));

  let eng = null, playing = false, waiting = false, userPaused = false, elapsed = 0, tick = null, destroyed = false;
  const el = document.createElement('div');
  el.className = 'mp';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Pemutar musik');
  host.appendChild(el);

  const gainOf = () => (prefs.muted ? 0 : (prefs.vol / 100) * 0.9);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  let autoHide = null, touched = false;
  el.addEventListener('pointerdown', () => { touched = true; clearTimeout(autoHide); });
  function paint() {
    const tr = TRACKS[prefs.track];
    clearTimeout(autoHide);
    if (prefs.hidden) {
      el.innerHTML = `<button class="mp-mini ${playing ? 'playing' : ''}" id="mp-show" aria-label="Tampilkan pemutar musik. ${playing ? 'Sedang diputar' : 'Dijeda'}"><span class="mp-art">♪</span><span>${playing ? 'Musik' : 'Musik (jeda)'}</span></button>`;
      el.querySelector('#mp-show').addEventListener('click', () => { prefs.hidden = false; savePrefs(prefs); paint(); touched = true; });
      return;
    }
    el.innerHTML = `<div class="mp-card">
      <div class="mp-top">
        <span class="mp-art" aria-hidden="true">${esc(tr.name[0])}</span>
        <div class="mp-title"><strong id="mp-name">${esc(tr.name)}</strong><span>${esc(tr.note)}</span></div>
        <button class="mp-btn" id="mp-hide" aria-label="Sembunyikan pemutar" title="Sembunyikan">${icon('x')}</button>
      </div>
      <div class="mp-bar" aria-hidden="true"><i id="mp-prog"></i></div>
      <div class="mp-row" style="justify-content:space-between">
        <span class="small" id="mp-time" style="color:#aab2d0;font-variant-numeric:tabular-nums;min-width:74px">${fmt(elapsed)} / ${fmt(LOOP_SECONDS)}</span>
        <div class="mp-row">
          <button class="mp-btn" id="mp-prev" aria-label="Lagu sebelumnya">${icon('prev')}</button>
          <button class="mp-btn play" id="mp-play" aria-label="${playing ? 'Jeda' : 'Putar'}">${icon(playing ? 'pause' : 'play')}</button>
          <button class="mp-btn" id="mp-next" aria-label="Lagu berikutnya">${icon('next')}</button>
        </div>
        <span style="min-width:74px"></span>
      </div>
      <div class="mp-row">
        <button class="mp-btn" id="mp-mute" aria-label="${prefs.muted ? 'Bunyikan' : 'Bisukan'}" aria-pressed="${prefs.muted}">${icon(prefs.muted ? 'volumeOff' : 'volume')}</button>
        <input class="mp-vol" id="mp-vol" type="range" min="0" max="100" value="${prefs.vol}" aria-label="Volume" />
        <span class="small" id="mp-volv" style="color:#aab2d0;width:34px;text-align:right">${prefs.vol}%</span>
      </div>
      <div class="mp-row"><select id="mp-sel" aria-label="Pilih soundtrack" style="flex:1;min-width:0;background:rgba(255,255,255,.08);color:#eceaf5;border:0;border-radius:8px;padding:7px 8px;font:inherit;font-size:.85rem">${TRACKS.map((x, i) => `<option value="${i}" ${i === prefs.track ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <label class="small" style="display:flex;align-items:center;gap:8px;color:#c8cde4;cursor:pointer"><input type="checkbox" id="mp-auto" ${prefs.autoplay ? 'checked' : ''} style="accent-color:var(--beni)" /> Putar otomatis saat aplikasi dibuka</label>
      ${waiting ? `<div class="mp-hint" role="status">Browser menunda suara. Musik mulai saat kamu menyentuh layar.</div>` : ''}
    </div>`;
    const $ = (s) => el.querySelector(s);
    // kartu besar mengecil sendiri jadi pil kecil bila tidak disentuh, supaya tidak menutupi halaman
    if (!touched) autoHide = setTimeout(() => { if (!destroyed && !touched) { prefs.hidden = true; paint(); } }, 8000);
    $('#mp-hide').addEventListener('click', () => { prefs.hidden = true; savePrefs(prefs); paint(); });
    $('#mp-play').addEventListener('click', () => (playing ? pause(true) : play(true)));
    $('#mp-next').addEventListener('click', () => go(1));
    $('#mp-prev').addEventListener('click', () => go(-1));
    $('#mp-mute').addEventListener('click', () => { prefs.muted = !prefs.muted; savePrefs(prefs); eng?.setGain(gainOf()); paint(); });
    $('#mp-vol').addEventListener('input', (e) => {
      prefs.vol = Number(e.target.value); if (prefs.vol > 0) prefs.muted = false;
      $('#mp-volv').textContent = `${prefs.vol}%`; savePrefs(prefs); eng?.setGain(gainOf());
    });
    $('#mp-sel').addEventListener('change', (e) => setTrack(Number(e.target.value)));
    $('#mp-auto').addEventListener('change', (e) => { prefs.autoplay = e.target.checked; savePrefs(prefs); });
  }

  function progress() {
    const p = el.querySelector('#mp-prog');
    if (p) p.style.width = `${Math.min(100, (elapsed / LOOP_SECONDS) * 100)}%`;
    const t = el.querySelector('#mp-time');
    if (t) t.textContent = `${fmt(elapsed)} / ${fmt(LOOP_SECONDS)}`;
  }

  function ensure() {
    if (!eng) eng = createEngine();
    return eng;
  }

  function startTicker() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (!playing) return;
      elapsed += 0.5;
      if (elapsed >= LOOP_SECONDS) { go(1); return; }
      progress();
    }, 500);
  }

  function play(byUser) {
    if (!ensure()) return Promise.resolve();
    if (byUser) userPaused = false;
    const resumed = eng.ctx.resume().catch(() => {});
    // resume() bisa menggantung (tanpa menolak) bila browser menunda suara: jangan ditunggu selamanya.
    return Promise.race([resumed, new Promise((r) => setTimeout(r, 300))]).then(() => {
      if (destroyed) return;
      if (eng.ctx.state !== 'running') { waitForGesture(); paint(); return; }
      waiting = false;
      if (!eng.running) eng.start(prefs.track);
      eng.setGain(gainOf(), 0.25);
      playing = true;
      startTicker();
      paint();
    });
  }

  function pause(byUser) {
    if (byUser) userPaused = true;
    if (!eng) { playing = false; paint(); return; }
    eng.setGain(0, 0.05);
    playing = false;
    setTimeout(() => { if (!playing) { eng.stop(); eng.ctx.suspend().catch(() => {}); } }, 250);
    paint();
  }

  function setTrack(i) {
    prefs.track = (i + TRACKS.length) % TRACKS.length;
    elapsed = 0;
    savePrefs(prefs);
    if (playing) { eng.setGain(0, 0.03); setTimeout(() => { if (!destroyed && playing) { eng.start(prefs.track); eng.setGain(gainOf(), 0.25); } }, 120); }
    paint();
  }
  const go = (d) => setTrack(prefs.track + d);

  // Jika browser memblokir, mulai pada interaksi pertama pengguna (bukan akal-akalan: ini cara resmi).
  let gestureBound = false;
  function waitForGesture() {
    waiting = true;
    if (gestureBound) return;
    gestureBound = true;
    const onGesture = (ev) => {
      if (el.contains(ev.target)) return; // sentuhan di pemutar sendiri ditangani tombolnya
      if (el.contains(ev.target)) return;
      for (const ev2 of ['pointerdown', 'keydown', 'touchend']) document.removeEventListener(ev2, onGesture, true);
      gestureBound = false;
      if (!destroyed && !userPaused && !playing) play(false);
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, onGesture, true);
  }

  paint();
  if (prefs.autoplay) {
    play(false);
  }

  return {
    /** Untuk pengujian: tingkat sinyal keluaran (0..1) dan status. */
    debug: () => {
      if (!eng) return { playing, state: 'none', rms: 0 };
      const buf = new Float32Array(eng.analyser.fftSize);
      eng.analyser.getFloatTimeDomainData(buf);
      let s = 0, peak = 0;
      for (const v of buf) { s += v * v; peak = Math.max(peak, Math.abs(v)); }
      return { playing, state: eng.ctx.state, rms: Math.sqrt(s / buf.length), peak, vol: prefs.vol, muted: prefs.muted, track: prefs.track, waiting };
    },
    destroy() {
      destroyed = true;
      clearInterval(tick);
      try { eng?.stop(); eng?.ctx.close(); } catch { /* abaikan */ }
      el.remove();
    },
  };
}
