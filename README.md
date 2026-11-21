# Coffee Cost

Aplikasi back office untuk coffee cart: COGS, stok bahan, rekap harian, dan sinkronisasi antar perangkat lewat Supabase.

Aplikasi ini murni file statis (HTML dan JavaScript), tanpa proses build.

## Memasang di GitHub Pages

1. Buat repo baru di GitHub, lalu unggah semua file di folder ini ke root repo (termasuk `.nojekyll`).
2. Buka **Settings**, **Pages**. Pada **Build and deployment**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
3. Tunggu satu sampai dua menit. Alamatnya `https://<akun>.github.io/<nama-repo>/`.

## Supabase

- Alamat project dan kunci publishable ada di `config.js`. Kunci publishable memang boleh publik. Jangan pernah menaruh kunci secret atau service_role di repo.
- Tabel yang dipakai: `cc_docs` (data aplikasi) dan `cc_inbox` (antrean catatan dari agen). Keduanya dilindungi RLS dan hanya bisa diakses akun yang login.
- Di Supabase, buka **Authentication**, **Sign In / Providers**, lalu matikan **Allow new users to sign up**. Tanpa ini, orang asing bisa mendaftar sendiri dan ikut mengakses data. Akun yang sudah dibuat tetap bisa login.

## Dipakai di iPhone

Buka alamat Pages di Safari, masuk lewat **Pengaturan**, bagian Sinkronisasi. Pintasan ke layar utama: Bagikan, lalu Tambah ke Layar Utama.

## Catatan

- Menu **Asisten** di dalam aplikasi hanya berfungsi bila dibuka lewat Claude. Di luar itu ia menampilkan pesan bahwa agen tidak tersedia. Agen yang sebenarnya adalah chat terpisah di Claude yang terhubung ke Supabase.
- Data juga tersimpan di browser tiap perangkat (localStorage), jadi aplikasi tetap bisa dibuka saat offline. Sinkronisasi berjalan lagi saat koneksi kembali.
- `config.js` berisi alamat project Supabase milikmu. Kalau repo dibuat publik, pahami bahwa alamat itu ikut terlihat.
