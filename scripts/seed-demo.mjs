#!/usr/bin/env node
// Data CONTOH untuk uji coba. Semua data ditandai demo:true sehingga bisa dihapus bersih.
// JANGAN dijalankan di database produksi yang sudah berisi data asli, kecuali kamu paham risikonya.
//
//   node scripts/seed-demo.mjs --key=./service-account.json --yes        (buat data contoh)
//   node scripts/seed-demo.mjs --key=./service-account.json --remove --yes  (hapus semua data contoh)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Firestore, op, newId } from '../backend/src/lib/firestore.js';
import { createAuthUser, deleteAuthUser } from '../backend/src/lib/google.js';
import { envFromServiceAccount } from './bootstrap-admin.mjs';

const MEMBERS = [
  ['demo_sakura', 'Sakura Demo', 'X-1', 'member'],
  ['demo_haruto', 'Haruto Demo', 'X-1', 'member'],
  ['demo_yuki', 'Yuki Demo', 'X-2', 'member'],
  ['demo_ren', 'Ren Demo', 'XI-1', 'member'],
  ['demo_mio', 'Mio Demo', 'XI-1', 'member'],
  ['demo_officer', 'Officer Demo', 'XI-2', 'officer'],
];

const day = (offset) => new Date(Date.now() + offset * 86400000 + 7 * 3600000).toISOString().slice(0, 10);

export async function seedDemo(env, { password }) {
  const db = new Firestore(env);
  const now = new Date();
  const users = [];
  for (const [username, fullName, kelas, role] of MEMBERS) {
    const uid = await createAuthUser(env, { username, password, displayName: fullName });
    users.push({ uid, username, fullName, kelas, role });
    await db.commit([
      op.create(`usernames/${username}`, { uid, demo: true, createdAt: now }),
      op.create(`users/${uid}`, {
        fullName, username, usernameLower: username, kelas, jabatan: role === 'officer' ? 'Sekretaris' : 'Anggota', role, active: true,
        countsAttendance: true,
        permissions: { editAttendance: role === 'officer', announce: role === 'officer', exportReports: role === 'officer' },
        joinedAt: day(-90), createdAt: now, updatedAt: now, createdBy: 'seed-demo', demo: true,
      }),
    ]);
  }

  const past = [
    ['Pengenalan Hiragana', -21],
    ['Latihan Percakapan Dasar', -14],
    ['Budaya: Tanabata', -7],
  ];
  const statuses = ['hadir', 'hadir', 'terlambat', 'izin', 'hadir', 'alfa', 'sakit'];
  let n = 0;
  for (const [name, offset] of past) {
    const id = newId();
    const date = day(offset);
    const writes = [
      op.create(`meetings/${id}`, {
        name, description: 'Pertemuan contoh', date, startTime: '15:30', endTime: '17:00', location: 'Ruang Bahasa', status: 'closed',
        lateAfterMinutes: 15, createdBy: 'seed-demo', createdByName: 'Seed Demo', createdAt: now, updatedAt: now, openedAt: now, closedAt: now, demo: true,
      }),
    ];
    for (const u of users) {
      writes.push(
        op.create(`attendance/${id}_${u.uid}`, {
          meetingId: id, meetingName: name, meetingDate: date, uid: u.uid, memberName: u.fullName, username: u.username, kelas: u.kelas,
          status: statuses[n++ % statuses.length], method: 'manual', recordedAt: now, updatedAt: now, updatedBy: 'seed-demo', updatedByName: 'Seed Demo', note: '', demo: true,
        }),
      );
    }
    await db.commit(writes);
  }
  const upId = newId();
  await db.commit([
    op.create(`meetings/${upId}`, {
      name: 'Latihan Katakana', description: 'Pertemuan contoh mendatang', date: day(3), startTime: '15:30', endTime: '17:00', location: 'Ruang Bahasa',
      status: 'scheduled', lateAfterMinutes: 15, createdBy: 'seed-demo', createdByName: 'Seed Demo', createdAt: now, updatedAt: now, demo: true,
    }),
    op.create(`announcements/${newId()}`, {
      title: 'Selamat datang (contoh)', body: 'Ini pengumuman contoh. Hapus data contoh sebelum dipakai sungguhan.', publishAt: now,
      createdBy: 'seed-demo', createdByName: 'Seed Demo', createdAt: now, updatedAt: now, demo: true,
    }),
  ]);
  return { users: users.map((u) => u.username), password };
}

export async function removeDemo(env) {
  const db = new Firestore(env);
  let removed = 0;
  const users = await db.query('users', { where: [['demo', '==', true]] });
  for (const u of users) {
    await deleteAuthUser(env, u.id);
    await db.commit([op.delete(`users/${u.id}`), op.delete(`usernames/${u.username}`)]);
    removed++;
  }
  for (const col of ['attendance', 'meetings', 'announcements']) {
    const docs = await db.query(col, { where: [['demo', '==', true]] });
    for (let i = 0; i < docs.length; i += 400) {
      await db.commit(docs.slice(i, i + 400).map((d) => op.delete(`${col}/${d.id}`)));
    }
    removed += docs.length;
  }
  return { removed };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const keyPath = args.key || process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error('File kunci tidak ditemukan. Contoh: node scripts/seed-demo.mjs --key=./service-account.json --yes');
    process.exit(1);
  }
  if (args.yes === undefined) {
    console.error('Tambahkan --yes untuk memastikan kamu sengaja menjalankan ini.');
    process.exit(1);
  }
  const env = envFromServiceAccount(fs.readFileSync(keyPath, 'utf8'));
  console.log(`Project Firebase: ${env.FIREBASE_PROJECT_ID}`);
  if (args.remove !== undefined) {
    const r = await removeDemo(env);
    console.log(`Selesai. ${r.removed} data contoh dihapus.`);
    return;
  }
  const password = 'Demo' + crypto.randomBytes(5).toString('hex') + '9';
  const r = await seedDemo(env, { password });
  console.log(`Data contoh dibuat.\nAkun: ${r.users.join(', ')}\nPassword (sama untuk semua, catat sekarang): ${r.password}\nHapus nanti dengan: node scripts/seed-demo.mjs --key=... --remove --yes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error('Gagal:', e.message || e); process.exit(1); });
