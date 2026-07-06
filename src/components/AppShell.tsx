import React, { useState } from "react";
import { t } from "@/lib/useT";
import { Link, useRouterState, useNavigate, useRouter } from "@tanstack/react-router";
import { HoodaLogo } from "@/components/HoodaLogo";
import { useTheme } from "@/contexts/ThemeContext";
import { useAvatar } from "@/contexts/AvatarContext";
import { useBadges } from "@/contexts/BadgeContext";
import { UserDrawer } from "@/components/UserDrawer";
import { QuickPostModal } from "@/components/QuickComposer";
import {
  Home, Compass, MessageSquare, Users, User, Tv, Menu,
  Moon, Sun, Bell, Droplet, Feather, MoreHorizontal, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const NAV_ITEMS = [
  { to: "/home",       label: t("nav.home"),          Icon: Home,          search: undefined as Record<string, string> | undefined },
  { to: "/explorar",   label: t("nav.explore"),     Icon: Compass,       search: undefined as Record<string, string> | undefined },
  { to: "/drops",      label: "Gotas",         Icon: Droplet,       search: undefined as Record<string, string> | undefined },
  { to: "/mensagens",  label: t("nav.messages"),    Icon: MessageSquare, search: undefined as Record<string, string> | undefined },
  { to: "/home",       label: "Notificações",  Icon: Bell,          search: { notifications: "1" } as Record<string, string> | undefined },
  { to: "/perfil",     label: t("nav.profile"),       Icon: User,          search: undefined as Record<string, string> | undefined },
] as const;

const MOBILE_ITEMS = [
  { to: "/home",       label: t("nav.home"),      Icon: Home          },
  { to: "/explorar",   label: t("nav.explore"),  Icon: Compass       },
  { to: "/drops",      label: "Gotas",     Icon: Droplet       },
  { to: "/mensagens",  label: t("nav.messages"), Icon: MessageSquare },
  { to: null,          label: "Menu",      Icon: Menu          }, // Menu Hamburger
] as const;

/** Resolve o valor do badge para uma rota de navegação a partir dos contadores já carregados */
function badgeCountFor(to: string, unreadMessages: number): number {
  if (to === "/mensagens") return unreadMessages;
  return 0;
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
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const { avatarUrl, name } = useAvatar();
  const { unreadMessages } = useBadges();
  const initial = (name?.[0] ?? "?").toUpperCase();
  const isPerfilActive = pathname === "/perfil";
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [showComposer, setShowComposer] = React.useState(false);
  const [currentUserId, setCurrentUserId] = React.useState("");
  const [currentUsername, setCurrentUsername] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCurrentUserId(session.user.id);
        supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle()
          .then(({ data }) => setCurrentUsername((data as any)?.username ?? ""));
      }
    });
  }, []);

  return (
    <>
      {showDrawer && (
        <UserDrawer userId={currentUserId} onClose={() => setShowDrawer(false)} />
      )}
      <aside className="hooda-sidenav hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[320px] border-r z-40"
        style={{
          background: "var(--surface-0)",
        borderColor: "var(--border-subtle)",
      }}>
      {/* Logo */}
      <div className="px-5 pt-5 pb-3">
        <HoodaLogo size="sm" animate={false} />
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, Icon, search }) => {
          const isNotif = label === "Notificações";
          const active = isNotif
            ? false
            : (to as string) === "/hoodatv" || (to as string) === "/studio"
              ? pathname.startsWith(to as string)
              : pathname === to;
          const isPerfil = to === "/perfil";
          if (isNotif) {
            return (
              <button key={label}
                onClick={() => {
                  if (pathname === "/home") {
                    window.dispatchEvent(new CustomEvent("hooda:open-notifications"));
                  } else {
                    navigate({ to: "/home" });
                    setTimeout(() => window.dispatchEvent(new CustomEvent("hooda:open-notifications")), 60);
                  }
                }}
                className="w-full flex items-center gap-4 px-3 py-2.5 rounded-full text-[15px] transition-colors group hover:bg-[color-mix(in_oklab,var(--text-primary)_6%,transparent)]"
                style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                <Icon className="h-[26px] w-[26px] shrink-0" strokeWidth={1.9} />
                <span className="truncate">{label}</span>
                <span className="ml-auto flex items-center gap-2">
                  <NavCountBadge count={badgeCountFor(to, unreadMessages)} />
                </span>
              </button>
            );
          }
          return (
            <Link key={label} to={to} search={search}
              className="flex items-center gap-4 px-3 py-2.5 rounded-full text-[15px] transition-colors group hover:bg-[color-mix(in_oklab,var(--text-primary)_6%,transparent)]"
              style={{
                color: active ? "var(--text-primary)" : "var(--text-primary)",
                fontWeight: active ? 800 : 500,
              }}>
              {isPerfil ? (
                <div className="shrink-0 h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-extrabold text-white"
                  style={{ background: avatarUrl ? "transparent" : "#5B3FCF" }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : initial}
                </div>
              ) : (
                <Icon
                  className="h-[26px] w-[26px] shrink-0"
                  strokeWidth={active ? 2.5 : 1.9}
                />
              )}
              <span className="truncate">{label}</span>
              <span className="ml-auto flex items-center gap-2">
                <NavCountBadge count={badgeCountFor(to, unreadMessages)} />
              </span>
            </Link>
          );
        })}

        {/* Botão Publicar — estilo X */}
        <div className="pt-3 px-1">
          <button
            onClick={() => setShowComposer(true)}
            className="w-full h-[52px] rounded-full text-white font-extrabold text-[16px] flex items-center justify-center gap-2 transition active:scale-[0.98]"
            style={{ background: "#5B3FCF", boxShadow: "0 6px 18px rgba(91,63,207,0.35)" }}>
            <Feather className="h-5 w-5" />
            <span>Publicar</span>
          </button>
        </div>
      </nav>

      {showComposer && (
        <QuickPostModal
          name={name || "Utilizador"}
          username={currentUsername}
          avatarUrl={avatarUrl}
          onClose={() => setShowComposer(false)}
          onPublished={() => setShowComposer(false)}
        />
      )}

      {/* Bottom user card — X style */}
      <div className="px-2 py-3 flex items-center gap-1">
        <button
          onClick={() => setShowDrawer(true)}
          className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-full transition hover:bg-[color-mix(in_oklab,var(--text-primary)_6%,transparent)]">
          <div className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: avatarUrl ? "transparent" : "#5B3FCF" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
              : initial}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{name || "Utilizador"}</p>
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>Menu</p>
          </div>
        </button>
        <button
          onClick={toggle}
          aria-label="Alternar tema"
          className="p-2 rounded-full hover:bg-[color-mix(in_oklab,var(--text-primary)_8%,transparent)] shrink-0"
          style={{ color: "var(--text-secondary)" }}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
  const { unreadMessages } = useBadges();
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
            const badgeCount = !isMenu ? badgeCountFor(to as string, unreadMessages) : 0;

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
      className={`lg:ml-[320px] min-h-dvh hooda-page-enter overflow-x-hidden ${className}`}
      style={{ background: "var(--s1)" }}
    >
      {children}
    </div>
  );
}

