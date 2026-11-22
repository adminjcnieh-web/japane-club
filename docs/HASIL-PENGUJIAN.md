# Hasil Pengujian (jujur)

Semua pengujian di bawah **benar-benar dijalankan** (bukan hanya membaca kode), tetapi di lingkungan sandbox yang **tidak punya internet ke Firebase/Cloudflare/CDN**. Karena itu ada bagian yang diganti tiruan. Bagian "Belum teruji" penting dibaca.

## Cara pengujian

| Lapisan | Cara | Hasil |
|---|---|---|
| API + keamanan (`backend/test/api.test.js`, `scripts.test.js`) | Worker asli dijalankan melawan **Firebase tiruan** (meniru Auth, token, Firestore REST termasuk precondition "dokumen sudah ada" dan commit atomik) | **46/46 lulus** |
| Browser end-to-end (`backend/test/e2e/e2e.mjs`) | Chromium + Playwright, frontend asli + Worker asli + Firebase tiruan + **kamera palsu** yang menayangkan QR sungguhan. Pembuatan & pembacaan QR memakai OpenCV sebagai pengganti pustaka CDN | **51/51 lulus**, 0 galat konsol/CSP |
| Uji sensitivitas | Sengaja merusak 3 pengaman (cegah duplikasi, cek kedaluwarsa QR, cek akun nonaktif) dan memastikan tes **gagal**. Setelah dikembalikan, tes lulus | 3/3 terdeteksi |

## Daftar sesuai permintaan

| Yang diminta | Status | Bukti |
|---|---|---|
| Login admin / officer / member | Teruji | API + browser |
| Hak akses tiap role | Teruji | member ditolak 403 di 9 endpoint admin; member tak bisa menaikkan role sendiri; officer tanpa izin ditolak; URL admin dialihkan |
| Pembuatan anggota | Teruji | lewat form di browser; validasi; username unik (huruf besar/kecil); akun Auth dibatalkan bila simpan gagal |
| Pengubahan anggota | Teruji | role/izin; admin terakhir tidak bisa diturunkan/dinonaktifkan |
| Nonaktifkan akun | Teruji | token lama langsung ditolak, login & refresh ditolak, bisa diaktifkan lagi |
| Pembuatan sesi | Teruji | form + validasi jam |
| QR dinamis | Teruji | token berganti otomatis dalam ~5 detik pada layar pengurus (diamati di browser) |
| Pemindaian QR | Teruji | kamera palsu -> terbaca -> tercatat Hadir atas UID akun login; UID/status di body diabaikan |
| QR kedaluwarsa | Teruji | pesan jelas, tidak ada catatan |
| QR setelah sesi ditutup | Teruji | pesan "sesi sudah ditutup" meski token masih segar |
| QR palsu/diubah/rahasia lain | Teruji | ditolak |
| Duplikasi absensi | Teruji | scan ulang -> "sudah tercatat", jumlah dokumen tetap |
| Terlambat otomatis | Teruji | |
| Perubahan status + pencatat | Teruji | nama pengubah, waktu, dan audit tersimpan |
| Alfa saat tutup sesi | Teruji | hanya anggota aktif yang ikut absensi |
| Riwayat kehadiran | Teruji | profil & detail anggota |
| Pengumuman | Teruji | buat/ubah/hapus (dengan konfirmasi), jadwal terbit di masa depan disembunyikan dari member |
| Jadwal | Teruji | tampilan daftar & kalender |
| Laporan | Teruji | rekap, filter kelas/status/tanggal, per pertemuan, per anggota |
| Ekspor Excel | **Sebagian** | logika, isi 3 sheet, angka, dan nama file otomatis teruji dengan **shim ExcelJS**. File .xlsx asli **belum pernah dibuat/dibuka** (lihat bawah) |
| Tampilan mobile | Teruji | iPhone 390, Android 360, tablet 768: tanpa overflow horizontal di 12+ halaman; navigasi bawah; modal jadi lembar bawah |
| Keamanan Firestore | **Sebagian** | `firestore.rules` mengunci semua akses klien, tetapi **tidak dijalankan di emulator**. Keamanan dibuktikan lewat desain: browser tidak memakai Firestore sama sekali |
| Rate limit | Teruji | login (429 setelah 8 percobaan), scan (429 setelah 15/menit) |

