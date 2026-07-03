import React, { useState } from "react";
import { t } from "@/lib/useT";
import { Link, useRouterState } from "@tanstack/react-router";
import { HoodaLogo } from "@/components/HoodaLogo";
import { useTheme } from "@/contexts/ThemeContext";
import { useAvatar } from "@/contexts/AvatarContext";
import { useBadges } from "@/contexts/BadgeContext";
import { UserDrawer } from "@/components/UserDrawer";
import {
  Home, Compass, MessageSquare, Users, User, Tv, Menu,
  Moon, Sun, Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const NAV_ITEMS = [
  { to: "/home",       label: "Home",        Icon: Home        },
  { to: "/explorar",   label: t("nav.explore"),    Icon: Compass     },
  { to: "/mensagens",  label: t("nav.messages"),   Icon: MessageSquare },
  { to: "/perfil",     label: t("nav.profile"),      Icon: User        },
] as const;

const MOBILE_ITEMS = [
  { to: "/home",       label: "Home",      Icon: Home          },
  { to: "/explorar",   label: t("nav.explore"),  Icon: Compass       },
  { to: "/mensagens",  label: t("nav.messages"), Icon: MessageSquare },
  { to: null,          label: "Menu",      Icon: Menu          }, // Menu Hamburger
] as const;

/** Resolve o valor do badge para uma rota de navegação a partir dos contadores já carregados */
function badgeCountFor(to: string, unreadMessages: number, unreadCommunities: number): number {
  if (to === "/mensagens") return unreadMessages;  return 0;
}

/** Pequeno contador numérico — não altera layout, apenas sobrepõe */
function NavCountBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{
        background: "#E94B8A",
        minWidth: compact ? 16 : 18,
        height: compact ? 16 : 18,
        padding: compact ? "0 4px" : "0 5px",
        fontSize: compact ? 9 : 10,
        lineHeight: 1,
        boxShadow: "0 0 0 2px var(--surface-0)",
      }}
    >
      {label}
    </span>
  );
}

/* ─── Desktop Sidebar ─── */
export function SideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const { avatarUrl, name } = useAvatar();
  const { unreadMessages, unreadCommunities } = useBadges();
  const initial = (name?.[0] ?? "?").toUpperCase();
  const isPerfilActive = pathname === "/perfil";
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [currentUserId, setCurrentUserId] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setCurrentUserId(session.user.id);
    });
  }, []);

  return (
    <>
      {showDrawer && (
        <UserDrawer userId={currentUserId} onClose={() => setShowDrawer(false)} />
      )}
      <aside className="hooda-sidenav hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[260px] border-r z-40"
        style={{
          background: "var(--surface-0)",
        borderColor: "var(--border-subtle)",
      }}>
      {/* Logo */}
      <div className="px-6 pt-6 pb-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <HoodaLogo size="sm" animate={false} />
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const active = (to as string) === "/hoodatv" || (to as string) === "/studio"
            ? pathname.startsWith(to as string)
            : pathname === to;
          const isPerfil = to === "/perfil";
          return (
            <Link key={to} to={to}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 group"
              style={{
                background: active ? "rgba(91,63,207,0.10)" : "transparent",
                color: active ? "#5B3FCF" : "var(--text-secondary)",
              }}>
              {isPerfil ? (
                /* Avatar redondo com anel gradiente estilo Instagram */
                <div className="shrink-0 rounded-full p-[2px]"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, #5B3FCF 0%, #E94B8A 50%, #FFC93C 100%)"
                      : "transparent",
                    boxShadow: active ? "0 0 0 1.5px #5B3FCF44" : "none",
                  }}>
                  <div className="w-[22px] h-[22px] rounded-full overflow-hidden flex items-center justify-center text-[10px] font-extrabold text-white"
                    style={{ background: avatarUrl ? "transparent" : "#5B3FCF" }}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      : initial}
                  </div>
                </div>
              ) : (
                <Icon
                  className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-110"
                  strokeWidth={active ? 2.5 : 1.8}
                />
              )}
              <span style={{ fontWeight: active ? 700 : 500 }}>{label}</span>
              <span className="ml-auto flex items-center gap-2">
                <NavCountBadge count={badgeCountFor(to, unreadMessages, unreadCommunities)} />
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#5B3FCF" }} />
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: "var(--border-subtle)" }}>
        {/* Botão Menu — abre o UserDrawer */}
        <button
          onClick={() => setShowDrawer(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-[rgba(91,63,207,0.08)]"
          style={{ color: "var(--text-secondary)" }}>
          <Menu className="h-5 w-5" strokeWidth={1.8} />
          <span>Menu</span>
        </button>
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
          style={{ color: "var(--text-secondary)" }}>
          {theme === "dark"
            ? <Sun className="h-5 w-5" strokeWidth={1.8} />
            : <Moon className="h-5 w-5" strokeWidth={1.8} />}
          <span>{theme === "dark" ? t("settings.light_mode") : t("settings.dark_mode")}</span>
        </button>
      </div>
    </aside>
    </>
  );
}

