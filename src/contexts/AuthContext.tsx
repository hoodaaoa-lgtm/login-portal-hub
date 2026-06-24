import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  /** "loading" until the first session check resolves, then settles. */
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** True only for the very first check on app boot (drives the splash screen). */
  initializing: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_CACHE_KEY = "hooda.session.cache.v1";

/**
 * Minimum time the splash stays on screen, in milliseconds.
 * The session check itself usually resolves near-instantly when a cached
 * session exists, which can make the splash flash on and off too fast to
 * register as an intentional screen. Instagram/TikTok/Facebook all hold
 * their splash for a short minimum beat regardless of how fast the check
 * finishes, so the transition reads as deliberate rather than a glitch.
 * The real auth check below is NOT delayed by this — only how long the
 * splash is shown for.
 */
const MIN_SPLASH_MS = 1400;

/**
 * Reads a tiny "do we plausibly have a session" hint from localStorage
 * synchronously, before Supabase has had a chance to resolve anything async.
 * This mirrors how apps like Instagram/TikTok decide, instantly on boot,
 * whether to render the splash → feed path or the splash → login path,
 * without waiting on a network round-trip.
 */
function readCachedHasSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCachedHasSession(hasSession: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (hasSession) window.localStorage.setItem(SESSION_CACHE_KEY, "1");
    else window.localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Storage can be unavailable (private mode, quota, etc). Non-fatal.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [initializing, setInitializing] = useState(true);
  const hasResolvedOnce = useRef(false);
  const bootStartedAt = useRef(Date.now());

  useEffect(() => {
    let mounted = true;
    let minSplashTimer: ReturnType<typeof setTimeout> | undefined;

    // Don't let the splash disappear before MIN_SPLASH_MS has elapsed, even
    // if the session check below resolves immediately. This never delays
    // the actual auth check — only how soon we're allowed to stop showing
    // the splash and reveal the resolved route underneath.
    function finishInitializing() {
      if (!mounted) return;
      const elapsed = Date.now() - bootStartedAt.current;
      const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
      minSplashTimer = setTimeout(() => {
        if (mounted) setInitializing(false);
      }, remaining);
    }

    // Supabase's own client already persists the session (localStorage) and
    // auto-refreshes the token in the background. getSession() here reads
    // that persisted session — it does not require a network round trip in
    // the common case, which is what keeps boot-time fast.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setStatus(data.session ? "authenticated" : "unauthenticated");
      writeCachedHasSession(!!data.session);
      hasResolvedOnce.current = true;
      finishInitializing();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setStatus(newSession ? "authenticated" : "unauthenticated");
      writeCachedHasSession(!!newSession);

      // Defensive: if for some reason the change fires before our initial
      // getSession() resolved, make sure we don't keep showing the splash.
      if (!hasResolvedOnce.current) {
        hasResolvedOnce.current = true;
        finishInitializing();
      }
    });

    return () => {
      mounted = false;
      if (minSplashTimer) clearTimeout(minSplashTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ status, session, user: session?.user ?? null, initializing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/**
 * Synchronous, best-effort hint for whether the user was logged in last time
 * we checked. Used only to decide the *initial* splash screen treatment
 * (e.g. skip an extra animation frame) — never to actually authorize access.
 */
export { readCachedHasSession };
