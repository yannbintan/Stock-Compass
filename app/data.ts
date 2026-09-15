export type Mode = "short" | "long";
export type Tone = "positive" | "warning" | "negative" | "neutral";

export type Check = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

export type Analysis = {
  verdict: string;
  score: number;
  tone: Tone;
  summary: string;
  trigger: string;
  invalidation: string;
  checks: Check[];
};

export type NewsItem = {
  title: string;
  source: string;
  age: string;
  tone: Tone;
  url: string;
  relationship?: "direct" | "indirect";
  effect?: "bullish" | "bearish" | "mixed";
  strength?: "high" | "medium" | "low";
  why?: string;
  confidence?: number;
  eventType?: string;
  summary?: string;
  relatedSymbols?: string[];
};

export type Stock = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
  history: number[];
  support: number[];
  resistance: number[];
  rsi: number;
  sma20: number;
  sma50: number;
  volatility: string;
  catalyst: string;
  sector?: string;
  short: Analysis;
  long: Analysis;
  news: NewsItem[];
};

const coreStocks: Stock[] = [
  {
    symbol: "SKHY",
    name: "SK hynix ADR",
    price: 155.97,
    changePct: -4.55,
    currency: "USD",
    history: [167, 169, 166, 165, 162, 164, 159, 157, 151.6, 156],
    support: [151.5, 148],
    resistance: [160, 168],
    rsi: 38,
    sma20: 161.8,
    sma50: 165.4,
    volatility: "High",
    catalyst: "Buyback underway",
    short: {
      verdict: "WAIT",
      score: 46,
      tone: "warning",
      summary: "Price is near support, but the short trend is still weak. Let buyers prove they are back before entering.",
      trigger: "Close above $160 with stronger volume",
      invalidation: "Break below $151.50",
      checks: [
        { label: "Trend", value: "Below 20D & 50D", detail: "The trend has not turned upward yet.", tone: "negative" },
        { label: "Momentum", value: "RSI 38", detail: "Weak, but not a reversal signal by itself.", tone: "warning" },
        { label: "Price level", value: "$151.50 support", detail: "Close enough to watch for a confirmed bounce.", tone: "warning" },
        { label: "Catalyst", value: "Buyback", detail: "Supportive, but sector selling can still dominate.", tone: "positive" },
      ],
    },
    long: {
      verdict: "ACCUMULATE",
      score: 74,
      tone: "positive",
      summary: "HBM leadership, customer agreements and shareholder returns support the longer-term case, but memory remains cyclical.",
      trigger: "Build in 3–4 portions rather than one purchase",
      invalidation: "HBM share loss or a material demand slowdown",
      checks: [
        { label: "Business", value: "Strong", detail: "Leading exposure to high-bandwidth memory.", tone: "positive" },
        { label: "Growth", value: "AI-led", detail: "Demand is strong but concentrated in AI infrastructure.", tone: "positive" },
        { label: "Cycle risk", value: "High", detail: "Memory prices and earnings can reverse quickly.", tone: "warning" },
        { label: "Entry", value: "Use tranches", detail: "Avoid depending on one exact bottom.", tone: "positive" },
      ],
    },
    news: [
      { title: "SK hynix plans major share buyback after recent decline", source: "Reuters", age: "5d", tone: "positive", url: "https://www.reuters.com/legal/transactional/sk-hynix-buy-back-cancel-29-billion-worth-treasury-shares-2026-08-19/" },
      { title: "Record Q2 performance driven by AI memory demand", source: "SK hynix", age: "3w", tone: "positive", url: "https://news.skhynix.com/en/q2-2026-business-results/" },
      { title: "Memory shares fall during broad semiconductor selloff", source: "MarketWatch", age: "Today", tone: "negative", url: "https://www.marketwatch.com/livecoverage/stock-market-today-dow-s-p-500-nasdaq-nvidia-earnings-results-jackson-hole/card/chips-drag-down-the-tech-sector-as-nvidia-s-stock-heads-for-a-long-losing-streak-SQYkt3cyGXmAiEtMQPLL" },
    ],
  },
  {
    symbol: "SNDK",
    name: "SanDisk",
    price: 1499.18,
    changePct: -6.07,
    currency: "USD",
    history: [1610, 1588, 1640, 1595, 1535, 1472, 1418, 1499],
    support: [1418, 1300],
    resistance: [1534, 1613],
    rsi: 42,
    sma20: 1540,
    sma50: 1613,
    volatility: "Very high",
    catalyst: "Post-investor day",
    short: {
      verdict: "AVOID",
      score: 31,
      tone: "negative",
      summary: "The price range is extremely wide and the trend remains below key averages. A red day alone does not make it a safe bounce trade.",
      trigger: "Reclaim $1,534 and hold it with volume",
      invalidation: "Loss of the $1,418 intraday low",
      checks: [
        { label: "Trend", value: "Below 20D & 50D", detail: "Sellers still control the short-term structure.", tone: "negative" },
        { label: "Momentum", value: "RSI 42", detail: "Neutral-weak, without confirmation of a turn.", tone: "warning" },
        { label: "Price range", value: ">7% today", detail: "Stops can be triggered quickly in both directions.", tone: "negative" },
        { label: "Level", value: "$1,418 support", detail: "A break could expose the $1,300 area.", tone: "warning" },
      ],
    },
    long: {
      verdict: "WAIT",
      score: 58,
      tone: "warning",
      summary: "Operating growth is excellent, but a huge prior run and dependence on NAND pricing leave little room for disappointment.",
      trigger: "Stabilisation near $1,400–1,430 or improving trend",
      invalidation: "Weakening pricing or customer commitments",
      checks: [
        { label: "Growth", value: "Excellent", detail: "Datacenter demand and pricing are powerful drivers.", tone: "positive" },
        { label: "Valuation", value: "Demanding", detail: "The stock already prices in substantial success.", tone: "warning" },
        { label: "Cycle risk", value: "Very high", detail: "NAND pricing is historically volatile.", tone: "negative" },
        { label: "Entry", value: "No rush", detail: "Wait for price and expectations to settle.", tone: "warning" },
      ],
    },
    news: [
      { title: "SanDisk forecasts mid-to-high-teens growth through 2030", source: "Reuters", age: "1w", tone: "positive", url: "https://www.reuters.com/business/sandisk-forecasts-mid-to-high-teens-revenue-growth-through-2030-2026-08-13/" },
      { title: "Fiscal Q4 revenue rose 51% sequentially", source: "SanDisk", age: "2w", tone: "positive", url: "https://investor.sandisk.com/news-releases/news-release-details/sandisk-reports-fiscal-fourth-quarter-2026-financial-results" },
      { title: "SanDisk leads Nasdaq declines during memory selloff", source: "WSJ", age: "Today", tone: "negative", url: "https://www.wsj.com/livecoverage/stock-market-today-dow-s-p-500-nasdaq-08-24-2026/card/the-nasdaq-s-biggest-losers-today-QgIez3jwTwA9H9qbumLC" },
    ],
  },
  {
    symbol: "QQQ",
    name: "Nasdaq-100 ETF",
    price: 707.98,
    changePct: -0.77,
    currency: "USD",
    history: [697, 704, 708, 715, 721, 718, 713, 708],
    support: [703, 697],
    resistance: [714, 725],
    rsi: 39.9,
    sma20: 713,
    sma50: 705,
    volatility: "Medium",
    catalyst: "Nvidia earnings",
    short: {
      verdict: "WATCH",
      score: 58,
      tone: "neutral",
      summary: "QQQ is testing a useful support zone. Wait for it to hold $703–705 and recover above $710 before treating the bounce as valid.",
      trigger: "Hold $703–705, then reclaim $710",
      invalidation: "Daily close below $700",
      checks: [
        { label: "Trend", value: "Mixed", detail: "Below the 20-day average but near the 50-day average.", tone: "warning" },
        { label: "Momentum", value: "RSI 39.9", detail: "Weak enough to watch, not enough to buy blindly.", tone: "warning" },
        { label: "Price level", value: "$703 support", detail: "A defined level makes risk easier to control.", tone: "positive" },
        { label: "Catalyst", value: "Earnings risk", detail: "Nvidia can move the entire index this week.", tone: "negative" },
      ],
    },
    long: {
      verdict: "ACCUMULATE",
      score: 82,
      tone: "positive",
      summary: "Diversified exposure to profitable technology leaders makes QQQ a stronger core than relying on one memory stock.",
      trigger: "Add consistently or during broad-market pullbacks",
      invalidation: "Time horizon becomes shorter than three years",
      checks: [
        { label: "Diversification", value: "Good", detail: "Far broader than a single semiconductor position.", tone: "positive" },
        { label: "Growth", value: "Strong", detail: "Meaningful exposure to cloud, software and AI.", tone: "positive" },
        { label: "Concentration", value: "Moderate", detail: "Largest technology holdings still drive returns.", tone: "warning" },
        { label: "Entry", value: "DCA", detail: "Monthly purchases reduce timing dependence.", tone: "positive" },
      ],
    },
    news: [
      { title: "Chip weakness weighs on the technology sector", source: "MarketWatch", age: "Today", tone: "negative", url: "https://www.marketwatch.com/livecoverage/stock-market-today-dow-s-p-500-nasdaq-nvidia-earnings-results-jackson-hole/card/chips-drag-down-the-tech-sector-as-nvidia-s-stock-heads-for-a-long-losing-streak-SQYkt3cyGXmAiEtMQPLL" },
      { title: "QQQ quarterly outlook and market context", source: "Invesco", age: "2w", tone: "neutral", url: "https://www.invesco.com/qqq-etf/en/etf-insights/qqq-quarterly-outlook.html" },
    ],
  },
  {
    symbol: "NVDA",
    name: "Nvidia",
    price: 209.82,
    changePct: -2.28,
    currency: "USD",
    history: [224, 221, 219, 218, 215, 214, 212, 210],
    support: [207.5, 200],
    resistance: [215, 224],
    rsi: 39,
    sma20: 217.5,
    sma50: 211,
    volatility: "High",
    catalyst: "Earnings Aug 26",
    short: {
      verdict: "WAIT",
      score: 35,
      tone: "warning",
      summary: "Seven losing sessions and an imminent earnings report create major overnight gap risk. Let the event pass first.",
      trigger: "After earnings: reclaim $215–218",
      invalidation: "Break below $207.50",
      checks: [
        { label: "Trend", value: "Falling", detail: "The stock is below its short moving average.", tone: "negative" },
        { label: "Momentum", value: "RSI 39", detail: "Weak momentum can remain weak into earnings.", tone: "warning" },
        { label: "Liquidity", value: "Excellent", detail: "Tight execution makes it suitable after confirmation.", tone: "positive" },
        { label: "Catalyst", value: "Earnings in 2d", detail: "A gap can bypass a normal stop order.", tone: "negative" },
      ],
    },
    long: {
      verdict: "WATCH",
      score: 71,
      tone: "neutral",
      summary: "The AI platform remains strong, but expectations are high. A staged entry after earnings offers a clearer risk picture.",
      trigger: "Review guidance, margins and demand after earnings",
      invalidation: "Material slowing in AI infrastructure demand",
      checks: [
        { label: "Business", value: "Excellent", detail: "A leading AI-compute ecosystem and strong liquidity.", tone: "positive" },
        { label: "Expectations", value: "High", detail: "Strong results may already be assumed by the market.", tone: "warning" },
        { label: "Catalyst", value: "Imminent", detail: "Wait for new information before sizing a position.", tone: "warning" },
        { label: "Entry", value: "Stage it", detail: "Avoid a full allocation around one report.", tone: "positive" },
      ],
    },
    news: [
      { title: "Nvidia heads toward longest losing streak since 2022", source: "WSJ", age: "Today", tone: "negative", url: "https://www.wsj.com/livecoverage/stock-market-today-dow-s-p-500-nasdaq-08-24-2026/card/nvidia-headed-for-longest-losing-streak-since-2022-as-tech-stocks-slide-8cDllVMijZSgshSpSR3t" },
      { title: "Earnings will test elevated AI expectations", source: "MarketBeat", age: "1w", tone: "warning", url: "https://www.marketbeat.com/articles/nvidias-rally-sets-up-a-bigger-test-ahead-of-earnings/" },
    ],
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    price: 487.47,
    changePct: 0.88,
    currency: "USD",
    history: [472, 476, 481, 479, 484, 482, 487],
    support: [480, 465],
    resistance: [491, 510],
    rsi: 52,
    sma20: 486,
    sma50: 478,
    volatility: "Medium",
    catalyst: "Cloud growth",
    short: {
      verdict: "WATCH",
      score: 66,
      tone: "neutral",
      summary: "Trend and momentum are constructive, but price is close to resistance. Wait for either a breakout or a cleaner pullback.",
      trigger: "Break above $491 or hold a pullback near $480",
      invalidation: "Close below $478",
      checks: [
        { label: "Trend", value: "Positive", detail: "Price is above both key averages.", tone: "positive" },
        { label: "Momentum", value: "RSI 52", detail: "Healthy, without being overextended.", tone: "positive" },
        { label: "Price level", value: "$491 resistance", detail: "A nearby ceiling limits immediate reward.", tone: "warning" },
        { label: "Catalyst", value: "Earnings passed", detail: "Lower near-term event risk than Nvidia.", tone: "positive" },
      ],
    },
    long: {
      verdict: "ACCUMULATE",
      score: 84,
      tone: "positive",
      summary: "Diversified software, Azure and recurring enterprise revenue offer a higher-quality core than a pure hardware cycle bet.",
      trigger: "Add in portions, especially during broad pullbacks",
      invalidation: "Sustained cloud slowdown or margin deterioration",
      checks: [
        { label: "Business", value: "Excellent", detail: "Recurring enterprise revenue across multiple products.", tone: "positive" },
        { label: "Growth", value: "Strong", detail: "Azure and cloud remain major drivers.", tone: "positive" },
        { label: "Valuation", value: "Premium", detail: "Quality is recognised in the share price.", tone: "warning" },
        { label: "Portfolio role", value: "Core", detail: "More balanced than a single chipmaker.", tone: "positive" },
      ],
    },
    news: [
      { title: "Microsoft Cloud revenue grew 27% in fiscal Q4", source: "Microsoft", age: "3w", tone: "positive", url: "https://www.microsoft.com/en-us/investor/earnings/fy-2026-q4/press-release-webcast" },
    ],
  },
  {
    symbol: "BRK.B",
    name: "Berkshire Hathaway",
    price: 502.07,
    changePct: 1.26,
    currency: "USD",
    history: [486, 491, 489, 495, 498, 496, 502],
    support: [495, 480],
    resistance: [505, 520],
    rsi: 55,
    sma20: 496,
    sma50: 490,
    volatility: "Low-medium",
    catalyst: "Buybacks resumed",
    short: {
      verdict: "WATCH",
      score: 64,
      tone: "neutral",
      summary: "The structure is positive, but price is close to resistance and daily movement is slower than the technology names.",
      trigger: "Break above $505 or hold $495 on a pullback",
      invalidation: "Close below $490",
      checks: [
        { label: "Trend", value: "Positive", detail: "Price is above the 20-day and 50-day averages.", tone: "positive" },
        { label: "Momentum", value: "RSI 55", detail: "Constructive and not overbought.", tone: "positive" },
        { label: "Price level", value: "$505 resistance", detail: "A breakout needs confirmation.", tone: "warning" },
        { label: "Volatility", value: "Lower", detail: "Cleaner risk, but smaller short-term moves.", tone: "neutral" },
      ],
    },
    long: {
      verdict: "ACCUMULATE",
      score: 80,
      tone: "positive",
      summary: "Insurance, energy, rail and investments give useful diversification away from the AI and memory cycle.",
      trigger: "Build gradually as a portfolio stabiliser",
      invalidation: "Persistent deterioration across operating businesses",
      checks: [
        { label: "Diversification", value: "Excellent", detail: "Multiple cash-generating operating businesses.", tone: "positive" },
        { label: "Balance sheet", value: "Strong", detail: "Large financial flexibility and capital allocation capacity.", tone: "positive" },
        { label: "Growth", value: "Moderate", detail: "Less explosive than AI-focused companies.", tone: "neutral" },
        { label: "Portfolio role", value: "Stabiliser", detail: "Balances higher-volatility positions.", tone: "positive" },
      ],
    },
    news: [
      { title: "Operating profit rises and Berkshire resumes buybacks", source: "Reuters", age: "2w", tone: "positive", url: "https://www.reuters.com/business/finance/urgent-berkshire-says-operating-profit-rises-conducts-stock-buybacks-2026-08-08/" },
    ],
  },
];

