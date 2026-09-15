import assert from "node:assert/strict";
import test from "node:test";
import { calculatePositions, createExitPlan } from "../app/lib/portfolio.ts";
import { evaluatePriceAlerts } from "../app/lib/alerts.ts";

test("transaction journal handles multiple buys, a partial sale, fees and dividends", () => {
  const positions = calculatePositions([
    { id: "1", symbol: "AAPL", type: "BUY", shares: 10, price: 100, fee: 1, date: "2026-01-01" },
    { id: "2", symbol: "AAPL", type: "BUY", shares: 5, price: 120, fee: 1, date: "2026-01-02" },
    { id: "3", symbol: "AAPL", type: "SELL", shares: 5, price: 130, fee: 1, date: "2026-01-03" },
    { id: "4", symbol: "AAPL", type: "DIVIDEND", shares: 0, price: 20, fee: 0, date: "2026-01-04" },
  ]);

  assert.equal(positions.AAPL.shares, 10);
  assert.equal(Number(positions.AAPL.averagePrice.toFixed(2)), 106.8);
  assert.equal(Number(positions.AAPL.realisedProfit.toFixed(2)), 135);
  assert.equal(positions.AAPL.dividends, 20);
  assert.equal(positions.AAPL.fees, 3);
});

test("exit planner creates one-risk and two-risk targets", () => {
  const plan = createExitPlan(100, 105, 95, 98);
  assert.equal(plan.stop, 95);
  assert.equal(plan.target1, 105);
  assert.equal(plan.target2, 110);
  assert.equal(plan.action, "SELL PART / RAISE STOP");
});

test("price alerts fire once after crossing the target", () => {
  const alert = { id: "a", symbol: "NVDA", direction: "ABOVE", target: 200, enabled: true, createdAt: "2026-01-01T00:00:00Z" };
  const first = evaluatePriceAlerts([alert], { NVDA: 201 }, "2026-01-02T00:00:00Z");
  assert.equal(first.triggered.length, 1);
  assert.equal(first.alerts[0].enabled, false);
  const second = evaluatePriceAlerts(first.alerts, { NVDA: 205 }, "2026-01-03T00:00:00Z");
  assert.equal(second.triggered.length, 0);
});
