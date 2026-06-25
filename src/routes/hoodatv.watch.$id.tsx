import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useState } from "react";
import {
  ChevronLeft, Play, ThumbsUp, Share2, Eye, Clock,
  Bell, BellOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/hoodatv/watch/$id")({
  head: () => ({ meta: [{ title: "HoodaTV — A ver vídeo" }] }),
  component: WatchPage,
});

/* ── Constantes ── */
const P    = "#5B3FCF";
const PINK = "#E94B8A";
const GRAD = `linear-gradient(135deg,${P},${PINK})`;
const AVATAR_COLORS = [P, "#F26B3A", "#1FAFA6", "#6BA547", PINK];
const avatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

/* ── Helpers ── */
const fmtDur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
    : `${m}:${String(sec).padStart(2,"0")}`;
};
const fmtV = (n: number) =>
  n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` :
  n >= 1_000     ? `${(n/1_000).toFixed(0)}K`      : String(n);
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff/60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h`;
  const days = Math.floor(h/24); if (days < 30) return `${days}d`;
  const mo = Math.floor(days/30); if (mo < 12) return `${mo} meses`;
  return `${Math.floor(mo/12)} anos`;
};

/* ── Queries ── */
function useVideo(id: string) {
  return useQuery({
    queryKey: ["htv-watch", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("videos")
        .select(`
          id, title, description, thumbnail_url, duration_seconds,
          views_count, likes_count, created_at, published_at,
          cf_stream_url, cf_embed_url, cf_stream_uid, video_path,
          channel_id,
          channels(id, name, handle, avatar_url)
        `)
        .eq("id", id)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

function useRelated(channelId: string | undefined, currentId: string) {
  return useQuery({
    queryKey: ["htv-related", channelId, currentId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("videos")
        .select(`
          id, title, thumbnail_url, duration_seconds,
          views_count, published_at, created_at,
          channels(name, handle, avatar_url)
        `)
        .eq("status", "published")
        .eq("visibility", "public")
        .neq("id", currentId)
        .order("views_count", { ascending: false })
        .limit(12);
      return (data ?? []).map((v: any) => ({ ...v, channel: v.channels }));
    },
    staleTime: 120_000,
  });
}

function useMe() {
  return useQuery({
    queryKey: ["htv-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user ?? null,
    staleTime: 60_000,
  });
}

function useIsFollowing(userId: string | null, channelId: string | undefined) {
  return useQuery({
    queryKey: ["htv-is-following", userId, channelId],
    queryFn: async () => {
      if (!userId || !channelId) return false;
      const { data } = await (supabase as any)
        .from("follows").select("id")
        .eq("follower_id", userId).eq("following_id", channelId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!userId && !!channelId,
    staleTime: 30_000,
  });
}

/* ── Componente de vídeo lateral "A Seguir" ── */
function RelatedCard({ v, onClick }: { v: any; onClick: () => void }) {
  const ch = v.channel;
  const bg = avatarColor(ch?.name ?? "");
  return (
    <div className="flex gap-2.5 cursor-pointer group" onClick={onClick}>
      {/* Thumbnail */}
      <div className="relative shrink-0 w-[140px] aspect-video rounded-xl overflow-hidden"
        style={{ background: "var(--s3)" }}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: `${bg}22` }}>
              <Play className="w-6 h-6" style={{ color: bg, opacity: 0.5 }} />
            </div>}
        {v.duration_seconds && (
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-white px-1 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.80)" }}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[12px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>
          {v.title}
        </p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          {ch?.name ?? "Canal"}
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {fmtV(v.views_count ?? 0)} views · {timeAgo(v.published_at ?? v.created_at)}
        </p>
      </div>
    </div>
  );
}

/* ══ PÁGINA PRINCIPAL ══ */
function WatchPage() {
  const { id } = useParams({ from: "/hoodatv/watch/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: video, isLoading } = useVideo(id);
  const ch = video?.channels;
  const { data: related = [] } = useRelated(ch?.id, id);
  const { data: me } = useMe();
  const { data: isFollowing = false } = useIsFollowing(me?.id ?? null, ch?.id);

  const [liked, setLiked] = useState(false);
  const bg = avatarColor(ch?.name ?? "");

  async function toggleFollow() {
    if (!me) { toast.error("Inicia sessão para seguir."); return; }
    if (!ch?.id) return;
    if (isFollowing) {
      await (supabase as any).from("follows").delete()
        .eq("follower_id", me.id).eq("following_id", ch.id);
      toast.success("Deixaste de seguir.");
    } else {
      await (supabase as any).from("follows").insert({
        follower_id: me.id, following_id: ch.id,
      });
      toast.success("Canal seguido!");
    }
    qc.invalidateQueries({ queryKey: ["htv-is-following", me.id, ch.id] });
  }

  /* ── Player URL ── */
  function getPlayerUrl(): string | null {
    if (!video) return null;
    if (video.cf_stream_url) return video.cf_stream_url;
    if (video.video_path) {
      // Supabase Storage URL
      const { data } = supabase.storage.from("videos").getPublicUrl(video.video_path);
      return data?.publicUrl ?? null;
    }
    return null;
  }

  const playerUrl = getPlayerUrl();
  const hasEmbed  = !!video?.cf_embed_url;

  /* Loading */
  if (isLoading) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
          <div className="animate-pulse space-y-4">
            <div className="aspect-video rounded-2xl" style={{ background: "var(--s3)" }} />
            <div className="h-5 rounded-full w-3/4" style={{ background: "var(--s3)" }} />
            <div className="h-4 rounded-full w-1/2" style={{ background: "var(--s3)" }} />
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  if (!video) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <Play className="w-16 h-16 mb-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Vídeo não encontrado</h2>
          <button onClick={() => navigate({ to: "/hoodatv" })}
            className="mt-4 px-6 py-2.5 rounded-full text-white font-bold text-sm"
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

        {/* Back */}
        <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 border-b"
          style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
          <button onClick={() => navigate({ to: "/hoodatv" })}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
            style={{ color: "var(--text-primary)" }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
            HoodaTV
          </span>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">

          {/* ══ COLUNA ESQUERDA — Player + Info ══ */}
          <div className="space-y-4">

            {/* Player */}
            <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black"
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
              {playerUrl
                ? <video
                    key={playerUrl}
                    src={playerUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full"
                    style={{ background: "#000" }}
                  />
                : hasEmbed
                  ? <iframe
                      src={`${video.cf_embed_url}?autoplay=true`}
                      className="w-full h-full"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  : <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <Play className="w-16 h-16" style={{ color: P, opacity: 0.35 }} />
                      <p className="text-white text-sm opacity-50">Vídeo não disponível</p>
                    </div>}
            </div>

            {/* Título */}
            <h1 className="text-lg font-extrabold leading-snug" style={{ color: "var(--text-primary)" }}>
              {video.title}
            </h1>

            {/* Stats + Acções */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {fmtV(video.views_count ?? 0)} visualizações
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {timeAgo(video.published_at ?? video.created_at)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLiked(l => !l)}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold border transition-all active:scale-95"
                  style={liked
                    ? { background: GRAD, color: "#fff", border: "none" }
                    : { background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                  <ThumbsUp className="w-4 h-4" />
                  {fmtV((video.likes_count ?? 0) + (liked ? 1 : 0))}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copiado!"); }}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold border transition-all active:scale-95"
                  style={{ background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                  <Share2 className="w-4 h-4" />
                  Partilhar
                </button>
              </div>
            </div>

            {/* Canal info */}
            <div className="flex items-center justify-between p-4 rounded-2xl border"
              style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-3 cursor-pointer"
                onClick={() => ch?.handle && navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } })}>
                <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: bg }}>
                  {ch?.avatar_url
                    ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" />
                    : (ch?.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold hover:underline" style={{ color: "var(--text-primary)" }}>
                    {ch?.name ?? "Canal"}
                  </p>
                  <p className="text-xs" style={{ color: P }}>@{ch?.handle}</p>
                </div>
              </div>
              <button onClick={toggleFollow}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold transition-all active:scale-95 shrink-0"
                style={isFollowing
                  ? { background: "var(--s3)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                  : { background: GRAD, color: "#fff" }}>
                {isFollowing
                  ? <><BellOff className="w-4 h-4" /> A seguir</>
                  : <><Bell className="w-4 h-4" /> Seguir</>}
              </button>
            </div>

            {/* Descrição */}
            {video.description && (
              <div className="p-4 rounded-2xl border text-sm leading-relaxed"
                style={{ background: "var(--s2)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                {video.description}
              </div>
            )}
          </div>

          {/* ══ COLUNA DIREITA — A Seguir ══ */}
          <aside className="mt-6 lg:mt-0 space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              A Seguir
            </h3>
            <div className="space-y-3">
              {related.map((v: any, i: number) => (
                <div key={v.id} className="flex items-start gap-1">
                  <span className="text-xs font-bold mt-2 w-5 shrink-0 text-center" style={{ color: "var(--text-muted)" }}>
                    {i + 1}
                  </span>
                  <RelatedCard
                    v={v}
                    onClick={() => navigate({ to: "/hoodatv/watch/$id", params: { id: v.id } })}
                  />
                </div>
              ))}
              {!related.length && (
                <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                  Sem vídeos relacionados.
                </p>
              )}
            </div>
          </aside>

        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );
}
