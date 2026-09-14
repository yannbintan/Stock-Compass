# Stock Compass

An explainable stock decision-support and learning dashboard by **Tan Yann Bin**.

Stock Compass brings market information, transparent technical rules, news context and portfolio tools into one browser application. It helps users inspect a setup and plan risk; it does not place broker orders or promise profitable trades.

> **Standalone GitHub edition.** This repository is a new implementation based on the documented Stock Compass requirements. It is not a recovered copy of the earlier hosted application's source. Its code, configuration and tests are maintained here independently.

## Features

- A searchable market board with 20 starter symbols and custom U.S. tickers.
- Quote timestamps, data-source labels, market-session information and stale-data protection.
- Regular-session, pre-market and after-hours observations when the upstream source supplies them. Overnight coverage is explicitly unavailable in this edition.
- Interactive price/volume charts with 1D, 5D, 1M, 3M, 6M and 1Y views.
- Explainable short-term setup scores, RSI, moving averages, recent support and resistance, and volume confirmation.
- Separate new-buyer and holder guidance; scores are not success probabilities.
- Long-term research with available company metrics, without fabricated fundamental ratings.
- A local transaction journal with buys, partial sales, fees, dividends, average cost and realised/unrealised profit.
- Stops, two profit targets, trailing-stop planning and an estimated USD/MYR position-size calculator.
- Device-saved watchlists and one-time price/setup alerts while the dashboard is open.
- A historical backtest with next-bar entries, trading costs, conservative OHLC exit handling, a time-ordered holdout and a mark-to-market equity curve.
- News deduplication, direct/indirect relevance labels and explainable keyword-based sentiment.
- Optional server-side Alpaca quote and Finnhub fundamentals connections, with a public-data fallback.
- JSON backup/import and deletion controls for browser-saved portfolio data.

## Technology

| Layer | Technology |
| --- | --- |
| Interface | React, TypeScript and CSS |
| Build | Vite |
| API | TypeScript on Cloudflare Workers |
| Persistence | Browser localStorage; no shared portfolio database |
| Tests | Node.js test runner and TypeScript checks |
| Automation | GitHub Actions |

## Run locally

Install **Node.js 22.18 or later** and Git. Then run:

```bash
git clone https://github.com/yannbintan/Stock-Compass.git
cd Stock-Compass
npm install
npm run build
npm run dev
```

Open **http://localhost:8787**. This command runs the Worker API and the built dashboard together. After changing frontend files, run `npm run build` again. For frontend hot reload, keep `npm run dev` running and run `npm run dev:ui` in a second terminal; open the Vite address it prints.

Once `package-lock.json` is available, use `npm ci` for a reproducible installation. No paid API key is needed to try the public fallback, but an internet connection is required and upstream requests may be blocked or rate-limited.

## Optional data-provider configuration

Copy `.dev.vars.example` to `.dev.vars` and supply only the providers you use. `.dev.vars` is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `ALPACA_API_KEY` | Alpaca market-data key |
| `ALPACA_API_SECRET` | Alpaca market-data secret |
| `ALPACA_FEED` | `iex` by default, or `sip` if your account is entitled |
| `FINNHUB_API_KEY` | Company fundamentals and earnings calendar |

Keys stay in the Worker. Never put them in `VITE_` variables, browser code, screenshots or commits. Configuring a key does not establish permission to redistribute market data publicly. Check the provider's current terms and account entitlements before a public launch.

## Deploy without a custom domain

The included Worker serves both the API and built frontend. In your own Cloudflare account:

```bash
npm run build
npx wrangler login
npm run deploy
```

Wrangler prints the actual `workers.dev` address after deployment. No custom `.com` is required. Cloudflare's free plan has CPU, request and size limits; confirm the application fits those limits before sharing widely. The repository does not claim that an independent public demo has already been deployed.

For production secrets, use `npx wrangler secret put ALPACA_API_KEY` and the corresponding command for each remaining secret. Set the non-secret feed selection in `wrangler.jsonc` if required. See [Cloudflare routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) and [plan limits](https://developers.cloudflare.com/workers/platform/limits/).

GitHub Pages alone cannot run this project's market-data API routes.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run check:worker
```

The CI workflow runs these checks. Its initial dependency install can commit a generated lockfile; subsequent runs use `npm ci`. Check the latest Actions run for the actual verification status.

## Project structure

```text
src/                 React dashboard and browser state
shared/              Indicators, decisions, portfolio and backtest logic
worker/              Data providers and API routing
tests/               Financial calculations and API safeguards
docs/                Methodology and data-source notes
wrangler.jsonc       Independent Cloudflare deployment configuration
```

## Data, privacy and limitations

Portfolio entries and watchlists are saved in the current browser, not to an account. Clearing site data removes them. Moving to another domain does not transfer localStorage: export your backup first. Quote/news requests transmit the requested ticker and normal connection metadata to the application host and relevant providers; provider requests are made server-side. Browser notifications require permission and work only while this page is open.

Public Yahoo/Stooq endpoints are unofficial application dependencies and may change, fail or provide delayed information. Alpaca feed coverage depends on entitlement. News labels are simple heuristics, not verified forecasts. Historical results are hypothetical; this is a price-based test, not a total-return model. Historical scores are not calibrated probabilities. The included request limiter is a best-effort per-instance safeguard, not a globally enforced abuse-control service.

Read [Methodology](docs/METHODOLOGY.md) and [Data sources](docs/DATA_SOURCES.md) for the exact assumptions. Confirm prices and any intended order in your broker before acting.

## Author

**Tan Yann Bin** — System Analytics / Data Analytics, Sunway University.

This portfolio project demonstrates API integration, financial-data processing, explainable rule design, frontend development and automated validation. No project licence has been assigned yet; dependency licences remain with their respective owners.
