import { quoteFreshness, isTradingDate, regularClose } from "../../lib/market-freshness";
const symbolMap: Record<string, { yahoo: string; stooq: string }> = {
  SKHY: { yahoo: "SKHY", stooq: "skhy.us" },
  SNDK: { yahoo: "SNDK", stooq: "sndk.us" },
  QQQ: { yahoo: "QQQ", stooq: "qqq.us" },
  NVDA: { yahoo: "NVDA", stooq: "nvda.us" },
  MSFT: { yahoo: "MSFT", stooq: "msft.us" },
  "BRK.B": { yahoo: "BRK-B", stooq: "brk-b.us" },
  AAPL: { yahoo: "AAPL", stooq: "aapl.us" },
  GOOGL: { yahoo: "GOOGL", stooq: "googl.us" },
  AMZN: { yahoo: "AMZN", stooq: "amzn.us" },
  META: { yahoo: "META", stooq: "meta.us" },
  TSLA: { yahoo: "TSLA", stooq: "tsla.us" },
  AMD: { yahoo: "AMD", stooq: "amd.us" },
  TSM: { yahoo: "TSM", stooq: "tsm.us" },
  MU: { yahoo: "MU", stooq: "mu.us" },
  PLTR: { yahoo: "PLTR", stooq: "pltr.us" },
  JPM: { yahoo: "JPM", stooq: "jpm.us" },
  V: { yahoo: "V", stooq: "v.us" },
  WMT: { yahoo: "WMT", stooq: "wmt.us" },
  JNJ: { yahoo: "JNJ", stooq: "jnj.us" },
  VOO: { yahoo: "VOO", stooq: "voo.us" },
};

const symbolPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;

function mappedSymbol(symbol: string) {
  return symbolMap[symbol] ?? {
    yahoo: symbol.replaceAll(".", "-"),
    stooq: `${symbol.toLowerCase().replaceAll(".", "-")}.us`,
  };
}

type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type MarketSession = "PRE-MARKET" | "REGULAR" | "AFTER-HOURS" | "OVERNIGHT" | "CLOSED";
type YahooPeriod = { start: number; end: number };
type PointSession = "pre" | "regular" | "post" | "overnight" | "closed";
type MarketPoint = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dateKey: string;
  session: PointSession;
};

