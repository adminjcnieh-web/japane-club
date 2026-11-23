// Halaman Learning Center: daftar kategori, jalur level, materi, sesi kuis, dan halaman hasil.
import * as api from '../api.js';
import { icon } from '../icons.js';
import { esc } from '../utils.js';
import { pageHead, errorState, toast, confirmDialog, skeletonPage, emptyState } from '../ui.js';
import { CATEGORIES, CAT_BY_ID } from './data.js';
import { resetCookIntro } from './cook.js';
import { buildQuestions, shuffle } from './engine.js';
import { loadProgress, setProgress, isPassed, isUnlocked, bestScore, catProgress, overall, recommended } from './progress.js';

const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
function speak(text) {
  if (!hasSpeech() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.rate = 0.85;
    window.speechSynthesis.speak(u);
  } catch { /* suara tidak tersedia di perangkat ini */ }
}
const speakBtn = (text) => (hasSpeech() && text ? `<button class="speak-btn" type="button" data-speak="${esc(text)}" aria-label="Dengarkan">${icon('speaker')}</button>` : '');
const heartsHtml = (n, max) => Array.from({ length: max }, (_, i) => `<span class="heart ${i < n ? 'on' : 'off'}">${icon('heart')}</span>`).join('');

// ---------- Beranda belajar ----------
export async function learnHubView({ container, isStale }) {
  resetCookIntro();
  container.innerHTML = pageHead({ title: 'Belajar' }) + skeletonPage();
  const load = async () => {
    try {
      const p = await loadProgress(true);
      if (isStale()) return;
      const rec = recommended(p);
      const all = overall(p);
      container.innerHTML = pageHead({ title: 'Belajar bahasa Jepang', subtitle: 'Pilih kategori, lalu selesaikan level satu per satu. Level berikutnya terbuka setelah level sebelumnya lulus.' }) +
        `<div class="learn-top">
          <div class="learn-continue">
            ${rec ? `<span class="small muted">Lanjutkan belajar</span><h2>${esc(rec.catName)}: ${esc(rec.title)}</h2><a class="btn btn-primary" href="#/learn/${esc(rec.cat)}/${rec.n}">${icon('play')} Lanjut level ${rec.n}</a>`
              : `<span class="small muted">Luar biasa</span><h2>Semua level sudah selesai</h2><p class="muted small">Kamu boleh mengulang level mana pun untuk berlatih.</p>`}
          </div>
          <div class="learn-total"><strong>${all.percent}%</strong><span>${all.done} dari ${all.total} level selesai</span><div class="meter"><i style="width:${all.percent}%"></i></div></div>
        </div>
        <div class="cat-grid">${CATEGORIES.map((c, i) => {
          const cp = catProgress(p, c.id);
          return `<a class="cat-card" href="#/learn/${c.id}" style="--i:${i}"><span class="cat-jp" aria-hidden="true">${esc(c.jp)}</span><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p><div class="meter"><i style="width:${cp.percent}%"></i></div><span class="small muted">${cp.done} dari ${cp.total} level</span></a>`;
        }).join('')}</div>
        <a class="cook-banner" href="#/cook"><span aria-hidden="true">料理</span><div><strong>Dapur Jepang</strong><div class="small">Game memasak: buat onigiri, ocha, dan sushi dengan gerakan jari.</div></div></a>`;
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Belajar' }) + errorState(e.message);
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  };
  await load();
}

// ---------- Jalur level satu kategori ----------
export async function learnCatView({ container, params, isStale }) {
  const cat = CAT_BY_ID[params.cat];
  if (!cat) { location.hash = '#/learn'; return; }
  container.innerHTML = skeletonPage();
  try {
    const p = await loadProgress(true);
    if (isStale()) return;
    const cp = catProgress(p, cat.id);
    const rec = recommended(p);
    container.innerHTML = `<p style="margin-bottom:12px"><a href="#/learn" class="small">${icon('chevronLeft')} Semua kategori</a></p>` +
      pageHead({ title: `${cat.name}`, subtitle: `${cat.blurb}. ${cp.done} dari ${cp.total} level selesai.` }) +
      `<ol class="path">${cat.lessons.map((l, i) => {
        const done = isPassed(p, cat.id, l.n), open = isUnlocked(p, cat.id, l.n);
        const isCurrent = open && !done;
        const state = done ? 'done' : isCurrent ? 'current' : 'locked';
        const best = bestScore(p, cat.id, l.n);
        const inner = `<span class="node-dot">${done ? icon('check') : open ? l.n : icon('lock')}</span><span class="node-text"><strong>${esc(l.title)}</strong><span class="small muted">${done ? `Selesai. Skor terbaik ${best}%` : open ? 'Siap dipelajari' : 'Selesaikan level sebelumnya'}</span></span>`;
        return `<li class="node ${state}" style="--s:${[0, 1, 2, 1, 0, -1, -2, -1][i % 8]}">${open ? `<a href="#/learn/${cat.id}/${l.n}" ${isCurrent ? 'aria-current="step"' : ''}>${inner}</a>` : `<button type="button" class="node-locked" data-locked aria-disabled="true">${inner}</button>`}</li>`;
      }).join('')}</ol>`;
    container.querySelectorAll('[data-locked]').forEach((b) => b.addEventListener('click', () => toast('Selesaikan level sebelumnya dulu.', 'error')));
    void rec;
  } catch (e) {
    if (isStale()) return;
    container.innerHTML = pageHead({ title: cat.name }) + errorState(e.message);
    container.querySelector('#retry')?.addEventListener('click', () => location.reload());
  }
}

// ---------- Level: materi -> latihan -> hasil ----------
export async function learnLessonView({ container, params, isStale }) {
  const cat = CAT_BY_ID[params.cat];
  const n = Number(params.n);
  const lesson = cat?.lessons[n - 1];
  if (!lesson) { location.hash = '#/learn'; return; }
  container.innerHTML = skeletonPage();
  let progress;
  try { progress = await loadProgress(true); } catch (e) {
    if (isStale()) return;
    container.innerHTML = pageHead({ title: lesson.title }) + errorState(e.message);
    container.querySelector('#retry')?.addEventListener('click', () => location.reload());
    return;
  }
  if (isStale()) return;
  if (!isUnlocked(progress, cat.id, n)) {
    toast('Selesaikan level sebelumnya dulu.', 'error');
    location.hash = `#/learn/${cat.id}`;
    return;
  }
  const maxHearts = progress.config.hearts;
  let disposer = null;

  const speakDelegate = (e) => { const b = e.target.closest('[data-speak]'); if (b) speak(b.dataset.speak); };
  container.addEventListener('click', speakDelegate);

  function intro() {
    document.body.classList.remove('in-session');
    const long = lesson.cards.some((c) => c.big.length > 4);
    container.innerHTML = `<p style="margin-bottom:12px"><a href="#/learn/${cat.id}" class="small">${icon('chevronLeft')} ${esc(cat.name)}</a></p>
      <div class="lesson-intro">
        <span class="small muted">${esc(cat.name)} &middot; Level ${n} dari ${cat.lessons.length}</span>
        <h1>${esc(lesson.title)}</h1>
        <p class="lesson-lead">${esc(lesson.intro)}</p>
        ${lesson.rule ? `<div class="rule-box"><span class="small muted">Pola kalimat</span><strong>${esc(lesson.rule)}</strong></div>` : ''}
        ${lesson.passage ? `<div class="passage"><div class="passage-jp">${esc(lesson.passage.jp)}${speakBtn(lesson.passage.jp)}</div><div class="passage-ro">${esc(lesson.passage.romaji)}</div><div class="passage-id">${esc(lesson.passage.id)}</div></div>` : ''}
        <h2 class="lesson-h">Materi</h2>
        <div class="${long ? 'tlist' : 'kcards'}">${lesson.cards.map((c) => long
          ? `<div class="tcard"><div class="tcard-jp">${esc(c.big)}${speakBtn(c.big)}</div><div class="tcard-ro">${esc(c.small)}</div><div class="tcard-id">${esc(c.text)}</div></div>`
          : `<div class="kcard"><span class="kcard-big">${esc(c.big)}</span><span class="kcard-small">${esc(c.small)}</span><span class="kcard-text">${esc(c.text)}</span>${speakBtn(c.big)}</div>`).join('')}</div>
        ${lesson.examples?.length ? `<h2 class="lesson-h">Contoh penggunaan</h2><ul class="examples">${lesson.examples.map(([jp, ro, id]) => `<li><span class="ex-jp">${esc(jp)}</span><span class="ex-ro">${esc(ro)}</span><span class="ex-id">${esc(id)}</span></li>`).join('')}</ul>` : ''}
        <div class="lesson-cta"><button class="btn btn-primary btn-lg" id="ls-start">${icon('play')} Mulai latihan</button><span class="hearts-note"><span class="hearts">${heartsHtml(maxHearts, maxHearts)}</span> ${maxHearts} nyawa</span></div>
      </div>`;
    container.querySelector('#ls-start').addEventListener('click', session);
    window.scrollTo(0, 0);
  }

  // ----- Sesi latihan -----
  function session() {
    document.body.classList.add('in-session');
    const questions = buildQuestions(cat.id, n);
    const queue = [...questions];
    const st = { i: 0, hearts: maxHearts, correct: 0, attempts: 0, mistakes: [], q: null, phase: 'answer', sel: null, picked: [], matched: new Set(), pickedLeft: null, matchWrong: false, finished: false };

    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'Enter') { const b = container.querySelector('#sx-main:not(:disabled)'); if (b) { e.preventDefault(); b.click(); } }
      else if (/^[1-9]$/.test(e.key) && st.phase === 'answer' && (st.q.type === 'choice' || st.q.type === 'fill')) {
        const idx = Number(e.key) - 1;
        if (idx < st.q.options.length) { st.sel = idx; paintBody(); }
      }
    };
    document.addEventListener('keydown', onKey);
    disposer = () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('in-session'); };

    const shell = () => {
      container.innerHTML = `<div class="session" id="sx">
        <div class="sx-top"><button class="btn btn-quiet btn-icon" id="sx-close" aria-label="Keluar dari latihan">${icon('x')}</button><div class="sx-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i id="sx-prog"></i></div><div class="hearts" id="sx-hearts" aria-label="Nyawa"></div></div>
        <div class="sx-body" id="sx-body"></div>
        <div class="sx-foot" id="sx-foot"></div>
      </div>`;
      container.querySelector('#sx-close').addEventListener('click', async () => {
        if (await confirmDialog({ title: 'Keluar dari latihan?', message: 'Progres latihan ini tidak disimpan.', confirmLabel: 'Keluar', danger: true })) { disposer?.(); disposer = null; intro(); }
      });
    };

    function paintTop() {
      const total = queue.length;
      const bar = container.querySelector('#sx-prog');
      bar.style.width = `${Math.round((st.i / total) * 100)}%`;
      bar.parentElement.setAttribute('aria-valuenow', String(Math.round((st.i / total) * 100)));
      container.querySelector('#sx-hearts').innerHTML = heartsHtml(st.hearts, maxHearts);
    }

    function nextQuestion() {
      if (st.i >= queue.length) return finish(true);
      st.q = queue[st.i]; st.phase = 'answer'; st.sel = null; st.picked = []; st.matched = new Set(); st.pickedLeft = null; st.matchWrong = false;
      if (st.q.type === 'match') { st.q._left = shuffle(st.q.pairs.map((p, i) => i)); st.q._right = shuffle(st.q.pairs.map((p, i) => i)); }
      if (st.q.type === 'order') st.q._bank = st.q.tokens.map((t, i) => ({ t, i }));
      paintTop(); paintBody(); paintFoot();
      if (st.q.speak && st.q.type !== 'match') { /* suara hanya atas permintaan pengguna */ }
    }

    function paintBody() {
      const q = st.q, body = container.querySelector('#sx-body');
      let h = `<p class="sx-prompt">${esc(q.prompt)}</p>`;
      if (q.context) h += `<div class="passage mini"><div class="passage-jp">${esc(q.context.jp)}${speakBtn(q.context.jp)}</div><div class="passage-ro">${esc(q.context.romaji)}</div></div>`;
      if (q.type === 'choice' || q.type === 'fill') {
        if (q.type === 'fill') h += `<div class="sx-sentence">${esc(q.sentence)}</div>${q.hint ? `<div class="small muted" style="text-align:center">${esc(q.hint)}</div>` : ''}`;
        if (q.big) h += `<div class="sx-big ${q.bigIsLatin ? 'latin' : ''} ${q.big.length > 6 ? 'long' : ''}">${esc(q.big)}${q.speak ? speakBtn(q.speak) : ''}</div>${q.sub ? `<div class="sx-sub">${esc(q.sub)}</div>` : ''}`;
        const short = q.options.every((o) => o.length <= 9);
        h += `<div class="opts ${short ? 'grid' : ''}" role="radiogroup">${q.options.map((o, i) => `<button type="button" class="opt ${st.sel === i ? 'sel' : ''} ${st.phase === 'feedback' ? (i === q.answer ? 'right' : st.sel === i ? 'wrong' : 'dim') : ''}" role="radio" aria-checked="${st.sel === i}" data-opt="${i}" ${st.phase === 'feedback' ? 'disabled' : ''}><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div>`;
      } else if (q.type === 'order') {
        h += `<div class="sx-meaning">${esc(q.meaning)}</div>
          <div class="order-line" id="ol">${st.picked.map((idx) => `<button type="button" class="tok" data-un="${idx}" ${st.phase === 'feedback' ? 'disabled' : ''}>${esc(q._bank[idx].t)}</button>`).join('') || '<span class="muted small">Ketuk kata di bawah untuk menyusunnya</span>'}</div>
          <div class="order-bank">${q._bank.map((b, idx) => (st.picked.includes(idx) ? `<span class="tok ghost">${esc(b.t)}</span>` : `<button type="button" class="tok" data-pick="${idx}" ${st.phase === 'feedback' ? 'disabled' : ''}>${esc(b.t)}</button>`)).join('')}</div>`;
      } else if (q.type === 'match') {
        h += `<div class="match"><div class="mcol">${q._left.map((pi) => `<button type="button" class="mbtn ${st.matched.has(pi) ? 'done' : ''} ${st.pickedLeft === pi ? 'sel' : ''}" data-l="${pi}" ${st.matched.has(pi) ? 'disabled' : ''}>${esc(q.pairs[pi][0])}</button>`).join('')}</div><div class="mcol">${q._right.map((pi) => `<button type="button" class="mbtn r ${st.matched.has(pi) ? 'done' : ''}" data-r="${pi}" ${st.matched.has(pi) ? 'disabled' : ''}>${esc(q.pairs[pi][1])}</button>`).join('')}</div></div>`;
      }
      body.innerHTML = h;
      bindBody();
    }

    function bindBody() {
      const body = container.querySelector('#sx-body');
      body.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => { st.sel = Number(b.dataset.opt); paintBody(); paintFoot(); }));
      body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { st.picked.push(Number(b.dataset.pick)); paintBody(); paintFoot(); }));
      body.querySelectorAll('[data-un]').forEach((b) => b.addEventListener('click', () => { st.picked = st.picked.filter((x) => x !== Number(b.dataset.un)); paintBody(); paintFoot(); }));
      body.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { st.pickedLeft = Number(b.dataset.l); paintBody(); }));
      body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => onMatchRight(Number(b.dataset.r), b)));
    }

    function onMatchRight(ri) {
      if (st.pickedLeft === null) { toast('Pilih dulu satu item di kolom kiri.', 'error'); return; }
      const li = st.pickedLeft;
      if (li === ri) {
        st.matched.add(li); st.pickedLeft = null;
        paintBody();
        if (st.matched.size === st.q.pairs.length) { resolveMatch(); }
      } else {
        st.pickedLeft = null;
        if (!st.matchWrong) { st.matchWrong = true; st.hearts--; paintTop(); }
        paintBody();
        const el = container.querySelector(`[data-r="${ri}"]`);
        el?.classList.add('shake');
        if (st.hearts <= 0) { resolveMatch(true); }
      }
    }

    function resolveMatch(outOfHearts = false) {
      st.attempts++;
      const ok = !st.matchWrong && !outOfHearts;
      if (ok) st.correct++;
      else st.mistakes.push({ prompt: st.q.prompt, answer: st.q.pairs.map((p) => `${p[0]} = ${p[1]}`).join(', ') });
      feedback(ok, `Pasangan yang benar: ${st.q.pairs.map((p) => `${p[0]} = ${p[1]}`).join(', ')}`);
    }

    function paintFoot() {
      if (st.phase !== 'answer') return;
      const q = st.q, foot = container.querySelector('#sx-foot');
      if (q.type === 'match') { foot.innerHTML = `<div class="sx-hint small muted">Pilih satu di kiri, lalu pasangannya di kanan.</div>`; return; }
      const ready = (q.type === 'order' ? st.picked.length > 0 : st.sel !== null);
      foot.innerHTML = `<button class="btn btn-primary btn-lg btn-block" id="sx-main" ${ready ? '' : 'disabled'}>Periksa</button>`;
      foot.querySelector('#sx-main').addEventListener('click', check);
    }

    function check() {
      const q = st.q;
      let ok, answerText;
      if (q.type === 'order') { ok = st.picked.map((i) => q._bank[i].t).join('') === q.answer.join(''); answerText = q.answer.join(' '); }
      else { ok = st.sel === q.answer; answerText = q.options[q.answer]; }
      st.attempts++;
      if (ok) st.correct++;
      else {
        st.hearts--;
        st.mistakes.push({ prompt: q.type === 'fill' ? q.sentence : (q.big || q.prompt), answer: answerText });
        if (!q._retry && st.hearts > 0) queue.push({ ...q, _retry: true, options: q.options ? shuffleKeep(q) : undefined, tokens: q.tokens ? shuffle(q.tokens) : undefined });
      }
      st.phase = 'feedback';
      paintTop();
      if (q.type === 'choice' || q.type === 'fill') paintBody();
      if (q.type === 'order') paintBody();
      feedback(ok, q.explain, ok ? '' : `Jawaban benar: ${answerText}`);
    }

    function shuffleKeep(q) { return q.options; }

    function feedback(ok, explain, correctLine = '') {
      st.phase = 'feedback';
      paintTop();
      const out = st.hearts <= 0;
      const foot = container.querySelector('#sx-foot');
      foot.innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}" role="status"><div class="fb-icon">${icon(ok ? 'check' : 'x')}</div><div class="fb-text"><strong>${ok ? pickPraise() : out ? 'Nyawa habis' : 'Kurang tepat'}</strong>${correctLine ? `<div>${esc(correctLine)}</div>` : ''}<div class="small">${esc(explain || '')}</div></div></div>
        <button class="btn ${ok ? 'btn-primary' : 'btn-dark'} btn-lg btn-block" id="sx-main">${out ? 'Lihat hasil' : 'Lanjut'}</button>`;
      foot.querySelector('#sx-main').addEventListener('click', () => { st.i++; if (out) finish(false); else nextQuestion(); });
      foot.querySelector('#sx-main').focus();
    }
    const PRAISE = ['Benar!', 'Tepat sekali!', 'Bagus!', 'Mantap!', 'Pas!'];
    const pickPraise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

    async function finish(passed) {
      if (st.finished) return;
      st.finished = true;
      disposer?.(); disposer = null;
      document.body.classList.add('in-session');
      const total = Math.min(40, Math.max(1, st.attempts));
      const correct = Math.min(st.correct, total);
      container.innerHTML = `<div class="result"><div class="loading-line"><span class="spinner"></span>Menyimpan hasil...</div></div>`;
      let saved = null, saveErr = null;
      try {
        saved = await api.post('/api/learning/result', { cat: cat.id, n, correct, total, passed });
        const prog = await loadProgress();
        setProgress({ ...prog, lessons: saved.lessons, last: saved.last });
      } catch (e) { saveErr = e.message; }
      showResult({ passed, correct, total, saved, saveErr });
    }

    function showResult({ passed, correct, total, saved, saveErr }) {
      document.body.classList.remove('in-session');
      const score = Math.round((correct / total) * 100);
      const hasNext = n < cat.lessons.length;
      container.innerHTML = `<div class="result ${passed ? 'pass' : 'fail'}">
        <div class="result-seal" aria-hidden="true">${passed ? icon('check') : icon('heart')}</div>
        <h1>${passed ? 'Level selesai!' : 'Belum berhasil'}</h1>
        <p class="muted">${passed ? (hasNext ? `Level ${n + 1} sudah terbuka.` : `Kamu menamatkan kategori ${esc(cat.name)}.`) : 'Nyawamu habis. Pelajari materinya sekali lagi, lalu coba lagi.'}</p>
        <div class="result-stats"><div><strong>${score}%</strong><span>skor</span></div><div><strong>${correct}/${total}</strong><span>jawaban benar</span></div><div><strong>${st.hearts}</strong><span>nyawa tersisa</span></div></div>
        ${saveErr ? `<div class="alert alert-warn" style="text-align:left">${icon('alert')}<div><strong>Hasil belum tersimpan.</strong><div class="small">${esc(saveErr)}</div><button class="btn btn-sm" id="rs-retry" style="margin-top:8px">Coba simpan lagi</button></div></div>` : ''}
        ${st.mistakes.length ? `<div class="review"><h2>Yang perlu diulang</h2><ul>${st.mistakes.slice(0, 8).map((m) => `<li><span class="rv-q">${esc(m.prompt)}</span><span class="rv-a">${esc(m.answer)}</span></li>`).join('')}</ul></div>` : '<p class="muted small">Tidak ada kesalahan. Sempurna.</p>'}
        <div class="result-actions">
          ${passed && hasNext ? `<a class="btn btn-primary btn-lg" href="#/learn/${cat.id}/${n + 1}">Lanjut ke level ${n + 1}</a>` : ''}
          <button class="btn btn-lg ${passed && hasNext ? '' : 'btn-primary'}" id="rs-again">Ulangi level ini</button>
          <a class="btn btn-quiet btn-lg" href="#/learn/${cat.id}">Kembali ke daftar level</a>
        </div></div>`;
      container.querySelector('#rs-again').addEventListener('click', () => { session(); });
      container.querySelector('#rs-retry')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          const r = await api.post('/api/learning/result', { cat: cat.id, n, correct, total, passed });
          const prog = await loadProgress();
          setProgress({ ...prog, lessons: r.lessons, last: r.last });
          showResult({ passed, correct, total, saved: r, saveErr: null });
        } catch (err) { toast(err.message, 'error'); e.currentTarget.disabled = false; }
      });
    }

    shell();
    nextQuestion();
  }

  intro();
  return () => { container.removeEventListener('click', speakDelegate); disposer?.(); document.body.classList.remove('in-session'); try { window.speechSynthesis?.cancel(); } catch { /* abaikan */ } };
}