/* ─── Layout de 3 colunas estilo X ───
   Sidebar esquerda: 280px (fixa, fora do fluxo). Coluna central: máx 600px
   com border-l/border-r subtis. Sidebar direita: 350px a partir de xl.
   Tudo dentro de um container centrado, sem esticar horizontalmente. */
export function FeedLayout({ feed, sidebar }: { feed: React.ReactNode; sidebar?: React.ReactNode }) {
  return (
    <div className="flex justify-start w-full min-h-screen">
      <div className="flex w-full max-w-[1120px] xl:max-w-[1180px] min-h-screen">
        <main
          className="flex-1 min-w-0 lg:max-w-[700px] w-full lg:border-x"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {feed}
        </main>
        {sidebar && (
          <aside className="hidden xl:block w-[400px] shrink-0 pl-6">
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}

/* Header sticky estilo X para o topo da coluna central */
export function PageHeader({
  title,
  actions,
  onBack,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-4 px-4 h-[53px] border-b backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--surface-0) 80%, transparent)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Voltar"
          className="p-2 -ml-2 rounded-full hover:bg-[color-mix(in_oklab,var(--text-primary)_8%,transparent)]"
        >
          <ArrowLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
        </button>
      )}
      <h1 className="text-[20px] font-extrabold truncate flex-1" style={{ color: "var(--text-primary)" }}>
        {title}
      </h1>
      {actions}
    </div>
  );
}
