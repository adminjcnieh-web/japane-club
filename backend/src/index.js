// Japanese Club Management System - API (Cloudflare Worker)
// File statis frontend (folder public/) dilayani oleh Workers Static Assets;
// permintaan ke /api/* ditangani di sini.
import { HttpError, json, readJson } from './lib/http.js';
import { Firestore } from './lib/firestore.js';
import { authenticate } from './lib/guard.js';
import * as auth from './routes/auth.js';
import * as members from './routes/members.js';
import * as meetings from './routes/meetings.js';
import * as attendance from './routes/attendance.js';
import * as announcements from './routes/announcements.js';
import * as dashboard from './routes/dashboard.js';
import * as reports from './routes/reports.js';
import * as settings from './routes/settings.js';
import * as avatars from './routes/avatars.js';
import * as learning from './routes/learning.js';

// [method, pola, handler, publik?]
const ROUTES = [
  ['GET', '/api/health', async () => ({ ok: true }), true],
  ['POST', '/api/auth/login', auth.login, true],
  ['POST', '/api/auth/refresh', auth.refresh, true],

  ['GET', '/api/me', auth.me],
  ['POST', '/api/me/password', auth.changePassword],

  ['PUT', '/api/me/avatar', avatars.putMine],
  ['DELETE', '/api/me/avatar', avatars.deleteMine],
  ['GET', '/api/avatars/:uid', avatars.get],
  ['DELETE', '/api/members/:uid/avatar', avatars.deleteOf],

  ['GET', '/api/learning', learning.get],
  ['POST', '/api/learning/result', learning.record],

  ['GET', '/api/dashboard', dashboard.get],

  ['GET', '/api/members', members.list],
  ['POST', '/api/members', members.create],
  ['GET', '/api/members/:uid', members.detail],
  ['PATCH', '/api/members/:uid', members.update],
  ['POST', '/api/members/:uid/active', members.setActive],
  ['POST', '/api/members/:uid/password', members.resetPassword],
  ['GET', '/api/members/:uid/attendance', members.history],

  ['GET', '/api/meetings', meetings.list],
  ['POST', '/api/meetings', meetings.create],
  ['GET', '/api/meetings/archive', meetings.archive],
  ['GET', '/api/meetings/:id', meetings.detail],
  ['GET', '/api/meetings/:id/impact', meetings.impact],
  ['POST', '/api/meetings/:id/restore', meetings.restore],
  ['POST', '/api/meetings/:id/purge', meetings.purge],
  ['PATCH', '/api/meetings/:id', meetings.update],
  ['DELETE', '/api/meetings/:id', meetings.remove],
  ['POST', '/api/meetings/:id/open', meetings.open],
  ['POST', '/api/meetings/:id/close', meetings.close],
  ['GET', '/api/meetings/:id/qr', meetings.qr],
  ['PUT', '/api/meetings/:id/attendance/:uid', attendance.setStatus],

  ['POST', '/api/attendance/scan', attendance.scan],

  ['GET', '/api/announcements', announcements.list],
  ['POST', '/api/announcements', announcements.create],
  ['GET', '/api/announcements/:id', announcements.detail],
  ['PATCH', '/api/announcements/:id', announcements.update],
  ['DELETE', '/api/announcements/:id', announcements.remove],

  ['GET', '/api/reports', reports.get],

  ['GET', '/api/settings', settings.get],
  ['PUT', '/api/settings', settings.put],
].map(([method, pattern, handler, isPublic]) => ({
  method,
  handler,
  isPublic: !!isPublic,
  regex: new RegExp('^' + pattern.replace(/:([a-z]+)/g, '(?<$1>[^/]+)') + '/?$'),
}));

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    vary: 'origin',
  };
}

async function handleApi(request, env, url) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    let pathMatched = false;
    for (const route of ROUTES) {
      const m = route.regex.exec(url.pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== request.method) continue;

      const ctx = {
        request,
        env,
        url,
        params: m.groups || {},
        now: new Date(),
        fs: new Firestore(env),
        json: () => readJson(request),
        auth: null,
      };
      if (!route.isPublic) ctx.auth = await authenticate(ctx);
      const result = await route.handler(ctx);
      if (result instanceof Response) {
        for (const [k, val] of Object.entries(cors)) result.headers.set(k, val);
        return result;
      }
      return json(result, 200, cors);
    }
    throw pathMatched ? new HttpError(405, 'Metode tidak diizinkan', 'method_not_allowed') : new HttpError(404, 'Endpoint tidak ditemukan', 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status, cors);
    console.error('Kesalahan tak terduga:', e?.stack || e);
    return json({ error: { code: 'internal', message: 'Terjadi kesalahan di server. Coba lagi nanti.' } }, 500, cors);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') return handleApi(request, env, url);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

export { handleApi };
