import { createFileRoute, Link } from "@tanstack/react-router";
import { t } from "@/lib/useT";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  myChannelQuery, channelStatsQuery, myVideosQuery,
  dailyViewsQuery, viewsByCountryQuery, topVideosQuery,
} from "@/lib/channel-queries";
import {
  Eye, Video as VideoIcon, Upload, ArrowUpRight, TrendingUp,
  Clock, Users, PlayCircle, Globe, Lock, Tv2,
  X, Activity, BarChart2, Scissors, ChevronRight, ChevronLeft,
  Search, Heart, MessageCircle, Share2, MoreVertical, MapPin,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { toast } from "sonner";
import { HoodaPlayer } from "@/components/HoodaPlayer";
import { deleteFromCloudflareStream } from "@/lib/cloudflare-stream";

export const Route = createFileRoute("/studio/")(  {
  head: () => ({ meta: [{ title: "Painel — Hooda Studio" }] }),
  component: DashboardPage,
});

const PURPLE = "#5B3FCF";
const GRAD   = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

/* ── Stat card ─────────────────────────────────────────── */
function StatCard({ label, value, sub, subColor, icon: Icon, accent, loading }: {
  label: string; value: string | number; sub?: string; subColor?: string;
  icon: React.ElementType; accent: string; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
        <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: accent + "18" }}>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      {loading
        ? <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background: "var(--s2)" }} />
        : <div className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {typeof value === "number" ? value.toLocaleString("pt-PT") : value}
          </div>
      }
      {sub && <p className="text-xs flex items-center gap-1" style={{ color: subColor ?? "#6BA547" }}>
        <TrendingUp className="h-3 w-3" />{sub}
      </p>}
      <div className="absolute -right-4 -bottom-4 h-20 w-20 rounded-full opacity-[0.06]" style={{ background: accent }} />
    </div>
  );
}

/* ── Mini bar (para país) ─────────────────────────────── */
function CountryBar({ country, views, max }: { country: string; views: number; max: number }) {
  const pct = max > 0 ? Math.round((views / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-6 text-center">{flagEmoji(country)}</span>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span style={{ color: "var(--text-primary)" }}>{COUNTRY_NAMES[country] ?? country}</span>
          <span style={{ color: "var(--text-muted)" }}>{views.toLocaleString("pt-PT")}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: GRAD }} />
        </div>
      </div>
    </div>
  );
}