type StockSeed = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  sector: string;
  volatility: string;
  catalyst: string;
  quality: number;
  shortScore: number;
};

function seededHistory(price: number, changePct: number) {
  const slope = Math.max(Math.min(changePct / 100, 0.04), -0.04);
  return [1 - slope * 2.2, 1 - slope * 1.55, 1 - slope * 1.1, 1 - slope * 0.85, 1 - slope * 0.5, 1 - slope * 0.25, 1]
    .map((factor) => Number((price * factor).toFixed(2)));
}

function makeStock(seed: StockSeed): Stock {
  const positiveTrend = seed.shortScore >= 67;
  const weakTrend = seed.shortScore < 43;
  const shortTone: Tone = positiveTrend ? "positive" : weakTrend ? "negative" : seed.shortScore >= 56 ? "neutral" : "warning";
  const shortVerdict = positiveTrend ? "SETUP" : weakTrend ? "AVOID" : seed.shortScore >= 56 ? "WATCH" : "WAIT";
  const longTone: Tone = seed.quality >= 78 ? "positive" : seed.quality >= 65 ? "neutral" : "warning";
  const longVerdict = seed.quality >= 78 ? "ACCUMULATE" : seed.quality >= 65 ? "WATCH" : "WAIT";
  const support = [Number((seed.price * 0.96).toFixed(2)), Number((seed.price * 0.91).toFixed(2))];
  const resistance = [Number((seed.price * 1.035).toFixed(2)), Number((seed.price * 1.08).toFixed(2))];
  const sma20 = Number((seed.price * (positiveTrend ? 0.985 : weakTrend ? 1.035 : 1.005)).toFixed(2));
  const sma50 = Number((seed.price * (positiveTrend ? 0.97 : weakTrend ? 1.05 : 0.995)).toFixed(2));
  const rsi = positiveTrend ? 57 : weakTrend ? 37 : 48;

  return {
    symbol: seed.symbol,
    name: seed.name,
    price: seed.price,
    changePct: seed.changePct,
    currency: "USD",
    history: seededHistory(seed.price, seed.changePct),
    support,
    resistance,
    rsi,
    sma20,
    sma50,
    volatility: seed.volatility,
    catalyst: seed.catalyst,
    sector: seed.sector,
    short: {
      verdict: shortVerdict,
      score: seed.shortScore,
      tone: shortTone,
      summary: positiveTrend
        ? "Price structure and momentum are constructive. Use a small first entry and keep the stop tied to support."
        : weakTrend
          ? "The short-term structure is weak. Do not treat a lower price as proof that the decline is finished."
          : "The setup is mixed. Wait for either a confirmed breakout or a controlled bounce from support.",
      trigger: `Close above $${resistance[0].toFixed(2)} or a confirmed bounce from $${support[0].toFixed(2)}`,
      invalidation: `Daily close below $${support[0].toFixed(2)}`,
      checks: [
        { label: "Trend", value: positiveTrend ? "Positive" : weakTrend ? "Weak" : "Mixed", detail: "Compares price with the 20-day and 50-day trend references.", tone: shortTone },
        { label: "Momentum", value: `RSI ${rsi}`, detail: "Momentum should confirm the price move rather than contradict it.", tone: rsi >= 45 && rsi <= 68 ? "positive" : "warning" },
        { label: "Price level", value: `$${support[0].toFixed(2)} support`, detail: "A visible support level makes risk easier to define.", tone: "neutral" },
        { label: "Catalyst", value: seed.catalyst, detail: "Check the live news panel before holding through an event.", tone: "warning" },
      ],
    },
    long: {
      verdict: longVerdict,
      score: seed.quality,
      tone: longTone,
      summary: seed.quality >= 78
        ? "Business quality supports gradual long-term accumulation, but entry size should still reflect valuation and volatility."
        : seed.quality >= 65
          ? "The long-term case is credible, though valuation or cycle risk makes a staged entry more sensible than buying all at once."
          : "The long-term opportunity comes with elevated execution or valuation risk. Wait for a wider margin of safety.",
      trigger: seed.quality >= 78 ? "Build in three or four portions" : "Wait for valuation, trend and news risk to improve",
      invalidation: "A lasting deterioration in growth, margins or competitive position",
      checks: [
        { label: "Business", value: seed.quality >= 78 ? "High quality" : "Watch", detail: "Assesses durability, cash generation and competitive position.", tone: longTone },
        { label: "Growth", value: seed.catalyst, detail: "The main catalyst must translate into durable earnings.", tone: "positive" },
        { label: "Risk", value: seed.volatility, detail: "Higher volatility requires smaller position sizes and wider patience.", tone: seed.volatility.includes("High") ? "warning" : "neutral" },
        { label: "Entry", value: "Use portions", detail: "Staging reduces dependence on choosing the exact bottom.", tone: "positive" },
      ],
    },
    news: [
      {
        title: `Live ${seed.name} and ${seed.sector.toLowerCase()} headlines load when selected`,
        source: "Stock Compass",
        age: "Refresh",
        tone: "neutral",
        url: `https://news.google.com/search?q=${encodeURIComponent(`${seed.name} stock`)}`,
        relationship: "direct",
        effect: "mixed",
        strength: "low",
        why: "Open the stock to load and classify recent company and sector headlines.",
      },
    ],
  };
}

