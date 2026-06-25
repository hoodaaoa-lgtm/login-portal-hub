import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useState } from "react";
import {
  ChevronLeft, Play, Bell, BellOff, Share2,
  Eye, Clock, Video as VideoIcon, Globe, Calendar,
  ThumbsUp, MoreVertical, Search,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/hoodatv/canal/$handle")({
  head: ({ params }) => ({ meta: [{ title: `${params.handle} — HoodaTV` }] }),
  component: ChannelPage,
});

/* ── Constantes ── */
const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";
const AVATAR_COLORS = [P, "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
const avatarColor = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

/* ── Helpers ── */
const fmtDur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
};
const fmtV = (n: number) =>
  n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` :
  n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n);
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff/60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h`;
  const days = Math.floor(h/24); if (days < 30) return `${days}d`;
  const mo = Math.floor(days/30); if (mo < 12) return `${mo} meses`;
  return `${Math.floor(mo/12)} anos`;
};
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("pt-PT", { year: "numeric", month: "long", day: "numeric" });

type Tab = "videos" | "sobre";

/* ── Queries ── */
function useChannel(handle: string) {
  return useQuery({
    queryKey: ["htv-canal", handle],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("channels")
        .select("id,name,handle,avatar_url,banner_url,description,category,country,created_at")
        .eq("handle", handle)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

function useChannelVideos(channelId: string | undefined) {
  return useQuery({
    queryKey: ["htv-canal-videos", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const { data } = await (supabase as any)
        .from("videos")
        .select("id,title,thumbnail_url,duration_seconds,views_count,likes_count,published_at,created_at,cf_embed_url,cf_stream_uid")
        .eq("channel_id", channelId)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!channelId,
    staleTime: 60_000,
  });
}

function useChannelStats(channelId: string | undefined) {
  return useQuery({
    queryKey: ["htv-canal-stats", channelId],
    queryFn: async () => {
      if (!channelId) return { subs: 0, totalViews: 0, videoCount: 0 };
      const [followRes, videoRes] = await Promise.all([
        (supabase as any).from("follows").select("id", { count: "exact", head: true }).eq("following_id", channelId),
        (supabase as any).from("videos").select("views_count").eq("channel_id", channelId).eq("status", "published").eq("visibility", "public"),
      ]);
      const subs = followRes.count ?? 0;
      const videos = videoRes.data ?? [];
      return {
        subs,
        videoCount: videos.length,
        totalViews: videos.reduce((s: number, v: any) => s + (v.views_count ?? 0), 0),
      };
    },
    enabled: !!channelId,
    staleTime: 30_000,
  });
}

function useMe() {
  return useQuery({ queryKey: ["htv-me"], queryFn: async () => (await supabase.auth.getUser()).data.user ?? null, staleTime: 60_000 });
}

function useIsFollowing(userId: string | null, channelId: string | undefined) {
  return useQuery({
    queryKey: ["htv-is-following", userId, channelId],
    queryFn: async () => {
      if (!userId || !channelId) return false;
      const { data } = await (supabase as any).from("follows").select("id").eq("follower_id", userId).eq("following_id", channelId).maybeSingle();
      return !!data;
    },
    enabled: !!userId && !!channelId,
    staleTime: 30_000,
  });
}

/* ── Video Card ── */
function VideoCard({ v, onPlay }: { v: any; onPlay: (v: any) => void }) {
  return (
    <div className="group cursor-pointer" onClick={() => onPlay(v)}>
      <div className="relative aspect-video rounded-2xl overflow-hidden" style={{ background: "var(--s3)" }}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: `${P}18` }}>
              <Play className="w-10 h-10" style={{ color: P, opacity: 0.5 }} />
            </div>}

        {v.duration_seconds && (
          <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white px-1.5 py-0.5 rounded-lg"
            style={{ background: "rgba(0,0,0,0.80)" }}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
          style={{ background: "rgba(0,0,0,0.28)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.95)" }}>
            <Play className="w-6 h-6 ml-1" style={{ color: P }} />
          </div>
        </div>
      </div>

      <div className="mt-2.5 space-y-0.5">
        <p className="text-[13px] font-bold leading-[1.35] line-clamp-2" style={{ color: "var(--text-primary)" }}>
          {v.title}
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {fmtV(v.views_count ?? 0)} visualizações · {timeAgo(v.published_at ?? v.created_at)}
        </p>
      </div>
    </div>
  );
}

/* ── Video Player Modal ── */
function VideoModal({ v, onClose }: { v: any; onClose: () => void }) {
  if (!v) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden"
        style={{ background: "var(--s0)" }}
        onClick={e => e.stopPropagation()}>

        {/* Player */}
        <div className="relative aspect-video bg-black">
          {v.cf_embed_url
            ? <iframe src={`${v.cf_embed_url}?autoplay=true`}
                className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
            : <div className="w-full h-full flex items-center justify-center">
                <p className="text-white text-sm opacity-60">Vídeo não disponível</p>
              </div>}
          <button onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-white"
            style={{ background: "rgba(0,0,0,0.6)" }}>
            ✕
          </button>
        </div>

        {/* Info */}
        <div className="p-4">
          <h2 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{v.title}</h2>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{fmtV(v.views_count ?? 0)} views</span>
            <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" />{fmtV(v.likes_count ?? 0)}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeAgo(v.published_at ?? v.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton ── */
function Skel() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="aspect-video rounded-2xl" style={{ background: "var(--s3)" }} />
      <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "80%" }} />
      <div className="h-3 rounded-full" style={{ background: "var(--s3)", width: "50%" }} />
    </div>
  );
}

