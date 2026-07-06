import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { idbPersister } from "../lib/idbPersister";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AvatarProvider } from "../contexts/AvatarContext";
import { BadgeProvider } from "../contexts/BadgeContext";
import { CountryProvider } from "../contexts/CountryContext";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { BottomNav } from "../components/AppShell";
import { TopProgressBar } from "../components/TopProgressBar";
import { SplashScreen, SPLASH_EXIT_MS } from "../components/SplashScreen";
import { useGlobalMediaFadeIn } from "../hooks/useGlobalMediaFadeIn";

import appCss from "../styles.css?url";
import "../lib/i18n";
import { reportLovableError } from "../lib/lovable-error-reporting";

// Routes that don't require an authenticated session.
const PUBLIC_ROUTES = new Set(["/", "/signup", "/reset-password"]);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5" },
      { title: "Hooda" },
      { name: "description", content: "Hooda é a rede social para partilhares vídeos, fotos e Gotas, conversares com amigos e descobrires conteúdo novo todos os dias. Cria a tua conta grátis." },
      { name: "keywords", content: "Hooda, rede social, partilhar vídeos, Gotas, Hooda TV, Hooda Studio" },
      { name: "author", content: "Hooda" },
      { property: "og:title", content: "Hooda — Partilha Vídeos, Fotos e Conversa com Amigos" },
      { property: "og:description", content: "Hooda é a rede social para partilhares vídeos, fotos e Gotas, conversares com amigos e descobrires conteúdo novo todos os dias." },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_PT" },
      { property: "og:site_name", content: "Hooda" },
      { property: "og:url", content: "https://hoode.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Hooda — Partilha Vídeos, Fotos e Conversa com Amigos" },
      { name: "twitter:description", content: "Hooda é a rede social para partilhares vídeos, fotos e Gotas, conversares com amigos e descobrires conteúdo novo todos os dias." },
      { property: "og:image", content: "https://hoode.lovable.app/icons/icon-512.png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { name: "twitter:image", content: "https://hoode.lovable.app/icons/icon-512.png" },
      { name: "robots", content: "index, follow" },
      // PWA
      { name: "theme-color", content: "#5B3FCF" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Hooda" },
      { name: "application-name", content: "Hooda" },
      { name: "msapplication-TileColor", content: "#5B3FCF" },
      { name: "msapplication-TileImage", content: "/icons/icon-144.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "apple-touch-icon", sizes: "152x152", href: "/icons/icon-152.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/icon-180.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icons/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Persiste o cache do React Query em IndexedDB — capacidade 50-500 MB
// (vs ~5 MB do localStorage), operações assíncronas que não bloqueiam
// a UI, e dados aparecem instantaneamente ao reabrir a app.
// Padrão stale-while-revalidate: mostra dados guardados → atualiza em background.
const persister = idbPersister;

function RootComponent() {
  // Registar Service Worker para PWA
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
  const { queryClient } = Route.useRouteContext();
  useGlobalMediaFadeIn();

  if (!persister) {
    // Caminho de SSR: sem persistência (não há localStorage no servidor),
    // mas o conteúdo é hidratado normalmente assim que chega ao browser.
    return (
      <AppProviders queryClient={queryClient}>
        <AuthGate>
          <TopProgressBar />
          <Outlet />
          <ConditionalBottomNav />
        </AuthGate>
      </AppProviders>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // IndexedDB aguenta muito mais do que localStorage — cache válido 7 dias.
        // O staleTime de cada query controla quando o refetch silencioso acontece.
        maxAge: 7 * 24 * 60 * 60 * 1000,
        // Persiste todas as queries exceto as marcadas explicitamente como privadas.
        // Queries com meta: { persist: false } nunca vão para disco.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.meta?.persist !== false,
        },
      }}
    >
      <AppProviders queryClient={queryClient}>
        <AuthGate>
          <TopProgressBar />
          <Outlet />
          <ConditionalBottomNav />
        </AuthGate>
      </AppProviders>
    </PersistQueryClientProvider>
  );
}

const PUBLIC_NAV_HIDDEN = new Set(["/", "/signup", "/reset-password"]);

function ConditionalBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (PUBLIC_NAV_HIDDEN.has(pathname)) return null;
  return <BottomNav />;
}

function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <CountryProvider>
      <AuthProvider>
        <ThemeProvider>
          <AvatarProvider>
            <BadgeProvider>{children}</BadgeProvider>
          </AvatarProvider>
        </ThemeProvider>
      </AuthProvider>
    </CountryProvider>
  );
}

// Depois do splash ter saído uma vez, nunca mais aparece mesmo que o componente remonte.
let _splashDone = false;
const SPLASH_MIN_MS = 5000;

function AuthGate({ children }: { children: ReactNode }) {
  const { status, initializing } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  const [showSplash, setShowSplash] = useState(() => !_splashDone && initializing);
  const [leaving, setLeaving] = useState(false);
  const splashStartRef = useRef(Date.now());

  useEffect(() => {
    if (_splashDone) { setShowSplash(false); return; }
    if (!initializing && showSplash) {
      // Garantir duração mínima para a animação completar
      const elapsed = Date.now() - splashStartRef.current;
      const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
      const t1 = setTimeout(() => {
        setLeaving(true);
        const t2 = setTimeout(() => {
          _splashDone = true;
          setShowSplash(false);
          setLeaving(false);
        }, SPLASH_EXIT_MS);
        return () => clearTimeout(t2);
      }, remaining);
      return () => clearTimeout(t1);
    }
  }, [initializing, showSplash]);

  useEffect(() => {
    if (initializing) return;
    if (status === "unauthenticated" && !isPublicRoute) {
      navigate({ to: "/", replace: true });
      return;
    }
    if (status === "authenticated" && isPublicRoute && pathname !== "/reset-password") {
      navigate({ to: "/home", replace: true });
    }
  }, [status, initializing, isPublicRoute, pathname, navigate]);

  if (showSplash) return <SplashScreen leaving={leaving} />;

  return <>{children}</>;
}
