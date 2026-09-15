export type PriceAlert = {
  id: string;
  symbol: string;
  direction: "ABOVE" | "BELOW";
  target: number;
  enabled: boolean;
  createdAt: string;
  triggeredAt?: string;
};

export function evaluatePriceAlerts(alerts: PriceAlert[], prices: Record<string, number>, now = new Date().toISOString()) {
  const triggered: PriceAlert[] = [];
  const next = alerts.map((alert) => {
    if (!alert.enabled || alert.triggeredAt || typeof prices[alert.symbol] !== "number") return alert;
    const crossed = alert.direction === "ABOVE" ? prices[alert.symbol] >= alert.target : prices[alert.symbol] <= alert.target;
    if (!crossed) return alert;
    const fired = { ...alert, triggeredAt: now, enabled: false };
    triggered.push(fired);
    return fired;
  });
  return { alerts: next, triggered };
}
