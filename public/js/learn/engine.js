// Pembuat soal. Murni fungsi (tanpa DOM) supaya mudah diuji.
import { CATEGORIES, CAT_BY_ID } from './data.js';

export const rand = (n) => Math.floor(Math.random() * n);
export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Pilihan jawaban: jawaban benar + pengecoh unik, diacak. Mengembalikan { options, answer(index) }. */
export function makeOptions(correct, pool, n = 4) {
  const uniq = [...new Set(pool.filter((x) => x !== correct))];
  const options = shuffle([correct, ...shuffle(uniq).slice(0, n - 1)]);
  return { options, answer: options.indexOf(correct) };
}

function previousPool(cat, lesson, pick) {
  const out = [];
  for (const l of cat.lessons) { if (l.n <= lesson.n) out.push(...pick(l)); }
  return out;
}

function matchQ(prompt, pairs, speak = false) {
  const chosen = shuffle(pairs).slice(0, 5);
  return { type: 'match', prompt, pairs: chosen, speak };
}

/** Membuat daftar soal untuk satu level. Kombinasinya selalu bervariasi. */
export function buildQuestions(catId, n) {
  const cat = CAT_BY_ID[catId];
  const lesson = cat.lessons[n - 1];
  const q = [];

  if (cat.kind === 'kana') {
    const items = lesson.items;
    const pool = previousPool(cat, lesson, (l) => l.items);
    const romajiPool = pool.map((i) => i.romaji);
    const charPool = pool.map((i) => i.char);
    const order = shuffle(items);
    const count = Math.min(10, Math.max(8, items.length));
    for (let i = 0; i < count; i++) {
      const it = order[i % order.length];
      if (i % 3 === 2) {
        const o = makeOptions(it.char, [...items.map((x) => x.char), ...charPool]);
        q.push({ type: 'choice', prompt: `Pilih huruf yang dibaca "${it.romaji}".`, big: it.romaji, options: o.options, answer: o.answer, explain: `${it.char} dibaca "${it.romaji}".`, bigIsLatin: true });
      } else {
        const o = makeOptions(it.romaji, [...items.map((x) => x.romaji), ...romajiPool]);
        q.push({ type: 'choice', prompt: 'Bagaimana cara membaca huruf ini?', big: it.char, speak: it.char, options: o.options, answer: o.answer, explain: `${it.char} dibaca "${it.romaji}".` });
      }
    }
    if (items.length >= 3) q.splice(Math.min(q.length, 4), 0, matchQ('Cocokkan huruf dengan romaji.', items.map((i) => [i.char, i.romaji])));
    if (items.length >= 4) q.push(matchQ('Cocokkan lagi: huruf dengan romaji.', items.map((i) => [i.char, i.romaji])));
  }

  if (cat.kind === 'kanji') {
    const ks = lesson.kanji;
    const all = CATEGORIES.find((c) => c.id === 'kanji').lessons.flatMap((l) => l.kanji);
    const order = shuffle(ks);
    for (let i = 0; i < 9; i++) {
      const k = order[i % order.length];
      const t = i % 3;
      if (t === 0) {
        const o = makeOptions(k.meaning, [...ks.map((x) => x.meaning), ...all.map((x) => x.meaning)]);
        q.push({ type: 'choice', prompt: 'Apa arti kanji ini?', big: k.char, options: o.options, answer: o.answer, explain: `${k.char} berarti "${k.meaning}", dibaca ${k.reading} (${k.romaji}). Contoh: ${k.ex[0]} (${k.ex[1]}) = ${k.ex[2]}.` });
      } else if (t === 1) {
        const o = makeOptions(k.reading, [...ks.map((x) => x.reading), ...all.map((x) => x.reading)]);
        q.push({ type: 'choice', prompt: 'Bagaimana cara membaca kanji ini?', big: k.char, speak: k.reading, options: o.options, answer: o.answer, explain: `${k.char} dibaca ${k.reading} (${k.romaji}) dan berarti "${k.meaning}".${k.note ? ` ${k.note}.` : ''}` });
      } else {
        const o = makeOptions(k.char, [...ks.map((x) => x.char), ...all.map((x) => x.char)]);
        q.push({ type: 'choice', prompt: `Pilih kanji untuk "${k.meaning}".`, big: k.meaning, bigIsLatin: true, options: o.options, answer: o.answer, explain: `"${k.meaning}" ditulis ${k.char}.` });
      }
    }
    q.splice(4, 0, matchQ('Cocokkan kanji dengan artinya.', ks.map((k) => [k.char, k.meaning])));
  }

  if (cat.kind === 'vocab') {
    const ws = lesson.words;
    const all = CATEGORIES.find((c) => c.id === 'kosakata').lessons.flatMap((l) => l.words);
    const order = shuffle(ws);
    for (let i = 0; i < 9; i++) {
      const w = order[i % order.length];
      if (i % 3 === 1) {
        const o = makeOptions(w.jp, [...ws.map((x) => x.jp), ...all.map((x) => x.jp)]);
        q.push({ type: 'choice', prompt: `Pilih kata Jepang untuk "${w.id}".`, big: w.id, bigIsLatin: true, options: o.options, answer: o.answer, explain: `"${w.id}" = ${w.jp} (${w.romaji}).` });
      } else {
        const o = makeOptions(w.id, [...ws.map((x) => x.id), ...all.map((x) => x.id)]);
        q.push({ type: 'choice', prompt: 'Apa arti kata ini?', big: w.jp, sub: w.romaji, speak: w.kana, options: o.options, answer: o.answer, explain: `${w.jp} (${w.romaji}) berarti "${w.id}".` });
      }
    }
    q.splice(3, 0, matchQ('Cocokkan kata dengan artinya.', ws.map((w) => [w.jp, w.id])));
  }

  if (cat.kind === 'grammar') {
    const allIds = cat.lessons.flatMap((l) => l.sentences.map((x) => x.id));
    const sents = shuffle(lesson.sentences);
    for (const sn of sents.slice(0, 4)) {
      q.push({ type: 'order', prompt: 'Susun kata menjadi kalimat yang benar.', meaning: sn.id, tokens: shuffle(sn.tokens), answer: sn.tokens, explain: `${sn.tokens.join('')} (${sn.romaji}) = ${sn.id}`, speak: sn.tokens.join('') });
    }
    for (const f of shuffle(lesson.fills)) {
      const idx = f.options.indexOf(f.answer);
      const opts = shuffle(f.options);
      q.push({ type: 'fill', prompt: 'Lengkapi kalimat yang kosong.', sentence: f.jp, hint: f.id, options: opts, answer: opts.indexOf(f.answer), explain: `Jawaban: ${f.answer}. ${lesson.rule ? `Pola: ${lesson.rule}.` : ''}`, _i: idx });
    }
    for (const sn of sents.slice(0, 3)) {
      const o = makeOptions(sn.id, allIds);
      q.push({ type: 'choice', prompt: 'Apa arti kalimat ini?', big: sn.tokens.join(''), sub: sn.romaji, speak: sn.tokens.join(''), options: o.options, answer: o.answer, explain: `${sn.tokens.join('')} = ${sn.id}` });
    }
    q.sort(() => Math.random() - 0.5);
  }

  if (cat.kind === 'talk') {
    const allIds = cat.lessons.flatMap((l) => l.lines.map((x) => x.id));
    for (const x of shuffle(lesson.qa)) {
      const o = makeOptions(x.a, [x.a, ...x.wrong]);
      q.push({ type: 'choice', prompt: x.q, options: o.options, answer: o.answer, explain: `Jawaban yang tepat: ${x.a}`, speak: /[ぁ-んァ-ン]/.test(x.a) ? x.a : null });
    }
    for (const l of shuffle(lesson.lines).slice(0, 3)) {
      const o = makeOptions(l.id, allIds);
      q.push({ type: 'choice', prompt: 'Apa arti kalimat ini?', big: l.jp, sub: l.romaji, speak: l.jp, options: o.options, answer: o.answer, explain: `${l.jp} (${l.romaji}) = ${l.id}` });
    }
    for (const o of lesson.order) q.push({ type: 'order', prompt: 'Susun kata menjadi kalimat yang benar.', meaning: o.id, tokens: shuffle(o.tokens), answer: o.tokens, explain: `${o.tokens.join('')} = ${o.id}`, speak: o.tokens.join('') });
    q.sort(() => Math.random() - 0.5);
  }

  if (cat.kind === 'read') {
    const p = lesson.passage;
    const splitJp = (x) => x.jp.split('。').filter(Boolean).map((t) => t + '。');
    const splitId = (x) => x.id.split('. ').map((t) => (t.endsWith('.') ? t : t + '.'));
    const splitRo = (x) => x.romaji.split('. ').map((t) => (t.endsWith('.') ? t : t + '.'));
    const allId = cat.lessons.flatMap((l) => splitId(l.passage));
    const allRo = cat.lessons.flatMap((l) => splitRo(l.passage));
    const sentences = splitJp(p), ids = splitId(p), ros = splitRo(p);
    sentences.forEach((jp, i) => {
      const o = makeOptions(ids[i], allId);
      q.push({ type: 'choice', prompt: 'Apa arti kalimat ini?', context: p, big: jp, speak: jp, options: o.options, answer: o.answer, explain: `${jp} = ${ids[i]}` });
      const r = makeOptions(ros[i], allRo);
      q.push({ type: 'choice', prompt: 'Bagaimana cara membaca kalimat ini?', big: jp, speak: jp, options: r.options, answer: r.answer, explain: `${jp} dibaca "${ros[i]}"` });
    });
    for (const x of lesson.qs) {
      const o = makeOptions(x.a, [x.a, ...x.wrong]);
      q.push({ type: 'choice', prompt: x.q, context: p, options: o.options, answer: o.answer, explain: `Jawaban: ${x.a}. Terjemahan bacaan: ${p.id}` });
    }
    if (sentences.length >= 2) q.push(matchQ('Cocokkan kalimat dengan artinya.', sentences.map((t, i) => [t, ids[i]])));
    const head = q.filter((x) => x.type !== 'match' && !x.context);
    const rest = q.filter((x) => !head.includes(x));
    q.length = 0;
    q.push(...shuffle(head), ...rest);
  }
  return q;
}
