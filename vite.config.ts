import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Build config is separated by Vite `mode`, not by ad-hoc environment sniffing:
 *
 * - `development` (`pnpm dev`, `pnpm desktop:dev`) — unminified, inline sourcemaps,
 *   served on the fixed port the Tauri dev shell expects.
 * - `preview` (`pnpm build --mode preview && pnpm preview`) — production-shaped bundle
 *   with sourcemaps retained, so a packaging dry run stays debuggable.
 * - `production` (`pnpm build`, and the `beforeBuildCommand` of `tauri build`) —
 *   minified, no sourcemaps, no dev-only globals.
 *
 * `DEV_SERVER_PORT` is fixed and `strictPort` is on: `src-tauri/tauri.conf.json` points
 * `build.devUrl` at exactly this origin, so a silently reassigned port must fail loudly
 * rather than leave the desktop shell pointed at someone else's server.
 */
const DEV_SERVER_PORT = 5202;

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    plugins: [react()],
    // Tauri's CLI owns the terminal during `tauri dev`; do not wipe its output.
    clearScreen: false,
    // Only these prefixes are inlined into the client bundle. Anything else in the
    // process environment stays on the Rust side of the boundary.
    envPrefix: ["VITE_", "TAURI_ENV_"],
    server: {
      host: "127.0.0.1",
      port: DEV_SERVER_PORT,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: DEV_SERVER_PORT,
      strictPort: true,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "es2022",
      sourcemap: !isProduction,
      minify: isProduction ? "oxc" : false,
    },
    define: {
      __APP_MODE__: JSON.stringify(mode),
    },
  };
});
