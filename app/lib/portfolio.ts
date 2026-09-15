export type TransactionType = "BUY" | "SELL" | "DIVIDEND";

export type JournalTransaction = {
  id: string;
  symbol: string;
  type: TransactionType;
  shares: number;
  price: number;
  fee: number;
  date: string;
  note?: string;
};

export type JournalPosition = {
  symbol: string;
  shares: number;
  averagePrice: number;
  costBasis: number;
  realisedProfit: number;
  dividends: number;
  fees: number;
};

export function calculatePositions(transactions: JournalTransaction[]) {
  const positions: Record<string, JournalPosition> = {};
  const ordered = [...transactions].sort((a, b) => `${a.date}-${a.id}`.localeCompare(`${b.date}-${b.id}`));

  ordered.forEach((transaction) => {
    const current = positions[transaction.symbol] ?? {
      symbol: transaction.symbol,
      shares: 0,
      averagePrice: 0,
      costBasis: 0,
      realisedProfit: 0,
      dividends: 0,
      fees: 0,
    };
    const fee = Math.max(transaction.fee || 0, 0);
    current.fees += fee;

    if (transaction.type === "DIVIDEND") {
      current.dividends += Math.max(transaction.price, 0) - fee;
      current.realisedProfit += Math.max(transaction.price, 0) - fee;
    } else if (transaction.type === "BUY") {
      const shares = Math.max(transaction.shares, 0);
      current.shares += shares;
      current.costBasis += shares * transaction.price + fee;
      current.averagePrice = current.shares ? current.costBasis / current.shares : 0;
    } else {
      const shares = Math.min(Math.max(transaction.shares, 0), current.shares);
      const averagePrice = current.shares ? current.costBasis / current.shares : 0;
      current.realisedProfit += shares * transaction.price - fee - shares * averagePrice;
      current.shares -= shares;
      current.costBasis = Math.max(current.costBasis - shares * averagePrice, 0);
      current.averagePrice = current.shares ? current.costBasis / current.shares : 0;
    }
    positions[transaction.symbol] = current;
  });

  return positions;
}

export function createExitPlan(entry: number, current: number, stop: number, sma20: number) {
  const safeEntry = Math.max(entry, 0.01);
  const safeStop = Math.min(Math.max(stop, 0.01), safeEntry * 0.999);
  const riskPerShare = Math.max(safeEntry - safeStop, safeEntry * 0.01);
  const target1 = safeEntry + riskPerShare;
  const target2 = safeEntry + riskPerShare * 2;
  const trailingStop = Math.max(safeStop, Math.min(sma20 * 0.99, current * 0.99), current >= target1 ? current * 0.92 : safeStop);
  const riskRewardAtCurrent = riskPerShare ? (target2 - current) / Math.max(current - safeStop, riskPerShare * 0.1) : 0;
  let action = "HOLD TO PLAN";
  let reason = "Price is between the planned stop and targets.";
  if (current <= safeStop) {
    action = "STOP BREACHED — REVIEW EXIT";
    reason = "The current price is at or below the invalidation level.";
  } else if (current >= target2) {
    action = "TAKE PROFIT / TRAIL REST";
    reason = "The position has reached the 2R target; protect the remaining gain.";
  } else if (current >= target1) {
    action = "SELL PART / RAISE STOP";
    reason = "The first target is reached; consider reducing risk and trailing the balance.";
  }
  return { stop: safeStop, target1, target2, trailingStop, riskPerShare, riskRewardAtCurrent, action, reason };
}
