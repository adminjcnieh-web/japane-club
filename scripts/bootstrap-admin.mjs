#!/usr/bin/env node
// Membuat ADMIN PERTAMA dengan cara yang aman.
//
// Dijalankan di KOMPUTERMU sendiri (bukan di browser) memakai file kunci service account.
// Tidak ada orang yang bisa menjadi admin hanya dengan mengetik username tertentu.
//
// Cara pakai:
//   node scripts/bootstrap-admin.mjs --key=./service-account.json
// Skrip akan menanyakan username, nama, dan password. Setelah selesai, HAPUS file kunci
// dari komputer bila tidak dipakai lagi, dan jangan pernah mengunggahnya ke GitHub.
import fs from 'node:fs';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { Firestore, op } from '../backend/src/lib/firestore.js';
import { createAuthUser, deleteAuthUser } from '../backend/src/lib/google.js';
import { auditOp } from '../backend/src/lib/audit.js';
import * as v from '../backend/src/lib/validate.js';

export function envFromServiceAccount(json, extra = {}) {
  const sa = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    FIREBASE_PROJECT_ID: sa.project_id,
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa),
    EMAIL_DOMAIN: process.env.EMAIL_DOMAIN || 'japanese-club.local',
    ...extra,
  };
}

export async function bootstrapAdmin(env, { username, fullName, password, force = false }) {
  const uname = v.username(username);
  const name = v.str(fullName, { name: 'Nama lengkap', min: 2, max: 80 });
  v.password(password);

  const db = new Firestore(env);
  const admins = await db.query('users', { where: [['role', '==', 'admin']], limit: 1 });
  if (admins.length && !force) {
    throw new Error('Admin sudah ada di database. Gunakan akun admin tersebut untuk membuat akun lain lewat dashboard. (Pakai --force hanya jika kamu yakin.)');
  }
  const now = new Date();
  const uid = await createAuthUser(env, { username: uname, password, displayName: name });
  try {
    await db.commit([
      op.create(`usernames/${uname}`, { uid, createdAt: now }),
      op.create(`users/${uid}`, {
        fullName: name, username: uname, usernameLower: uname, kelas: '', jabatan: 'Admin', role: 'admin', active: true,
        countsAttendance: false,
        permissions: { editAttendance: true, announce: true, exportReports: true },
        joinedAt: now.toISOString().slice(0, 10), createdAt: now, updatedAt: now, createdBy: 'bootstrap',
      }),
      auditOp({ action: 'admin.bootstrap', actor: { uid, user: { fullName: name } }, targetUid: uid, targetName: name }, now),
    ]);
  } catch (e) {
    await deleteAuthUser(env, uid);
    throw e;
  }
  return { uid, username: uname };
}

function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    if (hidden) {
      const out = rl.output;
      rl._writeToOutput = (s) => {
        if (s.includes(question)) out.write(s);
        else if (/[\r\n]/.test(s)) out.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl._writeToOutput = (s) => rl.output.write(s);
      if (hidden) rl.output.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const keyPath = args.key || process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error('File kunci tidak ditemukan. Jalankan:\n  node scripts/bootstrap-admin.mjs --key=./service-account.json');
    process.exit(1);
  }
  const env = envFromServiceAccount(fs.readFileSync(keyPath, 'utf8'));
  console.log(`Project Firebase: ${env.FIREBASE_PROJECT_ID}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    const username = await ask(rl, 'Username admin (huruf kecil/angka, min 3): ');
    const fullName = await ask(rl, 'Nama lengkap admin: ');
    const password = await ask(rl, 'Password (min 8, huruf + angka): ', true);
    const again = await ask(rl, 'Ulangi password: ', true);
    if (password !== again) throw new Error('Password tidak sama.');
    const r = await bootstrapAdmin(env, { username, fullName, password, force: args.force !== undefined });
    console.log(`\nBerhasil! Admin "${r.username}" dibuat (UID: ${r.uid}).\nSekarang kamu bisa login di website lalu membuat akun anggota dari menu Anggota.`);
  } catch (e) {
    console.error('\nGagal: ' + (e.message || e));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
