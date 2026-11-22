// Progres belajar per anggota: dokumen kecil "learning/{uid}". Isi materi ada di frontend.
// Aturan buka-kunci dicek juga di sini: level N hanya boleh dicatat jika level N-1 sudah lulus.
import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op } from '../lib/firestore.js';
import { LESSON_COUNTS } from '../lib/learning-manifest.js';
import { readSettings } from './settings.js';

function out(doc) {
  const lessons = {};
  for (const [k, x] of Object.entries(doc?.lessons || {})) {
    lessons[k] = { best: x.best || 0, attempts: x.attempts || 0, passed: !!x.passed, at: x.at || null };
  }
  return { lessons, last: doc?.last || null };
}

export async function get(ctx) {
  const [doc, settings] = await Promise.all([ctx.fs.get(`learning/${ctx.auth.uid}`), readSettings(ctx)]);
  return { ...out(doc), config: { hearts: settings.learningHearts }, counts: LESSON_COUNTS };
}

export async function record(ctx) {
  const b = await ctx.json();
  const cat = v.oneOf(b.cat, Object.keys(LESSON_COUNTS), 'Kategori');
  const n = v.intRange(b.n, { name: 'Level', min: 1, max: LESSON_COUNTS[cat] });
  const total = v.intRange(b.total, { name: 'Jumlah soal', min: 1, max: 40 });
  const correct = v.intRange(b.correct, { name: 'Jawaban benar', min: 0, max: total });
  const passed = v.bool(b.passed, 'passed');
  const uid = ctx.auth.uid;
  const doc = await ctx.fs.get(`learning/${uid}`);
  const lessons = { ...(doc?.lessons || {}) };
  if (n > 1 && !lessons[`${cat}-${n - 1}`]?.passed) {
    throw new HttpError(409, 'Selesaikan level sebelumnya dulu', 'locked');
  }
  const key = `${cat}-${n}`;
  const prev = lessons[key] || {};
  const score = Math.round((correct / total) * 100);
  lessons[key] = { best: Math.max(prev.best || 0, score), attempts: (prev.attempts || 0) + 1, passed: !!prev.passed || passed, at: ctx.now };
  const data = { lessons, last: { cat, n, at: ctx.now }, updatedAt: ctx.now };
  await ctx.fs.commit([doc ? op.update(`learning/${uid}`, data, doc._updateTime) : op.create(`learning/${uid}`, data)]);
  return { ...out({ ...data }), score, unlockedNext: passed && n < LESSON_COUNTS[cat] };
}
