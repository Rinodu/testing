# Blocky World - Multiplayer Relay Server

Server WebSocket ringan untuk fitur shared-world multiplayer Blocky World.
Tugasnya cuma dua: simpan blok yang ditaruh/dihancurkan pemain (sebagai
"selisih" di atas generasi dunia prosedural yang deterministik), dan
sebarkan posisi tiap pemain ke pemain lain yang sedang online.

**Bukan server otoritatif.** Tidak ada anti-cheat, tidak ada physics/mob
yang disinkron dari server. Setiap pemain tetap menjalankan simulasi mob,
health, hunger, dan inventory-nya sendiri secara lokal -- yang benar-benar
dibagikan cuma blok dunia, posisi pemain lain, dan jam siang-malam.

---

## Kenapa perlu deploy terpisah?

Halaman game (`index.html` + `game.js`) tetap file statis biasa, cocok
di-host di GitHub Pages seperti sekarang. Tapi GitHub Pages **tidak bisa**
menjalankan proses server yang nyala terus-menerus (dibutuhkan untuk
menyimpan world state & merutekan pesan WebSocket antar pemain). Jadi
folder `server/` ini perlu di-deploy ke layanan hosting Node.js terpisah.

## Deploy ke Render.com (gratis, paling gampang)

1. Buat akun di [render.com](https://render.com), login pakai GitHub.
2. Klik **New +** → **Web Service**.
3. Pilih repository `rinodu/testing` ini.
4. Isi konfigurasi:
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Klik **Create Web Service**. Tunggu sampai statusnya "Live".
6. Render akan kasih URL seperti `https://blockyworld-server-xxxx.onrender.com`.
   Ganti `https://` jadi `wss://` untuk dipakai di game -- jadi:
   `wss://blockyworld-server-xxxx.onrender.com`

**Catatan tier gratis Render**: server akan "tidur" kalau tidak ada yang
konek selama beberapa menit, dan perlu ~30-60 detik untuk bangun lagi saat
ada koneksi baru. Wajar untuk main santai, tidak cocok untuk demo yang
butuh instan.

## Alternatif lain

Cara yang sama (root directory `server/`, build `npm install`, start
`npm start`) juga jalan di Railway.app, Fly.io, Glitch, atau VPS pribadi
(pakai `pm2`/`systemd` biar server tetap hidup setelah `npm start`).

## Menghubungkan game ke server

Setelah server jalan, ada dua cara mengarahkan `game.js` ke server itu:

1. **Permanen**: buka `game.js`, cari baris:
   ```js
   const MULTIPLAYER_SERVER_URL = '';
   ```
   Isi dengan URL server Anda, misalnya:
   ```js
   const MULTIPLAYER_SERVER_URL = 'wss://blockyworld-server-xxxx.onrender.com';
   ```
   Commit & push -- sekarang semua orang yang buka link deploy GitHub Pages
   otomatis masuk ke dunia yang sama.

2. **Sementara/uji coba** (tanpa ubah `game.js`): tambahkan parameter URL
   `?server=` di link, contoh:
   ```
   https://rinodu.github.io/testing/?server=wss://blockyworld-server-xxxx.onrender.com
   ```

Kalau `MULTIPLAYER_SERVER_URL` kosong dan tidak ada parameter `?server=`,
game jalan seperti biasa (solo, simpan progres di localStorage browser) --
tidak ada perubahan perilaku sama sekali.

## Menjalankan lokal (untuk uji coba di komputer sendiri)

```bash
cd server
npm install
npm start
```

Server akan jalan di `ws://localhost:8787`. Buka game dengan
`?server=ws://localhost:8787` untuk menghubungkannya (dua tab/browser
berbeda di komputer yang sama sudah cukup untuk uji coba dua "pemain").
