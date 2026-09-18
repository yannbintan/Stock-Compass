"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { stocks, type Analysis, type Mode, type NewsItem, type Stock, type Tone } from "./data";
import { calculatePositions, createExitPlan, type JournalTransaction, type TransactionType } from "./lib/portfolio";
import { evaluatePriceAlerts, type PriceAlert } from "./lib/alerts";
import { latestQuote, quoteStatus, signalStatus } from "./lib/signal-status";

type MarketQuote = {
  symbol: string;
  price: number;
  changePct: number;
  open?: number;
  previousClose?: number;
  high: number;
  low: number;
  volume: number;
  averageVolume20?: number;
  week52High?: number;
  week52Low?: number;
  history: number[];
  historyBars?: number;
  historyUpdated?: string;
  historyByPeriod?: Partial<Record<"1M" | "3M" | "6M" | "1Y", number[]>>;
  sma20: number;
  sma50: number;
  rsi: number | null;
  support: number[];
  resistance: number[];
  updated: string;
  source: string;
  provider?: string;
  currency?: string;
  exchange?: string;
  feedType?: "near-live" | "end-of-day";
  ageSeconds?: number;
  staleAfterSeconds?: number;
  isStale?: boolean;
  freshness?: "live" | "recent" | "stale" | "session-closed";
  signalEligible?: boolean;
  freshnessReason?: string;
};

type SessionQuote = {
  symbol: string;
  price: number;
  changePct: number;
  previousClose: number;
  openPrice: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  bidPrice: number | null;
  askPrice: number | null;
  bidAskStatus: string;
  regularMarketPrice: number | null;
  preMarketPrice: number | null;
  preMarketChangePct: number | null;
  preMarketUpdated: string | null;
  preMarketStatus: string;
  postMarketPrice: number | null;
  postMarketChangePct: number | null;
  postMarketUpdated: string | null;
  postMarketStatus: string;
  overnightPrice: number | null;
  overnightStatus: string;
  overnightUpdated: string | null;
  session: "PRE-MARKET" | "REGULAR" | "AFTER-HOURS" | "OVERNIGHT" | "CLOSED";
  intradayHistory: number[];
  intradayHistory5d: number[];
  updated: string;
  provider: string;
  currency: string;
  exchange: string;
  feedType: "near-live";
  hasExtendedHours: boolean;
  overnightAvailable: boolean;
  ageSeconds?: number;
  staleAfterSeconds?: number;
  isStale?: boolean;
  freshness?: "live" | "recent" | "stale" | "session-closed";
  signalEligible?: boolean;
  freshnessReason?: string;
};

type Fundamentals = {
  symbol: string;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  revenueGrowthPct: number | null;
  epsGrowthPct: number | null;
  debtToEquity: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  freeCashFlow: number | null;
  dividendYieldPct: number | null;
  earningsDate: string | null;
  week52High: number | null;
  week52Low: number | null;
  provider: string;
  updated: string;
  confidence: "high" | "medium" | "low";
  asOfDate?: string;
  signalEligible?: boolean;
  isStale?: boolean;
};

type BacktestSummary = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  averageReturnPct: number;
  averageWinPct: number;
  averageLossPct: number;
  profitFactor: number | null;
  maximumDrawdownPct: number;
  compoundedReturnPct: number;
  sampleQuality: "stronger" | "limited" | "insufficient";
};

type BacktestResult = {
  symbol: string;
  period: { start: string; end: string; bars: number; validationStart: string };
  methodology: { entry: string; exit: string; costs: string; sameDayRule: string };
  benchmarkReturnPct: number;
  all: BacktestSummary;
  validation: BacktestSummary;
  recentTrades: Array<{ entryDate: string; exitDate: string; entry: number; exit: number; returnPct: number; outcome: "win" | "loss"; exitReason: string }>;
  hypothetical: boolean;
  warning: string;
};

type Holding = {
  symbol: string;
  shares: number;
  averagePrice: number;
  stopPrice: number;
  savedAt: string;
};

type FeedState = "snapshot" | "loading" | "ready" | "partial";
type Filter = "all" | "buy" | "wait" | "risk" | "tech" | "semis" | "core";
type ChartRange = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y";
type ActionPair = { newAction: string; ownAction: string; tone: Tone; note: string };

const HOLDINGS_KEY = "stock-compass-holdings-v1";
const WATCHLIST_KEY = "stock-compass-watchlist-v1";
const JOURNAL_KEY = "stock-compass-journal-v1";
const ALERTS_KEY = "stock-compass-alerts-v1";
const DEFAULT_SYMBOLS = stocks.map((stock) => stock.symbol);

const sectorOverrides: Record<string, string> = {
  SKHY: "Semiconductors",
  SNDK: "Semiconductors",
  QQQ: "ETF",
  NVDA: "Semiconductors",
  MSFT: "Technology",
  "BRK.B": "Financials",
};

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "buy", label: "Buy setups" },
  { id: "wait", label: "Wait" },
  { id: "risk", label: "Risk / sell" },
  { id: "tech", label: "Technology" },
  { id: "semis", label: "Semiconductors" },
  { id: "core", label: "Core & defensive" },
];

const chartRanges: ChartRange[] = ["1D", "5D", "1M", "3M", "6M", "1Y"];

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOptionalPrice(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `$${formatPrice(value)}` : "—";
}

function formatCompactNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatMetric(value?: number | null, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "—";
}

function sectorFor(stock: Stock) {
  return stock.sector ?? sectorOverrides[stock.symbol] ?? "Other";
}

