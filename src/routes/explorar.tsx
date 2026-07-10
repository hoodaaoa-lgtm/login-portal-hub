import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BottomNav, SideNav, PageWrapper, FeedLayout } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { UniversalPostCard } from "@/components/UniversalPostCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo } from "react";
import { Search, X, TrendingUp, Users, FileText, UserPlus, UserCheck, BookOpen, Download, Bookmark, Hash } from "lucide-react";
import { t } from "@/lib/useT";
import { getHoodaOfficialId } from "@/lib/hoodaOfficial";
import { useFollowState } from "@/hooks/useSocialSystem";
import { UniversalSkeleton } from "@/components/Skeletons";

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
  { key: "books",    label: "Livros",     icon: BookOpen   },
] as const;
type Tab = typeof TABS[number]["key"];

/* Hashtags em tendência agora vêm de get_trending_hashtags (DB), ver query
   "explore-trending-hashtags" mais abaixo — antes era um array vazio fixo. */

/* ── Avatar ── */
/** Número mínimo de hashtags em tendência para a secção aparecer —
 *  abaixo disto, fica invisível para o utilizador em vez de mostrar
 *  uma lista curta e esquisita. */
const MIN_TRENDING_HASHTAGS = 5;

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
  const routeSearch = Route.useSearch();
  const [search, setSearch]     = useState(routeSearch.q ?? "");
  const [tab, setTab]           = useState<Tab>(routeSearch.tab ?? "trending");
  const [myId, setMyId]         = useState("");

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
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── Query: pessoas sugeridas ── */
  const { data: suggestedPeople = [], isLoading: suggestedPeopleLoading } = useQuery({
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

  /* ── Hashtags em tendência (14 dias), extraídas de verdade do conteúdo
     dos posts — antes era um array vazio fixo no frontend. ── */
  const { data: trendingHashtags = [] } = useQuery({
    queryKey: ["explore-trending-hashtags"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_trending_hashtags", { p_limit: 12 });
      if (error) throw error;
      return (data ?? []) as { tag: string; uses: number }[];
    },
    enabled: tab === "trending" && !searchActive,
    staleTime: 60_000,
  });

  /* ── Hashtags que batem com o termo pesquisado — alimenta a secção
     "Relacionado com sua pesquisa" e a pesquisa global por hashtag. ── */
  const { data: searchHashtags = [] } = useQuery({
    queryKey: ["explore-search-hashtags", search],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("search_hashtags", {
        p_query: search.replace(/^#/, ""), p_limit: 10,
      });
      if (error) throw error;
      return (data ?? []) as { tag: string; uses: number }[];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── Regista o termo pesquisado (histórico usado para melhorar
     recomendações futuras) — silencioso, não bloqueia nada, com debounce
     de 1.2s para não gravar a cada tecla premida. ── */
  useEffect(() => {
    if (!searchActive || !myId) return;
    const term = search.trim();
    const timer = setTimeout(() => {
      (supabase as any).from("search_history").insert({ user_id: myId, query: term }).then(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [search, searchActive, myId]);

  /* ── Termo "estabilizado" para a pesquisa inteligente (IA) — espera
     500ms sem digitar antes de chamar o modelo, para não disparar um
     pedido a cada tecla premida. ── */
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  /* ── Query: posts (aba Mídia + trending) — nunca inclui vídeos; vídeos só
     aparecem quando o utilizador pesquisa (ver searchVideos/searchVideoPosts
     mais abaixo), nunca na navegação normal. ── */
  const { data: popularPosts = [] } = useQuery({
    queryKey: ["explore-posts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,kind,photo_url,image_url,photos,likes_count,comments_count,author_username,author_color,author_id,created_at")
        .in("kind",["photo","post"])
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
    enabled: tab === "trending" || tab === "posts",
    staleTime: 60_000,
  });

  /* ── Pesquisa: vídeos do Studio/HoodaTV que batem com o termo pesquisado ── */
  const { data: searchChannelVideos = [] } = useQuery({
    queryKey: ["explore-search-videos", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("videos")
        .select("id,title,thumbnail_url,views_count,likes_count,duration_seconds,created_at,owner_id")
        .eq("status","published").eq("visibility","public")
        .ilike("title",`%${search}%`).limit(25);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── Pesquisa: publicações de vídeo (feed) cujo texto bate com o termo ──
     Compara também "title" (o campo que o Studio usa para o título do
     vídeo) — antes só comparava "content" (a descrição), então um vídeo
     publicado só com título (sem descrição) nunca aparecia na pesquisa. ── */
  const { data: searchVideoPostsRaw = [] } = useQuery({
    queryKey: ["explore-search-video-posts", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,title,kind,created_at,video_url,thumbnail_url,views_count,reposts_count")
        .eq("kind","video")
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .or(`content.ilike.%${search}%,title.ilike.%${search}%`).limit(25);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── IDs das pessoas que bateram na pesquisa por nome/username — usado
     para trazer também as publicações delas (foto/vídeo), mesmo que o
     conteúdo da publicação não mencione o termo pesquisado. ── */
  const searchPeopleIds = useMemo(
    () => (searchPeople ?? []).map((p: any) => p.id).filter(Boolean),
    [searchPeople],
  );

  /* ── Publicações de VÍDEO de quem bateu na pesquisa por nome/username —
     mesmo princípio do searchPostsByAuthor (fotos), mas para kind="video":
     assim que uma pessoa aparece em "Pessoas", os vídeos mais recentes dela
     também aparecem, mesmo que o conteúdo do vídeo não mencione o termo
     pesquisado. ── */
  const { data: searchVideoPostsByAuthor = [] } = useQuery({
    queryKey: ["explore-search-video-posts-by-author", searchPeopleIds],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,title,kind,created_at,video_url,thumbnail_url,views_count,reposts_count")
        .eq("kind","video")
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .in("author_id", searchPeopleIds)
        .order("created_at", { ascending: false })
        .limit(25);
      return data ?? [];
    },
    enabled: searchActive && searchPeopleIds.length > 0,
    staleTime: 30_000,
  });

  /* Junta os vídeos encontrados por texto + os vídeos de quem bateu na
     pesquisa por nome/username, sem repetir a mesma publicação. */
  const mergedSearchVideoPosts = useMemo(() => {
    const byId = new Map<string, any>();
    (searchVideoPostsRaw ?? []).forEach((p: any) => byId.set(p.id, p));
    (searchVideoPostsByAuthor ?? []).forEach((p: any) => byId.set(p.id, p));
    return [...byId.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [searchVideoPostsRaw, searchVideoPostsByAuthor]);

  /* ── Autores dos resultados de vídeo, para o PostCard mostrar nome/avatar ── */
  const videoAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    (searchChannelVideos ?? []).forEach((v: any) => { if (v.owner_id) ids.add(v.owner_id); });
    (mergedSearchVideoPosts ?? []).forEach((p: any) => { if (p.author_id) ids.add(p.author_id); });
    return [...ids];
  }, [searchChannelVideos, mergedSearchVideoPosts]);

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
      const name = author?.full_name || author?.username || "hooda";
      return {
        id: `vidfeed_${v.id}`, user_id: v.owner_id, author_id: v.owner_id,
        author_username: author?.username || null,
        user: name, name: `@${author?.username || "?"}`,
        color: colorFor(name), avatar_url: author?.avatar_url ?? null,
        text: null, photo: null, photos: null, video: null,
        bg_color: null, created_at: v.created_at, kind: "clip", is_ad: false,
        likes: v.likes_count ?? 0, liked_by_me: false, comments: 0,
        views_count: v.views_count ?? 0, reposts_count: 0,
        clip_video_id: v.id, clip_start: 0, clip_end: v.duration_seconds ?? 0,
        clip_title: v.title, clip_thumb_url: v.thumbnail_url,
      };
    });

    const fromVideoPosts = (mergedSearchVideoPosts ?? []).map((p: any) => {
      const author = authorMap[p.author_id];
      const name = p.author_name || author?.full_name || author?.username || "hooda";
      const username = p.author_username || author?.username || "";
      return {
        id: p.id, user_id: p.author_id, author_id: p.author_id,
        author_username: username || null,
        user: name, name: `@${username || "?"}`,
        color: p.author_color || colorFor(name), avatar_url: author?.avatar_url ?? null,
        text: p.content, photo: null, photos: null, video: p.video_url ?? null, video_thumb: p.thumbnail_url ?? null,
        bg_color: null, created_at: p.created_at, kind: p.kind, is_ad: false,
        likes: 0, liked_by_me: false, comments: 0,
        views_count: p.views_count ?? 0, reposts_count: p.reposts_count ?? 0,
      };
    });

    return [...fromChannelVideos, ...fromVideoPosts]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [searchChannelVideos, mergedSearchVideoPosts, videoAuthorProfiles]);

  const { data: searchPosts = [] } = useQuery({
    queryKey: ["explore-search-posts", search],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,title,kind,photo_url,image_url,photos,likes_count,comments_count,author_username,author_color,author_id,created_at")
        .in("kind",["photo","post"])
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .or(`content.ilike.%${search}%,title.ilike.%${search}%`).limit(25);
      return data ?? [];
    },
    enabled: searchActive,
    staleTime: 30_000,
  });

  /* ── Publicações de FOTO de quem bateu na pesquisa por nome/username —
     antes, pesquisar "joão" só encontrava o perfil dele; as publicações
     dele só apareciam se o TEXTO da publicação também contivesse "joão".
     Agora, assim que uma pessoa aparece em "Pessoas", trazemos também as
     publicações mais recentes dela, mesmo que o conteúdo não mencione o
     termo pesquisado. ── */
  const { data: searchPostsByAuthor = [] } = useQuery({
    queryKey: ["explore-search-posts-by-author", searchPeopleIds],
    queryFn: async () => {
      const { data } = await (supabase as any).from("posts")
        .select("id,content,title,kind,photo_url,image_url,photos,likes_count,comments_count,author_username,author_color,author_id,created_at")
        .in("kind",["photo","post"])
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .in("author_id", searchPeopleIds)
        .order("created_at", { ascending: false })
        .limit(25);
      return data ?? [];
    },
    enabled: searchActive && searchPeopleIds.length > 0,
    staleTime: 30_000,
  });

  /* Junta os dois grupos (conteúdo + autor), sem repetir a mesma publicação. */
  const mergedSearchPosts = useMemo(() => {
    const byId = new Map<string, any>();
    (searchPosts ?? []).forEach((p: any) => byId.set(p.id, p));
    (searchPostsByAuthor ?? []).forEach((p: any) => byId.set(p.id, p));
    return [...byId.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [searchPosts, searchPostsByAuthor]);

  /* ── Avatares dos autores de posts (foto/texto), para o UniversalPostCard
     mostrar foto de perfil em vez de ficar sempre com a inicial. ── */
  const postAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    (popularPosts ?? []).forEach((p: any) => { if (p.author_id) ids.add(p.author_id); });
    (mergedSearchPosts ?? []).forEach((p: any) => { if (p.author_id) ids.add(p.author_id); });
    return [...ids];
  }, [popularPosts, mergedSearchPosts]);


  const { data: postAuthorProfiles = [] } = useQuery({
    queryKey: ["explore-post-authors", postAuthorIds],
    queryFn: async () => {
      if (postAuthorIds.length === 0) return [];
      const { data } = await (supabase as any).from("profiles")
        .select("id,avatar_url").in("id", postAuthorIds);
      return data ?? [];
    },
    enabled: postAuthorIds.length > 0,
    staleTime: 60_000,
  });

  const postAvatarMap = useMemo(() => {
    const m: Record<string, string | null> = {};
    (postAuthorProfiles ?? []).forEach((a: any) => { m[a.id] = a.avatar_url ?? null; });
    return m;
  }, [postAuthorProfiles]);

  /* Converte uma linha crua de "posts" (foto/texto) no formato canónico do
     UniversalPostCard — antes estes resultados usavam um PostThumb próprio
     (grelha estática, sem player, sem ações de gostar/comentar/partilhar). */
  function toCanonicalPost(p: any) {
    const name = p.author_username || "hooda";
    return {
      id: p.id, author_id: p.author_id ?? null, author_username: p.author_username ?? null,
      user: name, name: `@${p.author_username || "?"}`,
      color: p.author_color || colorFor(name), avatar_url: postAvatarMap[p.author_id] ?? null,
      text: p.content, photo: p.photo_url || p.image_url || null,
      photos: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : null,
      video: null, video_thumb: null,
      bg_color: null, created_at: p.created_at, kind: p.kind, is_ad: false,
      likes: p.likes_count ?? 0, liked_by_me: false, comments: p.comments_count ?? 0,
      views_count: 0, reposts_count: 0,
    };
  }

  const popularPostCards = useMemo(() => (popularPosts ?? []).map(toCanonicalPost), [popularPosts, postAvatarMap]);
  const searchPostCards  = useMemo(() => (mergedSearchPosts ?? []).map(toCanonicalPost),  [mergedSearchPosts, postAvatarMap]);

  /* ── Pesquisa inteligente: em vez de só confiar no ILIKE (que só bate
     palavra exata), manda os candidatos já encontrados a um modelo de IA
     (mesma infra do classify-content, sem chave nova) para perceber a
     intenção real da pesquisa — sinónimos, tema, erros de escrita — e
     escolher/ordenar só o que faz sentido, mais uma frase a dizer o que
     encontrou. Se a IA falhar ou ainda não tiver resposta, mostra os
     resultados na ordem normal (nunca fica sem nada). ── */
  const smartCandidates = useMemo(() => {
    const fromVideos = searchVideos.map((v: any) => ({
      id: String(v.id), type: "video", text: v.text || v.user || "",
    }));
    const fromPosts = searchPostCards.map((p: any) => ({
      id: String(p.id), type: "post", text: p.text || "",
    }));
    return [...fromVideos, ...fromPosts];
  }, [searchVideos, searchPostCards]);

  const { data: smartSearch } = useQuery({
    queryKey: ["explore-smart-search", debouncedSearch, smartCandidates.map((c) => c.id).join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("smart-search", {
        body: { query: debouncedSearch, candidates: smartCandidates },
      });
      if (error) throw error;
      return data as { summary: string; ranked: { id: string; type: string; score: number }[] };
    },
    enabled: searchActive && debouncedSearch === search.trim() && smartCandidates.length > 0,
    staleTime: 30_000,
    retry: false,
  });

  /* Reordena/filtra usando o ranking da IA quando disponível; se ainda
     não chegou ou falhou, mantém a ordem original do ILIKE. */
  function applySmartRank<T extends { id: string }>(items: T[], type: string): T[] {
    if (!smartSearch?.ranked?.length) return items;
    const order = new Map<string, number>();
    smartSearch.ranked.forEach((r, i) => { if (r.type === type) order.set(String(r.id), i); });
    if (order.size === 0) return items;
    return items
      .filter((it) => order.has(String(it.id)))
      .sort((a, b) => (order.get(String(a.id))! - order.get(String(b.id))!));
  }

  const rankedSearchVideos    = useMemo(() => applySmartRank(searchVideos, "video"),    [searchVideos, smartSearch]);
  const rankedSearchPostCards = useMemo(() => applySmartRank(searchPostCards, "post"),  [searchPostCards, smartSearch]);

  /* ── Contagem de seguidores em lote para as pessoas visíveis (pesquisa +
     sugeridas) — 1 pedido só, em vez de 1 por cartão. ── */
  const visiblePeopleUsernames = useMemo(() => {
    const set = new Set<string>();
    (searchPeople ?? []).forEach((p: any) => p.username && set.add(p.username));
    (suggestedPeople ?? []).slice(0, 60).forEach((p: any) => p.username && set.add(p.username));
    return [...set];
  }, [searchPeople, suggestedPeople]);

  const { data: followerCountsRaw = [] } = useQuery({
    queryKey: ["explore-follower-counts", visiblePeopleUsernames],
    queryFn: async () => {
      if (visiblePeopleUsernames.length === 0) return [];
      const { data, error } = await (supabase as any).rpc("get_follower_counts", { p_usernames: visiblePeopleUsernames });
      if (error) throw error;
      return (data ?? []) as { username: string; followers: number }[];
    },
    enabled: visiblePeopleUsernames.length > 0,
    staleTime: 30_000,
  });
  const followerCounts = useMemo(() => {
    const m: Record<string, number> = {};
    (followerCountsRaw ?? []).forEach((r: any) => { m[r.username] = Number(r.followers) || 0; });
    return m;
  }, [followerCountsRaw]);

  /* ── Render helpers ──
     PersonCard usa useFollowState — a MESMA fonte de verdade partilhada
     com o resto da app (post cards, perfil, u/$username, sugestões da
     home...). Antes, o Explorar tinha a sua própria cópia do estado
     ("followMap" local + query "explore-my-follows" com staleTime de só
     10s, sem cobertura do realtime): clicar aqui até acompanhava de
     verdade na base de dados, mas o botão nesta página específica
     esquecia isso ao fim de pouco tempo (refetch/remount) porque vivia
     numa cache totalmente separada da usada nas outras páginas — dava a
     sensação de "acompanho, mas o botão não guarda" ou "num sítio diz
     que sigo, no Explorar não". */
  function PersonCard({ p }: { p: any }) {
    const { isFollowing, isPending, isLoading: followLoading, toggle } = useFollowState(myId || null, p.username, p.id);
    const followers = followerCounts[p.username];
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl border transition hover:bg-[var(--s1)]"
        style={{ borderColor: "var(--border-subtle)", background: "var(--s0)" }}>
        <button onClick={() => navigate({ to: "/u/$username", params: { username: p.username } })}>
          <Av name={p.full_name || p.username} src={p.avatar_url} size={40} />
        </button>
        <div className="flex-1 min-w-0" onClick={() => navigate({ to: "/u/$username", params: { username: p.username } })} style={{ cursor: "pointer" }}>
          <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{p.full_name || p.username}</p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            @{p.username}{followers !== undefined && <> · {fmtNum(followers)} acompanhante{followers === 1 ? "" : "s"}</>}
          </p>
        </div>
        {myId && myId !== p.id && (
          followLoading ? (
            <div className="relative overflow-hidden h-[30px] w-[104px] rounded-full shrink-0" style={{ background: "var(--s2)" }}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
          ) : (
            <button onClick={toggle} disabled={isPending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95 shrink-0 disabled:opacity-60"
              style={isFollowing
                ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }
                : { background: P, color: "#fff" }}>
              {isFollowing ? <><UserCheck className="h-3.5 w-3.5" />Acompanhando</> : <><UserPlus className="h-3.5 w-3.5" />Acompanhar</>}
            </button>
          )
        )}
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
            {/* Hashtags */}
            {searchHashtags.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Hashtags</p>
                <div className="flex flex-wrap gap-2">
                  {searchHashtags.map((h: any) => (
                    <button key={h.tag} onClick={() => setSearch(h.tag)}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-semibold transition active:scale-95"
                      style={{ background: "var(--s2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                      <Hash className="w-3.5 h-3.5" style={{ color: P }} />{h.tag}
                      <span style={{ color: "var(--text-muted)" }}>· {fmtNum(h.uses)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {/* Pessoas */}
            {searchPeople.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Pessoas</p>
                <div className="space-y-2">
                  {searchPeople.map((p: any) => <PersonCard key={p.id} p={p} />)}
                </div>
              </section>
            )}
            {/* Prévia da IA — frase curta a dizer o que encontrou, antes
                de mostrar os resultados de vídeos/publicações. */}
            {smartSearch?.summary && (rankedSearchVideos.length > 0 || rankedSearchPostCards.length > 0) && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl"
                style={{ background: `${P}12`, border: `1px solid ${P}30` }}>
                <span className="text-base leading-none mt-0.5">✨</span>
                <p className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{smartSearch.summary}</p>
              </div>
            )}
            {/* Vídeos — mesmo cartão usado no Lar, nunca um thumbnail à parte */}
            {rankedSearchVideos.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Vídeos</p>
                <div className="space-y-4 -mx-4">
                  {rankedSearchVideos.map((v: any) => <UniversalPostCard key={v.id} post={v} />)}
                </div>
              </section>
            )}
            {/* Posts — agora com o mesmo cartão universal (foto/texto/vídeo),
                nunca mais um thumbnail estático à parte. */}
            {rankedSearchPostCards.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>Publicações</p>
                <div className="space-y-4 -mx-4">
                  {rankedSearchPostCards.map((p: any) => <UniversalPostCard key={p.id} post={p} />)}
                </div>
              </section>
            )}
            {searchPeople.length === 0 && rankedSearchVideos.length === 0 && rankedSearchPostCards.length === 0 && searchHashtags.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>Sem resultados</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Tenta pesquisar algo diferente</p>
              </div>
            )}
            {/* Relacionado com a pesquisa — hashtags parecidas que ainda não
                apareceram em cima, para continuar a explorar o mesmo tema. */}
            {searchHashtags.length > 1 && (
              <section className="pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <p className="text-sm font-bold mb-2.5 pt-4" style={{ color: "var(--text-primary)" }}>
                  Relacionado com "{search}"
                </p>
                <div className="flex flex-wrap gap-2">
                  {searchHashtags.slice(1).map((h: any) => (
                    <button key={h.tag} onClick={() => setSearch(h.tag)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95"
                      style={{ background: "var(--s2)", border: "1px solid var(--border-subtle)", color: P }}>
                      #{h.tag}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

        /* ══════════ TENDÊNCIA (default) ══════════ */
        ) : tab === "trending" ? (
          <div className="py-3 space-y-5">

            {/* Tags em tendência — extraídas de verdade dos posts recentes.
                Só aparece com um mínimo de tags (evita mostrar uma secção
                "Em tendência" com 1-2 hashtags, que fica esquisito/vazio
                para o utilizador — nesse caso fica invisível). */}
            {trendingHashtags.length >= MIN_TRENDING_HASHTAGS && (
            <section className="px-4">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-muted)" }}>
                Em tendência
              </p>
              <div className="flex flex-wrap gap-2">
                {trendingHashtags.map((h: any, i: number) => (
                  <button key={h.tag} onClick={() => setSearch(h.tag)}
                    className="px-3.5 py-1.5 rounded-full text-sm font-semibold transition active:scale-95"
                    style={i === 0
                      ? { background: GRAD, color: "#fff" }
                      : { background: "var(--s2)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                    #{h.tag}
                  </button>
                ))}
              </div>
            </section>
            )}

            {/* Pessoas para seguir */}
            <section className="px-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Pessoas para acompanhar</p>
                <button onClick={() => setTab("people")} className="text-xs font-semibold" style={{ color: P }}>Ver mais →</button>
              </div>
              <div className="space-y-2">
                {suggestedPeopleLoading
                  ? <UniversalSkeleton variant="explorar" count={3} />
                  : suggestedPeople.slice(0, 3).map((p: any) => <PersonCard key={p.id} p={p} />)}
              </div>
            </section>

            {/* Posts — removidos daqui: só devem aparecer quando o usuário pesquisa */}
          </div>

        /* ══════════ PESSOAS ══════════ */
        ) : tab === "people" ? (
          <div className="px-4 py-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Pessoas sugeridas
            </p>
            {suggestedPeopleLoading
              ? <UniversalSkeleton variant="explorar" count={8} />
              : suggestedPeople.map((p: any) => <PersonCard key={p.id} p={p} />)}
          </div>

        /* ══════════ MÍDIA (posts de qualquer pessoa; vídeos só na pesquisa) ══════════ */
        ) : tab === "posts" ? (
          <div className="px-4 py-4">
            {search && popularPostCards.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-3 px-0" style={{ color: "var(--text-muted)" }}>
                  Posts
                </p>
                <div className="space-y-4 -mx-4">
                  {popularPostCards.map((p: any) => <UniversalPostCard key={p.id} post={p} />)}
                </div>
              </section>
            )}
            {!search && (
              <div className="py-20 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>Pesquisa algo para ver publicações</p>
              </div>
            )}
            {search && popularPostCards.length === 0 && (
              <div className="py-20 text-center">
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>Ainda não há mídia</p>
              </div>
            )}
          </div>

        /* ══════════ CANAIS ══════════ */
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