/* ── Video row ─────────────────────────────────────────── */
function VideoRow({ v, onEdit, onDelete }: { v: any; onEdit: (v: any) => void; onDelete: (v: any) => void }) {
  const [menu, setMenu] = useState(false);
  const isPublic = v.visibility === "public";
  return (
    <li className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--s1)] group">
      <div className="h-12 w-[86px] rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "var(--s2)" }}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />
          : <PlayCircle className="h-5 w-5" style={{ color: "var(--text-muted)" }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
        <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isPublic ? "text-green-700 bg-green-50" : "text-[var(--text-muted)] bg-[var(--s2)]"}`}>
            {isPublic ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
            {isPublic ? t("studio.public") : t("studio.private")}
          </span>
          · {Number(v.views_count ?? 0).toLocaleString("pt-PT")} vistas
          {v.duration_seconds && <> · {fmtDuration(v.duration_seconds)}</>}
          {v.created_at && <> · {formatDistanceToNow(new Date(v.created_at), { locale: pt, addSuffix: true })}</>}
        </p>
      </div>
      <div className="relative shrink-0">
        <button onClick={() => setMenu(m => !m)}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition"
          style={{ color: "var(--text-muted)" }}
          onMouseOver={e => (e.currentTarget.style.background = "var(--s2)")}
          onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
          <MoreVertical className="h-4 w-4" />
        </button>
        {menu && (
          <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-10 overflow-hidden min-w-[140px] border"
            style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>
            <button onClick={() => { setMenu(false); onEdit(v); }}
              className="w-full text-left px-4 py-2.5 text-sm transition hover:bg-[var(--s1)]"
              style={{ color: "var(--text-primary)" }}>
              Editar
            </button>
            <a href="/hoodatv"
              className="w-full block text-left px-4 py-2.5 text-sm transition hover:bg-[var(--s1)]"
              style={{ color: "var(--text-primary)" }}
              onClick={() => setMenu(false)}>
              Ver na HoodaTV
            </a>
            <div style={{ height: 1, background: "var(--border-subtle)" }} />
            <button onClick={() => { setMenu(false); onDelete(v); }}
              className="w-full text-left px-4 py-2.5 text-sm transition hover:bg-red-50"
              style={{ color: "#E94B8A" }}>
              Eliminar
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/* ── Dashboard ─────────────────────────────────────────── */
export default function DashboardPage() {
  const qc = useQueryClient();
  const { data: channel, isLoading: chLoading } = useQuery(myChannelQuery());
  const { data: stats, isLoading } = useQuery(channelStatsQuery(channel?.id));
  const { data: videos }           = useQuery(myVideosQuery(channel?.id));
  const { data: dailyViews }       = useQuery(dailyViewsQuery(channel?.id));
  const { data: countryData }      = useQuery(viewsByCountryQuery(channel?.id));
  const { data: topVideos }        = useQuery(topVideosQuery(channel?.id));

  const [tab,       setTab]       = useState<"all" | "public" | "private">("all");
  const [editVideo, setEditVideo] = useState<any | null>(null);
  const [liveCount, setLiveCount] = useState<number>(0);
  const [showClipModal, setShowClipModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [confirmDeleteClip, setConfirmDeleteClip] = useState<{ id: string; title: string } | null>(null);

  const { data: myClips, refetch: refetchClips } = useQuery({
    queryKey: ["studio-clips", channel?.id],
    queryFn: async () => {
      if (!channel?.id) return [];
      // Buscar o user_id associado ao canal
      const { data: chanData } = await (supabase as any)
        .from("channels").select("user_id").eq("id", channel.id).maybeSingle();
      const userId = chanData?.user_id;
      if (!userId) return [];
      const { data } = await (supabase as any)
        .from("posts")
        .select("id,clip_title,clip_thumb_url,clip_start,clip_end,created_at")
        .eq("kind", "clip")
        .eq("author_id", userId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!channel?.id,
    staleTime: 30_000,
  });

  async function deleteClip(clipId: string) {
    await (supabase as any).from("posts").delete().eq("id", clipId);
    refetchClips();
    toast.success("Clip removido do feed.");
  }

  /* Realtime — novos vídeos e views */
  useEffect(() => {
    if (!channel?.id) return;
    const ch = supabase
      .channel(`studio-realtime-${channel.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "videos",
          filter: `channel_id=eq.${channel.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-videos"] });
        qc.invalidateQueries({ queryKey: ["channel-stats"] });
        toast.success("Novo vídeo detectado!", { icon: "🎬" });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "video_views",
          filter: `channel_id=eq.${channel.id}` }, () => {
        setLiveCount(n => n + 1);
        qc.invalidateQueries({ queryKey: ["channel-stats"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channel?.id, qc]);

  /* Sem canal */
  if (!chLoading && !channel) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
          style={{ background: GRAD }}>
          <Tv2 className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>
          Bem-vindo ao Hooda Studio
        </h1>
        <p className="text-sm mb-8 max-w-xs" style={{ color: "var(--text-muted)" }}>
          Ainda não tens um canal. Cria o teu canal para começares a publicar vídeos na HoodaTV.
        </p>
        <a href="/studio/onboarding"
          className="px-8 py-3 rounded-2xl text-white font-bold text-sm transition-all hover:-translate-y-0.5 active:scale-95 inline-block"
          style={{ background: GRAD, boxShadow: "0 4px 20px rgba(91,63,207,0.35)" }}>
          + Criar Canal
        </a>
      </div>
    );
  }

  const filtered = (videos ?? []).filter(v =>
    tab === "all" ? true : tab === "public" ? v.visibility === "public" : v.visibility !== "public"
  ).slice(0, 6);

  const totalHours = stats?.total_duration_seconds
    ? (stats.total_duration_seconds / 3600).toFixed(1)
    : ((stats?.published ?? 0) * 2.1).toFixed(1);

  const maxCountry = countryData?.[0]?.views ?? 1;

  const STATS = [
    { label: "Visualizações totais", value: stats?.views ?? 0, sub: `+${stats?.views_24h ?? 0} hoje`, icon: Eye, accent: PURPLE },
    { label: "Vistas 7 dias",        value: stats?.views_7d ?? 0, sub: `${stats?.views_28d ?? 0} em 28 dias`, icon: BarChart2, accent: "#1FAFA6" },
    { label: t("profile.followers"),           value: stats?.subs ?? 0, sub: `+${stats?.subs_gained_28d ?? 0} este mês`, icon: Users, accent: "#E94B8A" },
    { label: "Tempo de vídeo",       value: `${totalHours}h`, sub: "total carregado", icon: Clock, accent: "#FFC93C" },
    { label: "Em directo agora",     value: liveCount, sub: "vistas nesta sessão", icon: Activity, accent: "#10b981" },
    { label: "Retenção média",       value: `${stats?.avg_watch_pct ?? 0}%`, sub: "tempo médio assistido", icon: PlayCircle, accent: "#F97316" },
    { label: "Vídeos publicados",    value: stats?.published ?? 0, sub: `${stats?.total ?? 0} total`, icon: VideoIcon, accent: "#8B5CF6" },
    { label: "Vistas 24h",           value: stats?.views_24h ?? 0, sub: "últimas 24 horas", icon: TrendingUp, accent: "#EC4899" },
  ];

  /* Tooltip chart */
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2 shadow-lg text-xs"
        style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
        <p className="font-bold mb-0.5">{label ? format(new Date(label), "d MMM", { locale: pt }) : ""}</p>
        <p>{payload[0]?.value?.toLocaleString("pt-PT")} vistas</p>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-7">
      {/* Modal confirmação de eliminar vídeo */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-4"
            style={{ background: "var(--s1)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-1"
              style={{ background: "#fee2e2" }}>
              <X className="h-6 w-6" style={{ color: "#dc2626" }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-base mb-1" style={{ color: "var(--text-primary)" }}>Eliminar vídeo?</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                "{confirmDelete.title}" será eliminado permanentemente.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 h-11 rounded-2xl font-semibold text-sm transition active:scale-95 border"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
                Cancelar
              </button>
              <button onClick={() => { deleteVideo(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 h-11 rounded-2xl font-bold text-sm text-white transition active:scale-95"
                style={{ background: "#dc2626" }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar delete clip */}
      {confirmDeleteClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-3xl p-6 flex flex-col gap-4 w-full max-w-sm"
            style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "#fee2e2" }}>
              <Scissors className="h-6 w-6" style={{ color: "#dc2626" }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-base mb-1" style={{ color: "var(--text-primary)" }}>Remover clip?</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                "{confirmDeleteClip.title}" será removido do feed permanentemente.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteClip(null)}
                className="flex-1 h-11 rounded-2xl font-semibold text-sm transition active:scale-95 border"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
                Cancelar
              </button>
              <button onClick={() => { deleteClip(confirmDeleteClip.id); setConfirmDeleteClip(null); }}
                className="flex-1 h-11 rounded-2xl font-bold text-sm text-white transition active:scale-95"
                style={{ background: "#dc2626" }}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {showClipModal && (
        <ClipModal
          channel={channel}
          videos={videos ?? []}
          onClose={() => setShowClipModal(false)}
        />
      )}
      <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Painel do canal
          </h1>
          {channel && (
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Bem-vindo de volta, <span style={{ color: PURPLE, fontWeight: 600 }}>{channel.name}</span>
              {liveCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                  style={{ background: "#10b981" }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--s2)] animate-pulse" />
                  {liveCount} em directo
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowClipModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 border"
            style={{ color: PURPLE, borderColor: PURPLE, background: PURPLE + "10" }}>
            <Scissors className="h-4 w-4" /> Criar Clipe
          </button>
          <Link to="/studio/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-lg transition-all active:scale-95 hover:opacity-90"
            style={{ background: GRAD, boxShadow: "0 4px 16px #5B3FCF44" }}>
            <Upload className="h-4 w-4" /> Enviar vídeo
          </Link>
        </div>
      </div>

      {/* Stats grid — 4+4 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {STATS.slice(0, 4).map(s => <StatCard key={s.label} loading={isLoading} {...s} />)}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {STATS.slice(4).map(s => <StatCard key={s.label} loading={isLoading} {...s} />)}
      </div>

      {/* Chart + Country */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-7">

        {/* Views chart */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Visualizações — últimos 28 dias</h2>
            <Link to="/studio/analytics" className="flex items-center gap-1 text-xs font-semibold hover:opacity-70" style={{ color: PURPLE }}>
              Ver análises <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {!dailyViews ? (
            <div className="h-48 rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dailyViews} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PURPLE} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="day" tickFormatter={d => format(new Date(d), "d/M")}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="views" stroke={PURPLE} strokeWidth={2}
                  fill="url(#grad1)" dot={false} activeDot={{ r: 4, fill: PURPLE }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* País */}
        <div className="rounded-2xl p-5"
          style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4" style={{ color: PURPLE }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Espectadores por país</h2>
          </div>
          {!countryData || countryData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Globe className="h-10 w-10 mb-3" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sem dados de localização ainda.</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Os países aparecem após as primeiras vistas.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {countryData.map(r => (
                <CountryBar key={r.country} country={r.country} views={r.views} max={maxCountry} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vídeos + coluna direita */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Últimos vídeos */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden"
          style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Últimos vídeos</h2>
            <Link to="/studio/content" className="flex items-center gap-1 text-xs font-semibold hover:opacity-70" style={{ color: PURPLE }}>
              Ver tudo <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex gap-1 px-5 pt-3 pb-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {(["all", "public", "private"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition"
                style={{ background: tab === t ? PURPLE : "transparent", color: tab === t ? "#fff" : "var(--text-secondary)" }}>
                {t === "all" ? "Todos" : t === "public" ? "Públicos" : "Privados"}
              </button>
            ))}
          </div>
          {!videos ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <VideoIcon className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sem vídeos aqui.</p>
              <Link to="/studio/upload"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
                style={{ background: GRAD }}>
                <Upload className="h-4 w-4" /> Enviar
              </Link>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {filtered.map(v => <VideoRow key={v.id} v={v} onEdit={setEditVideo}
                onDelete={vid => setConfirmDelete(vid)} />)}
            </ul>
          )}
        </div>

        {/* Coluna direita */}
        <div className="flex flex-col gap-4">

          {/* Meus Clips */}
          {myClips && myClips.length > 0 && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                  <Scissors className="h-4 w-4" style={{ color: PURPLE }} /> Meus Clips
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: PURPLE + "15", color: PURPLE }}>
                  {myClips.length}
                </span>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {myClips.map((clip: any) => {
                  const dur = clip.clip_end - clip.clip_start;
                  const fmt = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
                  return (
                    <li key={clip.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="h-10 w-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                        style={{ background: "var(--s2)" }}>
                        {clip.clip_thumb_url
                          ? <img src={clip.clip_thumb_url} className="h-full w-full object-cover" alt="" />
                          : <Scissors className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {clip.clip_title || "Clip sem título"}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {fmt(clip.clip_start)} – {fmt(clip.clip_end)} · {fmt(dur)}
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmDeleteClip({ id: clip.id, title: clip.clip_title || "este clip" })}
                        className="p-2 rounded-xl transition hover:opacity-80 shrink-0"
                        style={{ background: "#fee2e2", color: "#dc2626" }}
                        title="Remover clip do feed">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Top vídeos */}
          {topVideos && topVideos.length > 0 && (
            <div className="rounded-2xl p-5"
              style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>🏆 Top vídeos</h3>
              <div className="space-y-3">
                {topVideos.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-5 text-center shrink-0" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                    <div className="h-9 w-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "var(--s2)" }}>
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} className="h-full w-full object-cover" alt="" />
                        : <PlayCircle className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{(v.views_count ?? 0).toLocaleString("pt-PT")} vistas</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Canal card */}
          <div className="rounded-2xl p-5"
            style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>O teu canal no HoodaTV</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ background: GRAD }}>
                {channel?.avatar_url
                  ? <img src={channel.avatar_url} className="h-full w-full object-cover" alt="" />
                  : <span className="text-sm font-bold text-white">{(channel?.name?.[0] ?? "?").toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{channel?.name}</p>
                <p className="text-xs truncate" style={{ color: PURPLE }}>@{channel?.handle}</p>
              </div>
            </div>
            <Link to={"/hoodatv" as any}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-semibold border transition hover:opacity-80"
              style={{ color: PURPLE, borderColor: PURPLE + "55", background: PURPLE + "08" }}>
              <Tv2 className="h-4 w-4" /> Ver canal público
            </Link>
          </div>

          {/* Upload CTA */}
          <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: GRAD }}>
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[var(--s2)]/10" />
            <div className="absolute -right-2 -bottom-8 h-20 w-20 rounded-full bg-[var(--s2)]/10" />
            <p className="text-sm font-bold relative">Pronto para publicar?</p>
            <p className="text-xs opacity-80 mt-1 mb-4 relative">O teu próximo vídeo pode mudar tudo.</p>
            <Link to="/studio/upload"
              className="inline-flex items-center gap-2 bg-[var(--s2)] rounded-xl px-4 py-2 text-xs font-bold relative hover:opacity-90 transition"
              style={{ color: PURPLE }}>
              <Upload className="h-3.5 w-3.5" /> Enviar agora
            </Link>
          </div>
        </div>
      </div>

      {editVideo && (
        <DashEditModal v={editVideo} onClose={() => setEditVideo(null)}
          onSave={() => { qc.invalidateQueries({ queryKey: ["my-videos"] }); }} />
      )}
    </div>
  );

  async function deleteVideo(v: any) {
    if (v.cf_stream_uid) {
      try { await deleteFromCloudflareStream(v.cf_stream_uid); } catch (_) {}
    }
    if (v.video_path) await supabase.storage.from("videos").remove([v.video_path]);
    await (supabase as any).from("videos").delete().eq("id", v.id);
    qc.invalidateQueries({ queryKey: ["my-videos"] });
    qc.invalidateQueries({ queryKey: ["channel-stats"] });
    toast.success("Vídeo eliminado.");
  }
}

/* ── Edit Modal ─────────────────────────────────────────── */
function DashEditModal({ v, onClose, onSave }: { v: any; onClose: () => void; onSave: () => void }) {
  const [title,  setTitle]  = useState(v.title ?? "");
  const [desc,   setDesc]   = useState(v.description ?? "");
  const [vis,    setVis]    = useState(v.visibility ?? "private");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function save() {
    if (!title.trim()) { toast.error("O título não pode estar vazio."); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("videos").update({
      title: title.trim(), description: desc.trim() || null, visibility: vis,
      published_at: vis === "public" && !v.published_at ? new Date().toISOString() : v.published_at,
    }).eq("id", v.id);
    setSaving(false);
    if (error) { toast.error("Erro ao guardar."); return; }
    toast.success("Vídeo atualizado!"); onSave(); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl" style={{ background: "var(--s0)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Editar vídeo</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)]">
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-muted)" }}>Título *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none border bg-[var(--s3)] border-[var(--border-default)] focus:border-[#5B3FCF] text-[var(--text-primary)]" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-muted)" }}>Descrição</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={5000}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none border bg-[var(--s3)] border-[var(--border-default)] focus:border-[#5B3FCF] text-[var(--text-primary)] resize-none" />
        </div>
        <div className="flex gap-2">
          {(["public", "unlisted", "private"] as const).map(opt => (
            <button key={opt} onClick={() => setVis(opt)}
              className="flex-1 py-2 rounded-xl border-2 text-xs font-bold transition"
              style={{ borderColor: vis === opt ? "#5B3FCF" : "var(--border-default)", background: vis === opt ? "#5B3FCF08" : "var(--s3)", color: vis === opt ? "#5B3FCF" : "var(--text-secondary)" }}>
              {opt === "public" ? t("studio.public") : opt === "unlisted" ? "Com link" : t("studio.private")}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold border"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
            {saving ? t("settings.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtDuration(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  if (s >= 3600) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function flagEmoji(code: string) {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

const COUNTRY_NAMES: Record<string, string> = {
  AO:"Angola", PT:"Portugal", BR:"Brasil", US:"EUA", GB:"Reino Unido",
  FR:"França", DE:"Alemanha", ES:"Espanha", MZ:"Moçambique", CV:"Cabo Verde",
  GW:"Guiné-Bissau", ST:"S. Tomé e Príncipe", TL:"Timor-Leste",
};

/* ══════════════════════════════════════════════════════════
   CLIP MODAL — criar clipe de vídeo para o feed
   3 passos: 1) escolher vídeo  2) recortar  3) publicar
══════════════════════════════════════════════════════════ */
function ClipModal({ channel, videos, onClose }: {
  channel: any;
  videos: any[];
  onClose: () => void;
}) {
  const [step, setStep]             = useState<"pick" | "trim" | "publish">("pick");
  const [selected, setSelected]     = useState<any>(null);
  const [clipStart, setClipStart]   = useState(0);
  const [clipEnd, setClipEnd]       = useState(30);
  const [title, setTitle]           = useState("");
  const [search, setSearch]         = useState("");
  const [publishing, setPublishing] = useState(false);
  const [done, setDone]             = useState(false);

  const published = videos.filter(v => v.status === "published");
  const filtered  = search
    ? published.filter(v => v.title?.toLowerCase().includes(search.toLowerCase()))
    : published;

  function fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function pickVideo(v: any) {
    setSelected(v);
    setClipStart(0);
    setClipEnd(Math.min(60, v.duration_seconds ?? 60));
    setTitle(v.title ?? "");
    setStep("trim");
  }

  async function publish() {
    if (!title.trim() || !selected || !channel || publishing) return;
    setPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada. Inicia sessão novamente."); return; }

      const { error } = await (supabase as any).from("posts").insert({
        author_id:        session.user.id,
        author_username:  channel.handle ?? "",
        author_name:      channel.name   ?? "",
        author_color:     PURPLE,
        content:          title.trim(),
        kind:             "clip",
        clip_video_id:    selected.id,
        clip_start:       clipStart,
        clip_end:         clipEnd,
        clip_title:       title.trim(),
        clip_thumb_url:   selected.thumbnail_url ?? null,
        channel_id:       channel.id,
        channel_handle:   channel.handle,
        channel_name:     channel.name,
        channel_avatar:   channel.avatar_url ?? null,
        video_embed_url:  selected.cf_embed_url   ?? null,
        video_stream_url: selected.cf_stream_url  ?? null,
      });

      if (error) { toast.error("Erro ao publicar: " + error.message); return; }
      toast.success("Clipe publicado no feed! 🎬");
      setDone(true);
      setTimeout(onClose, 800);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado.");
    } finally {
      setPublishing(false);
    }
  }

  const dur = selected?.duration_seconds ?? 120;
  const clipDur = clipEnd - clipStart;

  const STEPS = ["pick", "trim", "publish"] as const;
  const stepIdx = STEPS.indexOf(step);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl"
        style={{ background: "var(--s0)", maxHeight: "92vh", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}>
          {step !== "pick" && (
            <button onClick={() => setStep(step === "publish" ? "trim" : "pick")}
              className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90"
              style={{ background: "var(--s2)" }}>
              <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
            </button>
          )}
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: GRAD }}>
            <Scissors className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              {step === "pick" ? "Escolher vídeo" : step === "trim" ? "Recortar clipe" : "Publicar no feed"}
            </p>
            {/* Barra de progresso dos passos */}
            <div className="flex gap-1 mt-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: i <= stepIdx ? PURPLE : "var(--s3)" }} />
              ))}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background: "var(--s2)" }}>
            <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* ── PASSO 1: Escolher vídeo ── */}
        {step === "pick" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Pesquisa */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                  style={{ color: "var(--text-muted)" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar vídeos publicados…"
                  className="w-full h-10 pl-9 pr-4 rounded-xl text-sm outline-none border"
                  style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
              {published.length === 0 ? (
                <div className="py-16 text-center">
                  <VideoIcon className="h-10 w-10 mx-auto mb-3 opacity-30" style={{ color: "var(--text-muted)" }} />
                  <p className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                    Ainda não tens vídeos publicados
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Publica um vídeo para poderes criar clipes
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  Nenhum vídeo encontrado
                </p>
              ) : filtered.map((v: any) => (
                <button key={v.id} onClick={() => pickVideo(v)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl text-left border transition-all active:scale-[0.98] hover:-translate-y-0.5"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}>
                  {/* Thumbnail */}
                  <div className="w-20 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                    style={{ background: "var(--s3)" }}>
                    {v.thumbnail_url
                      ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      : <PlayCircle className="h-5 w-5" style={{ color: "var(--text-muted)" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {v.duration_seconds ? fmt(v.duration_seconds) : "--"} · {(v.views_count ?? 0).toLocaleString("pt-PT")} vistas
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PASSO 2: Recortar ── */}
        {step === "trim" && selected && (
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {/* Preview */}
            <div className="rounded-2xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
              <HoodaPlayer
                src={selected.cf_stream_url || selected.video_url || ""}
                poster={selected.thumbnail_url ?? undefined}
                rounded="rounded-2xl"
                aspectRatio="16/9"
              />
            </div>

            {/* Info intervalo */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                Início: <span style={{ color: "var(--text-primary)" }}>{fmt(clipStart)}</span>
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full"
                style={{ background: PURPLE + "18", color: PURPLE }}>
                {fmt(clipDur)} clipe
              </span>
              <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                Fim: <span style={{ color: "var(--text-primary)" }}>{fmt(clipEnd)}</span>
              </span>
            </div>

            {/* Barra visual do clipe */}
            <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
              <div className="absolute top-0 h-full rounded-full transition-all"
                style={{
                  left: `${(clipStart / dur) * 100}%`,
                  width: `${(clipDur / dur) * 100}%`,
                  background: GRAD,
                }} />
            </div>

            {/* Slider início */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1 block"
                style={{ color: "var(--text-muted)" }}>Início</label>
              <input type="range" min={0} max={Math.max(0, dur - 1)} step={0.5}
                value={clipStart}
                onChange={e => {
                  const v = Number(e.target.value);
                  setClipStart(v);
                  if (clipEnd <= v + 1) setClipEnd(Math.min(v + 1, dur));
                }}
                className="w-full accent-purple-600" />
            </div>

            {/* Slider fim */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1 block"
                style={{ color: "var(--text-muted)" }}>Fim</label>
              <input type="range" min={Math.min(clipStart + 1, dur)} max={dur} step={0.5}
                value={clipEnd}
                onChange={e => setClipEnd(Number(e.target.value))}
                className="w-full accent-purple-600" />
            </div>

            {/* Atalhos de duração */}
            <div className="flex gap-2">
              {[15, 30, 60, 90].map(s => (
                <button key={s}
                  onClick={() => setClipEnd(Math.min(clipStart + s, dur))}
                  className="flex-1 py-1.5 rounded-xl text-xs font-semibold border transition active:scale-95"
                  style={{
                    borderColor: Math.abs(clipDur - s) < 1 ? PURPLE : "var(--border-default)",
                    background: Math.abs(clipDur - s) < 1 ? PURPLE + "15" : "var(--s2)",
                    color: Math.abs(clipDur - s) < 1 ? PURPLE : "var(--text-secondary)",
                  }}>
                  {s}s
                </button>
              ))}
            </div>

            {clipDur > 90 && (
              <p className="text-xs font-medium text-center" style={{ color: "#F59E0B" }}>
                ⚠️ Recomendamos clipes até 90 segundos para melhor desempenho no feed
              </p>
            )}

            <button onClick={() => setStep("publish")}
              className="w-full h-11 rounded-2xl font-bold text-white text-sm transition active:scale-[0.98]"
              style={{ background: GRAD }}>
              Continuar →
            </button>
          </div>
        )}

        {/* ── PASSO 3: Publicar ── */}
        {step === "publish" && selected && (
          <div className="overflow-y-auto flex-1 p-4 space-y-4">

            {/* Preview do card como aparece no feed */}
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}>Pré-visualização no feed</p>

            <div className="rounded-2xl overflow-hidden border shadow-sm"
              style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}>
              {/* Cabeçalho do canal */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b"
                style={{ borderColor: "var(--border-subtle)" }}>
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                  style={{ background: PURPLE + "20" }}>
                  {channel?.avatar_url
                    ? <img src={channel.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="font-bold text-sm" style={{ color: PURPLE }}>
                        {channel?.name?.[0]?.toUpperCase()}
                      </span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                    {channel?.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    @{channel?.handle} · HoodaTV
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{ background: PURPLE + "15", color: PURPLE }}>Clipe</span>
              </div>

              {/* Thumbnail com badge de tempo */}
              <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
                {selected.thumbnail_url
                  ? <img src={selected.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <PlayCircle className="h-10 w-10 text-white/30" />
                    </div>}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
                    <svg className="h-5 w-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white"
                  style={{ background: "rgba(0,0,0,0.75)" }}>
                  {fmt(clipStart)} – {fmt(clipEnd)}
                </div>
              </div>

              {/* Título e ações */}
              <div className="px-3 py-2.5">
                <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  {title || <span style={{ color: "var(--text-muted)" }}>Título do clipe…</span>}
                </p>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Heart className="h-4 w-4" /> 0
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <MessageCircle className="h-4 w-4" /> 0
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Share2 className="h-4 w-4" />
                  </span>
                  <span className="flex-1" />
                  <span className="text-[11px] font-bold" style={{ color: PURPLE }}>Ver vídeo completo →</span>
                </div>
              </div>
            </div>

            {/* Título */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block"
                style={{ color: "var(--text-muted)" }}>Título do clipe *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
                placeholder="Dá um título ao clipe…"
                className="w-full h-11 px-4 rounded-xl text-sm outline-none border transition"
                style={{ background: "var(--s2)", borderColor: title ? PURPLE : "var(--border-default)", color: "var(--text-primary)" }}
                onFocus={e => e.currentTarget.style.borderColor = PURPLE}
                onBlur={e => e.currentTarget.style.borderColor = title ? PURPLE : "var(--border-default)"} />
              <p className="text-[11px] text-right mt-0.5" style={{ color: "var(--text-muted)" }}>{title.length}/120</p>
            </div>

            {/* Botão publicar */}
            <button onClick={publish}
              disabled={publishing || done || !title.trim()}
              className="w-full h-12 rounded-2xl font-bold text-white text-sm transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: GRAD }}>
              {done
                ? "Publicado! 🎬"
                : publishing
                  ? <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> A publicar…</>
                  : <><Scissors className="h-4 w-4" /> Publicar no feed</>}
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
