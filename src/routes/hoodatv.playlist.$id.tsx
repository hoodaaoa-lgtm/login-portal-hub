import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useState } from "react";
import {
  ChevronLeft, Play, Eye, Clock, ListVideo, Check,
} from "lucide-react";
import { playlistQuery, playlistVideosQuery } from "@/lib/playlist-queries";

export const Route = createFileRoute("/hoodatv/playlist/$id")({
  head: () => ({ meta: [{ title: "Playlist — HoodaTV" }] }),
  component: PlaylistPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

/* ── helpers ── */
const fmtDur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};
const fmtV = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000     ? `${(n / 1_000).toFixed(0)}K` : String(n);

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24); if (days < 30) return `${days}d`;
  const mo = Math.floor(days / 30); if (mo < 12) return `${mo} meses`;
  return `${Math.floor(mo / 12)} anos`;
};

/* ── Skeleton ── */
function Skel() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="w-28 h-16 rounded-xl shrink-0" style={{ background: "var(--s3)" }} />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 rounded-full w-4/5" style={{ background: "var(--s3)" }} />
        <div className="h-3 rounded-full w-2/5" style={{ background: "var(--s3)" }} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Página de Playlist
══════════════════════════════════════════════════════════ */
function PlaylistPage() {
  const { id } = useParams({ from: "/hoodatv/playlist/$id" });
  const navigate = useNavigate();

  const { data: playlist, isLoading: plLoading } = useQuery(playlistQuery(id));
  const { data: items = [], isLoading: vLoading }  = useQuery(playlistVideosQuery(id));

  const [activeIdx, setActiveIdx] = useState(0);

  const activeItem = items[activeIdx] ?? null;
  const activeVideo = activeItem?.video ?? null;

  /* ── Channel info (para o link) ── */
  const { data: channel } = useQuery({
    queryKey: ["pl-channel", playlist?.channel_id],
    queryFn: async () => {
      if (!playlist?.channel_id) return null;
      const { data } = await (supabase as any)
        .from("channels")
        .select("name,handle")
        .eq("id", playlist.channel_id)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!playlist?.channel_id,
    staleTime: 60_000,
  });

  if (plLoading || vLoading) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="animate-pulse">
          <div className="h-12 border-b" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }} />
          <div className="flex flex-col lg:flex-row gap-0">
            <div className="flex-1 aspect-video" style={{ background: "var(--s3)" }} />
            <div className="w-full lg:w-80 p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => <Skel key={i} />)}
            </div>
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  if (!playlist) return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <ListVideo className="w-16 h-16 mb-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>
            Playlist não encontrada
          </h2>
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
      <PageWrapper className="pb-20 lg:pb-0 flex flex-col" style={{ minHeight: "100dvh" }}>

        {/* ── Top bar ── */}
        <div
          className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 border-b shrink-0"
          style={{
            background: "rgba(var(--s1-rgb,250,250,252),.94)",
            backdropFilter: "blur(20px)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            onClick={() => navigate({ to: -1 as any })}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
            style={{ color: "var(--text-primary)" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-extrabold truncate" style={{ color: "var(--text-primary)" }}>
              {playlist.title}
            </p>
            {channel && (
              <button
                onClick={() => navigate({ to: "/hoodatv/canal/$handle", params: { handle: channel.handle } })}
                className="text-[11px] font-semibold truncate hover:underline"
                style={{ color: P }}
              >
                {channel.name}
              </button>
            )}
          </div>
        </div>

        {/* ── Layout: Player + lista lateral ── */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">

          {/* ─ Player (esquerda / topo) ─ */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Player */}
            <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
              {activeVideo?.cf_embed_url
                ? <iframe
                    key={activeVideo.id}
                    src={`${activeVideo.cf_embed_url}?autoplay=true`}
                    className="w-full h-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                : <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                    <Play className="w-14 h-14 text-white opacity-30" />
                    <p className="text-white text-sm opacity-50">
                      {items.length === 0 ? "Playlist vazia" : "Vídeo não disponível"}
                    </p>
                  </div>}
            </div>

            {/* Info do vídeo activo */}
            {activeVideo && (
              <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <h1 className="text-base font-extrabold leading-snug mb-1.5"
                  style={{ color: "var(--text-primary)" }}>
                  {activeVideo.title}
                </h1>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {fmtV(activeVideo.views_count ?? 0)} visualizações
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {timeAgo(activeVideo.published_at ?? activeVideo.created_at)}
                  </span>
                </div>
                {/* Navegação anterior / próximo */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                    disabled={activeIdx === 0}
                    className="px-4 py-1.5 rounded-full text-xs font-bold border transition disabled:opacity-30 hover:bg-[var(--s2)]"
                    style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {activeIdx + 1} / {items.length}
                  </span>
                  <button
                    onClick={() => setActiveIdx(i => Math.min(items.length - 1, i + 1))}
                    disabled={activeIdx === items.length - 1}
                    className="px-4 py-1.5 rounded-full text-xs font-bold border transition disabled:opacity-30 hover:bg-[var(--s2)]"
                    style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
                  >
                    Próximo →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─ Lista lateral / inferior ─ */}
          <div
            className="w-full lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l overflow-y-auto"
            style={{ borderColor: "var(--border-subtle)", maxHeight: "calc(100dvh - 53px - 3rem)" }}
          >
            {/* Cabeçalho da lista */}
            <div className="px-4 py-3 border-b flex items-center gap-2"
              style={{ borderColor: "var(--border-subtle)" }}>
              <ListVideo className="w-4 h-4 shrink-0" style={{ color: P }} />
              <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {playlist.title}
              </p>
              <span className="ml-auto text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                {items.length} vídeo{items.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Itens */}
            <div className="py-2">
              {items.length === 0 && (
                <p className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>
                  Esta playlist não tem vídeos.
                </p>
              )}
              {items.map((item, idx) => {
                const v = item.video;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveIdx(idx)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 transition-all text-left hover:bg-[var(--s2)]"
                    style={isActive ? { background: `${P}10` } : {}}
                  >
                    {/* Número / check */}
                    <div
                      className="w-6 text-center text-xs font-bold shrink-0"
                      style={{ color: isActive ? P : "var(--text-muted)" }}
                    >
                      {isActive
                        ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full"
                            style={{ background: P }}>
                            <Play className="w-2.5 h-2.5 text-white ml-0.5" />
                          </span>
                        : idx + 1}
                    </div>

                    {/* Thumbnail */}
                    <div className="relative w-[4.5rem] h-[2.5rem] rounded-lg overflow-hidden shrink-0"
                      style={{ background: "var(--s3)" }}>
                      {v?.thumbnail_url
                        ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-3 h-3" style={{ color: P, opacity: 0.4 }} />
                          </div>}
                      {v?.duration_seconds && (
                        <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold text-white px-1 rounded"
                          style={{ background: "rgba(0,0,0,0.78)" }}>
                          {fmtDur(v.duration_seconds)}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[12px] font-semibold line-clamp-2 leading-[1.3]"
                        style={{ color: isActive ? P : "var(--text-primary)" }}
                      >
                        {v?.title ?? "Vídeo indisponível"}
                      </p>
                      {v && (
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {fmtV(v.views_count ?? 0)} views
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <BottomNav />
      </PageWrapper>
    </>
  );
}