type YahooResult = {
  meta: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketOpen?: number;
    regularMarketVolume?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    currency?: string;
    exchangeName?: string;
    fullExchangeName?: string;
    hasPrePostMarketData?: boolean;
    currentTradingPeriod?: { pre?: YahooPeriod; regular?: YahooPeriod; post?: YahooPeriod };
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function rsi(closes: number[], period = 14) {
  if (closes.length <= period) return null;
  const sample = closes.slice(-period - 1);
  const changes = sample.slice(1).map((close, index) => close - sample[index]);
  const averageGain = average(changes.map((change) => Math.max(change, 0)));
  const averageLoss = average(changes.map((change) => Math.max(-change, 0)));
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sampled(values: number[], maximumPoints: number) {
  if (values.length <= maximumPoints) return values;
  const step = (values.length - 1) / (maximumPoints - 1);
  return Array.from({ length: maximumPoints }, (_, index) => values[Math.round(index * step)]);
}

const newYorkClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function marketClock(timestampMs = Date.now()) {
  const parts = newYorkClock.formatToParts(new Date(timestampMs));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: value.weekday,
    dateKey: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

function classifySession(weekday: string, minutes: number): MarketSession {
  const weekdayOpen = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);

  if (weekdayOpen && minutes >= 240 && minutes < 570) return "PRE-MARKET";
  if (weekdayOpen && minutes >= 570 && minutes < 960) return "REGULAR";
  if (weekdayOpen && minutes >= 960 && minutes < 1200) return "AFTER-HOURS";
  const overnight =
    (weekday === "Sun" && minutes >= 1200) ||
    (["Mon", "Tue", "Wed", "Thu"].includes(weekday) && (minutes >= 1200 || minutes < 240)) ||
    (weekday === "Fri" && minutes < 240);
  return overnight ? "OVERNIGHT" : "CLOSED";
}

function sessionNow(): MarketSession {
  const clock = marketClock();
  if (!isTradingDate(clock.dateKey)) return "CLOSED";
  if (regularClose(clock.dateKey) === 780 && clock.minutes >= 780 && clock.minutes < 1020) return "AFTER-HOURS";
  if (regularClose(clock.dateKey) === 780 && clock.minutes >= 1020) return "CLOSED";
  return classifySession(clock.weekday, clock.minutes);
}

function pointSession(weekday: string, minutes: number): MarketPoint["session"] {
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) return "closed";
  if (minutes >= 240 && minutes < 570) return "pre";
  if (minutes >= 570 && minutes < 960) return "regular";
  if (minutes >= 960 && minutes < 1200) return "post";
  if (minutes >= 1200 || minutes < 240) return "overnight";
  return "closed";
}

function latestSessionPoint(points: MarketPoint[], session: PointSession, preferredDate?: string) {
  const matching = points.filter((point) => point.session === session);
  if (preferredDate) {
    const currentDay = matching.filter((point) => point.dateKey === preferredDate).at(-1);
    if (currentDay) return currentDay;
  }
  return matching.at(-1) ?? null;
}

function extendedStatus(
  session: "pre" | "post",
  point: MarketPoint | null,
  today: string,
  currentSession: MarketSession,
  feedSupportsExtendedHours: boolean,
) {
  const active = session === "pre" ? currentSession === "PRE-MARKET" : currentSession === "AFTER-HOURS";
  if (point) {
    if (point.dateKey === today && active) return "Live public-feed trade";
    if (point.dateKey === today) return "Today’s last reported trade";
    return "Last available extended-hours trade";
  }
  if (!feedSupportsExtendedHours) return "Extended-hours feed not supported";
  if (active) return `No ${session === "pre" ? "pre-market" : "after-hours"} trade reported yet`;
  return "No recent extended-hours trade reported";
}

const yahooCache = new Map<string, { expiresAt: number; result: YahooResult }>();

async function fetchYahooResult(mapped: string, query: string, intraday: boolean) {
  const cacheKey = `${mapped}:${query}`;
  const cached = yahooCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  let lastError = "Public quote feed unavailable";
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(mapped)}?${query}`, {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockCompass/3.1 educational-dashboard" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        lastError = `Public quote feed returned ${response.status}`;
        continue;
      }
      const payload = await response.json() as { chart?: { result?: YahooResult[]; error?: { description?: string } } };
      const result = payload.chart?.result?.[0];
      if (!result) {
        lastError = payload.chart?.error?.description ?? "Public quote feed returned no chart";
        continue;
      }
      yahooCache.set(cacheKey, {
        expiresAt: Date.now() + (intraday ? 25_000 : 240_000),
        result,
      });
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function loadYahoo(symbol: string, intraday: boolean) {
  const mapped = mappedSymbol(symbol).yahoo;
  const query = intraday
    ? "range=5d&interval=5m&includePrePost=true&events=div%2Csplits"
    : "range=1y&interval=1d&includePrePost=false&events=div%2Csplits";
  const result = await fetchYahooResult(mapped, query, intraday);
  const raw = result?.indicators?.quote?.[0];
  if (!result || !raw || !result.timestamp?.length) return null;

  const points: MarketPoint[] = result.timestamp.flatMap((timestamp, index) => {
    const close = raw.close?.[index];
    if (!validNumber(close)) return [];
    const clock = marketClock(timestamp * 1000);
    const open = raw.open?.[index];
    const high = raw.high?.[index];
    const low = raw.low?.[index];
    const volume = raw.volume?.[index];
    return [{
      timestamp,
      open: validNumber(open) ? open : close,
      high: validNumber(high) ? high : close,
      low: validNumber(low) ? low : close,
      close,
      volume: validNumber(volume) ? volume : 0,
      dateKey: clock.dateKey,
      session: pointSession(clock.weekday, clock.minutes),
    }];
  });
  if (points.length < (intraday ? 2 : 20)) return null;

  if (intraday) {
    const nowClock = marketClock();
    const currentSession = sessionNow();
    const prePoint = latestSessionPoint(points, "pre", nowClock.dateKey);
    const regularPoint = latestSessionPoint(points, "regular", nowClock.dateKey);
    const postPoint = latestSessionPoint(points, "post", nowClock.dateKey);
    const preMarketPrice = prePoint?.close ?? null;
    const postMarketPrice = postPoint?.close ?? null;
    const regularMarketPrice = validNumber(result.meta.regularMarketPrice)
      ? result.meta.regularMarketPrice
      : regularPoint?.close ?? latestSessionPoint(points, "regular")?.close ?? null;
    const previousClose = validNumber(result.meta.previousClose)
      ? result.meta.previousClose
      : validNumber(result.meta.chartPreviousClose) ? result.meta.chartPreviousClose : points[0].close;
    const latest = points.at(-1)!;
    const currentPre = prePoint?.dateKey === nowClock.dateKey ? prePoint : null;
    const currentPost = postPoint?.dateKey === nowClock.dateKey ? postPoint : null;
    const outsideSession = currentSession === "OVERNIGHT" || currentSession === "CLOSED";
    const lastExtended = outsideSession && latest.timestamp > (result.meta.regularMarketTime ?? 0) ? latest : null;
    const currentPrice = lastExtended ? lastExtended.close : currentSession === "PRE-MARKET" && currentPre
      ? currentPre.close
      : currentSession === "AFTER-HOURS" && currentPost
        ? currentPost.close
        : regularMarketPrice ?? latest.close;
    const currentTimestamp = lastExtended ? lastExtended.timestamp : currentSession === "PRE-MARKET" && currentPre
      ? currentPre.timestamp
      : currentSession === "AFTER-HOURS" && currentPost
        ? currentPost.timestamp
        : result.meta.regularMarketTime ?? regularPoint?.timestamp ?? latest.timestamp;
    const chartDate = points.findLast((point) => point.dateKey === nowClock.dateKey)?.dateKey ?? latest.dateKey;
    const currentPeriod = points.filter((point) => point.dateKey === chartDate && point.session !== "overnight" && point.session !== "closed");
    const currentRegularPeriod = points.filter((point) => point.dateKey === chartDate && point.session === "regular");
    const feedSupportsExtendedHours = Boolean(result.meta.hasPrePostMarketData) || Boolean(prePoint || postPoint);
    const dayOpen = validNumber(result.meta.regularMarketOpen)
      ? result.meta.regularMarketOpen
      : currentRegularPeriod[0]?.open ?? null;
    const dayHigh = validNumber(result.meta.regularMarketDayHigh)
      ? result.meta.regularMarketDayHigh
      : currentRegularPeriod.length ? Math.max(...currentRegularPeriod.map((point) => point.high)) : null;
    const dayLow = validNumber(result.meta.regularMarketDayLow)
      ? result.meta.regularMarketDayLow
      : currentRegularPeriod.length ? Math.min(...currentRegularPeriod.map((point) => point.low)) : null;
    const dayVolume = validNumber(result.meta.regularMarketVolume)
      ? result.meta.regularMarketVolume
      : currentRegularPeriod.reduce((sum, point) => sum + point.volume, 0);
    const allFiveDayPrices = points
      .filter((point) => point.session !== "closed")
      .map((point) => point.close);

    const updated = new Date(currentTimestamp * 1000).toISOString();
    return {
      symbol,
      kind: "session",
      price: currentPrice,
      changePct: ((currentPrice - previousClose) / previousClose) * 100,
      previousClose,
      openPrice: dayOpen,
      dayHigh,
      dayLow,
      volume: dayVolume || null,
      bidPrice: null,
      askPrice: null,
      bidAskStatus: "Bid/ask requires a licensed real-time quote feed",
      regularMarketPrice,
      preMarketPrice,
      preMarketChangePct: currentPre && previousClose ? ((currentPre.close - previousClose) / previousClose) * 100 : null,
      preMarketUpdated: prePoint ? new Date(prePoint.timestamp * 1000).toISOString() : null,
      preMarketStatus: extendedStatus("pre", prePoint, nowClock.dateKey, currentSession, feedSupportsExtendedHours),
      postMarketPrice,
      postMarketChangePct: currentPost && regularMarketPrice ? ((currentPost.close - regularMarketPrice) / regularMarketPrice) * 100 : null,
      postMarketUpdated: postPoint ? new Date(postPoint.timestamp * 1000).toISOString() : null,
      postMarketStatus: extendedStatus("post", postPoint, nowClock.dateKey, currentSession, feedSupportsExtendedHours),
      overnightPrice: null,
      overnightStatus: "A licensed overnight feed is required",
      overnightUpdated: null,
      session: currentSession,
      intradayHistory: (currentPeriod.length >= 2 ? currentPeriod : points.slice(-96)).map((point) => point.close),
      intradayHistory5d: sampled(allFiveDayPrices, 180),
      updated,
      provider: "Public intraday market feed",
      feedType: "near-live",
      currency: result.meta.currency ?? "USD",
      exchange: result.meta.fullExchangeName ?? result.meta.exchangeName ?? "US market",
      hasExtendedHours: feedSupportsExtendedHours,
      overnightAvailable: false,
      ...quoteFreshness(updated, currentSession, feedSupportsExtendedHours ? "extended" : "regular"),
    };
  }

  const bars = result.timestamp.flatMap((timestamp, index) => {
    const close = raw.close?.[index];
    const high = raw.high?.[index];
    const low = raw.low?.[index];
    const open = raw.open?.[index];
    const volume = raw.volume?.[index];
    return validNumber(close) && validNumber(high) && validNumber(low)
      ? [{ timestamp, close, high, low, open: validNumber(open) ? open : close, volume: validNumber(volume) ? volume : 0 }]
      : [];
  });
  if (bars.length < 20) return null;
  const annual = bars.slice(-252);
  const closes = annual.map((bar) => bar.close);
  const latest = annual.at(-1)!;
  const previous = annual.at(-2)!;
  const marketPrice = validNumber(result.meta.regularMarketPrice) ? result.meta.regularMarketPrice : latest.close;
  const last10 = annual.slice(-10);
  const last20 = annual.slice(-20);
  const averageVolume20 = average(last20.map((bar) => bar.volume));
  const updated = new Date((result.meta.regularMarketTime ?? latest.timestamp) * 1000).toISOString();

  return {
    symbol,
    kind: "daily",
    price: marketPrice,
    changePct: ((marketPrice - previous.close) / previous.close) * 100,
    open: validNumber(result.meta.regularMarketOpen) ? result.meta.regularMarketOpen : latest.open,
    previousClose: previous.close,
    high: validNumber(result.meta.regularMarketDayHigh) ? result.meta.regularMarketDayHigh : latest.high,
    low: validNumber(result.meta.regularMarketDayLow) ? result.meta.regularMarketDayLow : latest.low,
    volume: validNumber(result.meta.regularMarketVolume) ? result.meta.regularMarketVolume : latest.volume,
    averageVolume20,
    week52High: Math.max(...annual.map((bar) => bar.high)),
    week52Low: Math.min(...annual.map((bar) => bar.low)),
    history: annual.slice(-24).map((bar) => bar.close),
    historyBars: annual.length,
    historyUpdated: new Date(latest.timestamp * 1000).toISOString(),
    historyByPeriod: {
      "1M": annual.slice(-22).map((bar) => bar.close),
      "3M": sampled(annual.slice(-66).map((bar) => bar.close), 80),
      "6M": sampled(annual.slice(-132).map((bar) => bar.close), 100),
      "1Y": sampled(annual.map((bar) => bar.close), 140),
    },
    sma20: average(closes.slice(-20)),
    sma50: average(closes.slice(-50)),
    rsi: rsi(closes),
    support: [Math.min(...last10.map((bar) => bar.low)), Math.min(...last20.map((bar) => bar.low))],
    resistance: [Math.max(...last10.map((bar) => bar.high)), Math.max(...last20.map((bar) => bar.high))],
    updated,
    source: "Public daily market feed",
    provider: "Public market feed",
    feedType: "near-live",
    currency: result.meta.currency ?? "USD",
    exchange: result.meta.fullExchangeName ?? result.meta.exchangeName ?? "US market",
    ...quoteFreshness(updated, sessionNow()),
  };
}

function parseCsv(csv: string): Bar[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 3 || !lines[0].toLowerCase().includes("date")) return [];
  return lines.slice(1).flatMap((line) => {
    const [date, open, high, low, close, volume] = line.split(",");
    const bar = { date, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) };
    return Object.values(bar).some((value) => typeof value === "number" && !Number.isFinite(value)) ? [] : [bar];
  });
}

async function loadStooq(symbol: string) {
  const stooqSymbol = mappedSymbol(symbol).stooq;
  const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`, {
    headers: { "user-agent": "StockCompass/3.0 educational-dashboard" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const bars = parseCsv(await response.text());
  if (bars.length < 55) return null;
  const annual = bars.slice(-252);
  const closes = annual.map((bar) => bar.close);
  const latest = annual.at(-1)!;
  const previous = annual.at(-2)!;
  const last10 = annual.slice(-10);
  const last20 = annual.slice(-20);
  const updated = new Date(`${latest.date}T21:00:00Z`).toISOString();
  return {
    symbol,
    kind: "daily",
    price: latest.close,
    changePct: ((latest.close - previous.close) / previous.close) * 100,
    open: latest.open,
    previousClose: previous.close,
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
    averageVolume20: average(last20.map((bar) => bar.volume)),
    week52High: Math.max(...annual.map((bar) => bar.high)),
    week52Low: Math.min(...annual.map((bar) => bar.low)),
    history: annual.slice(-24).map((bar) => bar.close),
    historyBars: annual.length,
    historyUpdated: updated,
    historyByPeriod: {
      "1M": annual.slice(-22).map((bar) => bar.close),
      "3M": sampled(annual.slice(-66).map((bar) => bar.close), 80),
      "6M": sampled(annual.slice(-132).map((bar) => bar.close), 100),
      "1Y": sampled(annual.map((bar) => bar.close), 140),
    },
    sma20: average(closes.slice(-20)),
    sma50: average(closes.slice(-50)),
    rsi: rsi(closes),
    support: [Math.min(...last10.map((bar) => bar.low)), Math.min(...last20.map((bar) => bar.low))],
    resistance: [Math.max(...last10.map((bar) => bar.high)), Math.max(...last20.map((bar) => bar.high))],
    updated,
    source: "Stooq end-of-day fallback",
    provider: "Stooq",
    feedType: "end-of-day",
    currency: "USD",
    exchange: "US market",
    ...quoteFreshness(updated, sessionNow(), "daily"),
  };
}

type AlpacaBar = { t: string; o: number; h: number; l: number; c: number; v: number };
type AlpacaTrade = { t: string; p: number };
type AlpacaQuote = { t: string; bp: number; ap: number };
type AlpacaSnapshot = {
  latestTrade?: AlpacaTrade;
  latestQuote?: AlpacaQuote;
  minuteBar?: AlpacaBar;
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
};

function alpacaCredentials() {
  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();
  return key && secret ? { key, secret, feed: process.env.ALPACA_DATA_FEED?.trim() || "iex" } : null;
}

async function alpacaFetch(path: string) {
  const credentials = alpacaCredentials();
  if (!credentials) return null;
  const response = await fetch(`https://data.alpaca.markets${path}`, {
    headers: {
      accept: "application/json",
      "APCA-API-KEY-ID": credentials.key,
      "APCA-API-SECRET-KEY": credentials.secret,
    },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`Licensed market feed returned ${response.status}`);
  return response.json();
}

async function loadAlpacaSession(symbol: string) {
  const credentials = alpacaCredentials();
  if (!credentials) return null;
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const encodedSymbol = encodeURIComponent(symbol);
  const [snapshotPayload, barsPayload] = await Promise.all([
    alpacaFetch(`/v2/stocks/${encodedSymbol}/snapshot?feed=${encodeURIComponent(credentials.feed)}`) as Promise<AlpacaSnapshot | null>,
    alpacaFetch(`/v2/stocks/${encodedSymbol}/bars?timeframe=5Min&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&limit=1000&adjustment=all&feed=${encodeURIComponent(credentials.feed)}`) as Promise<{ bars?: AlpacaBar[] } | null>,
  ]);
  if (!snapshotPayload) return null;

  const bars = barsPayload?.bars ?? [];
  const points: MarketPoint[] = bars.flatMap((bar) => {
    if (!validNumber(bar.c)) return [];
    const timestamp = Math.floor(new Date(bar.t).getTime() / 1000);
    const clock = marketClock(timestamp * 1000);
    return [{
      timestamp,
      open: validNumber(bar.o) ? bar.o : bar.c,
      high: validNumber(bar.h) ? bar.h : bar.c,
      low: validNumber(bar.l) ? bar.l : bar.c,
      close: bar.c,
      volume: validNumber(bar.v) ? bar.v : 0,
      dateKey: clock.dateKey,
      session: pointSession(clock.weekday, clock.minutes),
    }];
  });
  const nowClock = marketClock();
  const currentSession = sessionNow();
  const prePoint = latestSessionPoint(points, "pre", nowClock.dateKey);
  const regularPoint = latestSessionPoint(points, "regular", nowClock.dateKey);
  const postPoint = latestSessionPoint(points, "post", nowClock.dateKey);
  const overnightPoint = latestSessionPoint(points, "overnight", nowClock.dateKey);
  const latestTradePrice = snapshotPayload.latestTrade?.p;
  const latestBar = points.at(-1);
  const previousClose = snapshotPayload.prevDailyBar?.c;
  if (!validNumber(latestTradePrice) && !latestBar) return null;
  const price = validNumber(latestTradePrice) ? latestTradePrice : latestBar!.close;
  const baseline = validNumber(previousClose) ? previousClose : price;
  const regularMarketPrice = snapshotPayload.dailyBar?.c ?? regularPoint?.close ?? null;
  const updated = snapshotPayload.latestTrade?.t ?? snapshotPayload.minuteBar?.t ?? new Date((latestBar?.timestamp ?? Date.now() / 1000) * 1000).toISOString();
  const currentPeriod = points.filter((point) => point.dateKey === (latestBar?.dateKey ?? nowClock.dateKey) && point.session !== "closed");
  const statusFor = (label: string, point: MarketPoint | null, active: boolean) => point
    ? `${active ? "Live" : "Latest"} licensed-feed ${label} trade`
    : active ? `No ${label} trade reported yet` : `No recent ${label} trade reported`;

  return {
    symbol,
    kind: "session",
    price,
    changePct: baseline ? ((price - baseline) / baseline) * 100 : 0,
    previousClose: baseline,
    openPrice: snapshotPayload.dailyBar?.o ?? regularPoint?.open ?? null,
    dayHigh: snapshotPayload.dailyBar?.h ?? null,
    dayLow: snapshotPayload.dailyBar?.l ?? null,
    volume: snapshotPayload.dailyBar?.v ?? null,
    bidPrice: snapshotPayload.latestQuote?.bp ?? null,
    askPrice: snapshotPayload.latestQuote?.ap ?? null,
    bidAskStatus: snapshotPayload.latestQuote ? "Latest licensed-feed quote" : "No quote reported",
    regularMarketPrice,
    preMarketPrice: prePoint?.close ?? null,
    preMarketChangePct: prePoint && baseline ? ((prePoint.close - baseline) / baseline) * 100 : null,
    preMarketUpdated: prePoint ? new Date(prePoint.timestamp * 1000).toISOString() : null,
    preMarketStatus: statusFor("pre-market", prePoint, currentSession === "PRE-MARKET"),
    postMarketPrice: postPoint?.close ?? null,
    postMarketChangePct: postPoint && regularMarketPrice ? ((postPoint.close - regularMarketPrice) / regularMarketPrice) * 100 : null,
    postMarketUpdated: postPoint ? new Date(postPoint.timestamp * 1000).toISOString() : null,
    postMarketStatus: statusFor("after-hours", postPoint, currentSession === "AFTER-HOURS"),
    overnightPrice: overnightPoint?.close ?? null,
    overnightStatus: statusFor("overnight", overnightPoint, currentSession === "OVERNIGHT"),
    overnightUpdated: overnightPoint ? new Date(overnightPoint.timestamp * 1000).toISOString() : null,
    session: currentSession,
    intradayHistory: (currentPeriod.length >= 2 ? currentPeriod : points.slice(-96)).map((point) => point.close),
    intradayHistory5d: sampled(points.map((point) => point.close), 180),
    updated,
    provider: `Alpaca ${credentials.feed.toUpperCase()} feed`,
    feedType: "near-live",
    currency: "USD",
    exchange: credentials.feed === "iex" ? "IEX market feed" : "US consolidated feed",
    hasExtendedHours: Boolean(prePoint || postPoint),
    overnightAvailable: Boolean(overnightPoint),
    ...quoteFreshness(updated, currentSession, overnightPoint ? "overnight" : "extended"),
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intraday = url.searchParams.get("intraday") === "1";
  const requested = (url.searchParams.get("symbols") ?? "SKHY,SNDK,QQQ,NVDA,MSFT,BRK.B")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbolPattern.test(symbol))
    .slice(0, intraday ? 1 : 40);

  const results = await mapWithConcurrency(requested, intraday ? 1 : 4, async (symbol) => {
    let unavailableReason = "No usable quote was returned";
    if (intraday && alpacaCredentials()) {
      try {
        const licensedQuote = await loadAlpacaSession(symbol);
        if (licensedQuote) return { symbol, quote: licensedQuote, unavailableReason: null };
      } catch (error) {
        unavailableReason = error instanceof Error ? error.message : "Licensed market feed unavailable";
      }
    }
    try {
      const quote = await loadYahoo(symbol, intraday);
      if (quote) return { symbol, quote, unavailableReason: null };
    } catch (error) {
      unavailableReason = error instanceof Error ? error.message : "Public quote feed unavailable";
    }
    if (!intraday) {
      try {
        const fallback = await loadStooq(symbol);
        if (fallback) return { symbol, quote: fallback, unavailableReason: null };
      } catch {
        unavailableReason = "Both public market feeds are temporarily unavailable";
      }
    }
    if (intraday) console.warn(`[market-feed] ${symbol}: ${unavailableReason}`);
    return { symbol, quote: null, unavailableReason };
  });
  const quotes = results.flatMap((result) => result.quote ? [result.quote] : []);
  const unavailableReasons = Object.fromEntries(
    results.filter((result) => !result.quote).map((result) => [result.symbol, result.unavailableReason]),
  );

  return Response.json(
    {
      quotes,
      unavailable: requested.filter((symbol) => !quotes.some((quote) => quote.symbol === symbol)),
      unavailableReasons,
      autoRefreshSeconds: intraday ? 60 : 300,
      educationalUse: true,
      note: "Extended-hours cards show the latest reported trade and timestamp. Public feeds can differ from broker quotes by venue, timing and licensing.",
      providerConfigured: Boolean(alpacaCredentials()),
      providerMode: alpacaCredentials() ? `Alpaca ${alpacaCredentials()!.feed}` : "Public fallback",
    },
    { headers: { "cache-control": intraday ? "public, max-age=30, stale-while-revalidate=30" : "public, max-age=120, stale-while-revalidate=180" } },
  );
}
