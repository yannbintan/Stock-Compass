# Data sources

| Data | Implemented source | Main limits |
| --- | --- | --- |
| Daily prices and indicators | Yahoo chart endpoint, then Stooq daily CSV | Public endpoints can fail or change; daily observations are not live trades |
| Selected-stock intraday/session data | Optional Alpaca, then Yahoo public chart data | Coverage, entitlement, timing and venue differ; extended sessions need actual reported observations |
| Bid/ask | Optional Alpaca latest quote | Not fabricated when unavailable; not supplied by the public fallback |
| Overnight | No implemented provider | Displayed as unavailable |
| Historical test bars | Yahoo daily chart history | Up to five years; public-feed and daily-bar modelling limitations |
| Company fundamentals | Optional Finnhub, then Yahoo dated statements | Partial coverage; public fallback does not invent earnings forecasts or unavailable metrics |
| News | Optional Alpaca News, Google News RSS and Yahoo Finance RSS | Headlines are not independently verified; keyword classifications are estimates |
| FX conversion | User-entered USD/MYR rate | Not an automatic currency quote |

The selected stock refreshes on a 60-second cycle and the board on a five-minute cycle while the page is active. Refresh frequency is not a guarantee of source freshness. Requests use timeouts and limited concurrency, and some results are cached. There is no exchange-grade uptime guarantee or global per-user rate limiter.

`GET /api/health` probes the same handlers using an AAPL sample and coalesces probes for 60 seconds per instance. HTTP 503 indicates a degraded/stale sample. A successful probe is not a guarantee for every symbol or source.

## Configuration and permissions

Provider credentials are optional server-side settings. Use `.env.local` for local Node development, `.dev.vars` with the Worker emulator, and Worker secrets in production. Do not include credentials in Git, client code, logs or screenshots. Account entitlement and permission to display data to multiple users are separate from whether an API request succeeds.

Official references:

- [Alpaca market-data API](https://docs.alpaca.markets/docs/about-market-data-api)
- [Finnhub API](https://finnhub.io/docs/api)
- [NYSE trading hours and calendar](https://www.nyse.com/markets/hours-calendars)
- [Cloudflare Workers Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Vinext source and documentation](https://github.com/cloudflare/vinext)

See [Methodology](METHODOLOGY.md) before interpreting scores or backtest statistics. A public-data fallback is not a licensed replacement for the complete data available inside a broker application.
