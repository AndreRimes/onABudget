import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the `~/*` path in tsconfig.json. Kept as a literal alias rather
    // than a tsconfig-paths plugin so the test runner has no extra dependency
    // to keep in step with the compiler.
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      // `import "server-only"` throws outside a React Server Component, which
      // would fail any suite whose module graph reaches the metrics or db
      // modules. The package ships an empty build for exactly this case.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    env: {
      // Some units under test sit in modules that also import `~/server/db`.
      // The libsql client connects lazily, so an in-memory URL is enough to
      // let those modules load without ever touching the real database — and
      // guarantees a stray query in a test cannot write to db.sqlite.
      SKIP_ENV_VALIDATION: "1",
      DATABASE_URL: "file::memory:",
    },
  },
});