const additionalStocks: StockSeed[] = [
  { symbol: "AAPL", name: "Apple", price: 311.42, changePct: 0.67, sector: "Technology", volatility: "Medium", catalyst: "Services & devices", quality: 84, shortScore: 69 },
  { symbol: "GOOGL", name: "Alphabet", price: 348.10, changePct: 0.95, sector: "Technology", volatility: "Medium", catalyst: "AI & advertising", quality: 86, shortScore: 71 },
  { symbol: "AMZN", name: "Amazon", price: 262.28, changePct: 1.41, sector: "Technology", volatility: "Medium-high", catalyst: "AWS & retail margins", quality: 82, shortScore: 72 },
  { symbol: "META", name: "Meta Platforms", price: 560.44, changePct: 1.92, sector: "Technology", volatility: "Medium-high", catalyst: "Ads & AI spending", quality: 78, shortScore: 74 },
  { symbol: "TSLA", name: "Tesla", price: 351.52, changePct: -3.13, sector: "Consumer", volatility: "Very high", catalyst: "Deliveries & autonomy", quality: 58, shortScore: 34 },
  { symbol: "AMD", name: "Advanced Micro Devices", price: 458.31, changePct: -3.16, sector: "Semiconductors", volatility: "High", catalyst: "AI accelerator share", quality: 73, shortScore: 39 },
  { symbol: "TSM", name: "TSMC ADR", price: 410.14, changePct: -2.10, sector: "Semiconductors", volatility: "High", catalyst: "Advanced-node demand", quality: 86, shortScore: 44 },
  { symbol: "MU", name: "Micron Technology", price: 916.10, changePct: -5.24, sector: "Semiconductors", volatility: "Very high", catalyst: "HBM & memory prices", quality: 70, shortScore: 31 },
  { symbol: "PLTR", name: "Palantir", price: 178.21, changePct: -0.96, sector: "Technology", volatility: "High", catalyst: "AI software contracts", quality: 66, shortScore: 51 },
  { symbol: "JPM", name: "JPMorgan Chase", price: 356.31, changePct: 1.35, sector: "Financials", volatility: "Medium", catalyst: "Rates & credit quality", quality: 81, shortScore: 70 },
  { symbol: "V", name: "Visa", price: 381.07, changePct: 2.70, sector: "Financials", volatility: "Medium", catalyst: "Consumer payments", quality: 85, shortScore: 77 },
  { symbol: "WMT", name: "Walmart", price: 106.10, changePct: 2.31, sector: "Consumer", volatility: "Low-medium", catalyst: "Consumer demand", quality: 79, shortScore: 75 },
  { symbol: "JNJ", name: "Johnson & Johnson", price: 272.56, changePct: 0.86, sector: "Healthcare", volatility: "Low-medium", catalyst: "Drug pipeline", quality: 77, shortScore: 68 },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", price: 702.45, changePct: -0.18, sector: "ETF", volatility: "Medium", catalyst: "Broad US earnings", quality: 91, shortScore: 57 },
];

export const stocks: Stock[] = [...coreStocks, ...additionalStocks.map(makeStock)];
