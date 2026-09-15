/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy. Next.js hydrates through inline scripts and styles
 * (and next-themes sets the colour scheme with one), so `'unsafe-inline'` has
 * to stay on both — the policy is not a script whitelist here so much as a
 * fence around everything else: no plugins, no framing, no form posting or
 * network calls to hosts other than our own and the Pluggy Connect widget,
 * and `base-uri 'self'` so an injected <base> cannot redirect relative URLs.
 *
 * The dev server evaluates source maps and hot-reloads over a websocket,
 * neither of which production needs.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // pdf.js runs its parser in a worker; it is served from our own origin but
  // may fall back to a blob-backed one.
  "worker-src 'self' blob:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  // The Open Finance consent flow renders inside Pluggy's iframe.
  "frame-src https://connect.pluggy.ai",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Only meaningful over TLS, and harmful on a plain-http dev server (the
  // browser would pin localhost to https for a year).
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
];

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Barrel packages: a named import from any of these otherwise pulls the
    // whole library through the bundler before tree-shaking gets a say, which
    // is most of the compile time and a good share of the shipped bytes.
    optimizePackageImports: [
      "recharts",
      "lucide-react",
      "date-fns",
      "@hugeicons/react",
      "@hugeicons/core-free-icons",
      "radix-ui",
      "@base-ui/react",
    ],
  },
};

export default config;
