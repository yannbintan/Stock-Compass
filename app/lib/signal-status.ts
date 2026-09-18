import { quoteFreshness } from "./market-freshness.ts";

export type QuoteInput = {
  price: number;
  updated: string;
  isStale?: boolean;
  signalEligible?: boolean;
  feedType?: string;
  coverage?: "regular" | "extended" | "overnight" | "daily";
  hasExtendedHours?: boolean;
  session?: string;
};

type HistoryInput = {
  historyBars?: number;
  historyUpdated?: string;
  sma20: number;
  sma50: number;
  rsi: number | null;
};

type ResearchInput = {
  updated: string;
  isStale?: boolean;
  signalEligible?: boolean;
};

type Status = { blocked: boolean; label: string; reason: string };
const paused = (label: string, reason: string): Status => ({ blocked: true, label, reason });

/** An old selected-stock cache must not override a newer board quote. */
export function latestQuote<T extends QuoteInput>(daily?: T, session?: T, now = Date.now()): T | undefined {
  const valid = [session, daily].filter((quote): quote is T => Boolean(quote &&
    Number.isFinite(quote.price) && quote.price > 0 && Number.isFinite(Date.parse(quote.updated)) &&
    Date.parse(quote.updated) <= now + 60_000));
  return valid.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))[0];
}

export function quoteStatus(quote?: QuoteInput, now = Date.now()): Status {
  if (!quote) return paused("Quote unavailable", "A usable quote has not loaded. Select this stock and press Refresh Now to retry.");
  const stamp = Date.parse(quote.updated);
  if (!Number.isFinite(stamp) || stamp > now + 60_000 || !Number.isFinite(quote.price) || quote.price <= 0) {
    return paused("Invalid quote", "The quote has an invalid price or timestamp. Refresh the data before using a signal.");
  }
  const coverage = quote.coverage ?? (quote.feedType === "end-of-day" ? "daily" : quote.hasExtendedHours ? "extended" : "regular");
  const freshness = quoteFreshness(quote.updated, quote.session ?? "", coverage, now);
  if (quote.isStale !== false || freshness.isStale) {
    return paused("Quote outdated", "The latest quote is too old for the current session. Refresh Now retries the feed; a recommendation resumes only after usable data arrives.");
  }
  if (coverage === "daily") {
    return paused("Daily prices only", "Only end-of-day prices are available. These can support research, but cannot enable a live Buy/Sell instruction.");
  }
  if (!freshness.signalEligible) {
    return paused("Outside feed hours", "This is the last completed session's quote. The feed is outside its supported trading hours; a live instruction needs a fresh trade during a supported session.");
  }
  if (quote.signalEligible === false) {
    return paused("Live quote unavailable", "The provider has not supplied a quote eligible for a live instruction. Select the stock and refresh its session data.");
  }
  return { blocked: false, label: "Current quote", reason: "The latest quote is current for this feed's supported session." };
}

export function signalStatus(input: {
  quote?: QuoteInput;
  history?: HistoryInput;
  mode: "short" | "long";
  fundamentals?: ResearchInput;
  fundamentalsError?: string;
  marketError?: string;
}, now = Date.now()): Status {
  const { quote, history, mode, fundamentals } = input;
  const price = quoteStatus(quote, now);
  if (price.blocked) return !quote && input.marketError
    ? paused("Quote unavailable", input.marketError) : price;
  if (mode === "short") {
    if (!history || !Number.isFinite(history.historyBars)) {
      return paused("History not loaded", "A live price alone is not enough. The daily history needed for trend, RSI and support must load before a short-term signal can resume.");
    }
    if (history.historyBars! < 50) {
      return paused("Not enough history", `${history.historyBars} daily observations are available; the short-term rules require at least 50 for the 50-day moving average.`);
    }
    if (!history.historyUpdated || quoteFreshness(history.historyUpdated, "", "daily", now).isStale ||
      !Number.isFinite(history.sma20) || history.sma20 <= 0 || !Number.isFinite(history.sma50) || history.sma50 <= 0 ||
      history.rsi === null || !Number.isFinite(history.rsi)) {
      return paused("History outdated", "The daily history or indicators are missing or outdated. Refresh Now retries both history and the selected quote.");
    }
  } else {
    if (!fundamentals) return paused(input.fundamentalsError ? "Fundamentals unavailable" : "Research not loaded",
      input.fundamentalsError ? `Long-term analysis is paused: ${input.fundamentalsError}. Short-term analysis is separate.`
        : "Select this stock to load its fundamentals. Long-term signals need current company research in addition to the quote.");
    const stamp = Date.parse(fundamentals.updated);
    if (!Number.isFinite(stamp) || stamp > now + 60_000 || now - stamp > 3_600_000 || fundamentals.isStale) {
      return paused("Fundamentals outdated", "Company research needs refreshing before a long-term recommendation can resume.");
    }
    if (fundamentals.signalEligible === false) {
      return paused("Fundamentals incomplete", "Required company metrics are missing. Available metrics remain visible, but the long-term recommendation stays paused.");
    }
  }
  return { blocked: false, label: "Signal ready", reason: "The required quote and analysis data passed their checks." };
}
