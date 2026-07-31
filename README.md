# Blocky World

Game bergaya Minecraft (voxel sandbox) yang berjalan langsung di browser, dibuat dengan [three.js](https://threejs.org/). Semua tekstur (blok, mob) adalah pixel-art buatan sendiri secara prosedural -- bukan aset resmi Minecraft.

## Fitur

- Dunia voxel tak terbatas, digenerate per-chunk di sekitar pemain (procedural noise: terrain, gua, biome gurun/salju, danau/laut)
- Siklus siang-malam dengan matahari/bulan bergerak dan pencahayaan dinamis
- Hancurkan blok (tahan klik kiri, ada progress retak) dan pasang blok (klik kanan), dengan outline pada blok yang ditatap
- Ore (batu bara, bijih besi) dan tool tier (pickaxe batu/besi, kapak kayu) yang mempercepat mining
- Torch: blok yang bisa dipasang dan benar-benar memancarkan cahaya
- Inventory, crafting sederhana, item drop dari blok yang dihancurkan
- Mob: sapi & kambing (pasif), zombie (mengejar & menyerang), bisa dipukul
- Health & hunger, sprint, berenang di air
- Sound effect (disintesis, bukan file audio) untuk langkah kaki, mining, combat, dll
- Save/load otomatis lewat localStorage browser
- Kontrol mobile (joystick + tombol) otomatis muncul di device layar sentuh, plus toggle fullscreen
- **Multiplayer opsional**: semua orang yang membuka link yang sama bisa masuk ke dunia yang sama (lihat `server/README.md`)

## Cara Bermain

Buka `index.html` di browser (atau jalankan server statis lokal), lalu klik/ketuk **Mulai Bermain**.

Kontrol (desktop):
- `W A S D` — bergerak, `Shift` — lari, `Spasi` — lompat/berenang
- Mouse — melihat sekeliling
- Klik kiri (tahan) — hancurkan blok / pukul mob
- Klik kanan — pasang blok terpilih
- `1`-`7` atau scroll — pilih jenis blok
- `E` — inventory & crafting, `F` — makan, `O` — simpan manual

Di device layar sentuh, kontrol di atas otomatis diganti joystick + tombol on-screen.

## Menjalankan secara lokal

Cukup buka `index.html` langsung di browser, atau jalankan server statis sederhana:

```bash
python3 -m http.server 8000
```

lalu buka `http://localhost:8000` di browser.

## Multiplayer

Game ini bisa dijalankan solo (default, progres tersimpan di localStorage browser)
atau terhubung ke dunia bersama lewat server relay WebSocket kecil. Lihat
[`server/README.md`](server/README.md) untuk cara deploy server-nya dan
menghubungkannya ke `game.js`.
