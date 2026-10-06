import assert from "node:assert/strict";
import test from "node:test";
import { latestQuote, quoteStatus, scoreStatus, signalStatus } from "../app/lib/signal-status.ts";

const now = Date.parse("2026-09-18T15:00:00Z");
const quote = { price: 100, updated: "2026-09-18T14:59:00Z", isStale: false, signalEligible: true, coverage: "regular" };
const history = { historyBars: 200, historyUpdated: "2026-09-18T13:30:00Z", sma20: 95, sma50: 90, rsi: 55 };

test("a stale selected-stock cache cannot replace a fresher board quote", () => {
  const old = { ...quote, updated: "2026-09-18T14:00:00Z", price: 80, coverage: "extended" };
  const selected = latestQuote(quote, old, now);
  assert.equal(selected, quote);
  assert.equal(signalStatus({ quote: selected, history, mode: "short" }, now).blocked, false);
  assert.equal(quoteStatus(old, now).blocked, true);
});

test("closed sessions have a clear reason and never enable live instructions", () => {
  const closed = { ...quote, updated: "2026-09-17T20:00:00Z", signalEligible: false };
  const status = quoteStatus(closed, Date.parse("2026-09-18T10:00:00Z"));
  assert.equal(status.blocked, true);
  assert.equal(status.label, "Outside feed hours");
  assert.equal(quoteStatus({ ...closed, coverage: "daily" }, Date.parse("2026-09-18T10:00:00Z")).label, "Daily prices only");
});

test("live prices cannot enable technical signals without sufficient real history", () => {
  assert.equal(signalStatus({ quote, mode: "short" }, now).label, "History not loaded");
  const short = signalStatus({ quote, history: { ...history, historyBars: 49 }, mode: "short" }, now);
  assert.equal(short.blocked, true);
  assert.match(short.reason, /49.*50/);
  assert.equal(signalStatus({ quote, history: { ...history, historyUpdated: "2026-09-01T13:30:00Z" }, mode: "short" }, now).label, "History outdated");
});

test("fundamentals pauses affect long-term analysis, not valid short-term data", () => {
  assert.equal(signalStatus({ quote, history, mode: "short" }, now).blocked, false);
  assert.equal(signalStatus({ quote, history, mode: "long" }, now).label, "Research not loaded");
  const failed = signalStatus({ quote, mode: "long", fundamentalsError: "Statements unavailable" }, now);
  assert.equal(failed.label, "Fundamentals unavailable");
  assert.match(failed.reason, /Statements unavailable/);
  assert.equal(signalStatus({ quote, mode: "long", fundamentals: { updated: "invalid" } }, now).blocked, true);
});

test("future, stale, failed and zero-price quotes stay blocked", () => {
  assert.equal(latestQuote({ ...quote, updated: "2026-09-19T15:00:00Z" }, quote, now), quote);
  for (const bad of [ { ...quote, price: 0 }, { ...quote, isStale: true },
    { ...quote, updated: "2026-09-18T14:40:00Z" }, { ...quote, updated: "2026-09-19T15:00:00Z" } ]) {
    assert.equal(quoteStatus(bad, now).blocked, true);
  }
});

test("latest completed-session scores stay visible while live actions remain paused", () => {
  const overnight = Date.parse("2026-09-19T02:00:00Z");
  const closed = { ...quote, updated: "2026-09-18T20:00:01Z", signalEligible: false };
  const input = { quote: closed, history, mode: "short" };
  const score = scoreStatus(input, overnight);
  assert.equal(score.blocked, false);
  assert.equal(score.isReference, true);
  assert.equal(score.asOf, closed.updated);
  assert.equal(score.label, "Reference score");
  assert.equal(signalStatus(input, overnight).blocked, true);
  assert.equal(scoreStatus(input, Date.parse("2026-09-19T18:00:00Z")).blocked, false);
});

test("daily-only data supports dated research but never a live action", () => {
  const daily = { ...quote, updated: "2026-09-17T20:00:00Z", coverage: "daily", signalEligible: false };
  const input = { quote: daily, history: { ...history, historyUpdated: "2026-09-17T13:30:00Z" }, mode: "short" };
  assert.equal(scoreStatus(input, now).blocked, false);
  assert.equal(scoreStatus(input, now).isReference, true);
  assert.equal(signalStatus(input, now).blocked, true);
});

test("reference scores still require complete and current analysis inputs", () => {
  const overnight = Date.parse("2026-09-19T02:00:00Z");
  const closed = { ...quote, updated: "2026-09-18T20:00:01Z", signalEligible: false };
  for (const missing of [undefined, { ...history, historyBars: 49 }, { ...history, rsi: null },
    { ...history, historyUpdated: "2026-09-01T13:30:00Z" }]) {
    assert.equal(scoreStatus({ quote: closed, history: missing, mode: "short" }, overnight).blocked, true);
  }
  assert.equal(scoreStatus({ quote: closed, mode: "long" }, overnight).blocked, true);
  assert.equal(scoreStatus({ quote: closed, mode: "long", fundamentals: { updated: new Date(overnight).toISOString(), signalEligible: false } }, overnight).blocked, true);
  assert.equal(scoreStatus({ quote: closed, mode: "long", fundamentals: { updated: new Date(overnight).toISOString(), signalEligible: true } }, overnight).blocked, false);
});

test("fresh scores retain live behavior and outdated quotes never expose a score", () => {
  const input = { quote, history, mode: "short" };
  assert.equal(scoreStatus(input, now).label, "Current score");
  assert.equal(scoreStatus(input, now).isReference, false);
  assert.equal(signalStatus(input, now).blocked, false);
  for (const failed of [{ ...quote, isStale: true }, { ...quote, updated: "2026-09-18T14:00:00Z" },
    { ...quote, price: 0 }, { ...quote, signalEligible: false }]) {
    assert.equal(scoreStatus({ ...input, quote: failed }, now).blocked, true);
  }
});
