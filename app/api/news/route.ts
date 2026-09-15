type Relationship = "direct" | "indirect";
type Effect = "bullish" | "bearish" | "mixed";
type Strength = "high" | "medium" | "low";

const newsQueries: Record<string, { company: string; theme: string }> = {
  SKHY: { company: "SK hynix stock", theme: "HBM memory chip prices AI demand" },
  SNDK: { company: "SanDisk stock", theme: "NAND flash memory prices datacenter demand" },
  QQQ: { company: "Invesco QQQ Nasdaq 100", theme: "Nasdaq 100 interest rates technology stocks" },
  NVDA: { company: "Nvidia stock", theme: "AI chips datacenter spending export restrictions" },
  MSFT: { company: "Microsoft stock", theme: "cloud computing AI enterprise spending" },
  "BRK.B": { company: "Berkshire Hathaway stock", theme: "insurance rates US economy value stocks" },
  AAPL: { company: "Apple stock", theme: "smartphone demand consumer electronics supply chain" },
  GOOGL: { company: "Alphabet Google stock", theme: "digital advertising AI search regulation" },
  AMZN: { company: "Amazon stock", theme: "cloud spending ecommerce consumer demand" },
  META: { company: "Meta Platforms stock", theme: "digital advertising social media AI regulation" },
  TSLA: { company: "Tesla stock", theme: "electric vehicle demand battery prices autonomy regulation" },
  AMD: { company: "AMD stock", theme: "AI chips semiconductor datacenter demand" },
  TSM: { company: "TSMC stock", theme: "semiconductor foundry demand Taiwan geopolitical risk" },
  MU: { company: "Micron stock", theme: "HBM DRAM NAND memory prices" },
  PLTR: { company: "Palantir stock", theme: "AI software government contracts enterprise spending" },
  JPM: { company: "JPMorgan stock", theme: "US interest rates bank credit quality economy" },
  V: { company: "Visa stock", theme: "consumer spending digital payments regulation" },
  WMT: { company: "Walmart stock", theme: "US consumer spending retail inflation" },
  JNJ: { company: "Johnson Johnson stock", theme: "pharmaceutical regulation drug approvals healthcare" },
  VOO: { company: "Vanguard VOO S&P 500", theme: "S&P 500 earnings interest rates US economy" },
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extract(block: string, tag: string) {
  return decodeXml(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() ?? "");
}

function classify(title: string, relationship: Relationship): { effect: Effect; tone: "positive" | "warning" | "negative" | "neutral"; strength: Strength; why: string; confidence: number; eventType: string } {
  const text = title.toLowerCase();
  const bearish = /miss|cut guidance|downgrade|investigation|probe|lawsuit|tariff|ban|restriction|recall|weak demand|slump|selloff|loss|declin|fall|drop|delay|risk/.test(text);
  const bullish = /beat|raise guidance|upgrade|buyback|contract|approval|record|strong demand|growth|surge|gain|rise|partnership|launch/.test(text);
  const effect: Effect = bullish === bearish ? "mixed" : bullish ? "bullish" : "bearish";
  const highImpact = /earnings|guidance|forecast|contract|approval|ban|restriction|investigation|lawsuit|recall|acquisition|merger|buyback/.test(text);
  const mediumImpact = /demand|sales|revenue|margin|price|shipment|rate|inflation|spending|upgrade|downgrade/.test(text);
  const strength: Strength = highImpact && relationship === "direct" ? "high" : highImpact || mediumImpact ? "medium" : "low";
  let eventType = "General market update";
  if (/earnings|revenue|margin|guidance|forecast/.test(text)) eventType = "Earnings / guidance";
  else if (/contract|partnership|deal/.test(text)) eventType = "Contract / partnership";
  else if (/buyback|dividend/.test(text)) eventType = "Capital return";
  else if (/ban|restriction|tariff|regulation|investigation|lawsuit|recall/.test(text)) eventType = "Regulatory / legal";
  else if (/acquisition|merger/.test(text)) eventType = "M&A";
  else if (/launch|product|approval/.test(text)) eventType = "Product / approval";
  else if (/rate|inflation|economy|credit/.test(text)) eventType = "Macro environment";
  else if (/demand|shipment|sales|spending|price/.test(text)) eventType = "Demand / pricing";

  let why = relationship === "direct"
    ? "Company-specific news can change revenue, costs, expectations or investor confidence."
    : "This sector or macro headline can influence demand, valuation and risk appetite without changing the company directly.";
  if (/earnings|revenue|margin|guidance|forecast/.test(text)) why = "Results or guidance can reset the market's expectations for future earnings and valuation.";
  else if (/contract|partnership/.test(text)) why = "A contract or partnership can affect future revenue visibility and customer confidence.";
  else if (/buyback/.test(text)) why = "A buyback can reduce share supply and signal management confidence, though execution matters.";
  else if (/ban|restriction|tariff|regulation|investigation|lawsuit|recall/.test(text)) why = "Policy, legal or regulatory changes can alter costs, market access and perceived risk.";
  else if (/demand|shipment|sales|spending/.test(text)) why = relationship === "direct"
    ? "Demand or sales changes can flow directly into revenue and margins."
    : "Industry demand can indirectly lift or pressure the company's revenue outlook.";
  else if (/rate|inflation|economy|credit/.test(text)) why = "Rates and economic conditions can affect valuation, financing, credit quality and consumer demand.";
  else if (/chip|semiconductor|memory|hbm|dram|nand/.test(text)) why = "Chip demand and pricing can affect industry revenue, margins and inventory conditions.";

  const confidence = Math.min(95,
    42 +
    (relationship === "direct" ? 18 : 0) +
    (strength === "high" ? 22 : strength === "medium" ? 12 : 0) +
    (bullish !== bearish ? 10 : 0),
  );
  return { effect, tone: effect === "bullish" ? "positive" : effect === "bearish" ? "negative" : "neutral", strength, why, confidence, eventType };
}

async function loadFeed(query: string, relationship: Relationship, fallbackUrl?: string) {
  const feedUrl = fallbackUrl ?? `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(feedUrl, { headers: { accept: "application/rss+xml, application/xml, text/xml", "user-agent": "StockCompass/1.1" }, signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error(`News feed returned ${response.status}`);
  const xml = await response.text();

  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const rawTitle = extract(block, "title");
    const source = extract(block, "source") || rawTitle.split(" - ").at(-1) || (fallbackUrl ? "Yahoo Finance" : "News");
    const title = rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(` - ${source}`).length) : rawTitle;
    return {
      title,
      source,
      publishedAt: extract(block, "pubDate"),
      url: extract(block, "link"),
      relationship,
      ...classify(title, relationship),
    };
  }).filter((item) => {
    const timestamp = Date.parse(item.publishedAt);
    return item.title && /^https?:\/\//i.test(item.url) && Number.isFinite(timestamp) &&
      timestamp <= Date.now() + 5 * 60_000 && timestamp >= Date.now() - 7 * 86400_000;
  }).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 5);
}

async function loadAlpacaNews(symbol: string) {
  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();
  if (!key || !secret) return [];
  const response = await fetch(`https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(symbol)}&limit=12&sort=desc&include_content=false`, {
    headers: {
      accept: "application/json",
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
    },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`Licensed news feed returned ${response.status}`);
  const payload = await response.json() as {
    news?: Array<{ headline?: string; summary?: string; source?: string; created_at?: string; url?: string; symbols?: string[] }>;
  };
  return (payload.news ?? []).flatMap((item) => {
    if (!item.headline || !item.url) return [];
    const relationship: Relationship = item.symbols?.includes(symbol) ? "direct" : "indirect";
    return [{
      title: item.headline,
      summary: item.summary ?? "",
      source: item.source || "Market news",
      publishedAt: item.created_at ?? new Date().toISOString(),
      url: item.url,
      relationship,
      relatedSymbols: item.symbols ?? [],
      ...classify(`${item.headline} ${item.summary ?? ""}`, relationship),
    }];
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "SKHY").toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return Response.json({ error: "Invalid symbol" }, { status: 400 });
  const queries = newsQueries[symbol] ?? { company: `${symbol} stock`, theme: `${symbol} company industry market` };

  try {
    const [licensedResult, directResult, indirectResult, fallbackResult] = await Promise.allSettled([
      loadAlpacaNews(symbol),
      loadFeed(queries.company, "direct"),
      loadFeed(queries.theme, "indirect"),
      loadFeed("", "direct", `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol.replaceAll(".", "-"))}&region=US&lang=en-US`),
    ]);
    const licensed = licensedResult.status === "fulfilled" ? licensedResult.value : [];
    const direct = directResult.status === "fulfilled" ? directResult.value : [];
    const indirect = indirectResult.status === "fulfilled" ? indirectResult.value : [];
    const fallback = fallbackResult.status === "fulfilled" ? fallbackResult.value : [];
    const seen = new Set<string>();
    const items = [...licensed, ...direct, ...fallback, ...indirect]
      .filter((item) => {
        const timestamp = Date.parse(item.publishedAt);
        if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300_000 || timestamp < Date.now() - 7 * 86400_000) return false;
        const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 90);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 10);

    if (!items.length) {
      const errors = [licensedResult, directResult, indirectResult, fallbackResult]
        .filter(x => x.status === "rejected").map(x => x.reason instanceof Error ? x.reason.message : "Feed unavailable");
      throw new Error("No usable headlines from news providers" + (errors.length ? ": " + errors.join("; ") : ""));
    }
    return Response.json(
      {
        symbol,
        items,
        source: [licensed.length ? "Alpaca News" : "", direct.length || indirect.length ? "Google News RSS" : "", fallback.length ? "Yahoo Finance RSS" : ""].filter(Boolean).join(" + "),
        updated: new Date().toISOString(),
        newestPublishedAt: items[0].publishedAt,
        delayed: !licensed.length,
        classification: "event-aware rule engine",
        licensedProvider: Boolean(licensed.length),
      },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  } catch (error) {
    return Response.json({ symbol, items: [], error: error instanceof Error ? error.message : "News unavailable" }, { status: 502 });
  }
}
