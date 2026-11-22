# Japanese Club Management System

Website manajemen ekstrakurikuler Japanese Club: absensi dengan **QR dinamis** (berganti tiap 5 detik), data anggota, pertemuan, pengumuman, jadwal, dan laporan Excel. Dibuka lewat browser di HP maupun laptop. Bisa dibungkus jadi APK (lihat bagian 8c).

> Panduan ini ditulis untuk pemula. Ikuti urutannya dari atas ke bawah. Total waktu sekitar 30-45 menit.

---

## 1. Bagaimana cara kerjanya (singkat)

```
Browser (HTML/CSS/JS)  ──►  Cloudflare Worker (backend/)  ──►  Firebase Authentication + Firestore
   folder public/             API aman, GRATIS                 project: web-jc-nekat
```

- **Browser tidak pernah menyentuh database langsung.** Semua lewat API di Worker. Firestore Rules dikunci total (`firestore.rules`), jadi walau orang mengambil konfigurasi Firebase dari website, mereka tidak bisa membaca atau menulis data.
- **Kunci rahasia Firebase (service account) hanya ada di Cloudflare**, tidak pernah di browser atau GitHub.
- **Peran (admin/pengurus/anggota) dicek di server** setiap permintaan, dibaca dari database, bukan dari browser.

### Kenapa Cloudflare Workers, bukan Firebase Cloud Functions?

Cloud Functions mewajibkan paket **Blaze** (kartu kredit/billing). Cloudflare Workers punya paket **gratis** (100.000 permintaan/hari) yang jauh lebih dari cukup untuk 30-50 anggota, dan tetap memakai Firebase Authentication + Firestore yang kamu miliki. Keamanan tidak dikurangi: token login diverifikasi di server, QR ditandatangani rahasia server, dan akun dibuat lewat Firebase Admin API.

---

## 2. Isi proyek

```
japanese-club/
├── public/                 ← Website (frontend). Ini yang dilihat pengguna
│   ├── index.html, css/, js/
│   └── _headers            ← Header keamanan (CSP, dll.)
├── backend/                ← API (Cloudflare Worker)
│   ├── src/                ← Kode server
│   ├── test/               ← Pengujian otomatis (+ test/e2e untuk browser)
│   ├── wrangler.toml       ← Konfigurasi deploy
│   └── .dev.vars.example   ← Contoh rahasia (salin jadi .dev.vars)
├── scripts/
│   ├── bootstrap-admin.mjs ← Membuat ADMIN PERTAMA (aman)
│   └── seed-demo.mjs       ← Data contoh (opsional, bisa dihapus bersih)
├── firestore.rules         ← Aturan keamanan Firestore (tutup semua akses browser)
├── firebase.json, .firebaserc, firestore.indexes.json
└── docs/HASIL-PENGUJIAN.md ← Apa saja yang sudah/belum diuji (jujur)
```

---

## 3. Persiapan Firebase (sekali saja)

Project Firebase kamu: `web-jc-nekat`. Buka https://console.firebase.google.com lalu pilih project itu.

### 3.1 Aktifkan login Email/Password
Aplikasi mengubah username menjadi email palsu `username@japanese-club.local` agar bisa memakai Firebase Authentication. Anggota tidak pernah melihat email ini.

1. **Build → Authentication → Sign-in method**
2. Klik **Email/Password** → aktifkan **Email/Password** (yang pertama, bukan "Email link") → **Save**.

### 3.2 Ambil Web API Key
1. Klik ikon roda gigi → **Project settings → General**.
2. Salin **Web API Key** (diawali `AIza...`). Ini bukan rahasia, tapi dibutuhkan untuk login.
3. (Sudah diisi untuk project `web-jc-nekat`.) Bila nanti pindah project, ubah `FIREBASE_API_KEY` dan `FIREBASE_PROJECT_ID` di `backend/wrangler.toml`.

### 3.3 Buat kunci Service Account (RAHASIA!)
1. **Project settings → Service accounts → Generate new private key** → unduh file `.json`.
2. Simpan sebagai `service-account.json` di folder proyek. **Jangan pernah mengunggahnya ke GitHub, WhatsApp, atau screenshot.** (`.gitignore` sudah memblokirnya.)

