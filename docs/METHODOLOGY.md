# Methodology and current limits

This document describes the implemented code, not a tested prediction service. The authoritative implementation is in `app/page.tsx`, `app/lib/` and `app/api/backtest/route.ts`.

## Live setup score

The short-term view compares price with the 20-day and 50-day simple moving averages, uses 14-period RSI, and checks proximity to rolling support. A positive trend with RSI between 45 and 68 receives the fixed score 74/100. Other branches produce fixed watch, wait or avoid scores. Volume is mentioned in confirmation guidance but is not a numerical gate in this live scoring function. News classifications do not change this short-term score.

The long-term view starts from the predefined assessment in `app/data.ts` (or the custom-ticker baseline). Available revenue growth, EPS growth, trailing P/E and free cash flow adjust that baseline. Missing data reduces the evidence available. This is a heuristic research view, not a calibrated probability or comprehensive valuation.

Quote and fundamentals guards can pause instructions. Quote freshness distinguishes an active session from the last completed session. The bundled U.S. calendar covers 2026–2028 and requires maintenance; unforeseen exchange closures are not automatically discovered.

## Historical backtest

The endpoint requests up to five years of daily OHLCV data and requires at least 120 usable bars. The strategy:

1. Requires the daily close above SMA20 and SMA50, RSI between 45 and 68, and volume at least 90% of its 20-day average. The existing rule bypasses the volume check when average volume is zero.
2. Enters at the following day's open, with 0.05% slippage added.
3. Places a model stop 1% below the lowest low of the preceding 10 signal-day bars. Entries with non-positive risk or risk above 12% of entry are skipped.
4. Uses a target at twice initial risk. The loop's time exit is at entry index plus 20, inclusive: it may inspect **21 daily bars**, counting the entry bar.
5. If both stop and target appear within one bar, counts the stop first. The current model fills at the threshold even when the market gaps through it; gap slippage is not modelled.
6. Applies another 0.05% slippage on exit and 0.05% fees on each side. It permits one position at a time for the selected symbol.

The later 30% of history is labelled validation. Trades are assigned by entry date. No model is fitted, no parameter search is isolated, and this is not walk-forward validation. The historical entry has a volume gate that the live score does not use, so its win rate must not be presented as the live dashboard's success probability.

Win rate is profitable completed trades divided by completed trades after model costs. Zero is shown for an empty sample, which means no measured success rate. Profit factor uses sums of percentage gains/losses and is null when gains exist without a losing trade. Compounded returns assume full reinvestment on successive trades. Maximum drawdown uses only closed-trade equity and omits adverse movement while positions are open.

Further limits: there is no dividend total-return accounting, corporate-action reconciliation, multi-stock capital allocation, borrow model, trading-liquidity simulation, confidence interval or score calibration. Daily bars cannot reconstruct intraday event order. Historical sample labels are descriptive heuristics, not statistical guarantees.

## Portfolio tools

Buy fees are added to average-cost basis. Partial sales reduce basis proportionally. Realised profit includes net sale proceeds and net dividends. A dividend's price field is the total cash amount; it is not multiplied by shares. Transactions are sorted by date and ID, so the journal does not model precise same-day execution times. Invalid over-sales are capped by the accounting helper; this is not a broker or tax ledger.

My Holdings and the transaction journal are separate forms. The dashboard can use journal positions in the selected-stock view, but it does not reconcile them with a broker account. The trailing-stop reference is recalculated from current inputs and is not a persistent broker stop or high-water-mark order. Fees and FX inputs are estimates.

Price alerts trigger once when an enabled above/below condition is observed. They do not promise to detect every crossing between refreshes and cannot run when the page is closed.
