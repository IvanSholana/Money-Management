# News & Catalyst Review Layer for DeepSeek Risk Reviewer

Lapisan peninjau risiko katalis berita eksternal deterministik dan AI (DeepSeek) untuk melakukan risk-checking sebelum keputusan transaksi dirilis oleh sistem.

---

## 1. Arsitektur Review Layer

```
[ Quant Candidate (BUY/WATCH) ]
              |
              v
 [ Multi-Provider News Search ] (SerpAPI, Brave, Bing, Google, Tavily)
              |
              v
   [ Source Ranker & Dedup ]
              |
              v (Filter & Sort)
    [ Structural Source Pack ]
              |
              +---> [ Catalyst Analyzer ] (Deterministic Tags & Risks)
              |
              v
[ DeepSeek AI Risk Reviewer ] ---> (Skeptical Risk Review JSON)
              |
              v
   [ Non-Upgrade Safety Gate ] ---> final_signal (BUY / HOLD / WATCH / AVOID)
```

---

## 2. Fitur Utama

### A. Multi-Provider Search (`web_search_provider.py`)
Mendukung 5 jenis penyedia pencarian berita:
1.  **SerpAPI**
2.  **Brave Search**
3.  **Bing Search**
4.  **Google Custom Search Engine (CSE)**
5.  **Tavily Search**

Sistem didesain modular dan toleran. Jika API key kosong atau penyedia tidak aktif, pencarian akan dinonaktifkan secara anggun (*fails gracefully*) dan tidak menyebabkan aplikasi crash.

### B. Penilai Kredibilitas Berita (`source_ranker.py`)
Melakukan penyaringan dan penilaian relevansi berita:
*   **Official Sources (+40)**: e.g. `idx.co.id`, `ksei.co.id`.
*   **Credible Media (+25)**: e.g. `kontan.co.id`, `bisnis.com`, `cnbcindonesia.com`.
*   **Spam Sites (-20)**: forum stockbit, media sosial, kaskus.
*   **Ticker/Company Match (+10 - +20)**: kecocokan nama emiten pada judul/snippet.

### C. Analisis Katalis Deterministik (`catalyst_analyzer.py`)
Menganalisis teks snippet secara deterministik untuk melabeli:
*   *Catalyst tags*: pembagian dividen, RUPS, peningkatan laba.
*   *Risk tags*: UMA (radar pantau BEI), suspensi perdagangan, PKPU, rights issue, kerugian keuangan.
*   *Confidence score*: Menghitung kredibilitas dari gabungan sumber berita resmi.

### D. Peninjau Risiko AI (`deepseek_catalyst_reviewer.py`)
Mengirim Source Pack terstruktur ke model DeepSeek. Peran DeepSeek dibatasi ketat sebagai **Risk Reviewer (Penilai Risiko)**:
*   DeepSeek **dilarang menaikkan sinyal** menjadi BUY jika hasil quant asli bukan BUY (Non-Upgrade safety gate).
*   DeepSeek hanya diperbolehkan mempertahankan sinyal BUY atau menurunkannya menjadi HOLD, WATCH, atau AVOID jika terdeteksi risiko signifikan di berita (e.g. berita gugatan hukum, suspensi, atau kerugian besar).
*   Sistem menerapkan cache selama **6 jam** (`news_catalyst_cache.py`) untuk efisiensi kueri API.

---

## 3. Integrasi API (Backend)

*   `POST /api/news/search-catalyst`: Mencari berita dan menyusun source pack serta tag analisis secara deterministik.
*   `POST /api/yahoo/review_single_with_news`: Melakukan quant screen tunggal untuk ticker saham, lalu menggabungkannya dengan review risiko berita dan DeepSeek.