function MiniChart({ values, tone }: { values: number[]; tone: Tone }) {
  const width = 620;
  const height = 190;
  const padding = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = padding + ((max - value) / span) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
  const lastY = padding + ((max - values[values.length - 1]) / span) * (height - padding * 2);

  return (
    <svg className="main-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent price direction">
      <defs>
        <linearGradient id={`chart-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[38, 76, 114, 152].map((y) => <line key={y} x1="0" y1={y} x2={width} y2={y} className="chart-grid" />)}
      <polygon points={areaPoints} fill={`url(#chart-${tone})`} />
      <polyline points={points} className="chart-line" fill="none" />
      <circle cx={width - padding} cy={lastY} r="5" className="chart-dot" />
    </svg>
  );
}

function SessionCard({
  label,
  price,
  changePct,
  active,
  note,
  status,
  updated,
}: {
  label: string;
  price?: number | null;
  changePct?: number | null;
  active?: boolean;
  note: string;
  status?: string;
  updated?: string | null;
}) {
  const hasPrice = typeof price === "number";
  return (
    <div className={`session-card ${active ? "active" : ""}`}>
      <span>{label}{active ? <i>Now</i> : null}</span>
      <strong>{hasPrice ? `$${formatPrice(price)}` : "Not available"}</strong>
      <small className={typeof changePct === "number" ? (changePct >= 0 ? "up" : "down") : ""}>
        {typeof changePct === "number" ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : status ?? note}
      </small>
      <small className="session-detail">{hasPrice && status ? status : note}{updated ? ` · ${formatMarketTime(updated)}` : ""}</small>
    </div>
  );
}

function ScoreRing({ score, tone }: { score: number; tone: Tone }) {
  return (
    <div className={`score-ring tone-${tone}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{score}</strong><span>/100</span></div>
    </div>
  );
}

function deriveShortAnalysis(stock: Stock, quote: MarketQuote): Analysis {
  const momentum = quote.rsi ?? stock.rsi;
  const above20 = quote.price > quote.sma20;
  const above50 = quote.price > quote.sma50;
  const firstSupport = quote.support[0] ?? stock.support[0];
  const distanceToSupport = ((quote.price - firstSupport) / quote.price) * 100;
  const nearSupport = distanceToSupport >= 0 && distanceToSupport <= 3;
  let verdict = "WAIT";
  let tone: Tone = "warning";
  let score = 48;
  let summary = "The indicators are mixed. Wait for price, momentum and volume to agree before entering.";

  if (above20 && above50 && momentum >= 45 && momentum <= 68) {
    verdict = "SETUP";
    tone = "positive";
    score = 74;
    summary = "Trend and momentum are aligned. This setup stays valid only while price remains above the trend reference.";
  } else if (nearSupport && momentum >= 35) {
    verdict = "WATCH";
    tone = "neutral";
    score = 59;
    summary = "Price is near defined support. Wait for a bounce and stronger volume instead of predicting the bottom.";
  } else if (!above20 && !above50 && momentum < 40) {
    verdict = "AVOID";
    tone = "negative";
    score = 32;
    summary = "Trend and momentum are both weak. A lower price alone is not enough reason to enter this trade.";
  } else if (above20 && above50 && momentum > 68) {
    verdict = "WAIT";
    tone = "warning";
    score = 54;
    summary = "The trend is strong but momentum is stretched. Wait for a controlled pullback or fresh consolidation.";
  }

  return {
    verdict,
    tone,
    score,
    summary,
    trigger: `Close above the 20-day average near $${formatPrice(quote.sma20)} with volume`,
    invalidation: `Break below calculated support near $${formatPrice(firstSupport)}`,
    checks: [
      { label: "Trend", value: above20 && above50 ? "Positive" : above20 || above50 ? "Mixed" : "Weak", detail: `Price versus 20D $${formatPrice(quote.sma20)} and 50D $${formatPrice(quote.sma50)}.`, tone: above20 && above50 ? "positive" : above20 || above50 ? "warning" : "negative" },
      { label: "Momentum", value: `RSI ${momentum.toFixed(1)}`, detail: momentum > 70 ? "Potentially stretched." : momentum < 40 ? "Recent momentum remains weak." : "Momentum is in a workable range.", tone: momentum >= 45 && momentum <= 68 ? "positive" : "warning" },
      { label: "Price level", value: `$${formatPrice(firstSupport)} support`, detail: `${Math.abs(distanceToSupport).toFixed(1)}% from calculated support.`, tone: nearSupport ? "positive" : "neutral" },
      { label: "Catalyst", value: stock.catalyst, detail: "Check the news panel before holding through an event.", tone: stock.catalyst.toLowerCase().includes("earnings") ? "negative" : "warning" },
    ],
  };
}

function deriveLongAnalysis(stock: Stock, fundamentals: Fundamentals): Analysis {
  const checks = [
    {
      label: "Revenue growth",
      value: formatMetric(fundamentals.revenueGrowthPct, "%"),
      detail: "Year-over-year revenue growth from the latest available fundamentals feed.",
      tone: fundamentals.revenueGrowthPct === null ? "warning" : fundamentals.revenueGrowthPct > 0 ? "positive" : "negative",
    },
    {
      label: "EPS growth",
      value: formatMetric(fundamentals.epsGrowthPct, "%"),
      detail: "Earnings growth helps test whether business progress is reaching shareholders.",
      tone: fundamentals.epsGrowthPct === null ? "warning" : fundamentals.epsGrowthPct > 0 ? "positive" : "negative",
    },
    {
      label: "Valuation",
      value: fundamentals.trailingPE ? `${fundamentals.trailingPE.toFixed(1)}× P/E` : "P/E unavailable",
      detail: "A high valuation increases the amount of future growth already expected by the market.",
      tone: fundamentals.trailingPE === null ? "warning" : fundamentals.trailingPE > 0 && fundamentals.trailingPE <= 40 ? "positive" : "warning",
    },
    {
      label: "Cash generation",
      value: fundamentals.freeCashFlow === null ? "Unavailable" : fundamentals.freeCashFlow > 0 ? "Positive FCF" : "Negative FCF",
      detail: "Free cash flow supports reinvestment, debt repayment and shareholder returns.",
      tone: fundamentals.freeCashFlow === null ? "warning" : fundamentals.freeCashFlow > 0 ? "positive" : "negative",
    },
  ] satisfies Analysis["checks"];
  const positive = checks.filter((check) => check.tone === "positive").length;
  const negative = checks.filter((check) => check.tone === "negative").length;
  const score = Math.max(25, Math.min(88, stock.long.score + positive * 3 - negative * 5));
  const tone: Tone = score >= 72 ? "positive" : score >= 58 ? "neutral" : score >= 42 ? "warning" : "negative";
  return {
    verdict: score >= 72 ? "ACCUMULATE" : score >= 58 ? "WATCH" : score >= 42 ? "WAIT" : "AVOID",
    score,
    tone,
    summary: `${stock.long.summary} Live fundamentals currently have ${fundamentals.confidence} coverage.`,
    trigger: fundamentals.earningsDate ? `Review the next earnings update around ${fundamentals.earningsDate} before increasing size` : stock.long.trigger,
    invalidation: stock.long.invalidation,
    checks,
  };
}

function customStock(symbol: string, quote?: MarketQuote): Stock {
  const price = quote?.price ?? 100;
  const support = quote?.support ?? [price * 0.96, price * 0.91];
  const resistance = quote?.resistance ?? [price * 1.04, price * 1.08];
  const pending: Analysis = {
    verdict: "RESEARCH",
    score: 45,
    tone: "warning",
    summary: "This custom symbol needs current price history and fundamentals before Stock Compass can produce an actionable assessment.",
    trigger: "Wait for the market and fundamentals feeds to load",
    invalidation: "Do not act while the data guard is active",
    checks: [
      { label: "Market data", value: quote ? "Loaded" : "Loading", detail: "Technical analysis needs current daily history.", tone: quote ? "positive" : "warning" },
      { label: "Fundamentals", value: "Loading", detail: "Long-term analysis is paused until fundamentals are checked.", tone: "warning" },
      { label: "News", value: "Loading", detail: "Company-specific headlines load after selection.", tone: "warning" },
      { label: "Risk", value: "Define a stop", detail: "Do not enter without an invalidation level.", tone: "warning" },
    ],
  };
  return {
    symbol,
    name: symbol,
    price,
    changePct: quote?.changePct ?? 0,
    currency: quote?.currency ?? "USD",
    history: quote?.history ?? [price, price],
    support,
    resistance,
    rsi: quote?.rsi ?? 50,
    sma20: quote?.sma20 ?? price,
    sma50: quote?.sma50 ?? price,
    volatility: "Calculating",
    catalyst: "Live research",
    sector: "Custom watchlist",
    short: pending,
    long: pending,
    news: [],
  };
}

function actionsFor(analysis: Analysis, blocked = false, reason = "Market data is stale or incomplete."): ActionPair {
  if (blocked) {
    return { newAction: "SIGNAL PAUSED", ownAction: "CHECK BROKER / SIGNAL PAUSED", tone: "warning", note: reason };
  }
  if (analysis.score >= 76 && analysis.tone === "positive") {
    return { newAction: "BUY IN PARTS", ownAction: "HOLD", tone: "positive", note: "The strongest setup group. Start small; do not chase a gap." };
  }
  if (analysis.score >= 68 && analysis.tone !== "negative" && analysis.tone !== "warning") {
    return { newAction: "BUY SMALL", ownAction: "HOLD", tone: "positive", note: "Conditions are constructive, but confirmation and position size still matter." };
  }
  if (analysis.score >= 55) {
    return { newAction: "WAIT", ownAction: "HOLD / TRAIL STOP", tone: "neutral", note: "There is not enough edge for a fresh entry. Existing holders can protect the nearest support." };
  }
  if (analysis.score >= 40) {
    return { newAction: "WAIT", ownAction: "REDUCE RISK", tone: "warning", note: "The setup is weak or incomplete. Avoid adding until the trigger is confirmed." };
  }
  return { newAction: "AVOID", ownAction: "SELL IF SUPPORT BREAKS", tone: "negative", note: "Weak trend and momentum make capital protection the priority." };
}

function holdingDecision(actions: ActionPair, currentPrice: number, stopPrice: number, profitPct: number) {
  if (actions.newAction === "SIGNAL PAUSED") {
    return {
      label: "CHECK BROKER / SIGNAL PAUSED",
      tone: "warning" as Tone,
      reason: actions.note,
    };
  }
  if (currentPrice <= stopPrice) {
    return {
      label: "SELL ALL / REVIEW NOW",
      tone: "negative" as Tone,
      reason: `Price is at or below your $${formatPrice(stopPrice)} stop rule. Confirm the latest broker quote before acting.`,
    };
  }
  if (actions.ownAction.includes("SELL")) {
    return {
      label: "SELL IF SUPPORT BREAKS",
      tone: "negative" as Tone,
      reason: "The technical setup is weak. Keep the stop active and exit if the support rule is confirmed.",
    };
  }
  if (actions.ownAction.includes("REDUCE")) {
    return {
      label: "SELL PART / REDUCE",
      tone: "warning" as Tone,
      reason: "Risk has increased. Reducing part of the position can protect capital while retaining some exposure.",
    };
  }
  if (profitPct >= 15 && actions.ownAction.includes("TRAIL")) {
    return {
      label: "HOLD / SELL PART",
      tone: "neutral" as Tone,
      reason: "The position is profitable but the setup is not strong enough to add. Consider taking some profit and trail the remainder.",
    };
  }
  return {
    label: actions.ownAction.startsWith("HOLD") ? actions.ownAction : "HOLD",
    tone: actions.tone,
    reason: "Price remains above the stop rule and the current setup has not triggered a full exit.",
  };
}

function sessionLabel(session?: SessionQuote["session"]) {
  if (session === "PRE-MARKET") return "Pre-market";
  if (session === "REGULAR") return "Regular market";
  if (session === "AFTER-HOURS") return "After-hours";
  if (session === "OVERNIGHT") return "Overnight window";
  return "Market closed";
}

function formatMarketTime(value?: string | null) {
  if (!value) return "Waiting for feed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);
}

function feedAge(value?: string | null) {
  if (!value) return "No timestamp";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Timestamp unavailable";
  const seconds = Math.max(Math.floor((Date.now() - timestamp) / 1000), 0);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function newsAge(value: string) {
  const published = new Date(value);
  if (Number.isNaN(published.getTime())) return "Recent";
  const hours = Math.max(Math.floor((Date.now() - published.getTime()) / 3_600_000), 0);
  if (hours < 1) return "Now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function normalizeNews(item: NewsItem) {
  const effect = item.effect ?? (item.tone === "positive" ? "bullish" : item.tone === "negative" ? "bearish" : "mixed");
  const relationship = item.relationship ?? "direct";
  return {
    ...item,
    effect,
    relationship,
    strength: item.strength ?? (relationship === "direct" ? "medium" : "low"),
    confidence: item.confidence ?? (relationship === "direct" ? 68 : 48),
    eventType: item.eventType ?? "General update",
    why: item.why ?? (relationship === "direct"
      ? "This company-specific headline may change expectations, sentiment or the risk around the stock."
      : "This sector or macro headline may influence demand, valuation or investor risk appetite."),
  };
}

function summarizeNews(items: NewsItem[]) {
  let score = 0;
  let direct = 0;
  items.map(normalizeNews).forEach((item) => {
    if (item.relationship === "direct") direct += 1;
    const direction = item.effect === "bullish" ? 1 : item.effect === "bearish" ? -1 : 0;
    const relationWeight = item.relationship === "direct" ? 2 : 1;
    const strengthWeight = item.strength === "high" ? 2 : item.strength === "medium" ? 1.35 : 0.75;
    const confidenceWeight = (item.confidence ?? 50) / 100;
    const ageText = item.age.toLowerCase();
    const freshnessWeight = ageText === "now" || ageText.includes("h") ? 1 : ageText.includes("d") ? 0.75 : 0.55;
    score += direction * relationWeight * strengthWeight * confidenceWeight * freshnessWeight;
  });
  const threshold = Math.max(items.length * 0.6, 1.5);
  if (score > threshold) return { label: "Bullish tilt", tone: "positive" as Tone, score, direct };
  if (score < -threshold) return { label: "Bearish tilt", tone: "negative" as Tone, score, direct };
  return { label: "Mixed / unclear", tone: "warning" as Tone, score, direct };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("short");
  const [selectedSymbol, setSelectedSymbol] = useState("SKHY");
  const [account, setAccount] = useState(5000);
  const [riskPct, setRiskPct] = useState(0.5);
  const [fxRate, setFxRate] = useState(4.25);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [marketErrors, setMarketErrors] = useState<Record<string, string>>({});
  const [sessionQuotes, setSessionQuotes] = useState<Record<string, SessionQuote>>({});
  const [sessionFeedMessage, setSessionFeedMessage] = useState("Waiting for extended-hours feed");
  const [liveNews, setLiveNews] = useState<Record<string, NewsItem[]>>({});
  const [feedState, setFeedState] = useState<FeedState>("snapshot");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [secondsToRefresh, setSecondsToRefresh] = useState(60);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [holdings, setHoldings] = useState<Record<string, Holding>>({});
  const [holdingsLoaded, setHoldingsLoaded] = useState(false);
  const [holdingDrafts, setHoldingDrafts] = useState<Record<string, { shares: string; averagePrice: string; stopPrice: string }>>({});
  const [holdingMessage, setHoldingMessage] = useState("");
  const [chartRange, setChartRange] = useState<ChartRange>("1D");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [localDataLoaded, setLocalDataLoaded] = useState(false);
  const [transactions, setTransactions] = useState<JournalTransaction[]>([]);
  const [transactionDraft, setTransactionDraft] = useState<{ type: TransactionType; shares: string; price: string; fee: string; date: string; note: string }>({
    type: "BUY",
    shares: "",
    price: "",
    fee: "0",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertDraft, setAlertDraft] = useState<{ direction: "ABOVE" | "BELOW"; target: string }>({ direction: "ABOVE", target: "" });
  const [notificationMessage, setNotificationMessage] = useState("");
  const [fundamentals, setFundamentals] = useState<Record<string, Fundamentals>>({});
  const [fundamentalsErrors, setFundamentalsErrors] = useState<Record<string, string>>({});
  const [backtests, setBacktests] = useState<Record<string, BacktestResult>>({});
  const [backtestErrors, setBacktestErrors] = useState<Record<string, string>>({});
  const [researchLoading, setResearchLoading] = useState<Record<string, boolean>>({});
  const [providerMode, setProviderMode] = useState("Public fallback");

  const trackedStocks = useMemo(() => watchlistSymbols.map((symbol) => {
    const builtIn = stocks.find((stock) => stock.symbol === symbol);
    return builtIn ?? customStock(symbol, quotes[symbol]);
  }), [quotes, watchlistSymbols]);
  const selectedBase = trackedStocks.find((stock) => stock.symbol === selectedSymbol) ?? trackedStocks[0] ?? stocks[0];
  const selectedQuote = quotes[selectedSymbol];
  const selectedSession = sessionQuotes[selectedSymbol];
  const selectedFundamentals = fundamentals[selectedSymbol];
  const effectiveQuote = latestQuote<MarketQuote | SessionQuote>(selectedQuote, selectedSession);
  const selectedPrice = effectiveQuote?.price ?? selectedBase.price;
  const selectedChangePct = effectiveQuote?.changePct ?? selectedBase.changePct;
  const selected: Stock = {
    ...selectedBase,
    ...(selectedQuote ?? {}),
    price: selectedPrice,
    changePct: selectedChangePct,
    history: selectedSession?.intradayHistory?.length > 1 ? selectedSession.intradayHistory : selectedQuote?.history ?? selectedBase.history,
    rsi: selectedQuote?.rsi ?? selectedBase.rsi,
  };
  const analysisQuote = selectedQuote ? { ...selectedQuote, price: selectedPrice, changePct: selectedChangePct } : null;
  const analysis = mode === "short"
    ? analysisQuote ? deriveShortAnalysis(selectedBase, analysisQuote) : selected.short
    : selectedFundamentals ? deriveLongAnalysis(selectedBase, selectedFundamentals) : selected.long;
  const selectedQuoteStatus = quoteStatus(effectiveQuote);
  const guard = signalStatus({ quote: effectiveQuote, history: selectedQuote, mode,
    fundamentals: selectedFundamentals, fundamentalsError: fundamentalsErrors[selectedSymbol], marketError: marketErrors[selectedSymbol] });
  const signalBlocked = guard.blocked;
  const signalBlockedReason = guard.reason;
  const actions = actionsFor(analysis, signalBlocked, signalBlockedReason);
  const displayedNews = liveNews[selectedSymbol] ?? [];
  const newsSummary = summarizeNews(displayedNews);
  const suggestedStop = selected.support[0] * 0.99;
  const journalPositions = useMemo(() => calculatePositions(transactions), [transactions]);
  const selectedJournalPosition = journalPositions[selectedSymbol];
  const selectedHolding = selectedJournalPosition?.shares > 0
    ? {
        symbol: selectedSymbol,
        shares: selectedJournalPosition.shares,
        averagePrice: selectedJournalPosition.averagePrice,
        stopPrice: holdings[selectedSymbol]?.stopPrice ?? suggestedStop,
        savedAt: holdings[selectedSymbol]?.savedAt ?? "Transaction journal",
      }
    : holdings[selectedSymbol];
  const riskBudget = account * (riskPct / 100);
  const riskPerShareRm = Math.max((selected.price - suggestedStop) * fxRate, 0.01);
  const wholeShares = Math.max(Math.floor(riskBudget / riskPerShareRm), 0);
  const positionValue = wholeShares * selected.price * fxRate;
  const distanceToSupport = ((selected.price - selected.support[0]) / selected.price) * 100;
  const modeLabel = mode === "short" ? "Short-term · days to weeks" : "Long-term · 3+ years";
  const selectedProfit = selectedHolding ? (selected.price - selectedHolding.averagePrice) * selectedHolding.shares : 0;
  const selectedProfitPct = selectedHolding ? ((selected.price - selectedHolding.averagePrice) / selectedHolding.averagePrice) * 100 : 0;
  const selectedHoldingDecision = selectedHolding
    ? holdingDecision(actions, selected.price, selectedHolding.stopPrice, selectedProfitPct)
    : null;
  const holdingDraft = holdingDrafts[selectedSymbol] ?? (selectedHolding
    ? { shares: String(selectedHolding.shares), averagePrice: String(selectedHolding.averagePrice), stopPrice: String(selectedHolding.stopPrice) }
    : { shares: "", averagePrice: "", stopPrice: "" });
  const chartValues = chartRange === "1D"
    ? selectedSession?.intradayHistory?.length > 1 ? selectedSession.intradayHistory : selected.history
    : chartRange === "5D"
      ? selectedSession?.intradayHistory5d?.length > 1 ? selectedSession.intradayHistory5d : selectedQuote?.historyByPeriod?.["1M"] ?? selected.history
      : selectedQuote?.historyByPeriod?.[chartRange] ?? selected.history;
  const quoteOpen = selectedSession?.openPrice ?? selectedQuote?.open;
  const quoteHigh = selectedSession?.dayHigh ?? selectedQuote?.high;
  const quoteLow = selectedSession?.dayLow ?? selectedQuote?.low;
  const quotePreviousClose = selectedSession?.previousClose ?? selectedQuote?.previousClose;
  const quoteVolume = selectedSession?.volume ?? selectedQuote?.volume;
  const quoteProvider = effectiveQuote?.provider ?? "Built-in snapshot";
  const quoteUpdated = effectiveQuote?.updated;
  const exitPlan = createExitPlan(selectedHolding?.averagePrice ?? selected.price, selected.price, selectedHolding?.stopPrice ?? suggestedStop, selected.sma20);
  const selectedBacktest = backtests[selectedSymbol];

  const rows = useMemo(() => trackedStocks.map((stock) => {
    const quote = quotes[stock.symbol];
    const session = sessionQuotes[stock.symbol];
    const latest = latestQuote<MarketQuote | SessionQuote>(quote, session);
    const shown: Stock = quote
      ? { ...stock, ...quote, price: latest?.price ?? quote.price, changePct: latest?.changePct ?? quote.changePct, rsi: quote.rsi ?? stock.rsi }
      : latest ? { ...stock, price: latest.price, changePct: latest.changePct } : stock;
    const analysisInput = quote ? { ...quote, price: shown.price, changePct: shown.changePct } : null;
    const rowFundamentals = fundamentals[stock.symbol];
    const rowAnalysis = mode === "short"
      ? analysisInput ? deriveShortAnalysis(stock, analysisInput) : shown.short
      : rowFundamentals ? deriveLongAnalysis(stock, rowFundamentals) : shown.long;
    const status = signalStatus({ quote: latest, history: quote, mode, fundamentals: rowFundamentals,
      fundamentalsError: fundamentalsErrors[stock.symbol], marketError: marketErrors[stock.symbol] });
    const blocked = status.blocked;
    return {
      stock,
      shown,
      analysis: rowAnalysis,
      actions: actionsFor(rowAnalysis, blocked, status.reason),
      status,
      sector: sectorFor(stock),
      blocked,
    };
  }).sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.analysis.score - a.analysis.score), [fundamentals, fundamentalsErrors, marketErrors, mode, quotes, sessionQuotes, trackedStocks, secondsToRefresh]);

  const filteredRows = rows.filter((row) => {
    const textMatch = `${row.stock.symbol} ${row.stock.name}`.toLowerCase().includes(search.toLowerCase().trim());
    if (!textMatch) return false;
    if (filter === "buy") return row.actions.newAction.startsWith("BUY");
    if (filter === "wait") return row.actions.newAction === "WAIT";
    if (filter === "risk") return row.actions.newAction === "AVOID" || row.actions.ownAction.includes("SELL") || row.actions.ownAction.includes("REDUCE");
    if (filter === "tech") return row.sector === "Technology";
    if (filter === "semis") return row.sector === "Semiconductors";
    if (filter === "core") return ["ETF", "Financials", "Healthcare", "Consumer"].includes(row.sector);
    return true;
  });

  const topBuy = rows.find((row) => row.actions.newAction.startsWith("BUY"));
  const topWait = rows.find((row) => row.actions.newAction === "WAIT");
  const topRisk = [...rows].reverse().find((row) => row.actions.newAction === "AVOID" || row.actions.ownAction.includes("SELL"));
  const effectiveHoldings = { ...holdings };
  Object.values(journalPositions).forEach((position) => {
    if (position.shares <= 0) return;
    const row = rows.find((candidate) => candidate.stock.symbol === position.symbol);
    effectiveHoldings[position.symbol] = {
      symbol: position.symbol,
      shares: position.shares,
      averagePrice: position.averagePrice,
      stopPrice: holdings[position.symbol]?.stopPrice ?? (row?.shown.support[0] ?? position.averagePrice * 0.9) * 0.99,
      savedAt: holdings[position.symbol]?.savedAt ?? "Transaction journal",
    };
  });
  const portfolioRows = Object.values(effectiveHoldings).map((holding) => {
    const row = rows.find((candidate) => candidate.stock.symbol === holding.symbol);
    const currentPrice = row?.shown.price ?? holding.averagePrice;
    const profit = (currentPrice - holding.averagePrice) * holding.shares;
    const profitPct = ((currentPrice - holding.averagePrice) / holding.averagePrice) * 100;
    return {
      holding,
      currentPrice,
      profit,
      profitPct,
      decision: holdingDecision(row?.actions ?? actions, currentPrice, holding.stopPrice, profitPct),
    };
  });
  const portfolioValue = portfolioRows.reduce((sum, row) => sum + row.currentPrice * row.holding.shares, 0);
  const portfolioProfit = portfolioRows.reduce((sum, row) => sum + row.profit, 0);
  const realisedProfit = Object.values(journalPositions).reduce((sum, position) => sum + position.realisedProfit, 0);
  const updatedLabel = useMemo(() => lastRefresh
    ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(lastRefresh)
    : "Waiting for first refresh", [lastRefresh]);

  const refreshMarket = useCallback(async () => {
    return fetch(`/api/market?symbols=${watchlistSymbols.join(",")}`)
      .then(async (response) => {
        if (!response.ok) return false;
        const payload = await response.json() as { quotes?: MarketQuote[]; providerMode?: string; unavailableReasons?: Record<string, string> };
        setMarketErrors(payload.unavailableReasons ?? {});
        const nextQuotes = Object.fromEntries((payload.quotes ?? []).map((quote) => [quote.symbol, quote]));
        if (!Object.keys(nextQuotes).length) return false;
        setQuotes((current) => ({ ...current, ...nextQuotes }));
        setProviderMode(payload.providerMode ?? "Public fallback");
        return true;
      }).catch(() => false);
  }, [watchlistSymbols]);

  const refreshSession = useCallback(async (symbol: string) => {
    return fetch(`/api/market?symbols=${encodeURIComponent(symbol)}&intraday=1`)
      .then(async (response) => {
        if (!response.ok) return false;
        const payload = await response.json() as { quotes?: SessionQuote[]; unavailableReasons?: Record<string, string>; providerMode?: string };
        const quote = payload.quotes?.[0];
        if (!quote) {
          setSessionFeedMessage(payload.unavailableReasons?.[symbol] ?? "Extended-hours feed temporarily unavailable");
          return false;
        }
        setSessionQuotes((current) => ({ ...current, [symbol]: quote }));
        setProviderMode(payload.providerMode ?? quote.provider);
        setSessionFeedMessage(quote.hasExtendedHours ? "Extended-hours feed connected" : "Extended-hours trades are not reported for this security");
        setSecondsToRefresh(60);
        return true;
      }).catch(() => {
        setSessionFeedMessage("Extended-hours feed temporarily unavailable");
        return false;
      });
  }, []);

  const refreshNews = useCallback(async (symbol: string) => {
    return fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("News unavailable");
        const payload = await response.json() as { items?: Array<Omit<NewsItem, "age"> & { publishedAt: string }> };
        const items = (payload.items ?? []).map((item) => ({
          title: item.title,
          source: item.source,
          age: newsAge(item.publishedAt),
          url: item.url,
          tone: item.tone,
          relationship: item.relationship,
          effect: item.effect,
          strength: item.strength,
          why: item.why,
          confidence: item.confidence,
          eventType: item.eventType,
          summary: item.summary,
          relatedSymbols: item.relatedSymbols,
        }));
        if (!items.length) throw new Error("News unavailable");
        setLiveNews((current) => ({ ...current, [symbol]: items }));
        return true;
      }).catch(() => {
        setLiveNews((current) => ({ ...current, [symbol]: [] }));
        return false;
      });
  }, []);

  const refreshFundamentals = useCallback(async (symbol: string) => {
    return fetch(`/api/fundamentals?symbol=${encodeURIComponent(symbol)}`)
      .then(async (response) => {
        const payload = await response.json() as { fundamentals?: Fundamentals | null; error?: string };
        if (!response.ok || !payload.fundamentals) {
          setFundamentals((current) => { const next = { ...current }; delete next[symbol]; return next; });
          setFundamentalsErrors((current) => ({ ...current, [symbol]: payload.error ?? "Fundamentals unavailable" }));
          return false;
        }
        setFundamentals((current) => ({ ...current, [symbol]: payload.fundamentals! }));
        setFundamentalsErrors((current) => ({ ...current, [symbol]: "" }));
        return true;
      }).catch(() => {
        setFundamentals((current) => { const next = { ...current }; delete next[symbol]; return next; });
        setFundamentalsErrors((current) => ({ ...current, [symbol]: "Fundamentals feed temporarily unavailable" }));
        return false;
      });
  }, []);

  const refreshBacktest = useCallback(async (symbol: string, force = false) => {
    if (!force && backtests[symbol]) return true;
    setResearchLoading((current) => ({ ...current, [symbol]: true }));
    return fetch(`/api/backtest?symbol=${encodeURIComponent(symbol)}`)
      .then(async (response) => {
        const payload = await response.json() as BacktestResult & { error?: string };
        if (!response.ok || payload.error) {
          setBacktestErrors((current) => ({ ...current, [symbol]: payload.error ?? "Backtest unavailable" }));
          return false;
        }
        setBacktests((current) => ({ ...current, [symbol]: payload }));
        setBacktestErrors((current) => ({ ...current, [symbol]: "" }));
        return true;
      }).catch(() => {
        setBacktestErrors((current) => ({ ...current, [symbol]: "Historical feed temporarily unavailable" }));
        return false;
      }).finally(() => setResearchLoading((current) => ({ ...current, [symbol]: false })));
  }, [backtests]);

  const refreshEverything = useCallback(async () => {
    setFeedState("loading");
    const sessionWorked = await refreshSession(selectedSymbol);
    const remaining = await Promise.all([
      refreshMarket(),
      refreshNews(selectedSymbol),
      refreshFundamentals(selectedSymbol),
      refreshBacktest(selectedSymbol, true),
    ]);
    const results = [sessionWorked, ...remaining];
    setLastRefresh(new Date());
    const worked = results.filter(Boolean).length;
    setFeedState(worked === results.length ? "ready" : worked ? "partial" : "snapshot");
  }, [refreshBacktest, refreshFundamentals, refreshMarket, refreshNews, refreshSession, selectedSymbol]);

  function saveHolding() {
    const shares = Number(holdingDraft.shares);
    const averagePrice = Number(holdingDraft.averagePrice);
    const stopPrice = holdingDraft.stopPrice ? Number(holdingDraft.stopPrice) : suggestedStop;
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(averagePrice) || averagePrice <= 0 || !Number.isFinite(stopPrice) || stopPrice <= 0) {
      setHoldingMessage("Enter valid shares, purchase price and stop price.");
      return;
    }
    setHoldings((current) => ({
      ...current,
      [selectedSymbol]: { symbol: selectedSymbol, shares, averagePrice, stopPrice, savedAt: new Date().toISOString() },
    }));
    setHoldingDrafts((current) => ({ ...current, [selectedSymbol]: { shares: String(shares), averagePrice: String(averagePrice), stopPrice: String(stopPrice) } }));
    setHoldingMessage(`${selectedSymbol} holding saved on this device.`);
  }

  function removeHolding(symbol: string) {
    setHoldings((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setHoldingMessage(`${symbol} removed from My Holdings.`);
  }

  function addWatchSymbol() {
    const symbol = search.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
      setNotificationMessage("Enter a valid U.S. ticker, such as AAPL or BRK.B.");
      return;
    }
    if (watchlistSymbols.length >= 40 && !watchlistSymbols.includes(symbol)) {
      setNotificationMessage("This version supports up to 40 watchlist symbols.");
      return;
    }
    setWatchlistSymbols((current) => current.includes(symbol) ? current : [...current, symbol]);
    setSelectedSymbol(symbol);
    setFilter("all");
    setSearch("");
    setNotificationMessage(`${symbol} added to your watchlist.`);
  }

  function removeSelectedSymbol() {
    if (watchlistSymbols.length <= 1) return;
    if (effectiveHoldings[selectedSymbol]?.shares > 0) {
      setNotificationMessage("Remove or close this holding before removing it from the watchlist.");
      return;
    }
    const next = watchlistSymbols.filter((symbol) => symbol !== selectedSymbol);
    setWatchlistSymbols(next);
    setSelectedSymbol(next[0]);
    setNotificationMessage(`${selectedSymbol} removed from your watchlist.`);
  }

  function addTransaction() {
    const type = transactionDraft.type;
    const shares = Number(transactionDraft.shares || 0);
    const price = Number(transactionDraft.price);
    const fee = Number(transactionDraft.fee || 0);
    const valid = type === "DIVIDEND"
      ? Number.isFinite(price) && price > 0
      : Number.isFinite(shares) && shares > 0 && Number.isFinite(price) && price > 0;
    if (!valid || !Number.isFinite(fee) || fee < 0 || !transactionDraft.date) {
      setNotificationMessage(type === "DIVIDEND" ? "Enter a valid dividend amount and date." : "Enter valid shares, price, fee and date.");
      return;
    }
    if (type === "SELL" && shares > (journalPositions[selectedSymbol]?.shares ?? 0)) {
      setNotificationMessage(`The journal only has ${(journalPositions[selectedSymbol]?.shares ?? 0).toFixed(4)} open ${selectedSymbol} shares.`);
      return;
    }
    const transaction: JournalTransaction = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      symbol: selectedSymbol,
      type,
      shares: type === "DIVIDEND" ? 0 : shares,
      price,
      fee,
      date: transactionDraft.date,
      note: transactionDraft.note.trim() || undefined,
    };
    setTransactions((current) => [...current, transaction]);
    setTransactionDraft((current) => ({ ...current, shares: "", price: "", fee: "0", note: "" }));
    setNotificationMessage(`${type} transaction saved for ${selectedSymbol}.`);
  }

  function removeTransaction(id: string) {
    setTransactions((current) => current.filter((transaction) => transaction.id !== id));
  }

  function addPriceAlert() {
    const target = Number(alertDraft.target);
    if (!Number.isFinite(target) || target <= 0) {
      setNotificationMessage("Enter a valid alert price.");
      return;
    }
    const alert: PriceAlert = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      symbol: selectedSymbol,
      direction: alertDraft.direction,
      target,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    setAlerts((current) => [alert, ...current]);
    setAlertDraft((current) => ({ ...current, target: "" }));
    setNotificationMessage(`Alert set for ${selectedSymbol} ${alert.direction.toLowerCase()} $${formatPrice(target)}.`);
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(HOLDINGS_KEY);
        if (stored) setHoldings(JSON.parse(stored) as Record<string, Holding>);
        const storedWatchlist = window.localStorage.getItem(WATCHLIST_KEY);
        if (storedWatchlist) {
          const parsed = JSON.parse(storedWatchlist) as unknown;
          if (Array.isArray(parsed) && parsed.length) setWatchlistSymbols(parsed.filter((symbol): symbol is string => typeof symbol === "string").slice(0, 40));
        }
        const storedJournal = window.localStorage.getItem(JOURNAL_KEY);
        if (storedJournal) setTransactions(JSON.parse(storedJournal) as JournalTransaction[]);
        const storedAlerts = window.localStorage.getItem(ALERTS_KEY);
        if (storedAlerts) setAlerts(JSON.parse(storedAlerts) as PriceAlert[]);
      } catch {
        // Keep an empty local portfolio if browser storage is blocked.
      }
      setHoldingsLoaded(true);
      setLocalDataLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!holdingsLoaded) return;
    window.localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
  }, [holdings, holdingsLoaded]);

  useEffect(() => {
    if (!localDataLoaded) return;
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlistSymbols));
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(transactions));
    window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  }, [alerts, localDataLoaded, transactions, watchlistSymbols]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refreshMarket().then((worked) => {
        setLastRefresh(new Date());
        setFeedState(worked ? "ready" : "snapshot");
      });
    }, 1_200);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshMarket();
    }, 300_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshMarket]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void Promise.all([
        refreshSession(selectedSymbol),
        refreshNews(selectedSymbol),
        refreshFundamentals(selectedSymbol),
        refreshBacktest(selectedSymbol),
      ]).then((results) => {
        setLastRefresh(new Date());
        setFeedState(results.some(Boolean) ? (results.every(Boolean) ? "ready" : "partial") : "snapshot");
      });
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSession(selectedSymbol);
    }, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshBacktest, refreshFundamentals, refreshNews, refreshSession, selectedSymbol]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const prices = Object.fromEntries(trackedStocks.flatMap((stock) => {
        const quote = latestQuote<MarketQuote | SessionQuote>(quotes[stock.symbol], sessionQuotes[stock.symbol]);
        return quoteStatus(quote).blocked ? [] : [[stock.symbol, quote!.price]];
      }));
      const evaluated = evaluatePriceAlerts(alerts, prices);
      if (!evaluated.triggered.length) return;
      setAlerts(evaluated.alerts);
      const message = evaluated.triggered.map((alert) => `${alert.symbol} is ${alert.direction.toLowerCase()} $${formatPrice(alert.target)}`).join(" · ");
      setNotificationMessage(message);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        evaluated.triggered.forEach((alert) => new Notification("Stock Compass alert", { body: `${alert.symbol} is ${alert.direction.toLowerCase()} $${formatPrice(alert.target)}.` }));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alerts, quotes, sessionQuotes, trackedStocks]);

  useEffect(() => {
    const timer = window.setInterval(() => setSecondsToRefresh((value) => value <= 1 ? 60 : value - 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><p className="eyebrow">Personal market co-pilot</p><h1>Stock Compass</h1></div>
        </div>
        <div className="topbar-actions">
          <span className={`market-status session-${(selectedSession?.session ?? "closed").toLowerCase()}`}><i /> {feedState === "loading" ? "Refreshing…" : `${sessionLabel(selectedSession?.session)} · ${secondsToRefresh}s`}</span>
          <button className="refresh-button" type="button" onClick={() => void refreshEverything()} disabled={feedState === "loading"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" /></svg>
            Refresh now
          </button>
        </div>
      </header>

      <section className="control-strip" aria-label="Analysis controls">
        <div className="mode-switch" role="group" aria-label="Analysis horizon">
          <button className={mode === "short" ? "active" : ""} onClick={() => setMode("short")} type="button">Short-term<span>Days to weeks</span></button>
          <button className={mode === "long" ? "active" : ""} onClick={() => setMode("long")} type="button">Long-term<span>Three years+</span></button>
        </div>
        <div className="data-stamp"><span>{selectedSession ? `${providerMode} · selected quote every 60s` : Object.keys(quotes).length ? providerMode : "Market snapshot"}</span><strong>{updatedLabel}</strong></div>
      </section>

      <section className="command-center">
        <div className="section-heading action-heading">
          <div><span className="section-kicker">Automatic answers</span><h2>Action board</h2><p>Buy, wait or protect—ranked from the same rules used in each stock view.</p></div>
          <span className="mode-label">{modeLabel}</span>
        </div>
        <div className="market-pulse-grid">
          <button type="button" className="pulse-card pulse-buy" onClick={() => { if (topBuy) setSelectedSymbol(topBuy.stock.symbol); setFilter("buy"); }}>
            <span>Top buy setup</span><strong>{topBuy?.stock.symbol ?? "None"}</strong><small>{topBuy ? `${topBuy.actions.newAction} · ${topBuy.analysis.score}/100` : "No confirmed setup"}</small>
          </button>
          <button type="button" className="pulse-card pulse-wait" onClick={() => { if (topWait) setSelectedSymbol(topWait.stock.symbol); setFilter("wait"); }}>
            <span>Best watch</span><strong>{topWait?.stock.symbol ?? "None"}</strong><small>{topWait ? `${topWait.actions.newAction} · ${topWait.analysis.score}/100` : "No wait candidates"}</small>
          </button>
          <button type="button" className="pulse-card pulse-risk" onClick={() => { if (topRisk) setSelectedSymbol(topRisk.stock.symbol); setFilter("risk"); }}>
            <span>Risk alert</span><strong>{topRisk?.stock.symbol ?? "None"}</strong><small>{topRisk ? `${topRisk.actions.ownAction} · ${topRisk.analysis.score}/100` : "No sell alerts"}</small>
          </button>
        </div>

        <div className="market-toolbar">
          <div className="watchlist-search-tools">
            <label className="stock-search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addWatchSymbol(); }} placeholder="Filter or enter a ticker" aria-label="Search stocks" />
            </label>
            <button type="button" className="add-symbol-button" onClick={addWatchSymbol}>+ Add ticker</button>
            <button type="button" className="remove-symbol-button" onClick={removeSelectedSymbol} disabled={watchlistSymbols.length <= 1}>Remove selected</button>
          </div>
          <div className="filter-row" role="group" aria-label="Filter action board">
            {filters.map((item) => <button type="button" key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.id === "all" ? `All ${trackedStocks.length}` : item.label}</button>)}
          </div>
        </div>
        {notificationMessage ? <div className="in-app-notice" role="status"><span>{notificationMessage}</span><button type="button" onClick={() => setNotificationMessage("")}>Dismiss</button></div> : null}

        <div className="market-table-wrap">
          <table className="market-table">
            <thead><tr><th>Stock</th><th>Market</th><th>If you don&apos;t own it</th><th>If you already own it</th><th>Score</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.stock.symbol} className={selectedSymbol === row.stock.symbol ? "selected" : ""} onClick={() => setSelectedSymbol(row.stock.symbol)}>
                  <td><button type="button" className="ticker-button" onClick={() => setSelectedSymbol(row.stock.symbol)}><strong>{row.stock.symbol}</strong><span>{row.stock.name}</span><small>{row.sector}</small></button></td>
                  <td><strong>${formatPrice(row.shown.price)}</strong><span className={row.shown.changePct >= 0 ? "change up" : "change down"}>{row.shown.changePct >= 0 ? "+" : ""}{row.shown.changePct.toFixed(2)}%</span></td>
                  <td><span className={`action-chip tone-${row.actions.tone}`}>{row.actions.newAction}</span>{row.blocked ? <small className="pause-reason" title={row.status.reason}>{row.status.label}</small> : null}</td>
                  <td><span className={`own-action tone-${row.actions.tone}`}>{row.actions.ownAction}</span></td>
                  <td>{row.blocked ? <span className="paused-score" aria-label="Score unavailable while signal paused">—</span> : <div className="table-score"><span style={{ width: `${row.analysis.score}%` }} /><strong>{row.analysis.score}</strong></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRows.length && <div className="empty-state">No stocks match this filter.</div>}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className={`panel market-panel tone-border-${analysis.tone}`}>
          <div className="market-panel-head">
            <div>
              <div className="ticker-line">
                <span className="ticker-badge">{selected.symbol.slice(0, 2)}</span>
                <div><h2>{selected.symbol}</h2><p>{selected.name} · {sectorFor(selected)} · {selected.currency}</p></div>
              </div>
              <div className="price-line"><strong>${formatPrice(selected.price)}</strong><span className={selected.changePct >= 0 ? "change up" : "change down"}>{selected.changePct >= 0 ? "+" : ""}{selected.changePct.toFixed(2)}%</span><span className="session-pill">{sessionLabel(selectedSession?.session)}</span></div>
            </div>
            <div className="chart-legend"><span><i className="legend-current" /> {selectedSession ? "Current session" : "Recent movement"}</span><span><i className="legend-support" /> Support ${formatPrice(selected.support[0])}</span></div>
          </div>
          <div className="session-grid" aria-label="US market session prices">
            <SessionCard
              label="Pre-market"
              price={selectedSession?.preMarketPrice}
              changePct={selectedSession?.preMarketChangePct}
              active={selectedSession?.session === "PRE-MARKET"}
              note="4:00–9:30am ET"
              status={selectedSession?.preMarketStatus ?? sessionFeedMessage}
              updated={selectedSession?.preMarketUpdated}
            />
            <SessionCard
              label="Regular"
              price={selectedSession?.regularMarketPrice ?? selectedQuote?.price}
              changePct={selectedSession?.regularMarketPrice && selectedSession.previousClose
                ? ((selectedSession.regularMarketPrice - selectedSession.previousClose) / selectedSession.previousClose) * 100
                : selectedQuote?.changePct}
              active={selectedSession?.session === "REGULAR"}
              note="9:30am–4:00pm ET"
              status={selectedSession ? "Latest regular-session quote" : "Daily fallback price"}
              updated={selectedSession?.updated ?? selectedQuote?.updated}
            />
            <SessionCard
              label="After-hours"
              price={selectedSession?.postMarketPrice}
              changePct={selectedSession?.postMarketChangePct}
              active={selectedSession?.session === "AFTER-HOURS"}
              note="4:00–8:00pm ET"
              status={selectedSession?.postMarketStatus ?? sessionFeedMessage}
              updated={selectedSession?.postMarketUpdated}
            />
            <SessionCard
              label="Overnight"
              price={selectedSession?.overnightPrice}
              active={selectedSession?.session === "OVERNIGHT"}
              note="8:00pm–4:00am ET · eligible stocks"
              status={selectedSession?.overnightStatus ?? "Licensed overnight feed required"}
              updated={selectedSession?.overnightUpdated}
            />
          </div>
          <div className="chart-toolbar">
            <div><span>Price chart</span><strong>{chartRange} view</strong></div>
            <div className="chart-range-tabs" role="group" aria-label="Choose chart period">
              {chartRanges.map((range) => (
                <button type="button" key={range} className={chartRange === range ? "active" : ""} onClick={() => setChartRange(range)}>{range}</button>
              ))}
            </div>
          </div>
          <div className={`chart-wrap tone-${analysis.tone}`}>
            <MiniChart values={chartValues} tone={analysis.tone} />
            <span className="chart-time start">{chartRange === "1D" ? "Today’s sessions" : `${chartRange} history`}</span><span className="chart-time end">As of {formatMarketTime(quoteUpdated)}</span>
          </div>
          <div className="metric-row">
            <div><span>20-day average</span><strong>${formatPrice(selected.sma20)}</strong></div>
            <div><span>50-day average</span><strong>${formatPrice(selected.sma50)}</strong></div>
            <div><span>RSI (14)</span><strong>{Number(selected.rsi).toFixed(1)}</strong></div>
            <div><span>Volatility</span><strong>{selected.volatility}</strong></div>
          </div>
          <div className="quote-details-heading">
            <div><span>Market data</span><strong>{selectedSession?.exchange ?? selectedQuote?.exchange ?? "US market"} · {selectedSession?.currency ?? selectedQuote?.currency ?? selected.currency}</strong></div>
            <div className={`feed-badge ${selectedQuoteStatus.blocked ? "stale" : ""}`}><i />{quoteProvider}<small>{selectedQuoteStatus.blocked ? selectedQuoteStatus.label : feedAge(quoteUpdated)}</small></div>
          </div>
          <div className="quote-details-grid">
            <div><span>Open</span><strong>{formatOptionalPrice(quoteOpen)}</strong></div>
            <div><span>Day range</span><strong>{formatOptionalPrice(quoteLow)} – {formatOptionalPrice(quoteHigh)}</strong></div>
            <div><span>Previous close</span><strong>{formatOptionalPrice(quotePreviousClose)}</strong></div>
            <div><span>Volume</span><strong>{formatCompactNumber(quoteVolume)}</strong></div>
            <div><span>Average volume (20D)</span><strong>{formatCompactNumber(selectedQuote?.averageVolume20)}</strong></div>
            <div><span>52-week range</span><strong>{formatOptionalPrice(selectedQuote?.week52Low)} – {formatOptionalPrice(selectedQuote?.week52High)}</strong></div>
            <div className="quote-detail-with-note"><span>Bid</span><strong>{formatOptionalPrice(selectedSession?.bidPrice)}</strong><small>{selectedSession?.bidAskStatus ?? "Licensed quote feed required"}</small></div>
            <div className="quote-detail-with-note"><span>Ask</span><strong>{formatOptionalPrice(selectedSession?.askPrice)}</strong><small>{selectedSession?.bidAskStatus ?? "Licensed quote feed required"}</small></div>
          </div>
        </article>

        <aside className={`panel signal-panel tone-border-${actions.tone}`}>
          <div className="signal-topline"><span className="section-kicker">Automatic answer</span><span className="explain-pill">{signalBlocked ? "Data guard active" : `Rule-based · ${analysis.verdict}`}</span></div>
          {signalBlocked ? <div className="data-guard" role="status"><strong>Signal paused · {guard.label}</strong><p>{signalBlockedReason} Check the broker quote before making a decision.</p></div> : null}
          <div className="dual-actions">
            <div className={`action-answer tone-border-${actions.tone}`}><span>If you don&apos;t own it</span><strong className={`tone-${actions.tone}`}>{actions.newAction}</strong></div>
            <div className={`action-answer tone-border-${selectedHoldingDecision?.tone ?? actions.tone}`}><span>{selectedHolding ? "Your holding instruction" : "If you already own it"}</span><strong className={`tone-${selectedHoldingDecision?.tone ?? actions.tone}`}>{selectedHoldingDecision?.label ?? actions.ownAction}</strong></div>
          </div>
          <div className="signal-score-row"><p>{actions.note}</p>{!signalBlocked ? <ScoreRing score={analysis.score} tone={actions.tone} /> : null}</div>
          <p className="signal-summary">{signalBlocked ? "No current setup score is issued while the required data is incomplete. Select the stock and use Refresh Now to retry." : analysis.summary}</p>
          <div className="decision-box positive-edge"><span>What confirms a buy</span><strong>{analysis.trigger}</strong></div>
          <div className="decision-box negative-edge"><span>What cancels the setup</span><strong>{analysis.invalidation}</strong></div>
          <p className="signal-note">The score measures rule agreement, not probability. The action updates with price, fundamentals, your cost basis and stop. Confirm the latest broker quote before acting.</p>
        </aside>
      </section>

      <section className="panel holdings-panel">
        <div className="section-heading holdings-heading">
          <div><span className="section-kicker">Saved portfolio</span><h2>My Holdings</h2><p>Enter what you actually bought. Stock Compass remembers it on this device and recalculates profit, stop distance and the holder action.</p></div>
          <span className="local-save-pill">Saved on this device</span>
        </div>
        <div className="portfolio-summary">
          <div><span>Positions</span><strong>{portfolioRows.length}</strong></div>
          <div><span>Current value</span><strong>${formatPrice(portfolioValue)}</strong><small>≈ RM {formatPrice(portfolioValue * fxRate)}</small></div>
          <div><span>Unrealised P/L</span><strong className={portfolioProfit >= 0 ? "up" : "down"}>{portfolioProfit >= 0 ? "+" : ""}${formatPrice(portfolioProfit)}</strong><small>≈ RM {formatPrice(portfolioProfit * fxRate)}</small></div>
          <div><span>Realised P/L + dividends</span><strong className={realisedProfit >= 0 ? "up" : "down"}>{realisedProfit >= 0 ? "+" : ""}${formatPrice(realisedProfit)}</strong><small>From transaction journal</small></div>
        </div>

        <div className="holdings-workspace">
          <form className="holding-editor" onSubmit={(event) => { event.preventDefault(); saveHolding(); }}>
            <div className="holding-editor-title"><div><span>Add or update</span><strong>{selected.symbol}</strong></div><small>Current ${formatPrice(selected.price)}</small></div>
            <div className="holding-form-grid">
              <label>Shares<input type="number" min="0.0001" step="any" value={holdingDraft.shares} onChange={(event) => setHoldingDrafts((drafts) => ({ ...drafts, [selectedSymbol]: { ...holdingDraft, shares: event.target.value } }))} placeholder="e.g. 5" /></label>
              <label>Average purchase price (USD)<input type="number" min="0.01" step="any" value={holdingDraft.averagePrice} onChange={(event) => setHoldingDrafts((drafts) => ({ ...drafts, [selectedSymbol]: { ...holdingDraft, averagePrice: event.target.value } }))} placeholder={formatPrice(selected.price)} /></label>
              <label>Your stop price (USD)<input type="number" min="0.01" step="any" value={holdingDraft.stopPrice} onChange={(event) => setHoldingDrafts((drafts) => ({ ...drafts, [selectedSymbol]: { ...holdingDraft, stopPrice: event.target.value } }))} placeholder={formatPrice(suggestedStop)} /></label>
            </div>
            <div className="holding-form-actions">
              <button type="submit">{selectedHolding ? "Update holding" : "Save holding"}</button>
              {selectedHolding ? <button type="button" className="remove-holding" onClick={() => removeHolding(selectedSymbol)}>Remove</button> : null}
              <span>{holdingMessage || `Suggested technical stop: $${formatPrice(suggestedStop)}`}</span>
            </div>
            {selectedHolding && selectedHoldingDecision ? (
              <div className={`holding-answer tone-${selectedHoldingDecision.tone}`}>
                <span>Your current instruction</span>
                <strong>{selectedHoldingDecision.label}</strong>
                <p>{selectedHoldingDecision.reason}</p>
                <div><span>Unrealised P/L</span><b className={selectedProfit >= 0 ? "up" : "down"}>{selectedProfit >= 0 ? "+" : ""}${formatPrice(selectedProfit)} · {selectedProfitPct >= 0 ? "+" : ""}{selectedProfitPct.toFixed(2)}%</b></div>
              </div>
            ) : null}
          </form>

          <div className="holdings-table-wrap">
            {portfolioRows.length ? (
              <table className="holdings-table">
                <thead><tr><th>Holding</th><th>Current</th><th>P/L</th><th>Stop</th><th>Instruction</th><th /></tr></thead>
                <tbody>
                  {portfolioRows.map((row) => (
                    <tr key={row.holding.symbol} className={selectedSymbol === row.holding.symbol ? "selected" : ""} onClick={() => setSelectedSymbol(row.holding.symbol)}>
                      <td><strong>{row.holding.symbol}</strong><span>{row.holding.shares} shares @ ${formatPrice(row.holding.averagePrice)}</span></td>
                      <td>${formatPrice(row.currentPrice)}</td>
                      <td className={row.profit >= 0 ? "up" : "down"}>{row.profit >= 0 ? "+" : ""}${formatPrice(row.profit)}<span>{row.profitPct >= 0 ? "+" : ""}{row.profitPct.toFixed(2)}%</span></td>
                      <td>${formatPrice(row.holding.stopPrice)}</td>
                      <td><span className={`holding-action-chip tone-${row.decision.tone}`}>{row.decision.label}</span></td>
                      <td><button type="button" aria-label={`Remove ${row.holding.symbol}`} onClick={(event) => { event.stopPropagation(); removeHolding(row.holding.symbol); }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="holdings-empty"><strong>No holdings saved yet</strong><p>Select a stock, enter your actual purchase details and save it here.</p></div>}
          </div>
        </div>
      </section>

      <section className="panel journal-panel">
        <div className="section-heading holdings-heading">
          <div><span className="section-kicker">Complete cost history</span><h2>Transaction journal</h2><p>Record every buy, partial sale, fee and dividend. Open shares and average cost are recalculated automatically.</p></div>
          <span className="local-save-pill">Device-saved journal</span>
        </div>
        <div className="journal-grid">
          <form className="journal-form" onSubmit={(event) => { event.preventDefault(); addTransaction(); }}>
            <div className="holding-editor-title"><div><span>New transaction</span><strong>{selectedSymbol}</strong></div><small>{selectedJournalPosition?.shares ? `${selectedJournalPosition.shares.toFixed(4)} open shares` : "No journal position"}</small></div>
            <div className="journal-form-grid">
              <label>Type<select value={transactionDraft.type} onChange={(event) => setTransactionDraft((current) => ({ ...current, type: event.target.value as TransactionType }))}><option>BUY</option><option>SELL</option><option>DIVIDEND</option></select></label>
              <label>Shares<input type="number" min="0" step="any" disabled={transactionDraft.type === "DIVIDEND"} value={transactionDraft.shares} onChange={(event) => setTransactionDraft((current) => ({ ...current, shares: event.target.value }))} placeholder="e.g. 5" /></label>
              <label>{transactionDraft.type === "DIVIDEND" ? "Dividend amount (USD)" : "Price per share (USD)"}<input type="number" min="0" step="any" value={transactionDraft.price} onChange={(event) => setTransactionDraft((current) => ({ ...current, price: event.target.value }))} placeholder={formatPrice(selected.price)} /></label>
              <label>Fee (USD)<input type="number" min="0" step="any" value={transactionDraft.fee} onChange={(event) => setTransactionDraft((current) => ({ ...current, fee: event.target.value }))} /></label>
              <label>Date<input type="date" value={transactionDraft.date} onChange={(event) => setTransactionDraft((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>Note<input value={transactionDraft.note} onChange={(event) => setTransactionDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Optional" /></label>
            </div>
            <button type="submit" className="primary-tool-button">Save transaction</button>
          </form>
          <div className="journal-table-wrap">
            {transactions.length ? (
              <table className="journal-table">
                <thead><tr><th>Date</th><th>Stock</th><th>Type</th><th>Shares</th><th>Price / amount</th><th>Fee</th><th /></tr></thead>
                <tbody>{[...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((transaction) => (
                  <tr key={transaction.id} onClick={() => setSelectedSymbol(transaction.symbol)}>
                    <td>{transaction.date}</td><td><strong>{transaction.symbol}</strong></td><td><span className={`transaction-type type-${transaction.type.toLowerCase()}`}>{transaction.type}</span></td><td>{transaction.type === "DIVIDEND" ? "—" : transaction.shares}</td><td>${formatPrice(transaction.price)}</td><td>${formatPrice(transaction.fee)}</td><td><button type="button" aria-label={`Delete ${transaction.type} transaction`} onClick={(event) => { event.stopPropagation(); removeTransaction(transaction.id); }}>×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="holdings-empty"><strong>No transactions recorded</strong><p>Add your first purchase to calculate a true cost basis and realised profit.</p></div>}
          </div>
        </div>
      </section>

      <section className="dashboard-grid lower-grid">
        <article className="panel checklist-panel">
          <div className="section-heading"><div><span className="section-kicker">Why this answer?</span><h2>Evidence checklist</h2></div><span className="score-text">{signalBlocked ? "Not scored" : `${analysis.score}/100 setup score`}</span></div>
          <div className="check-grid">
            {analysis.checks.map((check) => <div className="check-item" key={check.label}><span className={`status-dot tone-${check.tone}`} /><div><span>{check.label}</span><strong>{check.value}</strong><p>{check.detail}</p></div></div>)}
          </div>
        </article>

        <aside className="panel risk-panel">
          <div className="section-heading"><div><span className="section-kicker">Risk before reward</span><h2>RM position calculator</h2></div></div>
          <div className="form-grid">
            <label>Account size (RM)<input type="number" min="100" value={account} onChange={(event) => setAccount(Number(event.target.value))} /></label>
            <label>Risk per trade (%)<input type="number" min="0.1" max="5" step="0.1" value={riskPct} onChange={(event) => setRiskPct(Number(event.target.value))} /></label>
            <label>Entry (USD)<input type="number" value={selected.price} readOnly /></label>
            <label>USD/MYR rate<input type="number" min="1" step="0.01" value={fxRate} onChange={(event) => setFxRate(Number(event.target.value))} /></label>
          </div>
          <div className="risk-output">
            <div><span>Suggested stop reference</span><strong>${formatPrice(suggestedStop)}</strong></div>
            <div><span>Maximum loss</span><strong>RM {formatPrice(riskBudget)}</strong></div>
            <div className="primary-output"><span>Maximum whole shares</span><strong>{wholeShares}</strong></div>
            <div><span>Approx. position value</span><strong>RM {formatPrice(positionValue)}</strong></div>
          </div>
          <p className="calculator-note">Uses a stop 1% below first support. Adjust the FX rate and verify actual order fees in Moomoo.</p>
        </aside>
      </section>

      <section className="dashboard-grid lower-grid research-grid">
        <article className="panel fundamentals-panel">
          <div className="section-heading"><div><span className="section-kicker">Live business context</span><h2>Fundamentals & earnings</h2></div>{selectedFundamentals ? <span className={`confidence-pill confidence-${selectedFundamentals.confidence}`}>{selectedFundamentals.confidence} coverage</span> : null}</div>
          {selectedFundamentals ? (
            <>
              <div className="fundamentals-grid">
                <div><span>Market cap</span><strong>{formatCompactNumber(selectedFundamentals.marketCap)}</strong></div>
                <div><span>Trailing P/E</span><strong>{formatMetric(selectedFundamentals.trailingPE, "×")}</strong></div>
                <div><span>Forward P/E</span><strong>{formatMetric(selectedFundamentals.forwardPE, "×")}</strong></div>
                <div><span>Price / book</span><strong>{formatMetric(selectedFundamentals.priceToBook, "×")}</strong></div>
                <div><span>Revenue growth</span><strong className={(selectedFundamentals.revenueGrowthPct ?? 0) >= 0 ? "up" : "down"}>{formatMetric(selectedFundamentals.revenueGrowthPct, "%")}</strong></div>
                <div><span>EPS growth</span><strong className={(selectedFundamentals.epsGrowthPct ?? 0) >= 0 ? "up" : "down"}>{formatMetric(selectedFundamentals.epsGrowthPct, "%")}</strong></div>
                <div><span>Debt / equity (%)</span><strong>{formatMetric(selectedFundamentals.debtToEquity)}</strong></div>
                <div><span>Free cash flow</span><strong>{formatCompactNumber(selectedFundamentals.freeCashFlow)}</strong></div>
                <div><span>Dividend yield</span><strong>{formatMetric(selectedFundamentals.dividendYieldPct, "%")}</strong></div>
                <div><span>Next earnings</span><strong>{selectedFundamentals.earningsDate ?? "Not reported"}</strong></div>
              </div>
              <p className="data-source-note">{selectedFundamentals.provider} · refreshed {formatMarketTime(selectedFundamentals.updated)}{selectedFundamentals.asOfDate ? ` · Statements through ${selectedFundamentals.asOfDate}` : ""}. Unavailable fields remain blank. P/E uses the latest reported trailing EPS.</p>
            </>
          ) : <div className="research-empty"><strong>{fundamentalsErrors[selectedSymbol] ? "Fundamentals unavailable" : "Loading fundamentals…"}</strong><p>{fundamentalsErrors[selectedSymbol] || "Checking valuation, growth, debt, cash flow and earnings information."}</p></div>}
        </article>

        <aside className="panel backtest-panel">
          <div className="section-heading"><div><span className="section-kicker">Historical rule check</span><h2>Signal backtest</h2></div><button type="button" className="mini-action-button" onClick={() => void refreshBacktest(selectedSymbol, true)} disabled={researchLoading[selectedSymbol]}>{researchLoading[selectedSymbol] ? "Testing…" : "Run again"}</button></div>
          {selectedBacktest ? (
            <>
              <div className="backtest-primary">
                <div><span>Validation win rate</span><strong>{selectedBacktest.validation.winRate.toFixed(1)}%</strong><small>{selectedBacktest.validation.wins}/{selectedBacktest.validation.trades} trades won</small></div>
                <div><span>Average trade</span><strong className={selectedBacktest.validation.averageReturnPct >= 0 ? "up" : "down"}>{selectedBacktest.validation.averageReturnPct >= 0 ? "+" : ""}{selectedBacktest.validation.averageReturnPct.toFixed(2)}%</strong><small>After modelled costs</small></div>
              </div>
              <div className="backtest-metrics">
                <div><span>Profit factor</span><strong>{selectedBacktest.validation.profitFactor === null ? "No losses" : selectedBacktest.validation.profitFactor.toFixed(2)}</strong></div>
                <div><span>Max drawdown</span><strong className="down">{selectedBacktest.validation.maximumDrawdownPct.toFixed(2)}%</strong></div>
                <div><span>Compounded</span><strong>{selectedBacktest.validation.compoundedReturnPct.toFixed(2)}%</strong></div>
                <div><span>Sample quality</span><strong>{selectedBacktest.validation.sampleQuality}</strong></div>
              </div>
              <details className="methodology-details"><summary>Method and test period</summary><p>{selectedBacktest.methodology.entry}. Exit: {selectedBacktest.methodology.exit}. Costs: {selectedBacktest.methodology.costs}. Validation begins {selectedBacktest.period.validationStart}.</p></details>
              <p className="backtest-warning">Historical and hypothetical—not a future success probability. A sample below 20 trades is insufficient.</p>
            </>
          ) : <div className="research-empty"><strong>{backtestErrors[selectedSymbol] ? "Backtest unavailable" : "Running historical test…"}</strong><p>{backtestErrors[selectedSymbol] || "Testing the current entry, stop and 2R rules on up to five years of daily prices."}</p></div>}
        </aside>
      </section>

      <section className="dashboard-grid lower-grid tools-grid">
        <article className="panel exit-panel">
          <div className="section-heading"><div><span className="section-kicker">Plan the exit before entry</span><h2>Advanced exit planner</h2></div><span className={`action-chip tone-${exitPlan.action.includes("STOP") ? "negative" : exitPlan.action.includes("PROFIT") || exitPlan.action.includes("SELL PART") ? "positive" : "neutral"}`}>{signalBlocked ? "PLAN ONLY" : exitPlan.action}</span></div>
          <p className="panel-intro">Calculated from {selectedHolding ? `your $${formatPrice(selectedHolding.averagePrice)} average cost` : "the current reference price"}, technical support and a two-to-one reward target.</p>
          <div className="exit-levels">
            <div className="exit-stop"><span>Stop / invalidation</span><strong>${formatPrice(exitPlan.stop)}</strong><small>Maximum planned loss level</small></div>
            <div><span>Target 1 · 1R</span><strong>${formatPrice(exitPlan.target1)}</strong><small>Consider selling part</small></div>
            <div className="exit-target"><span>Target 2 · 2R</span><strong>${formatPrice(exitPlan.target2)}</strong><small>Primary reward objective</small></div>
            <div><span>Trailing stop</span><strong>${formatPrice(exitPlan.trailingStop)}</strong><small>Raises as the trade progresses</small></div>
          </div>
          <div className="exit-guidance"><strong>{signalBlocked ? "No live exit instruction" : exitPlan.action}</strong><p>{signalBlocked ? signalBlockedReason : exitPlan.reason}</p><span>Planned risk per share: ${formatPrice(exitPlan.riskPerShare)}</span></div>
        </article>

        <aside className="panel alerts-panel">
          <div className="section-heading"><div><span className="section-kicker">While this page is open</span><h2>Price alerts</h2></div><span className="score-text">{alerts.filter((alert) => alert.enabled).length} active</span></div>
          <form className="alert-form" onSubmit={(event) => { event.preventDefault(); addPriceAlert(); }}>
            <label>Condition<select value={alertDraft.direction} onChange={(event) => setAlertDraft((current) => ({ ...current, direction: event.target.value as "ABOVE" | "BELOW" }))}><option value="ABOVE">Price moves above</option><option value="BELOW">Price moves below</option></select></label>
            <label>Target price (USD)<input type="number" min="0.01" step="any" value={alertDraft.target} onChange={(event) => setAlertDraft((current) => ({ ...current, target: event.target.value }))} placeholder={formatPrice(selected.price)} /></label>
            <button type="submit" className="primary-tool-button">Set {selectedSymbol} alert</button>
          </form>
          <div className="alert-list">
            {alerts.length ? alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} className={alert.triggeredAt ? "triggered" : ""}>
                <button type="button" className="alert-symbol" onClick={() => setSelectedSymbol(alert.symbol)}>{alert.symbol}</button>
                <span>{alert.direction === "ABOVE" ? "≥" : "≤"} ${formatPrice(alert.target)}</span>
                <small>{alert.triggeredAt ? `Triggered ${formatMarketTime(alert.triggeredAt)}` : "Watching while open"}</small>
                <button type="button" aria-label={`Remove ${alert.symbol} alert`} onClick={() => setAlerts((current) => current.filter((candidate) => candidate.id !== alert.id))}>×</button>
              </div>
            )) : <div className="alerts-empty">No price alerts yet.</div>}
          </div>
          <p className="calculator-note">Browser alerts work while Stock Compass is open. True background push alerts require an account and notification service.</p>
        </aside>
      </section>

      <section className="dashboard-grid lower-grid news-grid">
        <article className="panel news-panel">
          <div className="section-heading news-heading">
            <div><span className="section-kicker">News impact engine</span><h2>What could move {selected.symbol}</h2></div>
            <div className={`news-summary tone-${newsSummary.tone}`}><span>Combined effect</span><strong>{newsSummary.label}</strong><small>{newsSummary.direct} direct headline{newsSummary.direct === 1 ? "" : "s"}</small></div>
          </div>
          <p className="news-explainer">Direct = linked to the selected company. Indirect = sector or macro exposure. Event type, direction and confidence are explainable estimates—not verified price predictions.</p>
          <div className="news-list">
            {displayedNews.map((rawItem) => {
              const item = normalizeNews(rawItem);
              return (
                <a href={item.url} target="_blank" rel="noreferrer" className="news-item" key={`${item.title}-${item.relationship}`}>
                  <span className={`news-tone tone-${item.tone}`} />
                  <div className="news-copy">
                    <div className="news-badges"><span className={`impact-pill impact-${item.effect}`}>{item.effect}</span><span className={`relation-pill relation-${item.relationship}`}>{item.relationship}</span><span className="strength-pill">{item.strength} impact</span><span className="event-pill">{item.eventType}</span><span className="confidence-news-pill">{item.confidence}% confidence</span></div>
                    <strong>{item.title}</strong>
                    <span>{item.source} · {item.age}</span>
                    <p>{item.why}</p>
                  </div>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
                </a>
              );
            })}
            {!displayedNews.length ? <div className="research-empty"><strong>Current headlines unavailable or loading</strong><p>News impact remains excluded until relevant headlines are available.</p></div> : null}
          </div>
        </article>

        <aside className="panel learn-panel">
          <div className="section-heading"><div><span className="section-kicker">Learn as you analyse</span><h2>Read the signal correctly</h2></div></div>
          <div className="lesson-list">
            <details open><summary><span>01</span> Why there are two actions</summary><p>A new buyer needs a good entry. An existing holder also has unrealised profit, cost basis and a stop to protect—so the answer can differ.</p></details>
            <details><summary><span>02</span> Direct versus indirect news</summary><p>Earnings and contracts are direct. Rates, chip demand and regulation can be indirect but still powerful, especially across an entire sector.</p></details>
            <details><summary><span>03</span> “Buy” still needs a stop</summary><p>A strong score means the checklist agrees now. It does not remove uncertainty; position size and invalidation control the damage when it is wrong.</p></details>
            <details><summary><span>04</span> Why “oversold” is not “buy”</summary><p>A low RSI shows weak recent momentum. Price can stay weak, so combine it with support and a confirmed reversal.</p></details>
          </div>
        </aside>
      </section>

      <section className="callout">
        <div className="callout-icon" aria-hidden="true">!</div>
        <div><strong>Decision support with automatic data guard</strong><p>Current provider: {providerMode}. Stock Compass pauses actionable signals when required data is stale or incomplete. Prices can still differ by venue and licence, so confirm the final quote with your broker.</p></div>
        <span>{distanceToSupport.toFixed(1)}% above first support</span>
      </section>

      <footer><span>Stock Compass · Educational market dashboard</span><span>{Object.keys(quotes).length ? `${Object.keys(quotes).length} symbols · ${providerMode} · selected quote refreshes every 60s` : "Snapshot fallback active"}</span></footer>
    </main>
  );
}
