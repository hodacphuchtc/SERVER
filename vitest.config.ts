import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // PGlite khởi động một Postgres nhúng cho mỗi file test — chậm hơn test thuần,
    // nên nới timeout. Vẫn nhanh hơn nhiều so với dựng Docker.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
