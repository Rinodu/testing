# Blocky World

Game bergaya Minecraft (voxel sandbox) yang berjalan langsung di browser, dibuat dengan [three.js](https://threejs.org/).

## Fitur

- Dunia voxel dengan terrain acak (procedural, berbasis noise)
- Pohon yang tersebar otomatis di atas rumput
- Gerak first-person dengan gravitasi, lompat, dan collision terhadap blok
- Hancurkan blok (klik kiri) dan pasang blok (klik kanan)
- Hotbar dengan 6 jenis blok: rumput, tanah, batu, kayu, daun, pasir
- Ganti blok terpilih dengan tombol 1-6 atau scroll mouse

## Cara Bermain

Buka `index.html` di browser (atau jalankan server statis lokal), lalu klik tombol **Mulai Bermain** untuk mengunci mouse.

Kontrol:
- `W A S D` — bergerak
- `Spasi` — lompat
- Mouse — melihat sekeliling
- Klik kiri — hancurkan blok yang dituju
- Klik kanan — pasang blok terpilih
- `1`-`6` atau scroll — pilih jenis blok

## Menjalankan secara lokal

Karena game memuat three.js dari CDN dan menggunakan modul JS biasa, cukup buka `index.html` langsung di browser, atau jalankan server statis sederhana, misalnya:

```bash
python3 -m http.server 8000
```

lalu buka `http://localhost:8000` di browser.