/* ─── Mobile Bottom Nav ─── */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { avatarUrl, name } = useAvatar();
  const { unreadMessages, unreadCommunities } = useBadges();
  const initial = (name?.[0] ?? "?").toUpperCase();
  const [showDrawer, setShowDrawer] = useState(false);
  const [currentUserId, setCurrentUserId] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setCurrentUserId(session.user.id);
    });
  }, []);

  return (
    <>
      {showDrawer && <UserDrawer userId={currentUserId} onClose={() => setShowDrawer(false)} />}

      <nav className="hooda-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-40"
        style={{
          background: "var(--surface-0)",
          borderTop: "1px solid var(--border-subtle)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 4px)",
        }}>
        <ul className="grid grid-cols-5 h-[58px]">
          {MOBILE_ITEMS.map(({ to, label, Icon }) => {
            const isMenu = to === null;
            const active = !isMenu && (
              (to as string) === "/hoodatv" || (to as string) === "/studio"
                ? pathname.startsWith(to as string)
                : pathname === to
            );
            const badgeCount = !isMenu ? badgeCountFor(to as string, unreadMessages, unreadCommunities) : 0;

            return (
              <li key={label}>
                {isMenu ? (
                  <button onClick={() => setShowDrawer(true)}
                    className="flex flex-col items-center justify-center gap-1 h-full transition-all duration-150 active:scale-90"
                    style={{ color: "var(--text-muted)" }}>
                    <div className="relative flex items-center justify-center"
                      style={{
                        width: 38, height: 28, borderRadius: 12,
                        background: "transparent",
                        transition: "background 0.2s",
                      }}>
                      <Icon className="h-[20px] w-[20px]" strokeWidth={1.8} />
                    </div>
                    <span className="text-[9.5px] tracking-tight font-400">{label}</span>
                  </button>
                ) : (
                  <Link to={to as string}
                    className="flex flex-col items-center justify-center gap-1 h-full transition-all duration-150 active:scale-90"
                    style={{ color: active ? "#5B3FCF" : "var(--text-muted)" }}>
                    <div className="relative flex items-center justify-center"
                      style={{
                        width: 38, height: 28, borderRadius: 12,
                        background: active ? "rgba(91,63,207,0.12)" : "transparent",
                        transition: "background 0.2s",
                      }}>
                      <Icon className="h-[20px] w-[20px]" strokeWidth={active ? 2.5 : 1.8} />
                      {badgeCount > 0 && (
                        <span className="absolute flex items-center justify-center rounded-full font-bold text-white"
                          style={{
                            top: 2, right: 2,
                            minWidth: 15, height: 15, padding: "0 3px",
                            fontSize: 8.5, lineHeight: 1,
                            background: "#E94B8A",
                            boxShadow: "0 0 0 2px var(--surface-0)",
                          }}>
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[9.5px] tracking-tight" style={{ fontWeight: active ? 700 : 400 }}>{label}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/* ─── Page wrapper — adds sidebar padding on desktop ─── */
export function PageWrapper({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div
      key={pathname}
      className={`lg:ml-[260px] min-h-screen hooda-page-enter overflow-x-hidden ${className}`}
      style={{ background: "var(--s1)" }}
    >
      {children}
    </div>
  );
}
