import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BottomNav, SideNav, PageWrapper, FeedLayout } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { UniversalPostCard } from "@/components/UniversalPostCard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo } from "react";
import { Search, X, Heart, TrendingUp, Users, FileText, Tv2, UserPlus, UserCheck, BookOpen, Download, Bookmark } from "lucide-react";
import { t } from "@/lib/useT";
import { getHoodaOfficialId } from "@/lib/hoodaOfficial";
import { toast } from "sonner";

export const Route = createFileRoute("/explorar")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; q?: string } => ({
    tab: TABS.some(t => t.key === search.tab) ? (search.tab as Tab) : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
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
  { key: "posts",    label: "Mídia",      icon: FileText   },
  { key: "channels", label: "Canais",     icon: Tv2        },
  { key: "books",    label: "Livros",     icon: BookOpen   },
] as const;
type Tab = typeof TABS[number]["key"];

const TRENDING_TAGS: string[] = []; // hashtags reais vêm da DB

/* ── Avatar ── */
const BOOK_COLORS = ["#5B3FCF","#E94B8A","#F26B3A","#1FAFA6","#6BA547","#FFC93C"];
const bookColor = (s: string) => BOOK_COLORS[(s?.charCodeAt(0) ?? 0) % BOOK_COLORS.length];
const fmtB = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n ?? 0);

