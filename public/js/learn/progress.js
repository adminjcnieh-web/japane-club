// Progres belajar anggota (dari API) + perhitungan turunan. Satu salinan di memori per sesi halaman.
import * as api from '../api.js';
import { CATEGORIES, CAT_BY_ID, TOTAL_LESSONS } from './data.js';

let cache = null;
export async function loadProgress(force = false) {
  if (cache && !force) return cache;
  cache = await api.get('/api/learning');
  return cache;
}
export const setProgress = (p) => { cache = p; };
export const clearProgress = () => { cache = null; };

export const key = (cat, n) => `${cat}-${n}`;
export const isPassed = (p, cat, n) => !!p.lessons[key(cat, n)]?.passed;
export const isUnlocked = (p, cat, n) => n === 1 || isPassed(p, cat, n - 1);
export const bestScore = (p, cat, n) => p.lessons[key(cat, n)]?.best ?? null;

export function catProgress(p, cat) {
  const c = CAT_BY_ID[cat];
  const done = c.lessons.filter((l) => isPassed(p, cat, l.n)).length;
  return { done, total: c.lessons.length, percent: Math.round((done / c.lessons.length) * 100) };
}

export function overall(p) {
  let done = 0;
  for (const c of CATEGORIES) done += catProgress(p, c.id).done;
  return { done, total: TOTAL_LESSONS, percent: Math.round((done / TOTAL_LESSONS) * 100) };
}

function firstOpen(p, cat) {
  const c = CAT_BY_ID[cat];
  return c.lessons.find((l) => !isPassed(p, cat, l.n) && isUnlocked(p, cat, l.n)) || null;
}

/** Level terakhir yang dibuka anggota. */
export function lastLesson(p) {
  if (!p.last || !CAT_BY_ID[p.last.cat]) return null;
  const c = CAT_BY_ID[p.last.cat];
  const l = c.lessons[p.last.n - 1];
  return l ? { cat: c.id, catName: c.name, n: l.n, title: l.title, passed: isPassed(p, c.id, l.n) } : null;
}

/** Rekomendasi level berikutnya: lanjutkan kategori terakhir, lalu kategori pertama yang belum selesai. */
export function recommended(p) {
  if (p.last && CAT_BY_ID[p.last.cat]) {
    const l = firstOpen(p, p.last.cat);
    if (l) return { cat: p.last.cat, catName: CAT_BY_ID[p.last.cat].name, n: l.n, title: l.title };
  }
  for (const c of CATEGORIES) {
    const l = firstOpen(p, c.id);
    if (l) return { cat: c.id, catName: c.name, n: l.n, title: l.title };
  }
  return null;
}
