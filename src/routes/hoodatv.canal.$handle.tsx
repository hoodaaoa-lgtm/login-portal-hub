import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useState } from "react";
import {
  ChevronLeft, Play, Bell, BellOff, Share2,
  Eye, Clock, Video as VideoIcon, Globe, Calendar,
  Image as ImageIcon, FileText, LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { PhotoViewer } from "@/components/PhotoViewer";

export const Route = createFileRoute("/hoodatv/canal/$handle")({
  head: ({ params }) => ({ meta: [{ title: "Hooda" }] }),
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
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
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

type Tab = "media" | "videos" | "sobre";

/* ── Queries ── */
function useChannel(handle: string) {
  return useQuery({
    queryKey: ["canal", handle],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("channels")
        .select("id,name,handle,avatar_url,banner_url,description,category,country,created_at")
        .eq("handle", handle).maybeSingle();
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

function useChannelPosts(channelId: string | undefined) {
  return useQuery({
    queryKey: ["canal-posts", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      // Buscar posts do canal (vídeos publicados como posts + posts normais do dono)
      const { data: videos } = await (supabase as any)
        .from("videos")
        .select("id,title,thumbnail_url,duration_seconds,views_count,published_at,created_at,cf_stream_url,cf_embed_url,video_path")
        .eq("channel_id", channelId)
        .eq("status", "published").eq("visibility", "public")
        .order("published_at", { ascending: false });

      return (videos ?? []).map((v: any) => ({ ...v, _type: "video" }));
    },
    enabled: !!channelId,
    staleTime: 60_000,
  });
}

function useChannelStats(channelId: string | undefined) {
  return useQuery({
    queryKey: ["canal-stats", channelId],
    queryFn: async () => {
      if (!channelId) return { subs: 0, totalViews: 0, videoCount: 0 };
      const [followRes, videoRes] = await Promise.all([
        (supabase as any).from("follows").select("*", { count: "exact", head: true }).eq("following_id", channelId),
        (supabase as any).from("videos").select("views_count").eq("channel_id", channelId).eq("status", "published"),
      ]);
      const videos = videoRes.data ?? [];
      return {
        subs: followRes.count ?? 0,
        videoCount: videos.length,
        totalViews: videos.reduce((s: number, v: any) => s + (v.views_count ?? 0), 0),
      };
    },
    enabled: !!channelId,
    staleTime: 30_000,
  });
}

function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user ?? null, staleTime: 60_000 });
}

function useIsFollowing(userId: string | null, channelId: string | undefined) {
  return useQuery({
    queryKey: ["canal-following", userId, channelId],
    queryFn: async () => {
      if (!userId || !channelId) return false;
      const { data } = await (supabase as any).from("follows").select("id").eq("follower_id", userId).eq("following_id", channelId).maybeSingle();
      return !!data;
    },
    enabled: !!userId && !!channelId,
    staleTime: 30_000,
  });
}

/* ── Card de Vídeo ── */
function VideoCard({ v, onClick }: { v: any; onClick: () => void }) {
  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative aspect-video rounded-2xl overflow-hidden" style={{ background: "var(--s3)" }}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: `${P}18` }}>
              <Play className="w-10 h-10" style={{ color: P, opacity: 0.5 }} />
            </div>}
        {v.duration_seconds && (
          <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white px-1.5 py-0.5 rounded-lg"
            style={{ background: "rgba(0,0,0,0.80)" }}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
          style={{ background: "rgba(0,0,0,0.25)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.95)" }}>
            <Play className="w-5 h-5 ml-0.5" style={{ color: P }} />
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-[13px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>{v.title}</p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {fmtV(v.views_count ?? 0)} views · {timeAgo(v.published_at ?? v.created_at)}
        </p>
      </div>
    </div>
  );
}

/* ── Card de Média (grid misto) ── */
function MediaCard({ item, onClick }: { item: any; onClick: () => void }) {
  if (item._type === "video") {
    return (
      <div className="group cursor-pointer" onClick={onClick}>
        <div className="relative aspect-square rounded-2xl overflow-hidden" style={{ background: "var(--s3)" }}>
          {item.thumbnail_url
            ? <img src={item.thumbnail_url} alt={item.title} loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            : <div className="w-full h-full flex items-center justify-center" style={{ background: `${P}18` }}>
                <Play className="w-8 h-8" style={{ color: P, opacity: 0.5 }} />
              </div>}
          <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}>
            <Play className="w-3 h-3 text-white ml-0.5" />
          </div>
          {item.duration_seconds && (
            <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white px-1 py-0.5 rounded"
              style={{ background: "rgba(0,0,0,0.75)" }}>
              {fmtDur(item.duration_seconds)}
            </span>
          )}
        </div>
      </div>
    );
  }
  return null;
}

/* ── PÁGINA PRINCIPAL ── */
function ChannelPage() {
  const { handle } = useParams({ from: "/hoodatv/canal/$handle" });
  const navigate   = useNavigate();
  const qc         = useQueryClient();

  const [tab, setTab]             = useState<Tab>("media");
  const [avatarOpen, setAvatarOpen] = useState(false);

  const { data: channel, isLoading } = useChannel(handle);
  const { data: posts = [], isLoading: pLoading } = useChannelPosts(channel?.id);
  const { data: stats }               = useChannelStats(channel?.id);
  const { data: me }                  = useMe();
  const { data: isFollowing = false } = useIsFollowing(me?.id ?? null, channel?.id);

  const bg = avatarColor(channel?.name ?? "");

  const videos = posts.filter((p: any) => p._type === "video");

  async function toggleFollow() {
    if (!me) { toast.error("Inicia sessão para seguir."); return; }
    if (!channel) return;
    qc.setQueryData(["canal-following", me.id, channel.id], !isFollowing);
    if (isFollowing) {
      await (supabase as any).from("follows").delete().eq("follower_id", me.id).eq("following_id", channel.id);
      toast.success("Deixaste de seguir.");
    } else {
      await (supabase as any).from("follows").insert({ follower_id: me.id, following_id: channel.id });
      toast.success("Canal seguido!");
    }
    qc.invalidateQueries({ queryKey: ["canal-stats", channel.id] });
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "media",  label: "Média",   icon: LayoutGrid },
    { key: "videos", label: "Vídeos",  icon: VideoIcon  },
    { key: "sobre",  label: "Sobre",   icon: Globe      },
  ];

  if (isLoading) return (
    <><SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="animate-pulse">
          <div className="h-40 sm:h-52" style={{ background: "var(--s3)" }} />
          <div className="px-4 pt-4 space-y-3">
            <div className="w-20 h-20 rounded-full" style={{ background: "var(--s3)" }} />
            <div className="h-5 rounded-full w-48" style={{ background: "var(--s3)" }} />
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  if (!channel) return (
    <><SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <VideoIcon className="w-16 h-16 mb-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Canal não encontrado</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>O canal @{handle} não existe.</p>
          <button onClick={() => navigate({ to: "/home" })}
            className="px-6 py-2.5 rounded-full text-white font-bold text-sm" style={{ background: GRAD }}>
            Voltar ao início
          </button>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  return (
    <><SideNav />
      <PageWrapper className="pb-20 lg:pb-0">

        {/* Back */}
        <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 border-b"
          style={{ background: "var(--s1)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
          <button onClick={() => navigate({ to: "/home" })}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
            style={{ color: "var(--text-primary)" }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{channel.name}</span>
        </div>

        {/* Banner */}
        <div className="relative">
          <div className="h-36 sm:h-48 w-full overflow-hidden" style={{ background: `${bg}22` }}>
            {channel.banner_url
              ? <img src={channel.banner_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full" style={{ background: `linear-gradient(135deg,${bg}44,${bg}11)` }} />}
          </div>

          <div className="px-4 sm:px-6">
            <div className="flex items-end gap-4 -mt-10">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-black ring-4 ring-[var(--s1)] shrink-0 cursor-pointer"
                style={{ background: bg }}
                onClick={() => channel.avatar_url && setAvatarOpen(true)}>
                {channel.avatar_url
                  ? <img src={channel.avatar_url} alt="" className="w-full h-full object-cover" />
                  : (channel.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="hidden sm:flex items-center gap-2 ml-auto mb-1">
                <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copiado!"); }}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-full text-xs font-bold border transition hover:bg-[var(--s2)]"
                  style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                  <Share2 className="w-3.5 h-3.5" /> Partilhar
                </button>
                <button onClick={toggleFollow}
                  className="flex items-center gap-1.5 px-5 h-9 rounded-full text-sm font-bold transition active:scale-95"
                  style={isFollowing
                    ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                    : { background: GRAD, color: "#fff" }}>
                  {isFollowing ? <><BellOff className="w-4 h-4" /> A seguir</> : <><Bell className="w-4 h-4" /> Seguir</>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="px-4 sm:px-6 pt-3 pb-2">
          <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>{channel.name}</h1>
          <p className="text-sm mt-0.5" style={{ color: P }}>@{channel.handle}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{fmtV(stats?.totalViews ?? 0)} views</span>
            <span className="flex items-center gap-1"><VideoIcon className="w-3.5 h-3.5" />{stats?.videoCount ?? 0} vídeos</span>
            <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{fmtV(stats?.subs ?? 0)} seguidores</span>
          </div>

          {/* Botões mobile */}
          <div className="flex items-center gap-2 mt-3 sm:hidden">
            <button onClick={toggleFollow}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-full text-sm font-bold transition active:scale-95"
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

        {/* Tabs */}
        <div className="sticky top-[53px] z-20 border-b"
          style={{ background: "var(--s1)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
          <div className="flex px-4 sm:px-6">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition relative"
                style={{ color: tab === t.key ? P : "var(--text-muted)" }}>
                <t.icon className="w-4 h-4" />
                {t.label}
                {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: P }} />}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">

          {/* ══ MÉDIA ══ */}
          {tab === "media" && (
            <div>
              {pLoading
                ? <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-xl animate-pulse" style={{ background: "var(--s3)" }} />
                    ))}
                  </div>
                : !posts.length
                  ? <div className="py-20 text-center rounded-2xl border"
                      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                      <LayoutGrid className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Ainda não há publicações.</p>
                    </div>
                  : <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
                      {posts.map((item: any) => (
                        <MediaCard key={item.id} item={item}
                          onClick={() => item._type === "video" && navigate({ to: "/hoodatv/watch/$id", params: { id: item.id } })} />
                      ))}
                    </div>}
            </div>
          )}

          {/* ══ VÍDEOS ══ */}
          {tab === "videos" && (
            <div>
              {pLoading
                ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="space-y-2 animate-pulse">
                        <div className="aspect-video rounded-2xl" style={{ background: "var(--s3)" }} />
                        <div className="h-3 rounded-full w-3/4" style={{ background: "var(--s3)" }} />
                      </div>
                    ))}
                  </div>
                : !videos.length
                  ? <div className="py-20 text-center rounded-2xl border"
                      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                      <VideoIcon className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Ainda não há vídeos.</p>
                    </div>
                  : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {videos.map((v: any) => (
                        <VideoCard key={v.id} v={v}
                          onClick={() => navigate({ to: "/hoodatv/watch/$id", params: { id: v.id } })} />
                      ))}
                    </div>}
            </div>
          )}

          {/* ══ SOBRE ══ */}
          {tab === "sobre" && (
            <div className="max-w-xl space-y-4">
              {channel.description && (
                <div className="rounded-2xl p-5 border" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Descrição</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{channel.description}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Seguidores", value: fmtV(stats?.subs ?? 0) },
                  { label: "Vídeos",     value: String(stats?.videoCount ?? 0) },
                  { label: "Views",      value: fmtV(stats?.totalViews ?? 0) },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl p-4 text-center border"
                    style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
                    <p className="text-xl font-extrabold" style={{ color: P }}>{s.value}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl p-5 border space-y-3" style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
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
              </div>
            </div>
          )}
        </div>

        {avatarOpen && channel?.avatar_url && (
          <PhotoViewer src={channel.avatar_url} alt={channel.name} subtitle={`@${channel.handle}`} onClose={() => setAvatarOpen(false)} />
        )}
        <BottomNav />
      </PageWrapper>
    </>
  );
}