function BooksSection({ search, navigate }: { search: string; navigate: any }) {
  const { data: books = [], isLoading } = useQuery({
    queryKey: ["books", "explorar", search],
    queryFn: async () => {
      let q = (supabase as any).from("books").select("*").order("created_at", { ascending: false }).limit(500);
      if (search) q = q.or(`title.ilike.%${search}%,author_name.ilike.%${search}%,category.ilike.%${search}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  if (isLoading) return (
    <div className="px-4 py-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="rounded-xl animate-pulse" style={{ background: "var(--s2)", aspectRatio: "2/3" }} />
      ))}
    </div>
  );

  if (books.length === 0) return (
    <div className="flex flex-col items-center py-20 gap-3">
      <BookOpen className="w-10 h-10 opacity-20" style={{ color: "#5B3FCF" }} />
      <p className="font-bold text-sm" style={{ color: "var(--text-muted)" }}>
        {search ? "Nenhum livro encontrado" : "Ainda não há livros"}
      </p>
      <button onClick={() => navigate({ to: "/livros" })}
        className="px-4 h-9 rounded-full text-sm font-bold text-white"
        style={{ background: "#5B3FCF" }}>
        Adicionar um livro
      </button>
    </div>
  );

  return (
    <div className="px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
        Livros · {fmtB(books.length)} resultado{books.length !== 1 ? "s" : ""}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {books.map((book: any) => {
          const color = bookColor(book.title);
          return (
            <button key={book.id} onClick={() => navigate({ to: "/livros" })}
              className="text-left rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ aspectRatio: "2/3", background: "var(--s2)", position: "relative" }}>
                {book.cover_url
                  ? <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex flex-col items-center justify-center p-2 gap-1"
                      style={{ background: `linear-gradient(135deg,${color}22,${color}44)` }}>
                      <BookOpen className="w-6 h-6 opacity-50" style={{ color }} />
                      <p className="text-[8px] font-bold text-center line-clamp-3 leading-tight" style={{ color }}>{book.title}</p>
                    </div>}
              </div>
              <div className="p-2">
                <p className="text-[11px] font-bold line-clamp-2 leading-tight mb-0.5" style={{ color: "var(--text-primary)" }}>{book.title}</p>
                <p className="text-[10px] line-clamp-1" style={{ color: "var(--text-muted)" }}>{book.author_name || "—"}</p>
                <div className="flex gap-2 mt-1">
                  <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
                    <Download className="w-2.5 h-2.5" />{fmtB(book.downloads ?? 0)}
                  </span>
                  <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
                    <Bookmark className="w-2.5 h-2.5" />{fmtB(book.saves ?? 0)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const qc = useQueryClient();
  const routeSearch = Route.useSearch();
  const [search, setSearch]     = useState(routeSearch.q ?? "");
  const [tab, setTab]           = useState<Tab>(routeSearch.tab ?? "trending");
  const [myId, setMyId]         = useState("");
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const [channelFollowMap, setChannelFollowMap] = useState<Record<string, boolean>>({});

  // Se a URL trouxer uma aba (?tab=people) ou um texto de busca (?q=algo),
  // aplica mesmo se o componente já estiver montado (ex: clicar numa hashtag)
  useEffect(() => {
    if (routeSearch.tab) setTab(routeSearch.tab);
  }, [routeSearch.tab]);
  useEffect(() => {
    if (routeSearch.q) setSearch(routeSearch.q);
  }, [routeSearch.q]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setMyId(session.user.id);
    });
  }, []);

  /* Carregar quem já sigo, para o botão mostrar o estado certo */
  const { data: myFollowsData } = useQuery({
    queryKey: ["explore-my-follows", myId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("follows").select("target_username").eq("follower_id", myId);
      return (data ?? []).map((r: any) => r.target_username).filter(Boolean) as string[];
    },
    enabled: !!myId,
    staleTime: 10_000,
  });

  /* Carregar quais canais já sigo (following_id = channels.id) */
  const { data: myChannelFollows } = useQuery({
    queryKey: ["explore-my-channel-follows", myId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("follows").select("following_id").eq("follower_id", myId).not("following_id", "is", null);
      return (data ?? []).map((r: any) => r.following_id).filter(Boolean) as string[];
    },
    enabled: !!myId,
    staleTime: 10_000,
  });
  const myChannelFollowsSet = useMemo(() => new Set(myChannelFollows ?? []), [myChannelFollows]);

  async function toggleChannelFollow(channelId: string, channelHandle: string) {
    if (!myId) { toast.error("Inicia sessão para seguir."); return; }
    const isF = channelFollowMap[channelId] ?? myChannelFollowsSet.has(channelId);
    setChannelFollowMap(prev => ({ ...prev, [channelId]: !isF }));
    const db = supabase as any;
    try {
      if (isF) {
        const { error } = await db.from("follows").delete().eq("follower_id", myId).eq("following_id", channelId);
        if (error) throw error;
        toast.success("Deixaste de seguir o canal");
      } else {
        // A tabela "follows" exige sempre target_username (coluna obrigatória)
        // — usamos o handle do canal, sem isto o insert falha silenciosamente.
        const { error } = await db.from("follows").upsert({ follower_id: myId, following_id: channelId, target_username: channelHandle }, { onConflict: "follower_id,target_username", ignoreDuplicates: true });
        if (error) throw error;
        toast.success("A seguir o canal!");
      }
      qc.invalidateQueries({ queryKey: ["explore-my-channel-follows", myId] });
    } catch (err: any) {
      setChannelFollowMap(prev => ({ ...prev, [channelId]: isF }));
      toast.error(err?.message ?? "Não foi possível atualizar. Tenta novamente.");
    }
  }

  /* ── Query: pesquisa ── */
  const searchActive = search.trim().length >= 2;

  const { data: searchPeople = [] } = useQuery({
    queryKey: ["explore-search-people", search],
    queryFn: async () => {
      const officialId = await getHoodaOfficialId();
      const { data } = await (supabase as any).from("profiles")
        .select("id,username,full_name,avatar_url,bio")
        .or(`username.ilike.%${search}%,full_name.ilike.%${search}%`)
        .limit(20);
      // A conta "Hooda Oficial" nunca aparece em pesquisas de pessoas.
      return (data ?? []).filter((p: any) => p.id !== officialId);
    },
    enabled: searchActive && tab === "trending",
    staleTime: 30_000,
  });

  /* ── Query: pessoas sugeridas ── */
  const { data: suggestedPeople = [] } = useQuery({
    queryKey: ["explore-people", myId],
    queryFn: async () => {
      const officialId = await getHoodaOfficialId();
      const { data } = await (supabase as any).from("profiles")
        .select("id,username,full_name,avatar_url,bio")
        .neq("id", myId || "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []).filter((p: any) => p.id !== officialId);
    },
    enabled: tab === "trending" || tab === "people",
    staleTime: 60_000,
  });

  /* ── Query: posts (aba Mídia + trending) — nunca inclui vídeos; vídeos só
     aparecem quando o utilizador pesquisa (ver searchVideos/searchVideoPosts
     mais abaixo), nunca na navegação normal. ── */
  const { data: popularPosts = [] } = useQuery({
    queryKey: ["explore-posts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,kind,photo_url,image_url,likes_count,author_username,author_color,author_id,created_at")
        .in("kind",["photo","post"])
        .order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "posts",
    staleTime: 60_000,
  });

  /* ── Query: canais — todos, por ordem cronológica, sem ranking por popularidade ── */
  const { data: channels = [] } = useQuery({
    queryKey: ["explore-channels"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("channels")
        .select("id,name,handle,avatar_url,subscriber_count,videos_count,created_at")
        .order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "channels",
    staleTime: 60_000,
  });

  /* ── Pesquisa: vídeos do Studio/HoodaTV que batem com o termo pesquisado ── */
  const { data: searchChannelVideos = [] } = useQuery({
    queryKey: ["explore-search-videos", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("videos")
        .select("id,title,thumbnail_url,views_count,likes_count,duration_seconds,created_at,owner_id,channel_id,channels(name,avatar_url,handle)")
        .eq("status","published").eq("visibility","public")
        .ilike("title",`%${search}%`).limit(10);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── Pesquisa: publicações de vídeo (feed) cujo texto bate com o termo ── */
  const { data: searchVideoPostsRaw = [] } = useQuery({
    queryKey: ["explore-search-video-posts", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,video_url,views_count,reposts_count")
        .eq("kind","video")
        .ilike("content",`%${search}%`).limit(10);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── Autores dos resultados de vídeo, para o PostCard mostrar nome/avatar ── */
  const videoAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    (searchChannelVideos ?? []).forEach((v: any) => { if (v.owner_id) ids.add(v.owner_id); });
    (searchVideoPostsRaw ?? []).forEach((p: any) => { if (p.author_id) ids.add(p.author_id); });
    return [...ids];
  }, [searchChannelVideos, searchVideoPostsRaw]);

  const { data: videoAuthorProfiles = [] } = useQuery({
    queryKey: ["explore-search-video-authors", videoAuthorIds],
    queryFn: async () => {
      if (videoAuthorIds.length === 0) return [];
      const { data } = await (supabase as any).from("profiles")
        .select("id,username,full_name,avatar_url").in("id", videoAuthorIds);
      return data ?? [];
    },
    enabled: searchActive && videoAuthorIds.length > 0,
    staleTime: 30_000,
  });

  /* ── Resultados de vídeo (canal + posts) já no formato "p" do PostCard do
     Lar — igual ao que o feed principal já faz, para não reinventar a roda. ── */
  const searchVideos = useMemo(() => {
    const authorMap: Record<string, { username: string; full_name: string | null; avatar_url: string | null }> = {};
    (videoAuthorProfiles ?? []).forEach((a: any) => { authorMap[a.id] = a; });

    const fromChannelVideos = (searchChannelVideos ?? []).map((v: any) => {
      const author = authorMap[v.owner_id];
      const ch = v.channels;
      const name = author?.full_name || author?.username || ch?.name || "hooda";
      return {
        id: `vidfeed_${v.id}`, user_id: v.owner_id, author_id: v.owner_id,
        author_username: author?.username || null,
        user: name, name: `@${author?.username || ch?.handle || "?"}`,
        color: colorFor(name), avatar_url: author?.avatar_url ?? null,
        text: null, photo: null, photos: null, video: null,
        bg_color: null, created_at: v.created_at, kind: "clip", is_ad: false,
        likes: v.likes_count ?? 0, liked_by_me: false, comments: 0,
        views_count: v.views_count ?? 0, reposts_count: 0,
        clip_video_id: v.id, clip_start: 0, clip_end: v.duration_seconds ?? 0,
        clip_title: v.title, clip_thumb_url: v.thumbnail_url,
        channel_id: v.channel_id, channel_handle: ch?.handle ?? null,
        channel_name: ch?.name ?? null, channel_avatar: ch?.avatar_url ?? null,
      };
    });

    const fromVideoPosts = (searchVideoPostsRaw ?? []).map((p: any) => {
      const author = authorMap[p.author_id];
      const name = p.author_name || author?.full_name || author?.username || "hooda";
      const username = p.author_username || author?.username || "";
      return {
        id: p.id, user_id: p.author_id, author_id: p.author_id,
        author_username: username || null,
        user: name, name: `@${username || "?"}`,
        color: p.author_color || colorFor(name), avatar_url: author?.avatar_url ?? null,
        text: p.content, photo: null, photos: null, video: p.video_url ?? null,
        bg_color: null, created_at: p.created_at, kind: p.kind, is_ad: false,
        likes: 0, liked_by_me: false, comments: 0,
        views_count: p.views_count ?? 0, reposts_count: p.reposts_count ?? 0,
      };
    });

    return [...fromChannelVideos, ...fromVideoPosts]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [searchChannelVideos, searchVideoPostsRaw, videoAuthorProfiles]);

  const { data: searchPosts = [] } = useQuery({
    queryKey: ["explore-search-posts", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,kind,photo_url,image_url,likes_count,author_username,author_color")
        .in("kind",["photo","post"])
        .ilike("content",`%${search}%`).limit(10);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  const myFollowsSet = useMemo(() => new Set(myFollowsData ?? []), [myFollowsData]);

  async function toggleFollow(userId: string, username: string) {
    if (!myId) { toast.error("Inicia sessão para seguir."); return; }
    const isF = followMap[userId] ?? myFollowsSet.has(username);
    setFollowMap(prev => ({ ...prev, [userId]: !isF }));
    const db = supabase as any;
    try {
      if (isF) {
        const { error } = await db.from("follows").delete().eq("follower_id", myId).eq("target_username", username);
        if (error) throw error;
        toast.success(`Deixaste de seguir @${username}`);
      } else {
        const { error } = await db.from("follows").upsert({ follower_id: myId, target_username: username }, { onConflict: "follower_id,target_username", ignoreDuplicates: true });
        if (error) throw error;
        toast.success(`Estás a seguir @${username}!`);
      }
      qc.invalidateQueries({ queryKey: ["explore-my-follows", myId] });
    } catch (err: any) {
      setFollowMap(prev => ({ ...prev, [userId]: isF }));
      toast.error(err?.message ?? "Não foi possível atualizar. Tenta novamente.");
    }
  }

  /* ── Render helpers ── */
  function PersonCard({ p }: { p: any }) {
    const isF = followMap[p.id] ?? myFollowsSet.has(p.username);
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl border transition hover:bg-[var(--s1)]"
        style={{ borderColor: "var(--border-subtle)", background: "var(--s0)" }}>
        <button onClick={() => navigate({ to: "/u/$username", params: { username: p.username } })}>
          <Av name={p.full_name || p.username} src={p.avatar_url} size={40} />
        </button>
        <div className="flex-1 min-w-0" onClick={() => navigate({ to: "/u/$username", params: { username: p.username } })} style={{ cursor: "pointer" }}>
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
      <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
      <FeedLayout
        feed={
        <>

        {/* ── Barra de pesquisa ── */}
        <div className="sticky top-0 z-30 border-b"
          style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
          <div className="px-4 py-3 w-full">
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
        <div className="w-full">
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
            {/* Vídeos — mesmo cartão usado no Lar, nunca um thumbnail à parte */}
            {searchVideos.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Vídeos</p>
                <div className="space-y-4 -mx-4">
                  {searchVideos.map((v: any) => <UniversalPostCard key={v.id} post={v} />)}
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

            {/* Posts */}
            {popularPosts.length > 0 && (
              <section className="px-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Posts</p>
                  <button onClick={() => setTab("posts")} className="text-xs font-semibold" style={{ color: P }}>Ver mais →</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {popularPosts.slice(0, 4).map((p: any) => <PostThumb key={p.id} p={p} />)}
                </div>
              </section>
            )}

            {/* Canais */}
            {channels.length > 0 && (
              <section className="px-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Canais</p>
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

        /* ══════════ MÍDIA (posts de qualquer pessoa; vídeos só na pesquisa) ══════════ */
        ) : tab === "posts" ? (
          <div className="px-4 py-4 space-y-6">
            {popularPosts.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                  Posts
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {popularPosts.map((p: any) => <PostThumb key={p.id} p={p} />)}
                </div>
              </section>
            )}
            {popularPosts.length === 0 && (
              <div className="py-20 text-center">
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>Ainda não há mídia</p>
              </div>
            )}
          </div>

        /* ══════════ CANAIS ══════════ */
        ) : tab === "channels" ? (
          <div className="px-4 py-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Canais
            </p>
            {channels.map((ch: any) => {
              const isF = channelFollowMap[ch.id] ?? myChannelFollowsSet.has(ch.id);
              return (
                <div key={ch.id} className="w-full flex items-center gap-3 p-3 rounded-2xl border transition hover:bg-[var(--s1)]"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--s0)" }}>
                  <button onClick={() => navigate({ to: `/hoodatv/canal/${ch.handle}` })} className="shrink-0">
                    <Av name={ch.name} src={ch.avatar_url} size={46} />
                  </button>
                  <div className="flex-1 min-w-0" onClick={() => navigate({ to: `/hoodatv/canal/${ch.handle}` })} style={{ cursor: "pointer" }}>
                    <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{ch.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      @{ch.handle} · {fmtNum(ch.subscriber_count ?? 0)} subscritores · {fmtNum(ch.videos_count ?? 0)} vídeos
                    </p>
                  </div>
                  <button onClick={() => toggleChannelFollow(ch.id, ch.handle)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95 shrink-0"
                    style={isF
                      ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }
                      : { background: P, color: "#fff" }}>
                    {isF ? <><UserCheck className="h-3.5 w-3.5" />A seguir</> : <><UserPlus className="h-3.5 w-3.5" />Seguir</>}
                  </button>
                </div>
              );
            })}
          </div>
        ) : tab === "books" ? (
          <BooksSection search={search} navigate={navigate} />
        ) : null}
        </div>

        <BottomNav />
        </>
        }
        sidebar={<RightSidebar />}
      />
      </PageWrapper>
      </div>
    </>
  );
}
