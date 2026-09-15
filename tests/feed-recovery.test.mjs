import assert from "node:assert/strict";
import test from "node:test";
import { quoteFreshness } from "../app/lib/market-freshness.ts";
import { GET as fundamentals } from "../app/api/fundamentals/route.ts";
import { GET as news } from "../app/api/news/route.ts";

test("closed regular session is healthy but cannot enable live signals", () => {
  const f = quoteFreshness("2026-09-09T20:00:01Z", "OVERNIGHT", "regular", Date.parse("2026-09-10T00:50:00Z"));
  assert.equal(f.isStale, false);
  assert.equal(f.signalEligible, false);
  assert.equal(f.freshness, "session-closed");
});
test("midday outage and missed session stay stale, even on a holiday", () => {
  const now = Date.parse("2026-09-07T15:00:00Z"); // Labor Day, Friday is required.
  assert.equal(quoteFreshness("2026-09-04T20:00:00Z", "CLOSED", "regular", now).isStale, false);
  assert.equal(quoteFreshness("2026-09-03T20:00:00Z", "CLOSED", "regular", now).isStale, true);
  assert.equal(quoteFreshness("2026-09-04T16:00:00Z", "CLOSED", "regular", now).isStale, true);
});
test("active sessions retain the ten-minute guard and reject future timestamps", () => {
  const now = Date.parse("2026-09-10T15:00:00Z");
  assert.equal(quoteFreshness("2026-09-10T14:40:00Z", "REGULAR", "regular", now).isStale, true);
  assert.equal(quoteFreshness("2026-09-10T14:59:00Z", "REGULAR", "regular", now).signalEligible, true);
  assert.equal(quoteFreshness("2026-09-11T15:00:00Z", "REGULAR", "regular", now).isStale, true);
});
test("early closes and DST retain the proper completed session", () => {
  const now = Date.parse("2026-11-27T20:00:00Z");
  assert.equal(quoteFreshness("2026-11-27T18:00:00Z", "CLOSED", "regular", now).isStale, false);
  assert.equal(quoteFreshness("2026-11-25T21:00:00Z", "CLOSED", "regular", now).isStale, true);
});
test("news falls back when Google fails; filters old dates and empty responses", async t => {
  const recent = new Date().toUTCString();
  t.mock.method(globalThis, "fetch", async input => {
    if (!String(input).includes("feeds.finance.yahoo.com")) return new Response("unavailable", {status:502});
    return new Response(`<rss><channel><item data-id="1"><title><![CDATA[Apple reports earnings]]></title><link>https://example.com/new</link><pubDate>${recent}</pubDate></item><item><title>Old news</title><link>https://example.com/old</link><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item></channel></rss>`);
  });
  const r = await news(new Request("https://local/api/news?symbol=AAPL"));
  const p = await r.json();
  assert.equal(r.status,200); assert.equal(p.items.length,1);
  assert.match(p.source,/Yahoo Finance RSS/);
  globalThis.fetch.mock.mockImplementation(async()=>new Response("<rss/>"));
  assert.equal((await news(new Request("https://local/api/news?symbol=AAPL"))).status,502);
});
test("financial fallback uses dated statements and never invents unavailable fields", async t => {
  const date = new Date(Date.now() - 60 * 86400000).toISOString().slice(0,10);
  const prior = new Date(Date.parse(date) - 365 * 86400000).toISOString().slice(0,10);
  const values = {trailingTotalRevenue:120, trailingDilutedEPS:6, trailingFreeCashFlow:50,
    quarterlyTotalDebt:30,quarterlyStockholdersEquity:100,quarterlyCashCashEquivalentsAndShortTermInvestments:40};
  t.mock.method(globalThis,"fetch",async input => {
    if (String(input).includes("/timeseries/")) return Response.json({timeseries:{result:Object.entries(values).map(([key,val])=>({
      [key]:[{asOfDate:prior,currencyCode:"USD",reportedValue:{raw:val/1.2}},{asOfDate:date,currencyCode:"USD",reportedValue:{raw:val}}]
    }))}});
    if (String(input).includes("/chart/")) return Response.json({chart:{result:[{meta:{regularMarketPrice:120,regularMarketTime:Date.now()/1000,currency:"USD"}}]}});
    return new Response("unauthorized",{status:401});
  });
  const r = await fundamentals(new Request("https://local/api/fundamentals?symbol=AAPL"));
  const {fundamentals:f} = await r.json();
  assert.equal(r.status,200); assert.equal(f.trailingPE,20);
  assert.ok(Math.abs(f.revenueGrowthPct - 20) < .001);
  assert.equal(f.debtToEquity,30); assert.equal(f.earningsDate,null);
  assert.equal(f.marketCap,null); assert.equal(f.asOfDate,date);
  assert.equal(f.signalEligible,true);
});
