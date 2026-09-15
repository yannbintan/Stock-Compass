const symbolPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;

type FundamentalPayload = {
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
  isStale?: boolean;
  partial?: boolean;
  signalEligible?: boolean;
};

function raw(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const nested = (value as { raw?: unknown }).raw;
    return typeof nested === "number" && Number.isFinite(nested) ? nested : null;
  }
  return null;
}

function millions(value: unknown) {
  const number = raw(value);
  return number === null ? null : number * 1_000_000;
}

function confidenceFor(payload: FundamentalPayload): FundamentalPayload["confidence"] {
  const populated = [payload.marketCap, payload.trailingPE, payload.revenueGrowthPct, payload.epsGrowthPct, payload.totalDebt, payload.freeCashFlow, payload.earningsDate]
    .filter((value) => value !== null).length;
  return populated >= 6 ? "high" : populated >= 3 ? "medium" : "low";
}

async function loadFinnhub(symbol: string): Promise<FundamentalPayload | null> {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) return null;
  const today = new Date();
  const end = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const headers = { accept: "application/json", "X-Finnhub-Token": token };
  const [metricResponse, earningsResponse] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, { headers, signal: AbortSignal.timeout(9_000) }),
    fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${date(today)}&to=${date(end)}&symbol=${encodeURIComponent(symbol)}`, { headers, signal: AbortSignal.timeout(9_000) }),
  ]);
  if (!metricResponse.ok) throw new Error(`Fundamentals provider returned ${metricResponse.status}`);
  const metricPayload = await metricResponse.json() as { metric?: Record<string, unknown> };
  const earningsPayload = earningsResponse.ok
    ? await earningsResponse.json() as { earningsCalendar?: Array<{ date?: string }> }
    : { earningsCalendar: [] };
  const metric = metricPayload.metric ?? {};
  const payload: FundamentalPayload = {
    symbol,
    marketCap: millions(metric.marketCapitalization),
    trailingPE: raw(metric.peTTM ?? metric.peBasicExclExtraTTM),
    forwardPE: raw(metric.forwardPE),
    priceToBook: raw(metric.pbQuarterly),
    revenueGrowthPct: raw(metric.revenueGrowthTTMYoy),
    epsGrowthPct: raw(metric.epsGrowthTTMYoy),
    debtToEquity: raw(metric.totalDebtToEquityQuarterly),
    totalCash: millions(metric.cashAndShortTermInvestmentsQuarterly),
    totalDebt: millions(metric.totalDebtQuarterly),
    freeCashFlow: millions(metric.freeCashFlowTTM),
    dividendYieldPct: raw(metric.dividendYieldIndicatedAnnual),
    earningsDate: earningsPayload.earningsCalendar?.[0]?.date ?? null,
    week52High: raw(metric["52WeekHigh"]),
    week52Low: raw(metric["52WeekLow"]),
    provider: "Finnhub fundamentals",
    updated: new Date().toISOString(),
    confidence: "low",
  };
  return { ...payload, confidence: confidenceFor(payload) };
}

type FinancialPoint = { asOfDate: string; reportedValue?: { raw?: number }; currencyCode?: string };
const seriesTypes = ["trailingTotalRevenue", "trailingDilutedEPS", "trailingFreeCashFlow",
  "quarterlyTotalDebt", "quarterlyCashCashEquivalentsAndShortTermInvestments", "quarterlyStockholdersEquity",
];
async function loadYahoo(symbol: string): Promise<FundamentalPayload> {
  const mapped = symbol.replaceAll(".", "-");
  const end = Math.floor(Date.now() / 1000);
  const query = new URLSearchParams({ type: seriesTypes.join(","), period1: String(end - 3 * 366 * 86400), period2: String(end) });
  let lastError = "Public financial statements unavailable";
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      // Public statement series does not depend on the authenticated quoteSummary API.
      const response = await fetch(`https://${host}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(mapped)}?${query}`, {
        headers: { accept: "application/json", "user-agent": "StockCompass/1.1" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Public financial statements returned ${response.status}`);
      const data = await response.json() as { timeseries?: { result?: Array<Record<string, unknown>> } };
      const series: Record<string, FinancialPoint[]> = {};
      for (const row of data.timeseries?.result ?? []) {
        for (const key of seriesTypes) if (Array.isArray(row[key])) {
          series[key] = (row[key] as FinancialPoint[]).filter(x =>
            Number.isFinite(x.reportedValue?.raw) && Number.isFinite(Date.parse(x.asOfDate)) &&
            Date.parse(x.asOfDate) <= Date.now()
          ).sort((a,b) => a.asOfDate.localeCompare(b.asOfDate));
        }
      }
      const latest = (key: string) => series[key]?.at(-1);
      const value = (key: string) => raw(latest(key)?.reportedValue?.raw);
      const growth = (key: string) => {
        const points = series[key] ?? [];
        const current = points.at(-1);
        if (!current) return null;
        const yearAgo = points.findLast(x => {
          const days = (Date.parse(current.asOfDate) - Date.parse(x.asOfDate)) / 86400000;
          return days >= 350 && days <= 380 && x.currencyCode === current.currencyCode;
        });
        const prior = raw(yearAgo?.reportedValue?.raw), now = raw(current.reportedValue?.raw);
        return prior !== null && prior > 0 && now !== null ? (now / prior - 1) * 100 : null;
      };
      const reportingDates = seriesTypes.map(k => latest(k)?.asOfDate).filter((x): x is string => Boolean(x));
      if (reportingDates.length < 3) throw new Error("Insufficient financial statements for this symbol");
      const asOfDate = reportingDates.sort().at(-1)!;
      const isStale = reportingDates.some(date => Date.now() - Date.parse(date) > 200 * 86400000);
      const debt = value("quarterlyTotalDebt"), equity = value("quarterlyStockholdersEquity");
      const debtPoint = latest("quarterlyTotalDebt"), equityPoint = latest("quarterlyStockholdersEquity");
      const payload: FundamentalPayload = {
        symbol, marketCap: null, trailingPE: null, forwardPE: null, priceToBook: null,
        revenueGrowthPct: growth("trailingTotalRevenue"), epsGrowthPct: growth("trailingDilutedEPS"),
        debtToEquity: debt !== null && equity !== null && equity > 0 &&
          debtPoint?.asOfDate === equityPoint?.asOfDate && debtPoint?.currencyCode === equityPoint?.currencyCode
          ? debt / equity * 100 : null,
        totalCash: value("quarterlyCashCashEquivalentsAndShortTermInvestments"),
        totalDebt: debt, freeCashFlow: value("trailingFreeCashFlow"), dividendYieldPct: null,
        earningsDate: null, week52High: null, week52Low: null,
        provider: "Public financial statements (Yahoo Finance)",
        updated: new Date().toISOString(), asOfDate, isStale, partial: true, confidence: "low",
      };
      // Trailing P/E uses a recent price in the same currency as the reported EPS.
      // Keep unsupported forecast and earnings fields null instead of estimating them.
      const chart = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(mapped)}?range=5d&interval=1d`, {
        headers: { accept: "application/json", "user-agent": "StockCompass/1.1" }, signal: AbortSignal.timeout(5_000),
      }).then(async r => r.ok ? r.json() : null).catch(() => null);
      const meta = chart?.chart?.result?.[0]?.meta;
      const price = raw(meta?.regularMarketPrice), eps = value("trailingDilutedEPS");
      const quoteAge = Date.now() / 1000 - (raw(meta?.regularMarketTime) ?? 0);
      const sameCurrency = meta?.currency && latest("trailingDilutedEPS")?.currencyCode === meta.currency;
      if (price !== null && price > 0 && sameCurrency && quoteAge >= -60 && quoteAge < 5 * 86400) {
        payload.trailingPE = eps !== null && eps > 0 ? price / eps : null;
        payload.marketCap = null;
        payload.priceToBook = null;
      }
      payload.week52High = raw(meta?.fiftyTwoWeekHigh);
      payload.week52Low = raw(meta?.fiftyTwoWeekLow);
      payload.signalEligible = !isStale && payload.revenueGrowthPct !== null &&
        payload.epsGrowthPct !== null && payload.trailingPE !== null && payload.freeCashFlow !== null;
      return { ...payload, confidence: confidenceFor(payload) };
    } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
  }
  throw new Error(lastError);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "NVDA").trim().toUpperCase();
  if (!symbolPattern.test(symbol)) return Response.json({ error: "Invalid symbol" }, { status: 400 });
  try {
    const licensed = await loadFinnhub(symbol).catch(() => null);
    const fundamentals = licensed ?? await loadYahoo(symbol);
    if (!fundamentals || confidenceFor(fundamentals) === "low") throw new Error("Insufficient usable fundamentals were returned");
    if (fundamentals.isStale) throw new Error("Financial statements are older than 200 days");
    return Response.json({ fundamentals, licensedProvider: Boolean(licensed) }, {
      headers: { "cache-control": "public, max-age=3600, must-revalidate" },
    });
  } catch (error) {
    return Response.json({ symbol, fundamentals: null, error: error instanceof Error ? error.message : "Fundamentals unavailable" }, { status: 502 });
  }
}
