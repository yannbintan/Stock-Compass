type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Trade = {
  entryDate: string;
  exitDate: string;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  returnPct: number;
  outcome: "win" | "loss";
  exitReason: "target" | "stop" | "time";
};

const symbolPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function rsiAt(closes: number[], endIndex: number, period = 14) {
  if (endIndex < period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
    const change = closes[index] - closes[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  const averageLoss = losses / period;
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + (gains / period) / averageLoss);
}

function parseYahoo(payload: unknown): Bar[] {
  const result = (payload as {
    chart?: { result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
    }> };
  }).chart?.result?.[0];
  const raw = result?.indicators?.quote?.[0];
  return (result?.timestamp ?? []).flatMap((timestamp, index) => {
    const open = raw?.open?.[index];
    const high = raw?.high?.[index];
    const low = raw?.low?.[index];
    const close = raw?.close?.[index];
    const volume = raw?.volume?.[index];
    if (![open, high, low, close].every(validNumber)) return [];
    return [{
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: validNumber(volume) ? volume : 0,
    }];
  });
}

async function loadBars(symbol: string) {
  const mapped = symbol.replaceAll(".", "-");
  let lastError = "Historical feed unavailable";
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(mapped)}?range=5y&interval=1d&includePrePost=false&events=div%2Csplits`, {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0 StockCompass/4.0 backtest-engine" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        lastError = `Historical feed returned ${response.status}`;
        continue;
      }
      const bars = parseYahoo(await response.json());
      if (bars.length >= 120) return bars;
      lastError = "Not enough historical bars were returned";
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

function runBacktest(bars: Bar[], validationStartIndex: number) {
  const closes = bars.map((bar) => bar.close);
  const trades: Array<Trade & { entryIndex: number }> = [];
  const slippagePerSide = 0.0005;
  const feePerSide = 0.0005;

  for (let index = 50; index < bars.length - 2; index += 1) {
    const close = closes[index];
    const sma20 = average(closes.slice(index - 19, index + 1));
    const sma50 = average(closes.slice(index - 49, index + 1));
    const momentum = rsiAt(closes, index);
    const averageVolume20 = average(bars.slice(index - 19, index + 1).map((bar) => bar.volume));
    const volumeConfirmed = averageVolume20 === 0 || bars[index].volume >= averageVolume20 * 0.9;
    const setup = close > sma20 && close > sma50 && momentum !== null && momentum >= 45 && momentum <= 68 && volumeConfirmed;
    if (!setup) continue;

    const entryIndex = index + 1;
    const entry = bars[entryIndex].open * (1 + slippagePerSide);
    const support = Math.min(...bars.slice(index - 9, index + 1).map((bar) => bar.low));
    const stop = support * 0.99;
    const risk = entry - stop;
    if (risk <= 0 || risk / entry > 0.12) continue;
    const target = entry + risk * 2;
    const finalIndex = Math.min(entryIndex + 20, bars.length - 1);
    let exitIndex = finalIndex;
    let rawExit = bars[finalIndex].close;
    let exitReason: Trade["exitReason"] = "time";

    for (let cursor = entryIndex; cursor <= finalIndex; cursor += 1) {
      const bar = bars[cursor];
      if (bar.low <= stop) {
        exitIndex = cursor;
        rawExit = stop;
        exitReason = "stop";
        break;
      }
      if (bar.high >= target) {
        exitIndex = cursor;
        rawExit = target;
        exitReason = "target";
        break;
      }
    }

    const exit = rawExit * (1 - slippagePerSide);
    const returnPct = ((exit * (1 - feePerSide) - entry * (1 + feePerSide)) / (entry * (1 + feePerSide))) * 100;
    trades.push({
      entryIndex,
      entryDate: bars[entryIndex].date,
      exitDate: bars[exitIndex].date,
      entry,
      exit,
      stop,
      target,
      returnPct,
      outcome: returnPct > 0 ? "win" : "loss",
      exitReason,
    });
    index = exitIndex;
  }

  const summarise = (sample: Array<Trade & { entryIndex: number }>) => {
    const wins = sample.filter((trade) => trade.returnPct > 0);
    const losses = sample.filter((trade) => trade.returnPct <= 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.returnPct, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.returnPct, 0));
    let equity = 1;
    let peak = 1;
    let maximumDrawdown = 0;
    sample.forEach((trade) => {
      equity *= 1 + trade.returnPct / 100;
      peak = Math.max(peak, equity);
      maximumDrawdown = Math.min(maximumDrawdown, ((equity - peak) / peak) * 100);
    });
    return {
      trades: sample.length,
      wins: wins.length,
      losses: losses.length,
      winRate: sample.length ? (wins.length / sample.length) * 100 : 0,
      averageReturnPct: sample.length ? average(sample.map((trade) => trade.returnPct)) : 0,
      averageWinPct: wins.length ? average(wins.map((trade) => trade.returnPct)) : 0,
      averageLossPct: losses.length ? average(losses.map((trade) => trade.returnPct)) : 0,
      profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? null : 0,
      maximumDrawdownPct: maximumDrawdown,
      compoundedReturnPct: (equity - 1) * 100,
      sampleQuality: sample.length >= 50 ? "stronger" : sample.length >= 20 ? "limited" : "insufficient",
    };
  };

  const validationTrades = trades.filter((trade) => trade.entryIndex >= validationStartIndex);
  return {
    all: summarise(trades),
    validation: summarise(validationTrades),
    recentTrades: trades.slice(-12).reverse().map((trade) => ({
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      entry: trade.entry,
      exit: trade.exit,
      stop: trade.stop,
      target: trade.target,
      returnPct: trade.returnPct,
      outcome: trade.outcome,
      exitReason: trade.exitReason,
    })),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "NVDA").trim().toUpperCase();
  if (!symbolPattern.test(symbol)) return Response.json({ error: "Invalid symbol" }, { status: 400 });

  try {
    const bars = await loadBars(symbol);
    const validationStartIndex = Math.floor(bars.length * 0.7);
    const results = runBacktest(bars, validationStartIndex);
    const validationStart = bars[validationStartIndex]?.date ?? bars[0].date;
    const benchmarkStart = bars[validationStartIndex]?.close ?? bars[0].close;
    const benchmarkReturnPct = ((bars.at(-1)!.close - benchmarkStart) / benchmarkStart) * 100;
    return Response.json({
      symbol,
      period: { start: bars[0].date, end: bars.at(-1)!.date, bars: bars.length, validationStart },
      methodology: {
        entry: "Next daily open after price is above SMA20 and SMA50, RSI is 45–68, and volume is at least 90% of its 20-day average",
        exit: "1% below 10-day support, 2R target, or 20-trading-day time exit",
        costs: "0.05% slippage and 0.05% fee on each side",
        sameDayRule: "If stop and target are both touched on one daily bar, the stop is counted first",
      },
      benchmarkReturnPct,
      ...results,
      hypothetical: true,
      warning: "Historical backtesting is hypothetical and does not predict future results.",
    }, { headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=3600" } });
  } catch (error) {
    return Response.json({ symbol, error: error instanceof Error ? error.message : "Backtest unavailable" }, { status: 502 });
  }
}
