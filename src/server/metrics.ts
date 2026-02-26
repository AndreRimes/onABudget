import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";

export const register = new Registry();

collectDefaultMetrics({ register }); 

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const trpcRequestCounter = new Counter({
  name: "trpc_requests_total",
  help: "Total tRPC requests",
  labelNames: ["procedure", "type"],
  registers: [register],
});