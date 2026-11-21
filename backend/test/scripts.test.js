// Menguji skrip admin pertama & data contoh terhadap Firebase tiruan.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFake } from './fake-google.js';
import { bootstrapAdmin } from '../../scripts/bootstrap-admin.mjs';
import { seedDemo, removeDemo } from '../../scripts/seed-demo.mjs';
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
