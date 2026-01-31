# Binary Digital Attendance System (Headless)

Aplikasi absensi berbasis web mobile-first yang menggunakan **Google Apps Script (GAS)** sebagai Backend/Database dan **GitHub Pages** sebagai Frontend.

## 🚀 Fitur Utama
- **Absensi Wajah**: Menggunakan kamera depan dengan timestamp & watermark lokasi.
- **Geolokasi**: Mencatat lokasi koordinat dan alamat staff saat absen.
- **Support Izin/Sakit**: Upload bukti foto dan integrasi WhatsApp.
- **Mode Lembur**: Form khusus lembur dengan bukti foto surat tugas.
- **Headless Architecture**: Frontend dipisah dari backend Google untuk performa lebih cepat.

## 📂 Struktur Project
- `index.html`: UI Utama aplikasi.
- `script.js`: Logika frontend & koneksi ke API GAS.
- `style.css`: Styling tampilan (Tailwind + Custom CSS).
- `Google Apps Script`: Backend logic (tidak ada di repo ini, di-deploy terpisah).

## 🛠 Cara Instalasi

### 1. Backend (Google Apps Script)
1. Buat Spreadsheet baru di Google Sheets.
2. Buka **Extensions > Apps Script**.
3. Copy kode `Code.gs` (mode API), `SheetManager.gs`, dan `Constants.gs`.
4. Isi ID Spreadsheet di `Constants.gs`.
5. Deploy sebagai **Web App**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy **URL Web App** (`.../exec`).

### 2. Frontend (GitHub Pages)
1. Buka file `script.js`.
2. Ganti variabel `APPSCRIPT_URL` dengan URL Web App dari langkah 1.
3. Push semua file (`index.html`, `style.css`, `script.js`) ke repository GitHub.
4. Aktifkan **GitHub Pages** di menu Settings repository.

## ⚠️ Catatan Penting
- Pastikan browser memberikan izin **Kamera** dan **Lokasi**.
- Jika terjadi error CORS, pastikan fungsi `doPost` di GAS sudah menangani `LockService` dan return JSON yang valid.

---
&copy; 2024 Binary Digital Development Team
