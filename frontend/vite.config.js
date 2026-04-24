import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      // Treat all .js files in src/ as JSX before any other plugin runs
      {
        name: "treat-js-files-as-jsx",
        enforce: "pre",
        async transform(code, id) {
          if (/src\/.*\.js$/.test(id)) {
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
    envPrefix: "REACT_APP_",
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          ".js": "jsx",
        },
      },
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        mode === "production" ? "production" : "development"
      ),
    },
    server: {
      port: 3000,
      open: false,
    },
    build: {
      outDir: "build",
      sourcemap: false,
      minify: "esbuild",
      terserOptions: undefined,
    },
    esbuild: {
      drop: mode === "production" ? ["console", "debugger"] : [],
    },
  };
});
