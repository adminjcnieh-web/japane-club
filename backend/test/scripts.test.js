// Menguji skrip admin pertama & data contoh terhadap Firebase tiruan.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFake } from './fake-google.js';
import { bootstrapAdmin } from '../../scripts/bootstrap-admin.mjs';
import { seedDemo, removeDemo } from '../../scripts/seed-demo.mjs';
import { parseList, buildAccounts, importMembers } from '../../scripts/import-members.mjs';
import { resetRateLimits } from '../src/lib/ratelimit.js';

let fake;
beforeEach(async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T03:00:00Z') });
  fake = await createFake();
  fake.install();
  resetRateLimits();
});
afterEach(() => {
  fake.uninstall();
  mock.timers.reset();
});

async function login(username, password) {
  const res = await worker.fetch(
    new Request('https://club.test/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    fake.env,
  );
  return { status: res.status, data: await res.json() };
}

test('bootstrap: admin pertama dibuat, bisa login, dan hanya sekali', async () => {
  const r = await bootstrapAdmin(fake.env, { username: 'Pembina', fullName: 'Bu Pembina', password: 'Rahasia123' });
  assert.equal(r.username, 'pembina');
  const l = await login('pembina', 'Rahasia123');
  assert.equal(l.status, 200);
  assert.equal(l.data.user.role, 'admin');
  await assert.rejects(bootstrapAdmin(fake.env, { username: 'lain', fullName: 'Orang Lain', password: 'Rahasia123' }), /Admin sudah ada/);
  await assert.rejects(bootstrapAdmin(fake.env, { username: 'x', fullName: 'Orang', password: 'Rahasia123', force: true }), /Username/);
});

test('data contoh dapat dibuat lalu dihapus bersih tanpa menyentuh data asli', async () => {
  await bootstrapAdmin(fake.env, { username: 'pembina', fullName: 'Bu Pembina', password: 'Rahasia123' });
  const before = fake.state.docs.size;
  const authBefore = fake.state.authUsers.size;
  const r = await seedDemo(fake.env, { password: 'DemoPass123' });
  assert.equal(r.users.length, 6);
  assert.ok(fake.state.docs.size > before + 20);
  const l = await login('demo_sakura', 'DemoPass123');
  assert.equal(l.status, 200);

  const removed = await removeDemo(fake.env);
  assert.ok(removed.removed > 20);
  assert.equal(fake.state.authUsers.size, authBefore);
  assert.equal(fake.countDocs('attendance/'), 0);
  assert.equal(fake.countDocs('meetings/'), 0);
  assert.ok(fake.getDoc(`usernames/pembina`));
  assert.equal((await login('pembina', 'Rahasia123')).status, 200);
});

test('pemulihan admin: reset password, buat ulang setelah terhapus, aman untuk anggota biasa', async () => {
  const { recoverAdmin } = await import('../../scripts/recover-admin.mjs');
  const { deleteAuthUser } = await import('../src/lib/google.js');
  const a = await bootstrapAdmin(fake.env, { username: 'pembina', fullName: 'Bu Pembina', password: 'Rahasia123' });
  // 1) lupa password: admin masih ada -> password diganti, uid sama
  const r1 = await recoverAdmin(fake.env, { username: 'pembina', fullName: 'Bu Pembina', password: 'Baru12345' });
  assert.equal(r1.mode, 'reset'); assert.equal(r1.uid, a.uid);
  assert.equal((await login('pembina', 'Rahasia123')).status, 401);
  assert.equal((await login('pembina', 'Baru12345')).status, 200);
  // 2) admin lain masih aktif -> ditolak
  await assert.rejects(recoverAdmin(fake.env, { username: 'lain', fullName: 'Orang Lain', password: 'Baru12345' }), /Admin lain masih aktif/);
  // 3) akun Auth terhapus, dokumen tertinggal -> dibuat ulang
  await deleteAuthUser(fake.env, a.uid);
  const r2 = await recoverAdmin(fake.env, { username: 'pembina', fullName: 'Bu Pembina', password: 'Baru12345' });
  assert.equal(r2.mode, 'create'); assert.notEqual(r2.uid, a.uid);
  assert.equal((await login('pembina', 'Baru12345')).data.user.role, 'admin');
  assert.ok(!fake.getDoc(`users/${a.uid}`));
  // 4) dokumen terhapus, akun Auth tertinggal -> dibuat ulang
  const docsBefore = fake.countDocs('users/');
  fake.state.docs.delete(`users/${r2.uid}`); fake.state.docs.delete('usernames/pembina');
  const r3 = await recoverAdmin(fake.env, { username: 'pembina', fullName: 'Bu Pembina', password: 'Baru12345' });
  assert.equal(r3.mode, 'create'); assert.equal(fake.countDocs('users/'), docsBefore);
  assert.equal((await login('pembina', 'Baru12345')).status, 200);
  // 5) username milik anggota biasa tidak boleh dirampas
  fake.seedUser({ uid: 'uidAnggota1', username: 'anggota1', fullName: 'Anggota Satu' });
  await deleteAuthUser(fake.env, r3.uid);
  await assert.rejects(recoverAdmin(fake.env, { username: 'anggota1', fullName: 'Admin Baru', password: 'Baru12345' }), /anggota biasa/);
  assert.ok(fake.getDoc('users/uidAnggota1'));
});

test('impor anggota: username dari nama depan, password default-xx1, ganda dibuang, bisa login, aman diulang', async () => {
  const rows = parseList('Nama;Kelas;Divisi\nMuhammad Salman Fariz;X BP 1;Kaiwa\nSalsabil Hana;X BP 2;Manga\nSalman Ali;XI RPL 1;Kaiwa\nSalman Ali;XI RPL 1;Kaiwa\nWINARNI;X BP 1;Kaiwa\n');
  assert.equal(rows.length, 4);
  const acc = buildAccounts(rows);
  assert.deepEqual(acc.map((a) => a.username), ['salman', 'salsabil', 'salman.ali', 'winarni']);
  assert.equal(acc[0].password, 'default-sa1');
  const r = await importMembers(fake.env, rows);
  assert.equal(r.created.length, 4); assert.equal(r.failed.length, 0);
  const l = await login('salman', 'default-sa1');
  assert.equal(l.status, 200); assert.equal(l.data.user.role, 'member'); assert.equal(l.data.user.kelas, 'X BP 1');
  assert.equal((await login('winarni', 'default-wi1')).status, 200);
  const again = await importMembers(fake.env, rows);
  assert.equal(again.created.length, 0); assert.equal(again.skipped.length, 4);
});
