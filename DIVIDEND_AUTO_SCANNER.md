# Dividend Auto Collector & Momentum Scanner

Sistem otomatisasi pencarian event dividen (corporate action), validasi data, kalkulasi moving averages & volume, penilaian momentum score, dan penyusunan rencana trading (Entry & Exit Plan) serta backtesting historis.

---

## 1. Arsitektur Data & Alur Kerja

```
[ KSEI Scraper ]      [ IDX Announcements ]
        \                     /
         v                   v
      [ Normalisasi & Regex Date Parser ]
                     |
                     v
         [ Event Validator Gate ] ---> (Status: rejected / needs_review)
                     |
                     v (Status: auto_verified)
           [ SQLite Database ]
                     |
                     v (Trigger Scan)
       [ Yahoo Finance Price Helper ]
                     |
                     v
         [ Momentum Scoring Engine ]
                     |
                     v
       [ Ranked Trading Candidates ] ---> (Entry & Exit Trade Plan)
```

---

## 2. Struktur Tabel SQLite (Schema)

*   `dividend_events`: Menyimpan data pengumuman dividen yang lolos validasi atau antrean review.
*   `dividend_collection_runs`: Log auditing eksekusi kolektor (run timestamp, jumlah data, warning/error).
*   `dividend_event_audit_log`: Log auditing saat data diubah secara manual (old value vs new value).
*   `dividend_scan_cache`: Cache hasil scanning untuk optimalisasi performa.

---

## 3. Komponen Utama

### A. Scraper KSEI & IDX (`dividend_ksei_collector.py` & `dividend_idx_collector.py`)
Membaca data resmi dari situs web KSEI dan IDX secara toleran. Jika koneksi gagal, scraper mengabaikan error secara *graceful* dan mengembalikan status penanganan error yang akan dimuat di UI banner tanpa menyebabkan crash sistem.

### B. Regex Parser Tanggal (`dividend_event_parser.py`)
Mengubah format tanggal tidak terstruktur (e.g. *15 Juli 2026*, *15-07-2026*, *15 July 2026*) menjadi standar ISO `YYYY-MM-DD`. Memiliki estimasi *confidence score* berdasarkan kelengkapan informasi.

### C. Validator Kebenaran Data (`dividend_event_validator.py`)
Memeriksa integritas pengumuman:
*   Cum Date wajib sebelum Ex Date.
*   Payment Date wajib setelah Recording Date.
*   Mendeteksi duplikasi entitas berdasarkan ticker, cum date, dan nilai dividen.
*   Menentukan status verifikasi (`auto_verified` vs `needs_review` vs `rejected`).

### D. Kalkulator Harga Yahoo (`dividend_price_provider.py`)
Mengunduh data harian Yahoo Finance secara lokal untuk menghitung:
*   Moving Average (MA5, MA20, MA50)
*   Volume rata-rata 20 hari & volume ratio
*   Return harga (5 hari, 10 hari, sejak pengumuman)

### E. Mesin Skor Momentum (`dividend_momentum_engine.py`)
Menghitung skor total (0-100) berdasarkan 7 komponen:
1.  **Yield Attractiveness** (Max 20)
2.  **Days to Cum Date** (Max 15)
3.  **Price Momentum** (Max 15)
4.  **Volume Confirmation** (Max 15)
5.  **Historical Runup** (Max 15)
6.  **Ex-Date Drop Risk** (Max 10)
7.  **Fundamental Quality** (Max 10)

Hasil klasifikasi:
*   `< 50.0`: `AVOID`
*   `50.0 - 64.9`: `WATCH`
*   `65.0 - 79.9`: `DIVIDEND_MOMENTUM_CANDIDATE`
*   `>= 80.0`: `HIGH_CONVICTION_RUN_UP`

### F. Backtester Strategi (`dividend_event_backtest.py`)
Simulasi historis terhadap event dividen 3-10 tahun terakhir untuk mengukur efektivitas:
*   Slippage 0.1% per transaksi
*   Fee beli 0.15% & jual 0.25%
*   Metrik: Win Rate, Profit Factor, Expectancy, Recovery Days.

---

## 4. API Endpoints (Backend)

*   `POST /api/dividend/auto-collect`: Menjalankan kolektor KSEI/IDX secara remote.
*   `POST /api/dividend/scan-auto`: Menjalankan scanning momentum dividen.
*   `GET /api/dividend/events`: Mengambil list event dividen terdaftar.
*   `PATCH /api/dividend/events/<id>`: Koreksi manual kolom event dividen.
*   `POST /api/dividend/events/<id>/verify`: Verifikasi manual event dividen.
*   `POST /api/dividend/events/<id>/reject`: Penolakan manual event dividen.
*   `POST /api/dividend/backtest`: Menjalankan simulasi backtest dividen historis.
*   `GET /api/dividend/calendar`: List data aksi korporasi dividen aktif.
