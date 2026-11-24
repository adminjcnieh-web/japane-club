// Peringatan untuk admin: anggota yang tidak hadir (alfa) beberapa pertemuan beruntun.
// Dihitung dari pertemuan yang SUDAH DITUTUP, dari yang terbaru mundur. Alfa, izin, dan sakit dihitung tidak hadir; hadir dan terlambat memutus runtutan.
// Hemat pembacaan Firestore: hanya mengambil pertemuan sebanyak batas (mis. 3), lalu menambah satu per satu
// hanya bila masih ada anggota yang runtutannya berlanjut.
import { requireRole } from '../lib/guard.js';
import { op, Firestore } from '../lib/firestore.js';
import { sendTelegram, telegramConfigured } from '../lib/telegram.js';
import { readSettings } from './settings.js';

const MAX_LOOKBACK = 15;

export async function absence(ctx) {
  requireRole(ctx, 'admin');
  return { ...(await computeAbsence(ctx)), telegram: telegramConfigured(ctx.env) };
}

export async function computeAbsence(ctx) {
  const { absenceAlertStreak: threshold } = await readSettings(ctx);

  const all = await ctx.fs.query('meetings', { where: [['status', '==', 'closed']] });
  const meetings = all
    .filter((m) => !m.deletedAt)
    .sort((a, b) => (a.date === b.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date)))
    .slice(0, MAX_LOOKBACK);
  if (meetings.length < threshold) return { threshold, items: [], checkedMeetings: meetings.length };

  const users = await ctx.fs.list('users');
  const members = new Map(users.filter((u) => u.active && u.countsAttendance !== false).map((u) => [u.id, u]));

  const streak = new Map(); // uid -> jumlah alfa beruntun sejauh ini
  const stillCounting = new Set(members.keys());
  const missed = new Map(); // uid -> daftar pertemuan yang dilewatkan (terbaru dulu)

  for (let i = 0; i < meetings.length && stillCounting.size; i++) {
    if (i >= threshold && !stillCounting.size) break;
    const m = meetings[i];
    const recs = await ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]] });
    const status = new Map(recs.filter((r) => !r.meetingDeleted).map((r) => [r.uid, r.status]));
    for (const uid of [...stillCounting]) {
      const s = status.get(uid);
      if (s === 'alfa' || s === 'izin' || s === 'sakit') {
        streak.set(uid, (streak.get(uid) || 0) + 1);
        (missed.get(uid) || missed.set(uid, []).get(uid)).push({ id: m.id, name: m.name, date: m.date });
      } else {
        stillCounting.delete(uid); // hadir/terlambat, atau belum punya catatan: runtutan berhenti
      }
    }
    // setelah batas terpenuhi, hanya lanjut untuk yang masih lolos
    if (i + 1 >= threshold) for (const uid of [...stillCounting]) if ((streak.get(uid) || 0) < i + 1) stillCounting.delete(uid);
  }

  const items = [...streak.entries()]
    .filter(([, n]) => n >= threshold)
    .map(([uid, n]) => ({ uid, fullName: members.get(uid).fullName, kelas: members.get(uid).kelas || '', streak: n, lastMeetings: missed.get(uid).slice(0, 5) }))
    .sort((a, b) => b.streak - a.streak || a.fullName.localeCompare(b.fullName, 'id'));
  return { threshold, items, checkedMeetings: meetings.length };
}

/** Admin menekan "Kirim pesan tes" di Pengaturan. */
export async function telegramTest(ctx) {
  requireRole(ctx, 'admin');
  await sendTelegram(ctx.env, 'Tes dari Japanese Club: Telegram sudah tersambung. Peringatan tidak hadir beruntun akan dikirim ke sini setiap sore.');
  return { ok: true };
}

/** Dipanggil jadwal harian Cloudflare (sore). Hanya mengirim bila daftar berubah sejak pesan terakhir. */
export async function runDailyAlert(env, now = new Date()) {
  if (!telegramConfigured(env)) return { sent: false, reason: 'telegram_not_configured' };
  const ctx = { env, now, fs: new Firestore(env) };
  const r = await computeAbsence(ctx);
  const key = r.items.map((i) => `${i.uid}:${i.streak}`).join(',');
  const state = await ctx.fs.get('system/alertState');
  if (state?.key === key) return { sent: false, reason: 'unchanged', count: r.items.length };
  if (!r.items.length) {
    if (state) await ctx.fs.commit([op.set('system/alertState', { key: '', sentAt: now })]);
    return { sent: false, reason: 'none', count: 0 };
  }
  const lines = r.items.map((i, n) => `${n + 1}. ${i.fullName}${i.kelas ? ` (${i.kelas})` : ''} - ${i.streak} pertemuan beruntun`);
  await sendTelegram(env, `Japanese Club - peringatan tidak hadir beruntun\n\nAnggota berikut sudah tidak hadir ${r.threshold} pertemuan beruntun atau lebih:\n${lines.join('\n')}\n\nAlfa, izin, dan sakit dihitung tidak hadir.`);
  await ctx.fs.commit([op.set('system/alertState', { key, sentAt: now })]);
  return { sent: true, count: r.items.length };
}
