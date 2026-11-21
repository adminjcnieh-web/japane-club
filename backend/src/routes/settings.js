import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { requireRole } from '../lib/guard.js';

const DEFAULTS = {
  clubName: 'Japanese Club',
  description: 'Ekstrakurikuler bahasa dan budaya Jepang',
  contact: '',
  defaultLateMinutes: 15,
};

export async function readSettings(ctx) {
  const doc = await ctx.fs.get('settings/club');
  return {
    clubName: doc?.clubName || DEFAULTS.clubName,
    description: doc?.description ?? DEFAULTS.description,
    contact: doc?.contact ?? DEFAULTS.contact,
    defaultLateMinutes: Number.isInteger(doc?.defaultLateMinutes) ? doc.defaultLateMinutes : DEFAULTS.defaultLateMinutes,
  };
}

export async function get(ctx) {
  return { settings: await readSettings(ctx) };
}

export async function put(ctx) {
  requireRole(ctx, 'admin');
  const b = await ctx.json();
  const data = {
    clubName: v.str(b.clubName, { name: 'Nama klub', min: 2, max: 60 }),
    description: v.str(b.description, { name: 'Deskripsi', max: 300 }),
    contact: v.str(b.contact, { name: 'Kontak', max: 100 }),
    defaultLateMinutes: v.intRange(b.defaultLateMinutes, { name: 'Batas terlambat (menit)', min: 0, max: 180 }),
    updatedAt: ctx.now,
    updatedBy: ctx.auth.uid,
  };
  await ctx.fs.commit([
    op.set('settings/club', data),
    auditOp({ action: 'settings.update', actor: ctx.auth, detail: 'Informasi klub diperbarui' }, ctx.now),
  ]);
  return { settings: await readSettings(ctx) };
}
