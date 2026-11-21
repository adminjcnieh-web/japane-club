// Titik masuk aplikasi: kerangka (sidebar / navigasi bawah), pengaturan route, dan siklus login.
import * as api from './api.js';
import { route, dispatch, currentPath, navigate, cleanupCurrent } from './router.js';
import { icon } from './icons.js';
import { esc, initials, ROLE_LABEL } from './utils.js';
import { renderLogin } from './auth.js';
import { toast, loadingBlock, errorState } from './ui.js';
import { dashboardView } from './dashboard.js';
import { membersView, memberDetailView } from './members.js';
import { meetingsView, meetingDetailView } from './meetings.js';
import { qrStageView } from './attendance.js';
import { scannerView } from './qr-scanner.js';
import { announcementsView } from './announcements.js';
import { scheduleView } from './schedule.js';
import { reportsView } from './reports.js';
import { profileView, settingsView, moreView } from './profile.js';

const root = document.getElementById('app');
let user = null;
let clubName = 'Japanese Club';

export const can = (u, perm) => u.role === 'admin' || (u.role === 'officer' && u.permissions?.[perm] === true);
export const isStaff = (u) => u.role === 'admin' || u.role === 'officer';

function navFor(u) {
  if (!isStaff(u)) {
    return {
      side: [
        ['/', 'Beranda', 'dashboard'],
        ['/scan', 'Scan absensi', 'scan'],
        ['/schedule', 'Jadwal', 'calendar'],
        ['/announcements', 'Pengumuman', 'megaphone'],
        ['/profile', 'Profil & riwayat', 'user'],
      ],
      tabs: [
        ['/', 'Beranda', 'dashboard'],
        ['/schedule', 'Jadwal', 'calendar'],
        ['/scan', 'Scan', 'scan', true],
        ['/announcements', 'Info', 'megaphone'],
        ['/profile', 'Profil', 'user'],
      ],
    };
  }
  const side = [
    ['/', 'Beranda', 'dashboard'],
    ['/meetings', 'Pertemuan', 'qr'],
    ['/members', 'Anggota', 'users'],
    ['/schedule', 'Jadwal', 'calendar'],
    ['/announcements', 'Pengumuman', 'megaphone'],
  ];
  if (can(u, 'exportReports')) side.push(['/reports', 'Laporan', 'report']);
  const extra = [];
  if (u.role === 'admin') extra.push(['/settings', 'Pengaturan klub', 'settings']);
  extra.push(['/profile', 'Profil saya', 'user']);
  return {
    side,
    extra,
    tabs: [
      ['/', 'Beranda', 'dashboard'],
      ['/meetings', 'Pertemuan', 'qr'],
      ['/members', 'Anggota', 'users'],
      ['/announcements', 'Info', 'megaphone'],
      ['/more', 'Menu', 'more'],
    ],
  };
}

function shellHtml(u) {
  const nav = navFor(u);
  const link = ([href, label, ic]) => `<li><a href="#${href}" data-href="${href}">${icon(ic)}<span>${esc(label)}</span></a></li>`;
  const tab = ([href, label, ic, disc]) =>
    disc
      ? `<a href="#${href}" data-href="${href}" class="scan-tab" aria-label="${esc(label)}"><span class="disc">${icon(ic)}</span><span>${esc(label)}</span></a>`
      : `<a href="#${href}" data-href="${href}">${icon(ic)}<span>${esc(label)}</span></a>`;
  return `
    <div class="shell">
      <aside class="sidebar" aria-label="Navigasi utama">
        <a class="brand" href="#/"><span class="brand-mark"></span><span><span class="brand-name" id="club-name">${esc(clubName)}</span><br /><span class="brand-sub">Klub sekolah</span></span></a>
        <nav><ul class="nav">${nav.side.map(link).join('')}</ul>
        ${nav.extra?.length ? `<div class="nav-label">Akun & pengaturan</div><ul class="nav">${nav.extra.map(link).join('')}</ul>` : ''}</nav>
        <div class="sidebar-foot">
          <div class="sidebar-wave" aria-hidden="true"></div>
          <div class="usercard">
            <span class="avatar">${esc(initials(u.fullName))}</span>
            <div class="usercard-text"><div class="usercard-name">${esc(u.fullName)}</div><div class="usercard-role">${esc(ROLE_LABEL[u.role])}</div></div>
            <button class="btn btn-quiet btn-icon btn-sm" id="logout-btn" aria-label="Keluar" title="Keluar">${icon('logout')}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <a class="brand" href="#/"><span class="brand-mark"></span><span class="brand-name" id="club-name-m">${esc(clubName)}</span></a>
          <a href="#/profile" class="avatar" aria-label="Profil saya">${esc(initials(u.fullName))}</a>
        </header>
        <main class="view" id="view" tabindex="-1"></main>
      </div>
      <nav class="tabbar" aria-label="Navigasi utama">${nav.tabs.map(tab).join('')}</nav>
    </div>`;
}

