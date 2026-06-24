import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Video, Upload, Settings, HelpCircle,
  LogOut, ArrowLeft, Menu, X, BarChart2, Tv2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio")({
  component: StudioLayout,
});

const NAV = [
  { to: "/studio",         label: "Painel",       icon: LayoutDashboard, exact: true },
  { to: "/studio/content", label: "Conteúdo",      icon: Video },
  { to: "/studio/upload",  label: "Enviar vídeo",  icon: Upload },
];

const BOTTOM_NAV = [
  { label: "Análises",    icon: BarChart2 },
  { label: "Definições",  icon: Settings },
  { label: "Ajuda",       icon: HelpCircle },
];

function StudioLayout() {
  const { data: channel } = useQuery(myChannelQuery());
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const avatar = channel?.avatar_url
    ? <img src={channel.avatar_url} className="h-full w-full object-cover rounded-full" alt="" />
    : <span className="text-sm font-bold text-white">{(channel?.name?.[0] ?? "?").toUpperCase()}</span>;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--s1)" }}>

      {/* ── Top header ── */}
      <header className="h-14 sticky top-0 z-40 flex items-center px-4 gap-3 border-b"
        style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

        <button className="md:hidden p-2 -ml-1 rounded-xl hover:bg-[var(--s2)] transition"
          onClick={() => setOpen(v => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Logo */}
        <Link to="/studio" className="flex items-center gap-2 shrink-0 select-none">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
            <Tv2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
            Hooda <span style={{ color: "#5B3FCF" }}>Studio</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Back to Hooda */}
        <Link to="/home"
          className="hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition"
          style={{ color: "var(--text-secondary)" }}
          onMouseOver={e => (e.currentTarget.style.background = "var(--s2)")}
          onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Hooda
        </Link>

        <button onClick={signOut}
          className="p-2 rounded-full transition"
          style={{ color: "var(--text-muted)" }}
          onMouseOver={e => (e.currentTarget.style.color = "#E94B8A")}
          onMouseOut={e => (e.currentTarget.style.color = "var(--text-muted)")}>
          <LogOut className="h-4 w-4" />
        </button>

        {channel && (
          <div className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
            {avatar}
          </div>
        )}
      </header>

      <div className="flex flex-1">

        {/* ── Sidebar ── */}
        <aside className={`${open ? "flex" : "hidden"} md:flex w-56 shrink-0 flex-col border-r sticky top-14 h-[calc(100vh-56px)]`}
          style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>

          {/* Channel card */}
          <div className="px-4 py-5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
                {avatar}
              </div>
              <div className="min-w-0">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>O teu canal</p>
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {channel?.name ?? "—"}
                </p>
                {channel?.handle && (
                  <p className="text-xs truncate" style={{ color: "#5B3FCF" }}>@{channel.handle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV.map(({ to, label, icon: Icon, exact }) => {
              const active = isActive(to, exact);
              return (
                <Link key={to} to={to as any} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm transition-all mb-0.5"
                  style={{
                    background: active ? "#5B3FCF18" : "transparent",
                    color: active ? "#5B3FCF" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#5B3FCF]" />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom nav */}
          <div className="border-t py-2" style={{ borderColor: "var(--border-subtle)" }}>
            {BOTTOM_NAV.map(({ label, icon: Icon }) => (
              <button key={label}
                onClick={() => toast.info(`${label} — em breve!`)}
                className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl text-sm w-full text-left transition hover:bg-[var(--s2)]"
                style={{ color: "var(--text-muted)" }}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Page content ── */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
