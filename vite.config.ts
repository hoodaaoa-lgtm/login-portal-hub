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
      define: {
        // The published browser bundle needs the public backend config at
        // build time. If the VITE_* values are not present in the publish
        // environment, fall back to this app's public Lovable Cloud values so
        // the auth/client code does not crash on boot.
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
          process.env.VITE_SUPABASE_URL ||
            process.env.SUPABASE_URL ||
            "https://uiqxumshtqcmnjjciuba.supabase.co",
        ),
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            process.env.SUPABASE_PUBLISHABLE_KEY ||
            "sb_publishable_MhAthVjgpBekqplH8JFiIg_uV_GJkxL",
        ),
        "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
          process.env.VITE_SUPABASE_PROJECT_ID ||
            process.env.SUPABASE_PROJECT_ID ||
            "uiqxumshtqcmnjjciuba",
        ),
        // Lovable não permite segredos com prefixo VITE_ (são valores que vão
        // parar ao browser, não segredos verdadeiros). O segredo real
        // chama-se TENOR_API_KEY; aqui injetamo-lo como VITE_TENOR_API_KEY
        // para o código do cliente (src/routes/mensagens.tsx) o conseguir ler.
        "import.meta.env.VITE_TENOR_API_KEY": JSON.stringify(
          process.env.VITE_TENOR_API_KEY || process.env.TENOR_API_KEY || "",
        ),
      },
      resolve: {
        alias: [
          // workerd's `fs` polyfill is frozen, so graceful-fs's gracefulify()
          // throws at module init and crashes every SSR request. Replace it
          // with a thin stub for both client and SSR bundles.
          {
            find: "graceful-fs",
            replacement: new URL("./src/shims/graceful-fs.js", import.meta.url).pathname,
          },
          // lottie-react's package.json "browser" field points at a UMD build
          // that self-detects its environment (CommonJS vs AMD vs global) at
          // runtime. Vite's default client resolution prefers "browser" over
          // "module", so it picks that UMD build — and under Rolldown's CJS
          // interop shim the self-detection misfires and falls through to the
          // "attach to globalThis" branch, which needs a global `React`/`Lottie`
          // that doesn't exist here. The result: the default export resolves to
          // an invalid/undefined component, and React throws error #130
          // ("Element type is invalid") the moment a Lottie sticker renders —
          // which crashes the whole page via the root error boundary.
          // Force resolution to the clean ESM build instead, which has a real
          // `export { Lottie as default }` and no environment sniffing.
          // `find` is an exact-match regex so it doesn't also match (and
          // recurse into) the replacement path itself.
          { find: /^lottie-react$/, replacement: "lottie-react/build/index.es.js" },
        ],
      },
      build: {
        // Remove console.log/debugger do bundle final de produção — o dev
        // server (npm run dev) não passa por aqui, então o debug local
        // continua normal. console.error e console.warn ficam (úteis para
        // monitorização de erros reais em produção).
        minify: "terser",
        terserOptions: {
          compress: {
            pure_funcs: ["console.log", "console.debug", "console.info"],
            drop_debugger: true,
          },
        },
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
