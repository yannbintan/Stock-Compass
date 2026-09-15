/** US cash-equity calendar: https://www.nyse.com/trade/hours-calendars
 * Outside the verified calendar window, fail conservatively instead of assuming a holiday.
 */
const holidays = new Set([
  "2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25",
  "2027-01-01","2027-01-18","2027-02-15","2027-03-26","2027-05-31","2027-06-18","2027-07-05","2027-09-06","2027-11-25","2027-12-24",
  "2028-01-17","2028-02-21","2028-04-14","2028-05-29","2028-06-19","2028-07-04","2028-09-04","2028-11-23","2028-12-25",
]);
const earlyCloses = new Set(["2026-11-27","2026-12-24","2027-11-26","2028-07-03","2028-11-24"]);
const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function nyClock(ms: number) {
  const p = Object.fromEntries(clock.formatToParts(ms).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}
function tradingDay(date: string) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(date);
}
function previousDate(date: string) {
  return new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
}
export function regularClose(date: string) { return earlyCloses.has(date) ? 780 : 960; }
export function isTradingDate(date: string) { return tradingDay(date); }

/** Feed health and permission to produce a live signal are intentionally separate. */
export function quoteFreshness(updated: string, _session: string, coverage: "regular" | "extended" | "overnight" | "daily" = "regular", now = Date.now()) {
  const stamp = Date.parse(updated);
  const ageSeconds = Math.round((now - stamp) / 1000);
  const today = nyClock(now);
  const quoted = Number.isFinite(stamp) ? nyClock(stamp) : null;
  const knownCalendar = today.date >= "2026-01-01" && today.date <= "2028-12-31";
  const close = regularClose(today.date);
  const open = coverage === "extended" ? 240 : 570;
  const end = coverage === "extended" ? (earlyCloses.has(today.date) ? 1020 : 1200) : close;
  const active = coverage === "overnight"
    ? _session !== "CLOSED" && isTradingDate(today.date)
    : coverage !== "daily" && tradingDay(today.date) && today.minute >= open && today.minute < end;
  let expected = today.date;
  if (!tradingDay(expected) || today.minute < (coverage === "daily" ? close + 30 : end)) {
    expected = previousDate(expected);
  }
  for (let i = 0; i < 10 && !tradingDay(expected); i++) expected = previousDate(expected);
  // A closed session can retain its last trade, but not a prior session or a midday outage.
  const latestCompletedSession = quoted && quoted.date >= expected &&
    (coverage === "daily" || quoted.date > expected || quoted.minute >= regularClose(expected) - 10);
  const invalid = !Number.isFinite(stamp) || ageSeconds < -60;
  const isStale = invalid || (active || !knownCalendar ? ageSeconds > 600 : !latestCompletedSession);
  const signalEligible = !isStale && active && coverage !== "daily";
  return {
    ageSeconds: Number.isFinite(ageSeconds) ? Math.max(0, ageSeconds) : null,
    staleAfterSeconds: active ? 600 : null,
    isStale, signalEligible, freshness: isStale ? "stale" : active ? ageSeconds <= 90 ? "live" : "recent" : "session-closed",
    freshnessReason: isStale ? "Quote is missing, outdated, or older than the latest completed session."
      : active ? "Quote is current for this feed's supported session."
      : "Latest completed session; live signals paused outside this feed's coverage.",
    expectedSessionDate: active ? today.date : expected,
    calendarValidThrough: "2028-12-31",
    coverage,
  };
}
