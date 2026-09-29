# ⚡ PM2 Web Manager

Dashboard web modern untuk mengelola proses PM2 secara realtime, dilengkapi terminal interaktif, deploy form multi-runtime, dan log viewer.

Dibuat oleh **ZERIF ID** — Sistem ini hanya digunakan oleh orang-orang tertentu yang berwenang.

---

## 📋 Prerequisites

### Semua Platform (Windows & Linux/Ubuntu)

Pastikan sudah terinstall:

| Software | Versi Minimal | Download |
|----------|--------------|---------|
| Node.js | v18+ | https://nodejs.org |
| npm | v9+ | (bundled dengan Node.js) |
| PM2 | Latest | `npm install -g pm2` |

### Windows

Tidak ada requirement tambahan. Langsung lanjut ke instalasi.

### Linux / Ubuntu

Install build tools dulu (dibutuhkan oleh `node-pty`):

```bash
sudo apt update
sudo apt install -y build-essential python3 python3-pip
```

Jika ingin support Python di Deploy form:

```bash
sudo apt install -y python3 python3-pip
```

---

## 🚀 Instalasi

### 1. Clone / Copy project

```bash
cd /path/to/project
```

### 2. Install dependencies

```bash
npm install
```

> ⚠️ **Windows:** Jika muncul warning `allow-scripts` untuk `node-pty`, jalankan:
> ```bash
> npm approve-scripts node-pty
> npm install
> ```

> ⚠️ **Linux:** Pastikan `build-essential` sudah terinstall sebelum `npm install`.

### 3. Setup konfigurasi

Copy file `.env.example` menjadi `.env`:

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

Lalu edit file `.env` sesuai kebutuhan:

```env
PORT=8779
JWT_SECRET=ganti_dengan_secret_yang_kuat
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

> 🔐 **Penting:** Ganti `JWT_SECRET` dan `ADMIN_PASSWORD` sebelum deploy ke production!

### 4. Jalankan server

```bash
node server.js
```

Atau menggunakan PM2 agar berjalan di background:

```bash
pm2 start server.js --name "pm2-manager"
pm2 save
```

### 5. Akses dashboard

Buka browser dan akses:

```
http://localhost:8779
```

Login dengan kredensial yang sudah diset di `.env`.

---

## 🎛️ Fitur

### 📊 Dashboard
- Monitoring CPU & Memory realtime
- Jumlah proses online/stopped
- System info (hostname, platform, CPU model, RAM, uptime)
- Tabel proses ringkas

### ⚙️ Process Management
- Start, Stop, Restart, Reload, Delete proses
- Lihat detail info per proses
- Simpan list PM2 ke disk (`pm2 save`)

### 📋 Logs Realtime
- Tail stdout & stderr per proses via WebSocket
- Filter output/error
- Auto-scroll & flush log

### 🚀 Deploy / Start Process
- **Node.js** — langsung isi script entry file
- **Python** — isi script `.py` + optional Python path custom
- **Custom Interpreter** — Ruby, PHP, Java, dll
- Konfigurasi: working directory, instances, max memory, watch mode

### 🖥️ Terminal Interaktif
- Terminal penuh berbasis **xterm.js + node-pty**
- Support arrow keys, Ctrl+C, Ctrl+L, autocomplete
- Color output (npm, git, pip, dll)
- Set working directory sebelum connect
- Cocok untuk `npm install`, `pip install`, `git pull`, dll

### 🔐 Settings
- Ganti password via UI

---

## 📁 Struktur Project

```
pm2-web-manager/
├── server.js              # Entry point + WebSocket server
├── .env                   # Konfigurasi (PORT, JWT_SECRET, dll)
├── .env.example           # Template konfigurasi
├── package.json
├── middleware/
│   └── auth.js            # JWT middleware
├── routes/
│   ├── auth.js            # Login, verify, change password
│   ├── pm2.js             # PM2 API (list, start, stop, dll)
│   └── terminal.js        # Terminal run & resolve-path
├── utils/
│   ├── pm2monitor.js      # PM2 realtime monitor via WebSocket
│   └── ptymanager.js      # PTY session manager (node-pty)
└── public/
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```

---

## 🔧 Konfigurasi `.env`

| Key | Default | Keterangan |
|-----|---------|-----------|
| `PORT` | `8779` | Port server |
| `JWT_SECRET` | *(wajib diisi)* | Secret key untuk JWT token |
| `ADMIN_USERNAME` | `admin` | Username login |
| `ADMIN_PASSWORD` | `admin123` | Password login |

---

## 🌐 Deploy ke Production

### Menggunakan PM2

```bash
pm2 start server.js --name "pm2-manager" --max-memory-restart 200M
pm2 save
pm2 startup  # aktifkan auto-start saat server reboot
```

### Menggunakan Nginx (opsional, sebagai reverse proxy)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8779;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## ⚠️ Catatan Keamanan

- Ganti **password default** sebelum dipakai
- Gunakan **JWT_SECRET** yang kuat dan acak (minimal 32 karakter)
- Jangan expose port `8779` langsung ke internet tanpa firewall/auth
- Gunakan HTTPS di production (via Nginx + Certbot)
- Terminal interaktif memberikan **akses shell penuh** — pastikan hanya user terpercaya yang punya akses login

---

## 📦 Dependencies Utama

| Package | Kegunaan |
|---------|---------|
| `express` | Web framework |
| `ws` | WebSocket server |
| `pm2` | PM2 API integration |
| `node-pty` | Terminal interaktif (PTY) |
| `jsonwebtoken` | Autentikasi JWT |
| `bcryptjs` | Hash password |
| `dotenv` | Load konfigurasi .env |
| `xterm.js` *(CDN)* | Terminal emulator di browser |

---

## 🛠️ Troubleshooting

**`node-pty` gagal build di Windows:**
```bash
npm approve-scripts node-pty
npm install
```

**`node-pty` gagal build di Linux:**
```bash
sudo apt install build-essential python3
npm install
```

**Port sudah dipakai:**
Ganti `PORT` di file `.env`

**PM2 tidak ditemukan:**
```bash
npm install -g pm2
```

**Terminal tidak bisa connect:**
Pastikan WebSocket tidak diblok firewall/proxy. Jika pakai Nginx, pastikan config `Upgrade` sudah ditambahkan.

---

© 2026 ZERIF ID. All rights reserved.
