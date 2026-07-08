import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import { signOutHooda } from "@/contexts/AuthContext";
import {
  LayoutDashboard, PlusCircle, Calendar, FolderOpen, BarChart2,
  Settings, HelpCircle, LogOut, ArrowLeft, Menu, X, Tv2, Palette,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/studio")({
  component: StudioLayout,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

const NAV = [
  { to: "/studio",              label: "Dashboard",         icon: LayoutDashboard, exact: true },
  { to: "/studio/criar",        label: "Criar Publicação",  icon: PlusCircle, primary: true },
  { to: "/studio/agenda",       label: "Agenda",            icon: Calendar },
  { to: "/studio/biblioteca",   label: "Biblioteca",        icon: FolderOpen },
  { to: "/studio/estatisticas", label: "Estatísticas",      icon: BarChart2 },
  { to: "/studio/personalizacao", label: "Personalização",  icon: Palette },
  { to: "/studio/definicoes",   label: "Definições",        icon: Settings },
];

function StudioLayout() {
  const { data: channel, isLoading: channelLoading } = useQuery(myChannelQuery());
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  async function signOut() {
    await signOutHooda();
    navigate({ to: "/", replace: true });
  }

  const avatar = channel?.avatar_url
    ? <img src={channel.avatar_url} className="h-full w-full object-cover rounded-full" alt="" />
    : <span className="text-sm font-bold text-white">{(channel?.name?.[0] ?? "?").toUpperCase()}</span>;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--s1)" }}>

      {/* Top header */}
      <header className="h-14 sticky top-0 z-40 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 border-b"
        style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

        <button className="md:hidden p-2 -ml-1 rounded-xl hover:bg-[var(--s2)] transition shrink-0"
          onClick={() => setOpen(v => !v)}
          aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link to="/studio" className="flex items-center gap-2 shrink-0 select-none min-w-0">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: GRAD }}>
            <Tv2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-base truncate" style={{ color: "var(--text-primary)" }}>
            Hooda <span style={{ color: P }}>Studio</span>
          </span>
        </Link>

        <div className="flex-1" />

        <Link to="/home"
          className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition hover:bg-[var(--s2)]"
          style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>

        <button onClick={signOut}
          className="p-2 rounded-full transition hover:bg-[var(--s2)]"
          style={{ color: "var(--text-muted)" }}
          aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </button>

        {channel && (
          <div className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
            style={{ background: GRAD }}>
            {avatar}
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">

        {/* Sidebar / mobile drawer */}
        {open && (
          <div className="md:hidden fixed inset-0 z-30 bg-black/40"
            onClick={() => setOpen(false)} />
        )}

        <aside className={`${open ? "flex" : "hidden"} md:flex w-64 shrink-0 flex-col border-r
          fixed md:sticky top-14 z-40 md:z-auto h-[calc(100dvh-56px)]`}
          style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

          {/* Canal card */}
          <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                style={{ background: GRAD }}>
                {avatar}
              </div>
              <div className="min-w-0">
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>O teu canal</p>
                <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                  {channel?.name ?? "Sem canal"}
                </p>
                {channel?.handle && (
                  <p className="text-xs truncate" style={{ color: P }}>@{channel.handle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV.map(({ to, label, icon: Icon, exact, primary }) => {
              const active = isActive(to, exact);
              if (primary) {
                return (
                  <Link key={to} to={to as any} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 mx-3 mb-2 px-4 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
                    style={{ background: GRAD, boxShadow: "0 4px 14px rgba(91,63,207,0.35)" }}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                );
              }
              return (
                <Link key={to} to={to as any} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm transition-all mb-0.5"
                  style={{
                    background: active ? "#5B3FCF18" : "transparent",
                    color: active ? P : "var(--text-secondary)",
                    fontWeight: active ? 600 : 500,
                  }}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: P }} />}
                </Link>
              );
            })}
          </nav>

          <div className="border-t py-2" style={{ borderColor: "var(--border-subtle)" }}>
            <a href="mailto:suporte@hooda.app"
              className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm w-full text-left transition hover:bg-[var(--s2)]"
              style={{ color: "var(--text-muted)" }}>
              <HelpCircle className="h-4 w-4 shrink-0" />
              Ajuda / Suporte
            </a>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {channelLoading ? (
            <div className="flex items-center justify-center h-full py-24">
              <div className="h-6 w-6 rounded-full border-2 animate-spin"
                style={{ borderColor: "#5B3FCF33", borderTopColor: "#5B3FCF" }} />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
