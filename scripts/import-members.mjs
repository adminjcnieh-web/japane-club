#!/usr/bin/env node
// Membuat akun anggota sekaligus dari daftar (nama;kelas;divisi;panggilan, satu orang per baris; panggilan boleh kosong lalu ditebak).
// Username = panggilan (huruf kecil). Bila kembar: panggilan.kata-berikutnya (azkha.octaviander). Password awal = default-[2 huruf depan panggilan]1, contoh default-sa1.
// Aman dijalankan ulang: username yang sudah ada dilewati.
// Env: FIREBASE_SERVICE_ACCOUNT (atau FIREBASE_SERVICE_ACCOUNT_FILE), DAFTAR_ANGGOTA (teks CSV) atau DAFTAR_FILE, HASIL_FILE (opsional, tempat menulis hasil).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Firestore, op } from '../backend/src/lib/firestore.js';
import { createAuthUser, deleteAuthUser } from '../backend/src/lib/google.js';
import { auditOp } from '../backend/src/lib/audit.js';
import { envFromServiceAccount } from './bootstrap-admin.mjs';

const SKIP = new Set(['muhammad', 'muhamad', 'mohammad', 'mochamad', 'moch', 'muh', 'm', 'rd', 'raden', 'ahmad', 'abdul', 'aj', 'el', 'al']);
const clean = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

export function parseList(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(';').map((s) => s.trim()))
    .filter((p) => p[0] && !/^nama(\s+lengkap)?$/i.test(p[0]))
    .map(([nama, kelas = '', divisi = '', panggilan = '']) => ({ nama: nama.replace(/\s+/g, ' '), kelas: kelas.slice(0, 20), divisi, panggilan: clean(panggilan) }))
    .filter((r, i, all) => { // nama + kelas yang sama persis dianggap data ganda
      const k = `${r.nama.toLowerCase()}|${r.kelas.toLowerCase()}`;
      return all.findIndex((x) => `${x.nama.toLowerCase()}|${x.kelas.toLowerCase()}` === k) === i;
    });
}

/** Menyusun username unik + password untuk setiap orang (deterministik: urutan daftar yang menentukan). */
export function buildAccounts(rows) {
  const used = new Set();
  return rows.map((r) => {
    const words = r.nama.split(' ').map(clean).filter(Boolean);
    let bi = words.findIndex((w) => !SKIP.has(w) && w.length >= 2);
    if (bi < 0) bi = 0;
    const first = r.panggilan || words[bi] || 'anggota'; // panggilan (kolom ke-4 bila diisi, bila tidak ditebak) dipakai untuk password
    const ok = (u) => u.length >= 3 && !used.has(u);
    // username = panggilan. Bila sudah dipakai orang lain: panggilan.kata-berikutnya (dst), terakhir diberi angka.
    const after = words.slice(bi + 1).length ? words.slice(bi + 1) : words.filter((_, i) => i !== bi);
    const cands = [first.slice(0, 20)];
    for (let n = 1; n <= after.length; n++) cands.push([first, ...after.slice(0, n)].join('.').slice(0, 20));
    let username = cands.find(ok);
    for (let n = 2; !username; n++) { const sfx = String(n); const c = first.slice(0, 20 - sfx.length) + sfx; if (ok(c)) username = c; }
    used.add(username);
    return { ...r, username, password: `default-${first.slice(0, 2)}1` };
  });
}

export async function importMembers(env, rows, { log = () => {} } = {}) {
  const db = new Firestore(env);
  const accounts = buildAccounts(rows);
  const out = { created: [], skipped: [], failed: [] };
  const now = new Date();
  for (const a of accounts) {
    try {
      if (await db.get(`usernames/${a.username}`)) { out.skipped.push(a); continue; }
      const uid = await createAuthUser(env, { username: a.username, password: a.password, displayName: a.nama });
      try {
        await db.commit([
          op.create(`usernames/${a.username}`, { uid, createdAt: now }),
          op.create(`users/${uid}`, {
            fullName: a.nama, username: a.username, usernameLower: a.username, kelas: a.kelas, jabatan: a.divisi ? `Anggota ${a.divisi}` : 'Anggota',
            role: 'member', active: true, countsAttendance: true, permissions: { editAttendance: false, announce: false, exportReports: false },
            joinedAt: now.toISOString().slice(0, 10), createdAt: now, updatedAt: now, createdBy: 'import',
          }),
          auditOp({ action: 'member.create', actor: { uid: 'import', user: { fullName: 'Impor massal' } }, targetUid: uid, targetName: a.nama, detail: 'role member (impor)' }, now),
        ]);
      } catch (e) { await deleteAuthUser(env, uid); throw e; }
      out.created.push(a);
      log(`OK     ${a.username}  (${a.nama})`);
    } catch (e) {
      out.failed.push({ ...a, error: e.message });
      log(`GAGAL  ${a.username}  (${a.nama}): ${e.message}`);
    }
  }
  return out;
}

async function main() {
  const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT || (keyFile && fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '');
  const text = process.env.DAFTAR_ANGGOTA || (process.env.DAFTAR_FILE ? fs.readFileSync(process.env.DAFTAR_FILE, 'utf8') : '');
  if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT belum diisi.'); process.exit(1); }
  const rows = parseList(text);
  if (!rows.length) { console.error('Daftar anggota kosong (secret DAFTAR_ANGGOTA).'); process.exit(1); }
  console.log(`Membaca ${rows.length} anggota.`);
  const r = await importMembers(envFromServiceAccount(sa), rows, { log: console.log });
  console.log(`\nSelesai: ${r.created.length} dibuat, ${r.skipped.length} dilewati (sudah ada), ${r.failed.length} gagal.`);
  if (process.env.HASIL_FILE) {
    const all = [['nama', 'kelas', 'username', 'password', 'status'], ...r.created.map((a) => [a.nama, a.kelas, a.username, a.password, 'dibuat']), ...r.skipped.map((a) => [a.nama, a.kelas, a.username, '', 'dilewati']), ...r.failed.map((a) => [a.nama, a.kelas, a.username, '', `gagal: ${a.error}`])];
    fs.writeFileSync(process.env.HASIL_FILE, all.map((l) => l.join(';')).join('\n') + '\n');
  }
  if (r.failed.length) process.exit(1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
