# Monthly Cashflow Tracker

Simple local-first personal finance tracker for monthly income and monthly expenses.
It also includes an optional **Investment Thesis Manager** to structure stock-buying decisions before acting.

## Run locally

```powershell
npm install
pip install -r requirements.txt
npm run dev
```

Open the local app at `http://cashflow.local:5173`.

## Run automatically when Windows starts

Use the included startup script:

```powershell
.\scripts\start-monthly-cashflow-tracker.bat
```

The app will be available at `http://cashflow.local:5173` while the script window is running.

## What it does

- Track income and expense transactions.
- View monthly totals, net cashflow, expense ratio, biggest expense category, and transaction count.
- Filter transactions by month, type, category, and notes.
- Manage local income and expense categories.
- See simple charts for expense by category, monthly income vs expense, and daily spending.
- Export all data to JSON, import JSON backup, and export transactions to CSV.
- Manage investment theses locally without price APIs, broker integrations, or automatic buy/sell recommendations.
- Track thesis status, role, conviction, valuation notes, buy zone, risk register, invalidation criteria, review log, and decision log.
- Export/import theses as JSON and export the thesis list to CSV.
- Create budget pockets, allocate income into pockets, assign expenses to pockets, and track carry-over balances.
- Create personal targets for things you want, track saved amount, and see progress percentage from manual savings, linked pockets, and linked assets.
- Track assets such as RDPU, stocks, bonds, deposits, cash, and link assets to targets.
- Run conservative batch stock screening with local quantitative ranking, backtest metrics, and optional DeepSeek review.

## Local data storage

The app now stores its primary data in a local SQLite database file:

```text
money_management.db
```

When `npm run dev` starts, it runs:

- Flask API at `http://127.0.0.1:5000`
- Vite React app at `http://cashflow.local:5173`

The React app talks to the local API through `/api/*` and saves the complete app state into SQLite.

If the local API is not running, the app falls back to browser `localStorage` so it can still open. On first successful database connection, old browser data is migrated into SQLite automatically.

There is still no login, cloud sync, PostgreSQL, Prisma, Supabase, Firebase, or remote database. Everything stays on this laptop.

Use **Settings -> Export JSON** regularly for backups. SQLite is much safer than browser storage, but backups still matter.

## Investment Thesis Manager

Open **Tesis** in the navigation.

Use it to document:

- Why a stock is interesting.
- Portfolio role and thesis type.
- Buy zone and margin of safety.
- Entry plan and max allocation.
- Main risks and mitigation.
- What would make the thesis wrong.
- Review schedule.
- Current decision, review history, and decision history.

The checklist intentionally does not say "Buy". It only checks whether the thesis is structurally complete:

- If incomplete: `Thesis is not ready. Do not buy yet.`
- If complete: `Thesis is structurally ready. Still review price, risk, and portfolio allocation before buying.`

This is a discipline tool, not financial advice.

## Kantong Anggaran

Open **Kantong** in the navigation.

Use it to:

- Create budget pockets such as Needs, Family, Fun, Savings, or Bills.
- Add a manual starting balance for money that already existed before you tracked it in the app.
- Allocate a pocket balance into one or more targets, for example `Rp1.000.000` to target A and `Rp2.000.000` to target B from one `Rp3.000.000` pocket.
- Allocate income transactions into one or more pockets.
- Assign each new expense transaction to one pocket.
- See carry-over balance per pocket across months.
- Compare allocated income versus spending by pocket.
- Identify income that is not allocated and expenses without a pocket.

Rules:

- Income allocation is manual per income transaction.
- Manual starting balance is treated as old money already inside the pocket.
- Target allocation from a pocket is nominal and cannot exceed the available pocket balance.
- Expense uses one pocket.
- Pocket balances carry over to the next month.
- Overspending is allowed but shown as a warning/status because the app records real spending.

## Target Keinginan

Open **Target** in the navigation.

Use it to:

- Add things you want to achieve or buy.
- Choose a target type: Wishlist, Savings Goal, Installment, Debt Payoff, Emergency Fund, or Other.
- Set the target amount and current saved amount.
- Track progress percentage automatically from manual saved amount, linked budget pockets, and linked assets.
- Add an optional deadline and notes.
- Quickly add `Rp100rb` progress from the target card.

Examples: laptop, holiday, motor, course, gadget, or any personal goal.

Example: if the `Menikah` target needs `Rp100.000.000`, you can allocate `Rp3.000.000` from an RDPU asset and `Rp1.000.000` from a `Dana Menikah` budget pocket. The target progress will include only those allocated amounts, not necessarily the full asset or full pocket balance.

## Aset & Alokasi Target

Open **Aset** in the navigation.

Use it to:

- Record assets such as Cash, RDPU, Saham, Obligasi, Deposito, Reksa Dana, Emas, Crypto, or Other.
- Store current value and notes.
- Allocate part or all of an asset to one or more targets.
- Link stock assets to an investment thesis.
- See allocation by asset type.
- Let allocated asset amounts contribute to target progress.

Example: if an RDPU asset is worth `Rp10.000.000`, you can allocate `Rp3.000.000` to `Dana Darurat` and `Rp7.000.000` to another target.

For stock assets, choose **Tesis Terkait** so a holding such as `TLKM` can point to its investment thesis. The thesis detail page will show linked assets and total position value.

## Algo & AI Trading Scanner

The scanner is decision support only. It never connects to a broker and never places buy or sell orders.

Workflow:

1. Validate OHLCV freshness, completeness, adjusted-price warnings, and liquidity.
2. Calculate the local quant signal, regime, support/resistance, ATR stop, and risk-reward.
3. Block stale, illiquid, bearish, fundamentally unsafe, or poor-RR candidates.
4. Run a technical backtest without applying present-day fundamental data to historical candles.
5. Rank candidates transparently:
   - Quant signal quality: 30%
   - Risk-reward: 20%
   - Backtest quality: 25%
   - Fundamental safety: 15%
   - Liquidity/execution proxy: 10%
6. Optionally send only the top local BUY candidates to DeepSeek in one batch. DeepSeek may downgrade but cannot create or upgrade a BUY.

Batch API:

```text
POST /api/yahoo/screen_batch
```

It accepts a JSON ticker array, a JSON request object, or comma/newline-separated plain text. Local results are still returned when AI review is disabled or unavailable.

Backtest results are historical measurements, not profitability promises. A small number of trades is marked as low confidence, and unavailable bid-ask spread data is disclosed in warnings.

Verification:

```powershell
.venv\Scripts\python -m unittest test_signal_engine.py
.venv\Scripts\python -m unittest test_batch_screener.py
npx tsc --noEmit
```

## Notes

The app assumes Indonesian labels, IDR currency formatting, and Asia/Jakarta date behavior for default dates.