/* ══ PÁGINA PRINCIPAL ══ */
function ChannelPage() {
  const { handle } = useParams({ from: "/hoodatv/canal/$handle" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab]         = useState<Tab>("videos");
  const [playing, setPlaying] = useState<any>(null);
  const [search, setSearch]   = useState("");

  const { data: channel, isLoading: chLoading } = useChannel(handle);
  const { data: videos = [], isLoading: vLoading } = useChannelVideos(channel?.id);
  const { data: stats } = useChannelStats(channel?.id);
  const { data: me } = useMe();
  const { data: isFollowing = false } = useIsFollowing(me?.id ?? null, channel?.id);

  const bg = avatarColor(channel?.name ?? "");

  async function toggleFollow() {
    if (!me) { toast.error("Inicia sessão para seguir canais."); return; }
    if (!channel) return;

    qc.setQueryData(["htv-is-following", me.id, channel.id], !isFollowing);
    qc.setQueryData(["htv-canal-stats", channel.id], (old: any) => ({
      ...old, subs: (old?.subs ?? 0) + (isFollowing ? -1 : 1),
    }));

    if (isFollowing) {
      await (supabase as any).from("follows").delete().eq("follower_id", me.id).eq("following_id", channel.id);
      toast.success("Deixaste de seguir o canal.");
    } else {
      await (supabase as any).from("follows").insert({ follower_id: me.id, following_id: channel.id });
      toast.success("Canal seguido!");
    }
  }

  const filteredVideos = search
    ? videos.filter((v: any) => v.title?.toLowerCase().includes(search.toLowerCase()))
    : videos;

  /* ── Loading ── */
  if (chLoading) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="animate-pulse">
          <div className="h-40 sm:h-52" style={{ background: "var(--s3)" }} />
          <div className="px-4 pt-4 space-y-3">
            <div className="w-20 h-20 rounded-full" style={{ background: "var(--s3)" }} />
            <div className="h-5 rounded-full w-48" style={{ background: "var(--s3)" }} />
            <div className="h-3 rounded-full w-32" style={{ background: "var(--s3)" }} />
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  /* ── Canal não encontrado ── */
  if (!channel) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <VideoIcon className="w-16 h-16 mb-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Canal não encontrado</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>O canal @{handle} não existe.</p>
          <button onClick={() => navigate({ to: "/hoodatv" })}
            className="px-6 py-2.5 rounded-full text-white font-bold text-sm"
            style={{ background: GRAD }}>
            Voltar à HoodaTV
          </button>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">

        {/* ── Player Modal ── */}
        {playing && <VideoModal v={playing} onClose={() => setPlaying(null)} />}

        {/* ── Back button ── */}
        <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 border-b"
          style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
          <button onClick={() => navigate({ to: "/hoodatv" })}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
            style={{ color: "var(--text-primary)" }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{channel.name}</span>
        </div>

        {/* ── Banner ── */}
        <div className="relative">
          <div className="h-40 sm:h-52 w-full overflow-hidden"
            style={{ background: channel.banner_url ? undefined : `${bg}22` }}>
            {channel.banner_url
              ? <img src={channel.banner_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${bg}33, ${bg}11)` }} />}
          </div>

          {/* ── Avatar sobre o banner ── */}
          <div className="px-4 sm:px-6">
            <div className="flex items-end gap-4 -mt-10 sm:-mt-12">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-black ring-4 shrink-0"
                style={{ background: bg }}>
                {channel.avatar_url
                  ? <img src={channel.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (channel.name?.[0] ?? "?").toUpperCase()}
              </div>
              {/* Share button (desktop) */}
              <div className="hidden sm:flex items-center gap-2 ml-auto mb-2">
                <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copiado!"); }}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-full text-xs font-bold border transition hover:bg-[var(--s2)]"
                  style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                  <Share2 className="w-3.5 h-3.5" /> Partilhar
                </button>
                <button onClick={toggleFollow}
                  className="flex items-center gap-1.5 px-5 h-9 rounded-full text-sm font-bold transition-all active:scale-95"
                  style={isFollowing
                    ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                    : { background: GRAD, color: "#fff" }}>
                  {isFollowing ? <><BellOff className="w-4 h-4" /> A seguir</> : <><Bell className="w-4 h-4" /> Seguir</>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Info do canal ── */}
        <div className="px-4 sm:px-6 pt-3 pb-4">
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>{channel.name}</h1>
          <p className="text-sm mt-0.5" style={{ color: P }}>@{channel.handle}</p>

          {/* Stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {fmtV(stats?.totalViews ?? 0)} visualizações
            </span>
            <span className="flex items-center gap-1">
              <VideoIcon className="w-3.5 h-3.5" />
              {stats?.videoCount ?? 0} vídeos
            </span>
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              {fmtV(stats?.subs ?? 0)} seguidores
            </span>
            {channel.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Desde {fmtDate(channel.created_at)}
              </span>
            )}
          </div>

          {/* Botões mobile */}
          <div className="flex items-center gap-2 mt-3 sm:hidden">
            <button onClick={toggleFollow}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full text-sm font-bold transition-all active:scale-95"
              style={isFollowing
                ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                : { background: GRAD, color: "#fff" }}>
              {isFollowing ? <><BellOff className="w-4 h-4" /> A seguir</> : <><Bell className="w-4 h-4" /> Seguir</>}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copiado!"); }}
              className="w-9 h-9 rounded-full flex items-center justify-center border"
              style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="sticky top-[53px] z-20 border-b"
          style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
          <div className="flex px-4 sm:px-6">
            {(["videos", "sobre"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-3 text-sm font-bold capitalize transition-all relative"
                style={{ color: tab === t ? P : "var(--text-muted)" }}>
                {t === "videos" ? `Vídeos (${stats?.videoCount ?? 0})` : "Sobre"}
                {tab === t && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: P }} />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

          {/* ══ TAB: VÍDEOS ══ */}
          {tab === "videos" && (
            <div>
              {/* Search dentro do canal */}
              <div className="flex items-center gap-2 rounded-full px-4 h-10 border mb-6 transition-all"
                style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
                <Search className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar neste canal…"
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-primary)" }} />
                {search && <button onClick={() => setSearch("")}><span style={{ color: "var(--text-muted)", fontSize: 18 }}>×</span></button>}
              </div>

              {vLoading
                ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                    {Array.from({ length: 8 }).map((_, i) => <Skel key={i} />)}
                  </div>
                : !filteredVideos.length
                  ? <div className="py-20 text-center rounded-2xl border"
                      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                      <VideoIcon className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {search ? `Sem resultados para "${search}"` : "Este canal ainda não tem vídeos publicados."}
                      </p>
                    </div>
                  : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                      {filteredVideos.map((v: any) => (
                        <VideoCard key={v.id} v={v} onPlay={setPlaying} />
                      ))}
                    </div>}
            </div>
          )}

          {/* ══ TAB: SOBRE ══ */}
          {tab === "sobre" && (
            <div className="max-w-xl space-y-6">

              {channel.description && (
                <div className="rounded-2xl p-5 border" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Descrição</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{channel.description}</p>
                </div>
              )}

              <div className="rounded-2xl p-5 border space-y-4" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Detalhes</p>

                {channel.category && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${P}15` }}>
                      <VideoIcon className="w-4 h-4" style={{ color: P }} />
                    </div>
                    <div>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Categoria</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{channel.category}</p>
                    </div>
                  </div>
                )}

                {channel.country && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${P}15` }}>
                      <Globe className="w-4 h-4" style={{ color: P }} />
                    </div>
                    <div>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>País</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{channel.country}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${P}15` }}>
                    <Calendar className="w-4 h-4" style={{ color: P }} />
                  </div>
                  <div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Criado em</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fmtDate(channel.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${P}15` }}>
                    <Eye className="w-4 h-4" style={{ color: P }} />
                  </div>
                  <div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Total de visualizações</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fmtV(stats?.totalViews ?? 0)}</p>
                  </div>
                </div>
              </div>

              {/* Stats destacadas */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Seguidores", value: fmtV(stats?.subs ?? 0) },
                  { label: "Vídeos", value: String(stats?.videoCount ?? 0) },
                  { label: "Visualizações", value: fmtV(stats?.totalViews ?? 0) },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl p-4 text-center border"
                    style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                    <p className="text-xl font-extrabold" style={{ color: P }}>{s.value}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        <BottomNav />
      </PageWrapper>
    </>
  );
}