function markActive(path) {
  const hrefs = [...root.querySelectorAll('[data-href]')].map((a) => a.dataset.href);
  const best = hrefs
    .filter((h) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/')))
    .sort((a, b) => b.length - a.length)[0];
  root.querySelectorAll('[data-href]').forEach((a) => {
    if (a.dataset.href === best) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function mountApp() {
  root.innerHTML = shellHtml(user);
  document.getElementById('logout-btn').addEventListener('click', () => doLogout());
  const view = document.getElementById('view');

  const render = async () => {
    const path = currentPath();
    markActive(path);
    try {
      await dispatch(view, { user, can: (p) => can(user, p), isStaff: isStaff(user), refreshUser });
    } catch (e) {
      console.error(e);
      view.innerHTML = errorState(e.message || 'Terjadi kesalahan saat membuka halaman.');
      view.querySelector('#retry')?.addEventListener('click', render);
    }
    document.title = `${document.querySelector('h1')?.textContent || 'Beranda'} - ${clubName}`;
  };
  window.addEventListener('hashchange', render);
  mountApp.render = render;
  mountApp.unmount = () => window.removeEventListener('hashchange', render);
  if (!location.hash) navigate('/', { replace: true });
  else await render();

  // Muat nama klub (pengaturan) di latar belakang.
  api.get('/api/settings').then(({ settings }) => {
    clubName = settings.clubName;
    for (const id of ['club-name', 'club-name-m']) {
      const el = document.getElementById(id);
      if (el) el.textContent = clubName;
    }
  }).catch(() => {});
}

async function refreshUser() {
  const { user: fresh } = await api.get('/api/me');
  user = fresh;
  api.updateUser(fresh);
  return fresh;
}

function doLogout(message) {
  mountApp.unmount?.();
  cleanupCurrent();
  api.logout();
  user = null;
  showLogin(message);
}

function showLogin(notice = '') {
  history.replaceState(null, '', location.pathname);
  renderLogin(root, {
    notice,
    onSuccess: (u) => {
      user = u;
      history.replaceState(null, '', location.pathname + '#/');
      mountApp();
    },
  });
}

route('/', (c) => dashboardView(c));
route('/scan', (c) => scannerView(c), { roles: ['member', 'officer', 'admin'] });
route('/schedule', (c) => scheduleView(c));
route('/announcements', (c) => announcementsView(c));
route('/profile', (c) => profileView(c));
route('/more', (c) => moreView(c, { navFor, doLogout }), { roles: ['admin', 'officer'] });
route('/members', (c) => membersView(c), { roles: ['admin', 'officer'] });
route('/members/:uid', (c) => memberDetailView(c));
route('/meetings', (c) => meetingsView(c), { roles: ['admin', 'officer'] });
route('/meetings/:id', (c) => meetingDetailView(c), { roles: ['admin', 'officer'] });
route('/meetings/:id/qr', (c) => qrStageView(c), { roles: ['admin', 'officer'] });
route('/reports', (c) => (c.can('exportReports') ? reportsView(c) : (navigate('/', { replace: true }), null)), { roles: ['admin', 'officer'] });
route('/settings', (c) => settingsView(c), { roles: ['admin'] });

window.addEventListener('jcms:logout', (e) => {
  if (user) doLogout(e.detail?.reason);
});

async function boot() {
  const s = api.getSession();
  if (!s) return showLogin();
  user = s.user;
  try {
    await refreshUser(); // pastikan peran & status akun masih terbaru
    await mountApp();
  } catch (e) {
    if (!api.getSession()) return; // sudah di-logout oleh klien API
    root.innerHTML = `<div class="boot">${errorState(e.message)}</div>`;
    root.querySelector('#retry')?.addEventListener('click', boot);
  }
}

boot();
