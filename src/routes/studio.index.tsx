import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { myChannelQuery, channelStatsQuery, myVideosQuery, topVideosQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import {
  Eye, Users, Heart, TrendingUp, PlusCircle, Calendar, FolderOpen,
  BarChart2, MessageSquare, Bell, Loader2, Video as VideoIcon, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/studio/")({
  head: () => ({ meta: [{ title: "Dashboard — Hooda Studio" }] }),
  component: DashboardPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

function nf(n?: number | null) {
  const v = n ?? 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

function DashboardPage() {
  const navigate = useNavigate();
  const { data: channel, isLoading: chLoading } = useQuery(myChannelQuery());
  const { data: stats } = useQuery(channelStatsQuery(channel?.id));
  const { data: videos } = useQuery(myVideosQuery(channel?.id));
  const { data: topVideos } = useQuery(topVideosQuery(channel?.id));

  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function load() {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) { setLoading(false); return; }

      const [recentRes, schedRes, notifRes] = await Promise.all([
        (supabase as any).from("posts")
          .select("id,content,title,created_at,kind,thumbnail_url,photo_url,photos,video_url,likes_count,views_count,replies_count")
          .eq("author_id", uid).eq("is_draft", false)
          .or("scheduled_at.is.null,scheduled_at.lte." + new Date().toISOString())
          .order("created_at", { ascending: false }).limit(5),
        (supabase as any).from("posts")
          .select("id,content,title,scheduled_at,kind,thumbnail_url,photo_url")
          .eq("author_id", uid).eq("is_draft", false)
          .gt("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true }).limit(5),
        (supabase as any).from("notifications")
          .select("id,type,message,created_at,is_read")
          .eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
      ]);
      if (cancel) return;
      setRecentPosts(recentRes.data ?? []);
      setScheduled(schedRes.data ?? []);
      setActivity(notifRes.data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancel = true; };
  }, []);

  if (chLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: P }} />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="max-w-2xl mx-auto p-6 sm:p-10 text-center">
        <div className="rounded-3xl p-8 sm:p-12" style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <div className="h-16 w-16 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: GRAD }}>
            <VideoIcon className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-black mb-2" style={{ color: "var(--text-primary)" }}>Cria o teu canal</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            O Hooda Studio é o centro de gestão do teu canal. Cria já o teu para começar.
          </p>
          <Link to={"/studio/onboarding" as any}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white active:scale-95 transition"
            style={{ background: GRAD }}>
            Criar canal <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Visualizações",   value: nf(stats?.views),     icon: Eye,        color: "#5B3FCF" },
    { label: "Alcance (28d)",   value: nf(stats?.views_28d), icon: TrendingUp, color: "#E94B8A" },
    { label: "Seguidores",      value: nf(stats?.subs),      icon: Users,      color: "#1FAFA6" },
    { label: "Publicações",     value: nf((videos?.length ?? 0) + recentPosts.length), icon: Heart, color: "#F59E0B" },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Bem-vindo de volta, <span style={{ color: P, fontWeight: 600 }}>@{channel.handle}</span>
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl p-4 sm:p-5"
            style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{k.label}</span>
              <div className="h-8 w-8 rounded-xl flex items-center justify-center"
                style={{ background: k.color + "18" }}>
                <k.icon className="h-4 w-4" style={{ color: k.color }} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: "/studio/criar",        label: "Criar",       icon: PlusCircle, primary: true },
          { to: "/studio/agenda",       label: "Agenda",      icon: Calendar },
          { to: "/studio/biblioteca",   label: "Biblioteca",  icon: FolderOpen },
          { to: "/studio/estatisticas", label: "Estatísticas",icon: BarChart2 },
        ].map(a => (
          <Link key={a.to} to={a.to as any}
            className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold transition active:scale-95"
            style={{
              background: a.primary ? GRAD : "var(--s0)",
              border: a.primary ? "none" : "1px solid var(--border-subtle)",
              color: a.primary ? "#fff" : "var(--text-secondary)",
              boxShadow: a.primary ? "0 4px 14px rgba(91,63,207,0.30)" : "none",
            }}>
            <a.icon className="h-5 w-5" />
            {a.label}
          </Link>
        ))}
      </div>

      {/* Two column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Recent posts */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Publicações recentes</h2>
            <Link to={"/studio/biblioteca" as any} className="text-xs font-semibold" style={{ color: P }}>Ver tudo</Link>
          </div>
          {recentPosts.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>
              Sem publicações ainda. <Link to={"/studio/criar" as any} style={{ color: P, fontWeight: 600 }}>Criar a primeira →</Link>
            </p>
          ) : (
            <div className="space-y-2">
              {recentPosts.map(p => {
                const thumb = p.thumbnail_url || p.photo_url || (Array.isArray(p.photos) && p.photos[0]);
                return (
                  <button key={p.id}
                    onClick={() => navigate({ to: `/post/${p.id}` as any })}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition hover:bg-[var(--s2)]">
                    <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0"
                      style={{ background: thumb ? undefined : "var(--s2)" }}>
                      {thumb
                        ? <img src={thumb} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}><VideoIcon className="h-5 w-5" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {p.title || p.content?.slice(0, 60) || "Sem título"}
                      </p>
                      <p className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                        <span>{nf(p.views_count)} views</span> · <span>{nf(p.likes_count)} likes</span>
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Scheduled */}
        <div className="rounded-2xl p-5"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Agendadas</h2>
            <Link to={"/studio/agenda" as any} className="text-xs font-semibold" style={{ color: P }}>Ver tudo</Link>
          </div>
          {scheduled.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>
              Nenhuma publicação agendada.
            </p>
          ) : (
            <div className="space-y-2">
              {scheduled.map(p => (
                <div key={p.id} className="p-3 rounded-xl" style={{ background: "var(--s2)" }}>
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {p.title || p.content?.slice(0, 40) || "Publicação"}
                  </p>
                  <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: P }}>
                    <Calendar className="h-3 w-3" />
                    {new Date(p.scheduled_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top content + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-2xl p-5"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <h2 className="font-bold text-base mb-4" style={{ color: "var(--text-primary)" }}>Melhor desempenho</h2>
          {(topVideos ?? []).length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--text-muted)" }}>Sem dados ainda.</p>
          ) : (
            <div className="space-y-2">
              {(topVideos ?? []).slice(0, 4).map(v => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded-xl">
                  {v.thumbnail_url && (
                    <img src={v.thumbnail_url} className="h-12 w-20 rounded-lg object-cover shrink-0" alt="" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{nf(v.views_count)} visualizações</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-5"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <h2 className="font-bold text-base mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Bell className="h-4 w-4" /> Atividade recente
          </h2>
          {activity.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: "var(--text-muted)" }}>Sem notificações recentes.</p>
          ) : (
            <div className="space-y-2">
              {activity.map(n => (
                <div key={n.id} className="flex items-start gap-3 p-2 rounded-xl" style={{ opacity: n.is_read ? 0.7 : 1 }}>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: P + "18", color: P }}>
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>{n.message}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {new Date(n.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
