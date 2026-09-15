import assert from "node:assert/strict";
import test from "node:test";

test("renders the Stock Compass dashboard", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>Stock Compass<\/title>/i);
  assert.match(html, /My Holdings/i);
  assert.match(html, /Pre-market/i);
  assert.match(html, /After-hours/i);
  assert.match(html, /Market data/i);
  assert.match(html, /52-week range/i);
  assert.match(html, /Choose chart period/i);
  assert.match(html, /Transaction journal/i);
  assert.match(html, /Advanced exit planner/i);
  assert.match(html, /Signal backtest/i);
  assert.match(html, /Fundamentals &amp; earnings/i);
  assert.match(html, /Price alerts/i);
});

test("health endpoint detects actual provider failures without exposing credentials", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Provider failed", { status: 502 }));
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("health-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/api/health"), {}, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.status, "degraded");
  assert.equal(payload.services.fundamentals.status, "failed");
  assert.equal(payload.services.news.status, "failed");
  assert.equal(payload.services.safeguards.staleSignalGuard, true);
  assert.equal(JSON.stringify(payload).includes("ALPACA_API_SECRET"), false);
});

test("research endpoints reject invalid symbols before external requests", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("validation-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const context = { waitUntil() {}, passThroughOnException() {} };
  const [backtest, fundamentals] = await Promise.all([
    worker.fetch(new Request("http://localhost/api/backtest?symbol=BAD%20SYMBOL"), {}, context),
    worker.fetch(new Request("http://localhost/api/fundamentals?symbol=BAD%20SYMBOL"), {}, context),
  ]);
  assert.equal(backtest.status, 400);
  assert.equal(fundamentals.status, 400);
});
