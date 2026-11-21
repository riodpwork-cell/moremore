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

## Antrean agen (cc_inbox)

Agen di chat Claude tidak menulis langsung ke data aplikasi. Ia memasukkan satu baris ke tabel `cc_inbox`, dan aplikasi yang memeriksa lalu menerapkannya.

### Siapa boleh apa

- Agen (lewat konektor Supabase): hanya `INSERT` ke `cc_inbox`, mengisi `kind` dan `payload`. Konektor berjalan dengan hak khusus dan tidak melewati RLS, jadi agen tidak butuh policy INSERT. Aturan "jangan UPDATE, DELETE, atau tulis ke `cc_docs`" adalah disiplin di prompt agen.
- Aplikasi (akun yang login): `SELECT`, dan `UPDATE` hanya kolom `status`, `applied_at`, `error`, `summary`. Dibatasi di level kolom.
- Pemicu database menjaga semuanya, juga untuk jalur konektor: `kind`, `payload`, `created_at` tidak bisa diubah, status hanya boleh `pending` ke `applied` atau `rejected` (final), dan baris tidak bisa dihapus.

### Kapan antrean diproses

- Tiap 6 detik selama aplikasi terbuka dan terlihat di salah satu perangkat, dan 2,5 detik setelah dibuka.
- Hanya bila sinkronisasi berstatus "Tersinkron" dan tidak ada dialog atau kolom yang sedang diketik.
- Paling banyak 10 baris per putaran, berurutan menurut `created_at`.
- Bila aplikasi tertutup di semua perangkat, baris menunggu sebagai `pending`. Agen tidak bisa memaksa aplikasi memprosesnya.

### Hasil di kolom status, error, summary

| status | error | summary | arti |
|---|---|---|---|
| pending | kosong | kosong | belum diproses |
| applied | kosong | terisi | berhasil diterapkan. summary berisi ringkasan (total, bahan baru, perubahan harga, hasil cek silang rekap) |
| rejected | terisi | kosong | ditolak sebelum diterapkan. Tidak ada data yang berubah. Perbaiki lalu INSERT baris baru, jangan ubah baris lama |
| applied | terisi | "Gagal diterapkan di aplikasi." | jarang terjadi. Anggap gagal dan periksa data |

Penyebab `rejected` yang umum: tanggal bukan YYYY-MM-DD atau lebih dari 400 hari lalu atau lebih dari besok, satuan tidak cocok dengan bahan, jumlah atau harga tidak terbaca, id bahan, menu, atau homemade tidak ditemukan, resep homemade belum lengkap, tidak ada angka rekap, teks pengingat kosong, jenis aksi tidak dikenal, atau hapus item yang masih dipakai.

Data yang diterapkan lebih dulu masuk ke aplikasi, lalu terkirim ke `cc_docs` dalam beberapa detik. Untuk memastikan, agen bisa membaca `cc_docs` setelah status `applied`.

### Tidak diterapkan dua kali

Sebelum menerapkan, aplikasi mengklaim baris dengan `UPDATE ... WHERE id = ... AND status = 'pending'`. Hanya satu perangkat yang mendapat baris itu, dan pemicu database menolak perubahan status dari `applied` atau `rejected`. Perangkat lain yang melihat baris yang sama melewatinya. Jangan INSERT ulang baris yang masih `pending`.

### Contoh payload per kind

Tanggal: `YYYY-MM-DD`. Rupiah: angka utuh. Satuan: `g`, `kg`, `ml`, `l`, `pcs`. Semua id dibaca dari tabel `cc_docs` (`ingredients__0`, `menus__0`, `carts__0`, `homemades__0`). Field yang tidak dikenal diabaikan.

**belanja**

```json
{"date": "2026-11-21", "store": "Pasar Pagi", "lines": [
  {"ingId": "i1xfsxe32y", "qty": 1, "unit": "kg", "price": 310000},
  {"name": "Susu UHT", "qty": 2, "unit": "l", "price": 36000, "newBase": "ml"}
]}
```

`price` adalah harga total baris. Bahan yang sudah ada: pakai `ingId` (atau `name` yang persis sama). Bahan baru: tanpa `ingId`, wajib `name` dan `newBase` (`g`, `ml`, atau `pcs`). Satuan harus sekeluarga dengan satuan dasar bahan. Bahan homemade tidak bisa dibeli.

**masak**

```json
{"date": "2026-11-21", "hmId": "<id homemade>", "qty": 500, "note": "batch pagi"}
```

`qty` adalah hasil jadi dalam satuan dasar homemade, misalnya gram. Bahan yang terpakai dihitung aplikasi dari resep, jadi tidak dikirim. Resep homemade harus sudah lengkap.

**rekap**