## Belum teruji (harus kamu cek setelah deploy)

1. **Firebase sungguhan.** Semua interaksi Firebase diuji terhadap tiruan buatan saya. Bila perilaku asli berbeda dari dokumentasi (mis. kode galat Identity Toolkit), mungkin perlu penyesuaian kecil. Ini risiko terbesar. Cek: login, buat anggota, scan.
2. **Cloudflare Workers sungguhan**: `wrangler deploy`, Static Assets, header `_headers` belum dicoba.
3. **Pustaka CDN asli** (Chart.js 4.4.1, qrcode-generator 1.4.4, jsQR 1.4.0, ExcelJS 4.4.0) tidak bisa diunduh di sandbox, jadi diganti tiruan saat uji. **Grafik tidak pernah digambar**, **file .xlsx asli tidak pernah dibuat**, dan kompatibilitas CSP dengan pustaka asli belum terbukti. Cek: dasbor (grafik muncul), tombol Ekspor Excel (file terbuka di Excel), scan di HP.
4. **Kamera iPhone/Safari & Android asli**: diuji dengan kamera palsu Chromium. Pada perangkat nyata, kualitas fokus/cahaya dan izin kamera bisa berbeda. Pesan penolakan izin diuji tetapi di Chromium headless pesannya "Kamera tidak bisa dibuka", bukan "Izin kamera ditolak".
5. **Font** Google Fonts (Shippori Mincho, Zen Kaku Gothic New) tidak termuat di sandbox; tampilan di tangkapan layar memakai font cadangan.
6. **Beban nyata** (banyak anggota scan bersamaan). Ada batas waktu CPU 10 ms Worker gratis; tidak diukur.

## Fitur baru (diuji di sandbox)

| Fitur | Status | Bukti |
|---|---|---|
| QR 5 detik | Teruji | API: token lama kedaluwarsa; browser: layar QR berganti sendiri |
| Hapus pertemuan (hapus lembut, arsip, pulihkan, hapus permanen) | Teruji | API + dialog di browser |
| Foto profil (unggah + crop, tampil di sidebar/profil, hapus, tolak berkas palsu, admin hapus foto anggota) | Teruji | API + browser. Validasi sisi server: JPEG, ukuran, dimensi |
| Learning Center (7 kategori, level terkunci, server menolak melompati level, nyawa, hasil) | Teruji sebagian | API penuh. Di browser hanya 1 soal dijawab; **tiap jenis soal belum dijawab lengkap lewat UI** |
| Beranda anggota baru | Teruji | browser + tangkapan layar desktop & HP |
| Musik | Teruji sebagian | Browser: sinyal audio keluar (peak ~0,007 pada volume 8%), volume awal 8%, bisu, ganti lagu, jeda, sembunyikan, preferensi tersimpan. **Tidak pernah didengarkan manusia**: enak/tidaknya belum diketahui |
| Excel 3 sheet | **Sebagian** | Struktur & angka diuji dengan shim ExcelJS. File .xlsx asli belum pernah dibuat/dibuka |

## Tambahan "Belum teruji"
7. **Jalur autoplay diblokir**: Chromium headless tetap mengizinkan audio, jadi jalur "tunggu sentuhan pertama" tidak benar-benar terpicu. Logikanya ada, belum terbukti di HP.
8. **Kamera di APK/WebView**: tidak bisa diuji di sandbox. Cek langsung di APK-nya.
9. **Materi bahasa Jepang** (huruf, kosakata, tata bahasa, soal) dibuat otomatis dan disusun rapi, tetapi sebaiknya dicek guru/orang yang paham bahasa Jepang.
10. **Unduh Excel di APK** (Filesystem + Share): di browser hanya diuji dengan plugin Capacitor palsu. Di APK asli belum diuji.
11. **Penolakan absensi dari browser** memakai User-Agent, jadi bukan penghalang mutlak bagi orang teknis.

## Batasan yang disengaja
- Pembatas request di kode bersifat per instance Worker, bukan global.
- Dasbor tidak refresh otomatis (hemat kuota gratis Firestore).
