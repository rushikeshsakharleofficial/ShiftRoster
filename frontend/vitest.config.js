import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "treat-js-files-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (/src\/.*\.js$/.test(id)) {
          const { transformWithEsbuild } = await import("vite");
          return transformWithEsbuild(code, id, {
            loader: "jsx",
            jsx: "automatic",
          });
        }
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "src/setupTests.js",
      ]
    },
    include: ["tests/**/*.test.{js,jsx}", "src/**/*.test.{js,jsx}"],
  },
});
