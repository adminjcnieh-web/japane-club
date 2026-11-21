import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op, newId } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { hasPermission, isStaff, requirePermission } from '../lib/guard.js';
import { announcementOut } from '../lib/models.js';

async function load(ctx, id) {
  if (!/^[A-Za-z0-9]{8,40}$/.test(id)) throw new HttpError(404, 'Pengumuman tidak ditemukan', 'not_found');
  const a = await ctx.fs.get(`announcements/${id}`);
  if (!a) throw new HttpError(404, 'Pengumuman tidak ditemukan', 'not_found');
  return a;
}

export async function list(ctx) {
  const all = await ctx.fs.query('announcements', { orderBy: ['publishAt', 'DESC'], limit: 100 });
  const staff = isStaff(ctx.auth.user);
  const visible = staff ? all : all.filter((a) => a.publishAt <= ctx.now);
  return { announcements: visible.map((a) => announcementOut(a, ctx.now)) };
}

export async function detail(ctx) {
  const a = await load(ctx, ctx.params.id);
  if (!isStaff(ctx.auth.user) && a.publishAt > ctx.now) throw new HttpError(404, 'Pengumuman tidak ditemukan', 'not_found');
  return { announcement: announcementOut(a, ctx.now) };
}

function fields(b, now) {
  return {
    title: v.str(b.title, { name: 'Judul', min: 3, max: 120 }),
    body: v.str(b.body, { name: 'Isi pengumuman', min: 1, max: 5000, multiline: true }),
    publishAt: b.publishAt ? v.isoDateTime(b.publishAt, 'Tanggal publikasi') : now,
  };
}

export async function create(ctx) {
  requirePermission(ctx, 'announce');
  const b = await ctx.json();
  const data = fields(b, ctx.now);
  const id = newId();
  const doc = { ...data, createdBy: ctx.auth.uid, createdByName: ctx.auth.user.fullName, createdAt: ctx.now, updatedAt: ctx.now };
  await ctx.fs.commit([
    op.create(`announcements/${id}`, doc),
    auditOp({ action: 'announcement.create', actor: ctx.auth, detail: data.title }, ctx.now),
  ]);
  return { announcement: announcementOut({ id, ...doc }, ctx.now) };
}

function assertCanModify(ctx, a) {
  requirePermission(ctx, 'announce');
  if (ctx.auth.user.role !== 'admin' && a.createdBy !== ctx.auth.uid) {
    throw new HttpError(403, 'Officer hanya boleh mengubah pengumuman buatannya sendiri', 'forbidden');
  }
}

export async function update(ctx) {
  const a = await load(ctx, ctx.params.id);
  assertCanModify(ctx, a);
  const b = await ctx.json();
  const data = fields({ title: a.title, body: a.body, publishAt: a.publishAt.toISOString(), ...b }, ctx.now);
  const patch = { ...data, updatedAt: ctx.now };
  await ctx.fs.commit([
    op.update(`announcements/${a.id}`, patch),
    auditOp({ action: 'announcement.update', actor: ctx.auth, detail: data.title }, ctx.now),
  ]);
  return { announcement: announcementOut({ ...a, ...patch }, ctx.now) };
}

export async function remove(ctx) {
  const a = await load(ctx, ctx.params.id);
  assertCanModify(ctx, a);
  await ctx.fs.commit([
    op.delete(`announcements/${a.id}`),
    auditOp({ action: 'announcement.delete', actor: ctx.auth, detail: a.title }, ctx.now),
  ]);
  return { ok: true };
}