### 3.4 Pasang Firestore Rules
Aturan lama kamu kemungkinan mengizinkan akses dari browser. Aplikasi ini **tidak membutuhkannya**, jadi ganti dengan aturan terkunci:

- Cara mudah: **Firestore Database → Rules** → hapus isi lama → tempel isi file `firestore.rules` → **Publish**.
- Atau lewat terminal: `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules`

### 3.5 Pastikan Firestore sudah dibuat
**Firestore Database** sudah harus berstatus aktif (kamu bilang sudah). Tidak perlu membuat koleksi manual; aplikasi membuatnya sendiri.

---

## 4. Persiapan Cloudflare (sekali saja)

1. Daftar gratis di https://dash.cloudflare.com/sign-up (tidak perlu kartu kredit).
2. Pasang Node.js (https://nodejs.org, versi LTS).
3. Di terminal, dalam folder proyek:

```bash
cd backend
npm install
npx wrangler login
```

4. Buat dua rahasia (perintah akan meminta kamu menempel nilainya):

```bash
# a) isi SELURUH file service-account.json (buka dengan Notepad, salin semua, tempel)
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT

# b) rahasia QR: buat string acak dulu, lalu tempel hasilnya
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put QR_SECRET
```

---

## 5. Membuat admin pertama (aman)

Dijalankan di komputermu, memakai file kunci. Tidak ada orang yang bisa jadi admin hanya karena memilih username tertentu.

```bash
# dari folder utama proyek (japanese-club/)
node scripts/bootstrap-admin.mjs --key=./service-account.json
```

Masukkan username (contoh `pembina`), nama, dan password (minimal 8 karakter, huruf + angka). Skrip menolak berjalan lagi jika admin sudah ada.

Setelah selesai, **hapus** `service-account.json` dari komputer bila tidak dipakai lagi (kamu bisa membuat yang baru kapan saja dari Firebase).

---

## 6. Menjalankan di komputer sendiri (uji coba)

```bash
cd backend
cp .dev.vars.example .dev.vars     # lalu isi FIREBASE_SERVICE_ACCOUNT dan QR_SECRET
npx wrangler dev
```

Buka alamat yang tampil (biasanya http://localhost:8787) lalu login dengan admin tadi. Kamera untuk scanner hanya berfungsi di `https://` atau `localhost`.

---

## 7. Deploy (online)

```bash
cd backend
npx wrangler deploy
```

Wrangler menampilkan alamat seperti `https://japanese-club.NAMAKAMU.workers.dev`. Buka dari HP, login, selesai. Alamat itu otomatis HTTPS sehingga kamera scanner berfungsi.

Pembaruan berikutnya: ubah file lalu jalankan `npx wrangler deploy` lagi.

**Disarankan** (gratis): di dashboard Cloudflare → Security → WAF → Rate limiting rules, batasi `/api/auth/login` (misal 10 permintaan/menit per IP) sebagai lapisan tambahan.

---

## 8. Cara memakai

| Peran | Bisa apa |
|---|---|
| **Admin** | Semuanya: buat/ubah/nonaktifkan akun, atur role & izin pengurus, pertemuan, absensi, pengumuman, laporan, pengaturan klub |
| **Pengurus (officer)** | Lihat anggota, buat pertemuan, buka/tutup absensi & tampilkan QR. Izin tambahan dari admin: ubah status kehadiran, buat pengumuman, lihat/ekspor laporan |
| **Anggota** | Scan QR, lihat riwayat & jadwal & pengumuman, profil, ganti password |

**Alur absensi**
1. Pengurus: menu **Pertemuan → Buat pertemuan → Buka absensi**. Layar QR tampil (bisa layar penuh untuk proyektor).
2. Anggota: menu **Scan** → **Mulai kamera** → arahkan ke QR. Muncul tanda berhasil.
3. Status otomatis **Hadir**, atau **Terlambat** jika lewat batas menit yang diatur. Izin/Sakit/Alfa diinput pengurus yang berizin.
4. Pengurus menekan **Tutup sesi**: QR langsung tidak berlaku dan anggota aktif yang belum tercatat ditandai **Alfa** (masih bisa diubah).

**Keamanan QR:** token berganti tiap **5 detik**, ditandatangani rahasia server, berlaku maksimal sekitar 10-15 detik, hanya untuk sesi yang sedang dibuka. Foto QR lama tidak berguna. Satu anggota hanya bisa punya satu catatan per pertemuan (dijamin oleh database, bukan hanya oleh tampilan).

**Lupa password:** admin membuka detail anggota → **Reset password**.
**Anggota keluar:** jangan dihapus; **Nonaktifkan** supaya riwayat absensi tetap aman.

---

## 8b. Fitur baru di versi ini

| Fitur | Cara pakai |
|---|---|
| **Learning Center** (menu *Belajar*) | 7 kategori: Hiragana, Katakana, Kanji, Kosakata, Bunpou, Percakapan, Membaca. Level dibuka berurutan (lulus level 1 baru level 2 terbuka). Ada bar progres, nyawa, umpan balik tiap soal, penjelasan, dan halaman hasil. Jumlah nyawa diatur admin di **Pengaturan klub**. Isi materi ada di `public/js/learn/data.js`. |
| **Foto profil** | Menu **Profil saya → Ganti foto**. Pilih foto, geser dan perbesar untuk memotong, lalu simpan. Foto otomatis dikecilkan (256 px) dan disimpan di Firestore (koleksi `avatars`), bukan di dokumen anggota. Tanpa foto, tampil avatar inisial. Anggota hanya bisa mengubah fotonya sendiri; admin bisa menghapus foto anggota di halaman detail anggota. |
| **Beranda baru** | Sapaan sesuai jam (WIB), foto, ringkasan kehadiran, progres belajar, tombol *Lanjut belajar*, jadwal, dan *Kosakata hari ini*. |
| **Musik latar** | Pemutar mini di kanan bawah (di HP: pil kecil di atas menu bawah). Putar/jeda, lagu berikut/sebelumnya, volume (awal 8%), bisu, sembunyikan. Musik dibuat langsung oleh browser (lo-fi dan suasana rumah teh, orisinal, tanpa file audio). Jika browser memblokir autoplay, musik mulai setelah sentuhan/klik pertama. Pengaturannya diingat. |
| **Hapus pertemuan** (admin) | Tombol **Hapus** di detail pertemuan: tampil nama, tanggal, dan dampaknya (berapa catatan absensi). Pertemuan masuk **Arsip** (bisa dipulihkan). **Hapus permanen** harus mengetik nama pertemuan. Semua tercatat di log aktivitas. |
| **Excel baru** | Menu **Laporan**: filter bulan/tahun, rentang tanggal, dan anggota. File berisi 3 sheet: *Ringkasan Anggota*, *Riwayat Absensi*, *Rekap Per Pertemuan*, lengkap dengan rumus, warna status, dan filter. |
| **Absensi hanya lewat APK** | Scan absensi hanya jalan di aplikasi (APK). Di browser biasa halaman scan memberi tahu untuk memakai aplikasi, dan server menolak (403 `app_required`). Tidak ada lagi unggah/foto QR, jadi QR tidak bisa dititipkan lewat foto. Lihat bagian 8c. |

### Koleksi Firestore baru (dibuat otomatis, tidak perlu setup)
- `avatars/{uid}`: foto profil kecil.
- `learning/{uid}`: progres belajar tiap anggota.
- Field baru: `deletedAt` di pertemuan (hapus lembut), `avatarVer` di anggota.

### 8c. Catatan konversi ke APK
- Aplikasi APK harus meminta izin `CAMERA` (Android) dan mengizinkan WebView memberi izin kamera ke halaman (`onPermissionRequest`). Tanpa ini, tombol *Mulai kamera* akan gagal walau HP sudah memberi izin.
- APK menandai dirinya di User-Agent dengan `JapaneseClubApp/1.0`. Server memakai tanda ini untuk menolak absensi dari browser biasa. Untuk uji coba lewat browser (pengembangan), set variabel `ALLOW_WEB_SCAN=1`.
- Batas yang jujur: tanda User-Agent bisa dipalsukan oleh orang yang paham teknis. Pengamannya yang utama tetap QR yang berganti tiap 5 detik. Pemindaian layar HP lain secara langsung lewat kamera APK masih mungkin, hanya saja QR-nya cepat kedaluwarsa.
- **Unduh laporan Excel di APK:** file disimpan lalu muncul menu Bagikan Android (pilih Simpan ke File/Drive, atau kirim lewat WhatsApp). Ini memakai plugin Filesystem dan Share yang ditambahkan otomatis oleh workflow `build-apk.yml`.

---

## 9. Biaya

| Layanan | Paket | Batas gratis | Perkiraan pemakaianmu (50 anggota) |
|---|---|---|---|
| Cloudflare Workers | Free | 100.000 permintaan/hari | Beberapa ratus per hari |
| Firebase Authentication | Spark (gratis) | Email/Password tanpa batas praktis | Aman |
| Cloud Firestore | Spark (gratis) | 50.000 baca, 20.000 tulis per hari | Biasanya < 10.000 baca/hari |

Tips hemat: dasbor sengaja **tidak refresh otomatis** (satu pembukaan dasbor membaca ± 1.000-1.500 dokumen setelah beberapa bulan data). Layar QR memeriksa daftar hadir tiap 5 detik hanya saat sesi dibuka. Jika suatu hari melebihi batas gratis, Firebase hanya menolak permintaan sampai besok (tidak otomatis menagih selama kamu tetap di paket Spark).

**Batasan Cloudflare gratis:** waktu CPU 10 ms per permintaan. Untuk 30-50 anggota ini cukup (operasi berat hanya menunggu jaringan). Jika suatu saat terkena batas, paket Workers berbayar mulai sekitar $5/bulan.

---

## 10. Pengujian

Lihat **`docs/HASIL-PENGUJIAN.md`** untuk daftar lengkap dan jujur (apa yang diuji, dengan cara apa, dan apa yang belum bisa diuji di sini).

Menjalankan sendiri:
```bash
cd backend
node --test test/api.test.js test/scripts.test.js        # 46 tes API & keamanan
node test/e2e/e2e.mjs                                    # skenario browser (butuh Playwright + python3 + OpenCV)
```

---

## 11. Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| "Layanan login sedang bermasalah" | Web API Key salah di `wrangler.toml`, atau login Email/Password belum diaktifkan (langkah 3.1) |
| "Server tidak dapat terhubung ke Firebase" | `FIREBASE_SERVICE_ACCOUNT` salah/terpotong. Ulangi `wrangler secret put` dengan isi file JSON utuh |
| "Konfigurasi server belum lengkap (QR_SECRET)" | Belum membuat rahasia `QR_SECRET` (min. 16 karakter) |
| Kamera tidak bisa dibuka | Buka lewat `https://` (bukan http), izinkan Kamera di pengaturan situs browser. iPhone: Pengaturan → Safari → Kamera |
| "QR sudah kedaluwarsa" | Normal. Pindai QR yang sedang tampil di layar, bukan foto/tangkapan layar |
| Jam terlambat salah | Atur `TZ_OFFSET_MINUTES` di `wrangler.toml` (WIB 420, WITA 480, WIT 540) lalu deploy ulang |
| Grafik/Excel/scanner tidak muncul | Pustaka dimuat dari internet (jsDelivr). Pastikan koneksi internet aktif |

---

## 12. Catatan keamanan

- Jangan commit `service-account.json`, `.dev.vars`, atau `.env` (sudah di `.gitignore`).
- Bila kunci service account pernah bocor: Firebase Console → Service accounts → hapus kunci lama, buat baru, lalu `wrangler secret put` lagi.
- Ganti `QR_SECRET` kapan saja dengan `wrangler secret put QR_SECRET` (QR yang sedang tampil otomatis tidak berlaku).
- Pembatas request di kode berlaku per instance Worker (bukan global). Tambahkan Rate Limiting Rules Cloudflare (langkah 7) untuk perlindungan lebih kuat.
