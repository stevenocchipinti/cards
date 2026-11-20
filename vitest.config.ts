import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Convex function tests need the edge runtime; pure src/ logic runs fine there too.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
  },
});