```json
{"date": "2026-11-21", "cartId": "cvt1nmt32y", "opening": 100000, "cash": 250000, "qris": 50000,
 "working": "turus 10, sisa 2",
 "lines": [{"menuId": "m66omqp32y", "turus": 10, "sisa": 2, "reject": 0}]}
```

`opening` adalah saldo awal, `cash` adalah uang tunai di laci saat tutup (saldo akhir), `qris` adalah total QRIS hari itu. Angka yang tidak dikirim tidak mengubah rekap yang sudah ada untuk tanggal dan cart yang sama. Minimal satu angka harus ada.

**pengingat**

```json
{"text": "Beli susu UHT", "due": "2026-11-22"}
```

`text` maksimal 140 huruf. `due` boleh dihilangkan.

**hapus_contoh**

```json
{"kind": "bahan", "id": "<id bahan>"}
```

`kind` adalah `bahan` atau `menu`. Satu item per baris. Cart tidak bisa dihapus lewat antrean. Ditolak bila bahan atau menu sudah dipakai di menu atau resep, atau sudah punya catatan belanja, produksi, pengiriman, atau rekap.

### Aksi lanjutan (agen bisa hampir semua yang bisa dilakukan menu aplikasi)

Semua jenis di bawah memakai aturan antrean yang sama: dicek dulu, ditolak utuh bila ada yang salah, diterapkan sekali. Bahan, menu, homemade, batch, dan cart boleh dirujuk dengan `ingId` / `menuId` / `hmId` / `batchId` / `cartId`, atau dengan `name` yang persis sama (huruf besar kecil diabaikan). `lines` pada `homemade_ubah` dan `menu_ubah` mengganti seluruh resep, bukan menambah.

| kind | payload | catatan |
|---|---|---|
| `bahan_buat` | `{name, base: g\|ml\|pcs, minStock?, density?}` | nama tidak boleh kembar |
| `bahan_ubah` | `{ingId\|name, newName?, minStock?, density?}` | nama bahan homemade diubah lewat `homemade_ubah` |
| `homemade_buat` | `{name, base: g\|ml, yieldQty, note?, density?, lines: [{ingId\|name, qty, unit, newBase?}]}` | `yieldQty` = hasil jadi per resep dalam satuan dasar. Bahan baru dibuat otomatis bila `newBase` dikirim. Resep boleh memakai homemade lain |
| `homemade_ubah` | `{hmId\|name, newName?, yieldQty?, note?, density?, lines?}` | siklus (resep memakai dirinya sendiri) ditolak |
| `menu_buat` | `{name, price?, targetMargin?, loss?, shelfDays?, lines: [{section: rtd\|cart, ingId\|name, qty, unit, newBase?}]}` | `targetMargin` dan `loss` dalam persen |
| `menu_ubah` | `{menuId\|name, newName?, price?, targetMargin?, loss?, shelfDays?, lines?}` | |
| `stok_opname` | `{date, items: [{ingId\|name, counted, unit}]}` | `counted` = hasil hitung fisik. Aplikasi menghitung selisih dari saldo |
| `produksi` | `{date, menuId\|name, cups, expiry?, code?, note?}` | `expiry` default dari `shelfDays` menu, `code` dibuat otomatis, kode kembar ditolak |
| `pengiriman` | `{date, cartId?, type: awal\|tambahan, time?: "HH:MM", note?, lines: [{menuId\|name, qty}]}` | ditolak bila stok central tidak cukup |
| `pembuangan` | `{date, batchId\|batchCode, qty, reason: Expired\|Rusak\|Tumpah\|Lainnya}` | `qty` tidak boleh melebihi sisa batch |
| `cart_buat` | `{name, openingCash?}` | |
| `pengingat_selesai` | `{id}` | |
| `hapus` | `{kind, id\|name}` | `kind`: `bahan`, `menu`, `homemade`, `belanja`, `koreksi`, `pengingat`, `rekap`, `pengiriman`, `pembuangan`, `cart` |

Batasan `hapus`: bahan yang dipakai resep homemade, bahan hasil masak, menu yang sudah punya catatan produksi, pengiriman, pembuangan, atau rekap, cart terakhir, menu terakhir, dan belanja yang menjadi satu-satunya sumber harga sebuah bahan ditolak dengan alasan. Hapus batch produksi belum didukung lewat antrean.

Contoh membuat bahan homemade:

```json
{"name": "Sirup Gula Aren", "base": "ml", "yieldQty": 600, "note": "masak 20 menit",
 "lines": [{"name": "Gula Aren", "qty": 300, "unit": "g", "newBase": "g"},
           {"ingId": "inakvjl32y", "qty": 400, "unit": "ml"}]}
```

Harga homemade dihitung otomatis dari harga bahan di resepnya, jadi `summary` akan menyebut bahan yang belum punya harga. Catat dulu `belanja` untuk bahan itu.
