/**
 * Next.js runs `register()` once per server process, before any request.
 * Used here to start the Prometheus registry (so default metrics cover the
 * whole process lifetime, not just from the first scrape) and to prime the
 * business gauges so nothing is missing on the very first scrape.
 */
export async function register() {
  // This file is evaluated in every runtime; prom-client is Node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await import("~/server/metrics");

  const { refreshBusinessGauges } = await import("~/server/metrics/business");
  await refreshBusinessGauges();
}
