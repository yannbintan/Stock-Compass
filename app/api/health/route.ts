import { GET as getMarket } from "../market/route";
import { GET as getFundamentals } from "../fundamentals/route";
import { GET as getNews } from "../news/route";

type Check = { status: string; provider?: string; checkedAt: string; error?: string; [key: string]: unknown };
let cached: { expires: number; services: Record<string, Check> } | undefined;
let pending: Promise<Record<string, Check>> | undefined;

async function check(kind: "market" | "fundamentals" | "news"): Promise<Check> {
  const checkedAt = new Date().toISOString();
  try {
    // Invoke the same handlers used by the dashboard; no unauthenticated self-request.
    const route = kind === "market" ? getMarket : kind === "fundamentals" ? getFundamentals : getNews;
    const query = kind === "market" ? "symbols=AAPL" : "symbol=AAPL";
    const response = await route(new Request(`https://stock-compass.invalid/api/${kind}?${query}`));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    if (kind === "market") {
      const quote = data.quotes?.[0];
      if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) throw new Error("No usable sample quote");
      const intraday = await getMarket(new Request("https://stock-compass.invalid/api/market?symbols=AAPL&intraday=1"));
      const sessionData = await intraday.json();
      const sessionQuote = sessionData.quotes?.[0];
      if (!sessionQuote || !Number.isFinite(sessionQuote.price)) throw new Error("Intraday sample unavailable");
      return { status: quote.isStale || sessionQuote.isStale ? "stale" : "public-fallback", provider: quote.provider,
        intraday: { provider: sessionQuote.provider, updated: sessionQuote.updated, freshness: sessionQuote.freshness,
          signalEligible: sessionQuote.signalEligible },
        checkedAt, sampleSymbol: "AAPL", updated: quote.updated, freshness: quote.freshness,
        signalEligible: quote.signalEligible, reason: quote.freshnessReason };
    }
    if (kind === "fundamentals") {
      const f = data.fundamentals;
      if (!f || f.isStale) throw new Error("Missing or stale financial statements");
      return { status: data.licensedProvider ? "licensed" : "public-fallback", provider: f.provider,
        checkedAt, sampleSymbol: "AAPL", asOfDate: f.asOfDate ?? null, partial: Boolean(f.partial),
        confidence: f.confidence, signalEligible: f.signalEligible ?? true };
    }
    if (!data.items?.length) throw new Error("No usable headlines");
    return { status: data.licensedProvider ? "licensed" : "rss-fallback", provider: data.source,
      checkedAt, sampleSymbol: "AAPL", itemCount: data.items.length, newestPublishedAt: data.items[0].publishedAt };
  } catch (error) {
    return { status: "failed", checkedAt, error: error instanceof Error ? error.message : "Service unavailable" };
  }
}

export async function GET() {
  // Coalesce concurrent health probes and cap external calls at once per minute.
  if (!cached || cached.expires <= Date.now()) {
    pending ??= Promise.all([check("market"), check("fundamentals"), check("news")])
      .then(([market, fundamentals, news]) => ({ market, fundamentals, news }));
    try { cached = { services: await pending, expires: Date.now() + 60_000 }; }
    finally { pending = undefined; }
  }
  const services = cached.services;
  const degraded = Object.values(services).some(x => x.status === "failed" || x.status === "stale");
  return Response.json({
    status: degraded ? "degraded" : "ok", timestamp: new Date().toISOString(),
    version: "1.1.0-beta", probeCacheSeconds: 60,
    services: { ...services, safeguards: { staleSignalGuard: true, sessionAware: true, localPersistence: true, tradeExecution: false } },
  }, { status: degraded ? 503 : 200, headers: { "cache-control": "no-store" } });
}
