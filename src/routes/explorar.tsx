import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Search, X, Play, Heart, TrendingUp, Users, Video, FileText, Tv2, UserPlus, UserCheck } from "lucide-react";
import { t } from "@/lib/useT";
import { toast } from "sonner";

export const Route = createFileRoute("/explorar")({
  head: () => ({ meta: [{ title: "hooda — Explorar" }] }),
  component: ExplorePage,
});

/* ── Constantes ── */
const P    = "#5B3FCF";
const PINK = "#E94B8A";
const GRAD = `linear-gradient(135deg,${P},${PINK})`;
const COLORS = [P, "#F26B3A", "#1FAFA6", "#6BA547", PINK, "#FFC93C"];
const colorFor = (s: string) => COLORS[(s?.charCodeAt(0) ?? 0) % COLORS.length];
const fmtNum = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n ?? 0);

const TABS = [
  { key: "trending", label: "Tendência",  icon: TrendingUp },
  { key: "people",   label: "Pessoas",    icon: Users      },
  { key: "videos",   label: "Vídeos",     icon: Video      },
  { key: "posts",    label: "Posts",      icon: FileText   },
  { key: "channels", label: "Canais",     icon: Tv2        },
] as const;
type Tab = typeof TABS[number]["key"];

const TRENDING_TAGS = ["#angola","#musica","#futebol","#hoodatv","#viralao","#kizomba","#luanda","#semba"];

