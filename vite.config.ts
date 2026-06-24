// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
  // or the app will break with duplicate plugins:
  //   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
  //     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
  //     error logger plugins, and sandbox detection (port/host/strictPort).
  // You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
  import { defineConfig } from "@lovable.dev/vite-tanstack-config";

  export default defineConfig({
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
    vite: {
      build: {
        // Split output into smaller chunks — navegadores só descarregam o que precisam
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // Isolate heavy UI libraries
              if (
                id.includes("@radix-ui/react-dialog") ||
                id.includes("@radix-ui/react-dropdown-menu") ||
                id.includes("@radix-ui/react-popover") ||
                id.includes("@radix-ui/react-tabs") ||
                id.includes("@radix-ui/react-select")
              ) {
                return "vendor-radix";
              }
              if (
                id.includes("@tanstack/react-query") ||
                id.includes("@tanstack/react-router")
              ) {
                return "vendor-tanstack";
              }
              if (id.includes("@supabase/supabase-js")) {
                return "vendor-supabase";
              }
              if (id.includes("recharts")) {
                return "vendor-charts";
              }
            },
          },
        },
        // Avisar quando chunks > 400 kB (default 500)
        chunkSizeWarningLimit: 400,
      },
    },
  });
