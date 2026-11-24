#!/usr/bin/env node
// Memulihkan akses admin bila akun admin hilang atau lupa password.
// - Admin dengan username yang sama masih ada di Firebase  -> password-nya diganti (akun diaktifkan lagi).
// - Admin sudah terhapus (Authentication dan/atau database) -> sisa datanya dibersihkan, admin baru dibuat.
// - Ada admin LAIN yang masih aktif                        -> berhenti (pakai akun itu saja).
// Anggota biasa tidak pernah disentuh.
//
// Dipakai lewat GitHub Actions "Pulihkan Admin" (lihat README) atau di komputer:
//   FIREBASE_SERVICE_ACCOUNT_FILE=./service-account.json ADMIN_USERNAME=pembina ADMIN_NAME="Nama" ADMIN_PASSWORD=... node scripts/recover-admin.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Firestore, op } from '../backend/src/lib/firestore.js';
import { deleteAuthUser, lookupAuthUid, updateAuthUser } from '../backend/src/lib/google.js';
import { auditOp } from '../backend/src/lib/audit.js';
import * as v from '../backend/src/lib/validate.js';
import { bootstrapAdmin, envFromServiceAccount } from './bootstrap-admin.mjs';

export async function recoverAdmin(env, { username, fullName, password }) {
  const uname = v.username(username);
  const name = v.str(fullName, { name: 'Nama lengkap', min: 2, max: 80 });
  v.password(password);
  const db = new Firestore(env);
  const now = new Date();

  const admins = await db.query('users', { where: [['role', '==', 'admin']] });
  const dead = [];
  for (const a of admins) {
    const alive = await lookupAuthUid(env, { uid: a.id });
    if (alive && a.usernameLower === uname) {
      await updateAuthUser(env, a.id, { password, disableUser: false });
      await db.commit([
        op.update(`users/${a.id}`, { active: true, updatedAt: now }),
        auditOp({ action: 'admin.recover', actor: { uid: a.id, user: { fullName: a.fullName } }, targetUid: a.id, targetName: a.fullName, detail: 'password admin direset lewat skrip pemulihan' }, now),
      ]);
      return { uid: a.id, username: uname, mode: 'reset' };
    }
    if (alive) throw new Error(`Admin lain masih aktif: "${a.username}". Login pakai akun itu, atau jalankan pemulihan dengan username tersebut untuk mengganti passwordnya.`);
    dead.push(a);
  }

  // Tidak ada admin yang hidup: bersihkan sisa lalu buat baru.
  const ops = new Map();
  const del = (path) => ops.set(path, op.delete(path));
  for (const a of dead) { del(`users/${a.id}`); del(`usernames/${a.usernameLower}`); del(`avatars/${a.id}`); }

  const orphanUid = await lookupAuthUid(env, { username: uname });
  if (orphanUid) {
    const d = await db.get(`users/${orphanUid}`);
    if (d && d.role !== 'admin') throw new Error(`Username "${uname}" dipakai anggota biasa. Pilih username lain untuk admin.`);
    await deleteAuthUser(env, orphanUid);
    if (d) del(`users/${orphanUid}`);
  }
  const un = await db.get(`usernames/${uname}`);
  if (un) {
    const d = await db.get(`users/${un.uid}`);
    if (d && d.role !== 'admin') throw new Error(`Username "${uname}" dipakai anggota biasa. Pilih username lain untuk admin.`);
    del(`usernames/${uname}`);
  }
  if (ops.size) await db.commit([...ops.values()]);

  const r = await bootstrapAdmin(env, { username: uname, fullName: name, password, force: true });
  return { ...r, mode: 'create' };
}

async function main() {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (!raw) { console.error('Kunci Firebase tidak ditemukan (FIREBASE_SERVICE_ACCOUNT).'); process.exit(1); }
  const { ADMIN_USERNAME: username, ADMIN_NAME: fullName, ADMIN_PASSWORD: password } = process.env;
  if (!username || !password) { console.error('ADMIN_USERNAME dan ADMIN_PASSWORD wajib diisi.'); process.exit(1); }
  try {
    const r = await recoverAdmin(envFromServiceAccount(raw), { username, fullName: fullName || 'Admin', password });
    console.log(r.mode === 'reset'
      ? `Berhasil: password admin "${r.username}" sudah diganti. Silakan login.`
      : `Berhasil: admin baru "${r.username}" dibuat. Silakan login.`);
  } catch (e) {
    console.error('Gagal: ' + (e.message || e));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