/* ── Avatar ── */
function Av({ name, src, size = 40, color }: { name: string; src?: string | null; size?: number; color?: string }) {
  const bg = color || colorFor(name || "?");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      overflow: "hidden", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "#fff",
    }}>
      {src
        ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => e.currentTarget.style.display = "none"} />
        : (name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/* ══════════════════════════════════════════
   PÁGINA
══════════════════════════════════════════ */
function ExplorePage() {
  const navigate = useNavigate();
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState<Tab>("trending");
  const [myId, setMyId]         = useState("");
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setMyId(session.user.id);
    });
  }, []);

  /* ── Query: pesquisa ── */
  const searchActive = search.trim().length >= 2;

  const { data: searchPeople = [] } = useQuery({
    queryKey: ["explore-search-people", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles")
        .select("id,username,full_name,avatar_url,bio")
        .or(`username.ilike.%${search}%,full_name.ilike.%${search}%`)
        .limit(20);
      return data ?? [];
    },
    enabled: searchActive && tab === "trending",
    staleTime: 30_000,
  });

  /* ── Query: vídeos em destaque ── */
  const { data: featuredVideos = [] } = useQuery({
    queryKey: ["explore-videos"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("videos")
        .select("id,title,thumbnail_url,views_count,duration_seconds,channel_id,channels(name,avatar_url,handle)")
        .eq("status","published").eq("visibility","public")
        .order("views_count", { ascending: false }).limit(6);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "videos",
    staleTime: 60_000,
  });

  /* ── Query: pessoas sugeridas ── */
  const { data: suggestedPeople = [] } = useQuery({
    queryKey: ["explore-people", myId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles")
        .select("id,username,full_name,avatar_url,bio")
        .neq("id", myId || "00000000-0000-0000-0000-000000000000")
        .limit(10);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "people",
    staleTime: 60_000,
  });

  /* ── Query: posts populares ── */
  const { data: popularPosts = [] } = useQuery({
    queryKey: ["explore-posts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,kind,photo_url,image_url,likes_count,author_username,author_color,author_id,created_at,profiles(avatar_url,full_name)")
        .in("kind",["photo","post","video"])
        .order("likes_count", { ascending: false }).limit(12);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "posts",
    staleTime: 60_000,
  });

  /* ── Query: canais ── */
  const { data: channels = [] } = useQuery({
    queryKey: ["explore-channels"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("channels")
        .select("id,name,handle,avatar_url,subscriber_count,videos_count")
        .order("subscriber_count", { ascending: false }).limit(10);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "channels",
    staleTime: 60_000,
  });

  /* ── Query: resultados de pesquisa ── */
  const { data: searchVideos = [] } = useQuery({
    queryKey: ["explore-search-videos", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("videos")
        .select("id,title,thumbnail_url,views_count,channels(name,handle)")
        .eq("status","published").ilike("title",`%${search}%`).limit(10);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  const { data: searchPosts = [] } = useQuery({
    queryKey: ["explore-search-posts", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,kind,photo_url,image_url,likes_count,author_username,author_color")
        .ilike("content",`%${search}%`).limit(10);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  async function toggleFollow(userId: string, username: string) {
    if (!myId) { toast.error("Inicia sessão para seguir."); return; }
    const isF = followMap[userId] ?? false;
    setFollowMap(prev => ({ ...prev, [userId]: !isF }));
    const db = supabase as any;
    try {
      if (isF) await db.from("follows").delete().eq("follower_id", myId).eq("target_username", username);
      else      await db.from("follows").insert({ follower_id: myId, target_username: username });
    } catch (_) { setFollowMap(prev => ({ ...prev, [userId]: isF })); }
  }

  function fmtDur(s: number) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  /* ── Render helpers ── */
  function PersonCard({ p }: { p: any }) {
    const isF = followMap[p.id] ?? false;
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl border transition hover:bg-[var(--s1)]"
        style={{ borderColor: "var(--border-subtle)", background: "var(--s0)" }}>
        <button onClick={() => navigate({ to: `/u/${p.username}` })}>
          <Av name={p.full_name || p.username} src={p.avatar_url} size={40} />
        </button>
        <div className="flex-1 min-w-0" onClick={() => navigate({ to: `/u/${p.username}` })} style={{ cursor: "pointer" }}>
          <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{p.full_name || p.username}</p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>@{p.username}</p>
        </div>
        {myId && myId !== p.id && (
          <button onClick={() => toggleFollow(p.id, p.username)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95 shrink-0"
            style={isF
              ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }
              : { background: P, color: "#fff" }}>
            {isF ? <><UserCheck className="h-3.5 w-3.5" />Seguindo</> : <><UserPlus className="h-3.5 w-3.5" />Seguir</>}
          </button>
        )}
      </div>
    );
  }

  function VideoThumb({ v }: { v: any }) {
    const ch = v.channels;
    return (
      <button className="group text-left w-full" onClick={() => navigate({ to: `/hoodatv/watch/${v.id}` })}>
        <div className="relative rounded-xl overflow-hidden mb-1.5" style={{ aspectRatio: "9/16", background: "var(--s2)" }}>
          {v.thumbnail_url
            ? <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center" style={{ background: GRAD }}>
                <Play className="h-6 w-6 text-white" fill="white" />
              </div>}
          {v.duration_seconds && (
            <span className="absolute bottom-1.5 right-1.5 text-[10px] font-bold text-white px-1.5 py-0.5 rounded"
              style={{ background: "rgba(0,0,0,0.75)" }}>
              {fmtDur(v.duration_seconds)}
            </span>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "rgba(255,255,255,0.9)" }}>
              <Play className="h-4 w-4 ml-0.5" style={{ color: P }} fill={P} />
            </div>
          </div>
        </div>
        <p className="text-[11px] font-semibold truncate leading-tight" style={{ color: "var(--text-primary)" }}>{v.title}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {fmtNum(v.views_count ?? 0)} views · {ch?.name ?? ""}
        </p>
      </button>
    );
  }

  function PostThumb({ p }: { p: any }) {
    const photo = p.photo_url || p.image_url;
    return (
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="relative" style={{ aspectRatio: "1/1", background: "var(--s2)" }}>
          {photo
            ? <img src={photo} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center p-2">
                <p className="text-[10px] text-center line-clamp-4 leading-relaxed"
                  style={{ color: "var(--text-muted)" }}>{p.content}</p>
              </div>}
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <Heart className="h-3.5 w-3.5" style={{ color: PINK }} />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{fmtNum(p.likes_count ?? 0)}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">

        {/* ── Barra de pesquisa ── */}
        <div className="sticky top-0 z-30 border-b"
          style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
          <div className="px-4 py-3">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Pesquisar pessoas, posts, vídeos..."
                className="w-full h-10 pl-10 pr-9 rounded-full text-sm outline-none transition-all"
                style={{
                  background: "var(--s2)",
                  border: `1.5px solid ${search ? P : "var(--border-default)"}`,
                  color: "var(--text-primary)",
                  boxShadow: search ? `0 0 0 3px ${P}18` : "none",
                }}
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--s3)" }}>
                  <X className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                </button>
              )}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex overflow-x-auto no-scrollbar border-t"
            style={{ borderColor: "var(--border-subtle)" }}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex-shrink-0 px-4 py-2.5 text-[13px] font-medium transition-colors relative"
                style={{ color: tab === key ? P : "var(--text-muted)" }}>
                {label}
                {tab === key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: P }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════ RESULTADOS DE PESQUISA ══════════ */}
        {searchActive ? (
          <div className="px-4 py-4 space-y-6">
            {/* Pessoas */}
            {searchPeople.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Pessoas</p>
                <div className="space-y-2">
                  {searchPeople.map((p: any) => <PersonCard key={p.id} p={p} />)}
                </div>
              </section>
            )}
            {/* Vídeos */}
            {searchVideos.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Vídeos</p>
                <div className="grid grid-cols-3 gap-2">
                  {searchVideos.map((v: any) => <VideoThumb key={v.id} v={v} />)}
                </div>
              </section>
            )}
            {/* Posts */}
            {searchPosts.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Posts</p>
                <div className="grid grid-cols-2 gap-2">
                  {searchPosts.map((p: any) => <PostThumb key={p.id} p={p} />)}
                </div>
              </section>
            )}
            {searchPeople.length === 0 && searchVideos.length === 0 && searchPosts.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>Sem resultados</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Tenta pesquisar algo diferente</p>
              </div>
            )}
          </div>

        /* ══════════ TENDÊNCIA (default) ══════════ */
        ) : tab === "trending" ? (
          <div className="py-3 space-y-5">

            {/* Tags em tendência */}
            <section className="px-4">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>
                Em tendência
              </p>
              <div className="flex flex-wrap gap-2">
                {TRENDING_TAGS.map((tag, i) => (
                  <button key={tag} onClick={() => setSearch(tag.replace("#",""))}
                    className="px-3.5 py-1.5 rounded-full text-sm font-semibold transition active:scale-95"
                    style={i === 0
                      ? { background: GRAD, color: "#fff" }
                      : { background: "var(--s2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                    {tag}
                  </button>
                ))}
              </div>
            </section>

            {/* Vídeos em destaque */}
            <section className="px-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Vídeos em destaque</p>
                <button onClick={() => setTab("videos")} className="text-xs font-semibold" style={{ color: P }}>Ver tudo →</button>
              </div>
              {featuredVideos.length === 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { grad: GRAD, label: "Clip do momento", views: "..." },
                    { grad: "linear-gradient(135deg,#F26B3A,#FFC93C)", label: "Trending agora", views: "..." },
                    { grad: "linear-gradient(135deg,#1FAFA6,#6BA547)", label: "Mais assistido", views: "..." },
                  ].map((item, i) => (
                    <div key={i} className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
                      <div className="flex items-center justify-center" style={{ aspectRatio: "9/16", background: item.grad }}>
                        <Play className="h-6 w-6 text-white" fill="white" />
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-[11px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{item.label}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{item.views} views</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {featuredVideos.slice(0,3).map((v: any) => <VideoThumb key={v.id} v={v} />)}
                </div>
              )}
            </section>

            {/* Pessoas para seguir */}
            <section className="px-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Pessoas para seguir</p>
                <button onClick={() => setTab("people")} className="text-xs font-semibold" style={{ color: P }}>Ver mais →</button>
              </div>
              <div className="space-y-2">
                {suggestedPeople.slice(0, 3).map((p: any) => <PersonCard key={p.id} p={p} />)}
              </div>
            </section>

            {/* Posts populares */}
            {popularPosts.length > 0 && (
              <section className="px-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Posts populares</p>
                  <button onClick={() => setTab("posts")} className="text-xs font-semibold" style={{ color: P }}>Ver mais →</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {popularPosts.slice(0, 4).map((p: any) => <PostThumb key={p.id} p={p} />)}
                </div>
              </section>
            )}

            {/* Canais HoodaTV */}
            {channels.length > 0 && (
              <section className="px-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Canais HoodaTV</p>
                  <button onClick={() => setTab("channels")} className="text-xs font-semibold" style={{ color: P }}>Ver todos →</button>
                </div>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                  {[...channels.slice(0, 5), { id: "more", name: "Ver mais", avatar_url: null, handle: "" }].map((ch: any) => (
                    <button key={ch.id} onClick={() => ch.id === "more" ? setTab("channels") : navigate({ to: `/hoodatv/canal/${ch.handle}` })}
                      className="flex-shrink-0 text-center w-16 transition active:scale-95">
                      <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center mx-auto mb-1.5"
                        style={{ background: ch.id === "more" ? "var(--s2)" : colorFor(ch.name || "?"), border: ch.id === "more" ? "1px solid var(--border-subtle)" : "none" }}>
                        {ch.id === "more"
                          ? <span className="text-lg" style={{ color: "var(--text-muted)" }}>+</span>
                          : ch.avatar_url
                            ? <img src={ch.avatar_url} alt={ch.name} className="w-full h-full object-cover" />
                            : <span className="text-lg font-bold text-white">{ch.name?.[0]?.toUpperCase()}</span>}
                      </div>
                      <p className="text-[11px] truncate" style={{ color: ch.id === "more" ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {ch.id === "more" ? "Ver mais" : ch.name}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

        /* ══════════ PESSOAS ══════════ */
        ) : tab === "people" ? (
          <div className="px-4 py-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Pessoas sugeridas
            </p>
            {suggestedPeople.map((p: any) => <PersonCard key={p.id} p={p} />)}
          </div>

        /* ══════════ VÍDEOS ══════════ */
        ) : tab === "videos" ? (
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Vídeos em destaque
            </p>
            <div className="grid grid-cols-3 gap-2">
              {featuredVideos.map((v: any) => <VideoThumb key={v.id} v={v} />)}
            </div>
          </div>

        /* ══════════ POSTS ══════════ */
        ) : tab === "posts" ? (
          <div className="px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Posts populares
            </p>
            <div className="grid grid-cols-2 gap-2">
              {popularPosts.map((p: any) => <PostThumb key={p.id} p={p} />)}
            </div>
          </div>

        /* ══════════ CANAIS ══════════ */
        ) : tab === "channels" ? (
          <div className="px-4 py-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Canais HoodaTV
            </p>
            {channels.map((ch: any) => (
              <button key={ch.id} onClick={() => navigate({ to: `/hoodatv/canal/${ch.handle}` })}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border transition hover:bg-[var(--s1)] text-left"
                style={{ borderColor: "var(--border-subtle)", background: "var(--s0)" }}>
                <Av name={ch.name} src={ch.avatar_url} size={46} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    @{ch.handle} · {fmtNum(ch.subscriber_count ?? 0)} subscritores
                  </p>
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full font-bold shrink-0"
                  style={{ background: P + "15", color: P }}>
                  {fmtNum(ch.videos_count ?? 0)} vídeos
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <BottomNav />
      </PageWrapper>
    </>
  );
}
