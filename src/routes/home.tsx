import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { HoodaLogo } from "@/components/HoodaLogo";
import { BottomNav, SideNav, PageWrapper, FeedLayout } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { useAvatar } from "@/contexts/AvatarContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { UniversalPostCard } from "@/components/UniversalPostCard";
import { registerVideo, notifyVideoPlaying, pauseAllVideos } from "@/lib/mediaManager";
import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { fetchPostComments, sendPostComment, replyToPostComment, toggleCommentLike, notifyMentions } from "@/lib/comments";
import {
  NotificationToast,
  NotificationCenter,
  SAMPLE_NOTIFICATIONS,
  type Notif,
} from "@/components/Notifications";
import {
  Search, Bell, Plus, MessageCircle, Share2, Music, X, Heart,
  Volume2, VolumeX, ChevronLeft, ChevronRight, Play, Pause,
  ImageIcon, Type as TypeIcon, Check, ArrowLeft,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Send, BarChart3,
  Trash2, Layers, Smile, Sliders, SlidersHorizontal,
  Bookmark, BookmarkCheck, Forward, Repeat2,
} from "lucide-react";
import { MusicLibrary, type Song } from "@/components/MusicLibrary";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { QUERY_KEYS, FEED_QUERY_OPTIONS, STATIC_QUERY_OPTIONS, REALTIME_QUERY_OPTIONS } from "@/lib/queryClient";
import { FeedSkeleton, BackgroundRefreshDot } from "@/components/Skeletons";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { PollCard } from "@/components/PollCard";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useScrollLock } from "@/hooks/useScrollLock";
import { ComposeBox } from "@/components/QuickComposer";
function t(key: string, opts?: Record<string, unknown>) { return i18n.t(key, opts) as string; }

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: HomePage,
});

/* ─── Constants ─── */
const POSTS: any[] = []; // feed carregado do Supabase em HomePage

/* ══════════════════════════════════════════════
   QUEM SEGUIR — card no feed
══════════════════════════════════════════════ */
function WhoToFollowCard({ myUserId, onDismiss, offset = 0 }: { myUserId: string; onDismiss: () => void; offset?: number }) {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [following, setFollowing] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    async function load() {
      try {
        // 1 — quem eu sigo
        const { data: myFollows } = await (supabase as any)
          .from("follows").select("following_id").eq("follower_id", myUserId);
        const myFollowIds = (myFollows ?? []).map((f: any) => f.following_id);
        const excludeIds = new Set([myUserId, ...myFollowIds]);

        // 2 — amigos de amigos
        let candidates: any[] = [];
        if (myFollowIds.length > 0) {
          const { data: fof } = await (supabase as any)
            .from("follows").select("following_id").in("follower_id", myFollowIds.slice(0, 20));
          const fofIds = [...new Set((fof ?? []).map((f: any) => f.following_id))]
            .filter(id => !excludeIds.has(id));
          if (fofIds.length > 0) {
            const { data: profiles } = await (supabase as any)
              .from("profiles")
              .select("id,username,full_name,avatar_url,bio,followers_count")
              .in("id", fofIds.slice(0, 20))
              .order("followers_count", { ascending: false });
            candidates = profiles ?? [];
          }
        }

        // 3 — se poucos, completa com populares ordenados por seguidores
        if (candidates.length < 5) {
          const excludeList = [...excludeIds].slice(0, 50);
          const { data: popular } = await (supabase as any)
            .from("profiles")
            .select("id,username,full_name,avatar_url,bio,followers_count")
            .not("id", "in", `(${excludeList.join(",")})`)
            .order("followers_count", { ascending: false })
            .limit(10);
          const existIds = new Set(candidates.map((c: any) => c.id));
          (popular ?? []).forEach((p: any) => { if (!existIds.has(p.id)) candidates.push(p); });
        }

        candidates.sort((a, b) => (b.followers_count ?? 0) - (a.followers_count ?? 0));
        setSuggestions(candidates.slice(offset, offset + 4 > candidates.length ? candidates.length : offset + 4));
      } catch {}
      setLoading(false);
    }
    load();
  }, [myUserId, offset]);

  async function handleFollow(userId: string, username: string) {
    if (following.has(userId)) {
      await (supabase as any).from("follows").delete()
        .eq("follower_id", myUserId).eq("following_id", userId);
      setFollowing(prev => { const s = new Set(prev); s.delete(userId); return s; });
    } else {
      // A tabela "follows" exige sempre target_username (coluna obrigatória) —
      // sem isto o insert falha silenciosamente e o botão parece não fazer nada.
      const { error } = await (supabase as any).from("follows").upsert({
        follower_id: myUserId,
        following_id: userId,
        target_username: username,
      }, { onConflict: "follower_id,target_username", ignoreDuplicates: true });
      if (error) { console.error("Erro ao seguir:", error); return; }
      setFollowing(prev => new Set([...prev, userId]));
    }
  }

  if (loading) return null;
  if (!suggestions.length) return null;

  const ACCENT = "#5B3FCF";
  const AVATAR_COLORS = [ACCENT, "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
  const avatarColor = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

  return (
    <div className="mx-0 my-1 border-b" style={{ borderColor: "var(--border-subtle, #f0f0f0)", background: "var(--s1, #fff)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <p className="font-extrabold text-[15px]" style={{ color: "var(--text-primary)" }}>Quem seguir</p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>Pessoas que talvez conheças</p>
        </div>
        <button onClick={onDismiss}
          className="w-7 h-7 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
          style={{ color: "var(--text-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Scroll horizontal */}
      <div ref={scrollRef} className="flex gap-3 px-4 pb-4 overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {suggestions.map((user) => {
          const name = user.full_name || user.username || "Utilizador";
          const bg   = avatarColor(name);
          const isFollowing = following.has(user.id);

          return (
            <div key={user.id}
              className="shrink-0 flex flex-col items-center rounded-2xl p-3 border transition"
              style={{
                width: 148,
                background: "var(--s2, #f9f9f9)",
                borderColor: "var(--border-default, #e8e8e8)",
              }}>
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-xl cursor-pointer mb-2"
                style={{ background: bg }}
                onClick={() => navigate({ to: "/u/$username", params: { username: user.username } })}>
                {user.avatar_url
                  ? <img src={user.avatar_url} alt={name} className="w-full h-full object-cover" />
                  : name[0]?.toUpperCase()}
              </div>

              {/* Nome */}
              <p className="font-bold text-[13px] text-center leading-tight truncate w-full"
                style={{ color: "var(--text-primary)" }}>
                {name.length > 14 ? name.slice(0, 13) + "…" : name}
              </p>
              <p className="text-[11px] text-center truncate w-full mb-1"
                style={{ color: "var(--text-muted)" }}>
                @{(user.username || "").slice(0, 14)}
              </p>
              {user.bio && (
                <p className="text-[11px] text-center leading-snug mb-2 line-clamp-2 w-full"
                  style={{ color: "var(--text-secondary)" }}>
                  {user.bio.slice(0, 40)}
                </p>
              )}

              {/* Botão seguir */}
              <button onClick={() => handleFollow(user.id, user.username)}
                className="w-full h-8 rounded-full text-[12px] font-bold transition active:scale-95 mt-auto"
                style={isFollowing
                  ? { background: "var(--s3)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                  : { background: ACCENT, color: "#fff", border: "none" }}>
                {isFollowing ? "A seguir" : "Seguir"}
              </button>
            </div>
          );
        })}

        {/* Ver mais */}
        <div className="shrink-0 flex flex-col items-center justify-center rounded-2xl p-3 border cursor-pointer transition hover:bg-[var(--s3)]"
          style={{ width: 100, borderColor: "var(--border-default, #e8e8e8)", background: "var(--s2)" }}
          onClick={() => navigate({ to: "/explorar" })}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
            style={{ background: "#5B3FCF18" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B3FCF" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
          <p className="text-[11px] font-bold text-center" style={{ color: "#5B3FCF" }}>Ver mais</p>
        </div>
      </div>
    </div>
  );
}

/* SimpleVideoPlayer local foi substituído por FeedVideoPlayer (moldura + controles tipo YouTube) */

/* ─── Home Page ─── */

function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const { avatarUrl: userAvatarUrl, name: myDisplayName } = useAvatar();

  /* ── Notifications ── */
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [showNotifCenter, setShowNotifCenter] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("notifications") === "1") {
      setShowNotifCenter(true);
      params.delete("notifications");
      const qs = params.toString();
      window.history.replaceState({}, "", `/home${qs ? `?${qs}` : ""}`);
    }
  }, []);

  useEffect(() => {
    function openFromEvent() { setShowNotifCenter(true); setToast(null); }
    window.addEventListener("hooda:open-notifications", openFromEvent);
    return () => window.removeEventListener("hooda:open-notifications", openFromEvent);
  }, []);
  const [toast, setToast] = useState<Notif | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const [showWhoToFollow, setShowWhoToFollow] = React.useState(true);
  const [showWhoToFollow2, setShowWhoToFollow2] = React.useState(true);
  const [feedVisible, setFeedVisible] = useState(15);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [extraPosts, setExtraPosts] = useState<any[]>([]); // páginas extra carregadas via scroll infinito
  const [myUserId, setMyUserId] = useState("");
  const [myUsername, setMyUsername] = useState("");

  // ─── FEED SEM ALGORITMO ─────────────────────────────────────────────────────
  //
  // O feed mostra todos os posts/vídeos publicados por qualquer pessoa
  // (incluindo os próprios), simplesmente por ordem cronológica — sem
  // scoring, sem segmentação por relevância/popularidade e sem qualquer
  // tipo de curadoria automática.
  // ────────────────────────────────────────────────────────────────────────────

  async function fetchFeedPage(uid: string) {
    try {
      return await fetchFeedPageInner(uid);
    } catch (e) {
      console.error("fetchFeedPage falhou, a usar busca simples de recurso:", e);
      // Nunca deixar o feed preso — se algo inesperado rebentar a lógica de
      // scoring/relevância acima, cai aqui numa busca simples e directa.
      const { data } = await supabase
        .from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,clip_video_id,clip_start,clip_end,clip_title,channel_id,channel_handle,channel_name,channel_avatar,clip_thumb_url,poll,poll_ends_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []).map((p: any) => {
        let text = p.content;
        let bg_color = null;
        if (p.kind === "bg") { try { const j = JSON.parse(p.content); text = j.text; bg_color = j.bgColor; } catch {} }
        return {
          id: p.id, user_id: p.author_id, author_id: p.author_id,
          author_username: p.author_username || null,
          user: p.author_name || p.author_username || "hooda",
          name: `@${p.author_username || "?"}`,
          color: p.author_color || "#5B3FCF",
          avatar_url: null,
          text, photo: p.photo_url ?? null,
          photos: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : (p.photo_url ? [p.photo_url] : null),
          video: p.video_url ?? null,
          bg_color, created_at: p.created_at, kind: p.kind, is_ad: p.is_ad,
          likes: 0, liked_by_me: false, comments: 0,
          clip_video_id: p.clip_video_id, clip_start: p.clip_start, clip_end: p.clip_end,
          clip_title: p.clip_title, clip_thumb_url: p.clip_thumb_url,
          channel_id: p.channel_id, channel_handle: p.channel_handle,
          channel_name: p.channel_name, channel_avatar: p.channel_avatar,
          poll: p.poll ?? null, poll_ends_at: p.poll_ends_at ?? null,
        };
      });
    }
  }

  const FEED_CHUNK_SIZE = 30;
  const ACCENT_LOCAL = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A","#FFC93C"];
  const POST_SELECT_FIELDS = "id,author_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,clip_video_id,clip_start,clip_end,clip_title,channel_id,channel_handle,channel_name,channel_avatar,clip_thumb_url,views_count,reposts_count,poll,poll_ends_at";
  const VIDEO_SELECT_FIELDS = "id,title,thumbnail_url,duration_seconds,views_count,likes_count,created_at,owner_id,channel_id,channels(name,avatar_url,handle)";

  // ─── FEED SEM ALGORITMO — busca e funde posts + vídeos publicados ──────────
  //
  // Mostra tudo o que foi publicado por qualquer pessoa (posts de texto/foto/
  // vídeo E vídeos publicados nos canais), fundido por ordem cronológica —
  // sem scoring, sem segmentação e sem qualquer curadoria automática.
  // `cursor` (created_at ISO) permite continuar a busca a partir de onde a
  // página anterior parou, para o scroll infinito.
  async function fetchFeedChunk(uid: string, cursor: string | null) {
    let postsQuery = supabase
      .from("posts")
      .select(POST_SELECT_FIELDS)
      .order("created_at", { ascending: false })
      .limit(FEED_CHUNK_SIZE);
    if (cursor) postsQuery = postsQuery.lt("created_at", cursor);

    let videosQuery = (supabase as any)
      .from("videos")
      .select(VIDEO_SELECT_FIELDS)
      .eq("status", "published").eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(FEED_CHUNK_SIZE);
    if (cursor) videosQuery = videosQuery.lt("created_at", cursor);

    const [{ data: postsData }, { data: videosData }] = await Promise.all([postsQuery, videosQuery]);

    const rawPosts  = postsData ?? [];
    const rawVideos = videosData ?? [];
    if (rawPosts.length === 0 && rawVideos.length === 0) return { items: [] as any[], nextCursor: null, hasMore: false };

    // Deduplicar por id (segurança)
    const seenPostIds = new Set<string>();
    const eligiblePosts = rawPosts.filter((p: any) => {
      if (!p.id || seenPostIds.has(p.id)) return false;
      seenPostIds.add(p.id);
      return true;
    });
    const seenVideoIds = new Set<string>();
    const eligibleVideos = rawVideos.filter((v: any) => {
      if (!v.id || seenVideoIds.has(v.id)) return false;
      seenVideoIds.add(v.id);
      return true;
    });

    const postIds    = eligiblePosts.map((p: any) => p.id);
    const authorIds  = new Set<string>();
    eligiblePosts.forEach((p: any) => { const k = p.author_id || p.user_id; if (k) authorIds.add(k); });
    eligibleVideos.forEach((v: any) => { if (v.owner_id) authorIds.add(v.owner_id); });

    // ── Sinais de exibição (likes/comentários/perfis) — sem influenciar ordem ──
    const [
      { data: likesData },
      { data: commentsData },
      { data: authorProfiles },
    ] = await Promise.all([
      postIds.length > 0
        ? supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds)
        : Promise.resolve({ data: [] as any[] }),
      postIds.length > 0
        ? supabase.from("post_comments").select("post_id").in("post_id", postIds)
        : Promise.resolve({ data: [] as any[] }),
      authorIds.size > 0
        ? supabase.from("profiles").select("id,avatar_url,username,full_name").in("id", [...authorIds])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const likesByPost: Record<string, string[]> = {};
    (likesData || []).forEach((l: any) => {
      if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
      likesByPost[l.post_id].push(l.user_id);
    });
    const commentsByPost: Record<string, number> = {};
    (commentsData || []).forEach((c: any) => { commentsByPost[c.post_id] = (commentsByPost[c.post_id] || 0) + 1; });

    const avatarMap: Record<string, string | null> = {};
    const nameMap: Record<string, string> = {};
    const usernameMap: Record<string, string> = {};
    (authorProfiles || []).forEach((p: any) => {
      avatarMap[p.id] = p.avatar_url || null;
      nameMap[p.id]   = p.full_name || p.username || "";
      usernameMap[p.id] = p.username || "";
    });

    // ── Mapear posts ──
    const mappedPosts = eligiblePosts.map((p: any) => {
      const authorKey = p.author_id || p.user_id;
      const rawName = p.author_name || nameMap[authorKey] || "";
      const name = rawName.includes("@") && rawName.includes(".")
        ? (p.author_username || usernameMap[authorKey] || "hooda")
        : (rawName || p.author_username || "hooda");
      const username = p.author_username || usernameMap[authorKey] || "";
      let text = p.content;
      let bg_color = null;
      if (p.kind === "bg") { try { const j = JSON.parse(p.content); text = j.text; bg_color = j.bgColor; } catch {} }

      return {
        id: p.id, user_id: authorKey, author_id: authorKey,
        author_username: username || null,
        user: name, name: `@${username || "?"}`,
        color: p.author_color || ACCENT_LOCAL[(name.charCodeAt(0) || 0) % ACCENT_LOCAL.length],
        avatar_url: authorKey ? (avatarMap[authorKey] ?? null) : null,
        text, photo: p.photo_url ?? null,
        photos: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : (p.photo_url ? [p.photo_url] : null),
        video: p.video_url ?? null,
        bg_color, created_at: p.created_at, kind: p.kind, is_ad: p.is_ad,
        likes: (likesByPost[p.id] || []).length, liked_by_me: (likesByPost[p.id] || []).includes(uid),
        comments: commentsByPost[p.id] || 0,
        views_count: p.views_count ?? 0, reposts_count: p.reposts_count ?? 0,
        clip_video_id: p.clip_video_id, clip_start: p.clip_start, clip_end: p.clip_end,
        clip_title: p.clip_title, clip_thumb_url: p.clip_thumb_url,
        channel_id: p.channel_id, channel_handle: p.channel_handle,
        channel_name: p.channel_name, channel_avatar: p.channel_avatar,
        poll: p.poll ?? null, poll_ends_at: p.poll_ends_at ?? null,
      };
    });

    // ── Mapear vídeos publicados (aparecem como "clipe" completo no feed) ──
    const mappedVideos = eligibleVideos.map((v: any) => {
      const authorKey = v.owner_id;
      const name = nameMap[authorKey] || usernameMap[authorKey] || "hooda";
      const username = usernameMap[authorKey] || "";
      const ch = v.channels;
      return {
        id: `vidfeed_${v.id}`, user_id: authorKey, author_id: authorKey,
        author_username: username || null,
        user: name, name: `@${username || "?"}`,
        color: ACCENT_LOCAL[(name.charCodeAt(0) || 0) % ACCENT_LOCAL.length],
        avatar_url: authorKey ? (avatarMap[authorKey] ?? null) : null,
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

    // ── Fundir por ordem cronológica ──
    const merged = [...mappedPosts, ...mappedVideos].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const page = merged.slice(0, FEED_CHUNK_SIZE);
    const nextCursor = page.length > 0 ? page[page.length - 1].created_at : null;
    // Há mais conteúdo se qualquer uma das fontes devolveu uma página cheia
    // (pode haver mais posts e/ou vídeos por buscar a seguir)
    const hasMore = rawPosts.length === FEED_CHUNK_SIZE || rawVideos.length === FEED_CHUNK_SIZE || merged.length > FEED_CHUNK_SIZE;

    return { items: page, nextCursor, hasMore };
  }

  async function fetchFeedPageInner(uid: string) {
    const { items } = await fetchFeedChunk(uid, null);
    return items;
  }

  // persistência em localStorage configurada no root, restaura este
  // resultado instantaneamente na próxima visita — sem ecrã vazio nem
  // spinner — enquanto busca dados novos em segundo plano.
  const effectiveUserId = myUserId || session?.user?.id || "";
  const feedQuery = useQuery({
    queryKey: QUERY_KEYS.feed(effectiveUserId),
    queryFn: () => fetchFeedPage(effectiveUserId),
    enabled: !!effectiveUserId,
    ...FEED_QUERY_OPTIONS,
    placeholderData: (prev: any) => prev,
  });

  const firstPagePosts = feedQuery.data ?? [];

  // Busca de recurso: corre SEMPRE ao montar a página, em paralelo com o
  // feed personalizado, e independente de sessão/autenticação resolvida.
  // Isto garante que publicações já existentes na base de dados aparecem
  // mesmo que o feed "inteligente" (por userId) demore, falhe, ou nunca
  // chegue a ser "enabled" por qualquer race condition de auth.
  const [forcedPublicFeed, setForcedPublicFeed] = useState<any[] | null>(null);
  const [forcedFeedTried, setForcedFeedTried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // A política RLS da tabela "posts" exige um pedido autenticado
        // (TO authenticated). Se o cliente Supabase ainda não tiver o
        // token de sessão anexado neste preciso instante — mesmo que o
        // React já mostre `session` como definida — a query devolve 0
        // linhas silenciosamente (sem erro), porque tecnicamente "correu
        // bem". Por isso esperamos aqui explicitamente por getSession()
        // antes de disparar a busca, garantindo que o token já está pronto.
        const { data: { session: forcedSession } } = await supabase.auth.getSession();
        const forcedUid = forcedSession?.user?.id ?? "";

        const { items } = await fetchFeedChunk(forcedUid, null);
        if (!cancelled && items.length > 0) setForcedPublicFeed(items);
      } catch (e) {
        console.error("Busca de recurso do feed rebentou:", e);
      } finally {
        if (!cancelled) setForcedFeedTried(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Posts da primeira página (React Query, feed personalizado) tomam
  // prioridade quando existem; senão usa-se a busca de recurso acima.
  // Páginas extra do scroll infinito juntam-se sempre, deduplicadas por id.
  const realPosts = useMemo(() => {
    const seen = new Set<string>();
    const base = firstPagePosts.length > 0 ? firstPagePosts : (forcedPublicFeed ?? []);
    return [...base, ...extraPosts].filter((p: any) => {
      if (!p?.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [firstPagePosts, extraPosts, forcedPublicFeed]);

  // Só mostra o skeleton enquanto NENHuma das duas fontes (feed personalizado
  // ou busca de recurso) resolveu ainda.
  const loadingFeed = firstPagePosts.length === 0 && !forcedPublicFeed && !forcedFeedTried;
  const refreshingFeedInBackground = feedQuery.isFetching && !loadingFeed;

  // Inicializa o cursor do scroll infinito com base no último item da
  // primeira página já carregada (cronológica), para que loadMoreFeed
  // continue exatamente de onde a primeira página parou.
  const paginationInitRef = useRef(false);
  useEffect(() => {
    if (paginationInitRef.current) return;
    const base = firstPagePosts.length > 0 ? firstPagePosts : (forcedPublicFeed ?? []);
    if (base.length === 0) return;
    paginationInitRef.current = true;
    const last = base[base.length - 1];
    setFeedCursor(last?.created_at ?? null);
    setHasMorePosts(base.length >= FEED_CHUNK_SIZE);
  }, [firstPagePosts.length, forcedPublicFeed]);

  useEffect(() => {
    const el = feedSentinelRef.current;
    if (!el || feedVisible >= realPosts.length) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setFeedVisible((v) => Math.min(v + 8, realPosts.length)); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [feedVisible, realPosts.length]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  // Final defensive dedupe right before render: even though loadFeed()
  // already dedupes by id, this guarantees the feed can NEVER render the
  // same post id twice — regardless of how realPosts got populated — and
  // is what the rendered <PostCard> list and its React keys are derived
  // from. Keying strictly by this guaranteed-unique id (no index fallback)
  // also makes any accidental duplicate immediately visible in dev instead
  // of being silently hidden by React's reconciliation.
  const visibleFeedPosts = useMemo(() => {
    const seen = new Set<string>();
    const unique = realPosts.filter((p) => {
      if (!p?.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return unique.slice(0, feedVisible);
  }, [realPosts, feedVisible]);

  const notifIdRef = useRef(1);


    // ── Carregar mais publicações (scroll infinito) — mesma busca fundida ──
    async function loadMoreFeed() {
      if (loadingMore || !hasMorePosts || !myUserId) return;
      setLoadingMore(true);
      try {
        const { items, nextCursor, hasMore } = await fetchFeedChunk(myUserId, feedCursor);
        if (items.length === 0) { setHasMorePosts(false); setLoadingMore(false); return; }
        setExtraPosts(prev => {
          const seen = new Set([...firstPagePosts, ...prev].map((p: any) => p.id));
          return [...prev, ...items.filter((p: any) => !seen.has(p.id))];
        });
        setHasMorePosts(hasMore);
        setFeedCursor(nextCursor);
        setFeedVisible(prev => prev + items.length);
      } catch { /* silencioso */ } finally { setLoadingMore(false); }
    }

    // IntersectionObserver para scroll infinito no feed
    useEffect(() => {
      const el = feedSentinelRef.current;
      if (!el) return;
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && hasMorePosts && !loadingMore) loadMoreFeed();
      }, { rootMargin: "300px" });
      obs.observe(el);
      return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMorePosts, loadingMore, feedCursor, myUserId]);

  
  function pushNotif(notif: Omit<Notif, "id">) {
    const full: Notif = { ...notif, id: notifIdRef.current++ };
    setNotifications((prev) => [full, ...prev].slice(0, 50));
    setToast(full);
    setTimeout(() => setToast((t) => (t?.id === full.id ? null : t)), 4500);
  }

  useEffect(() => {
    if (!myUserId || !myUsername) return;

    const COLORS = ["#5B3FCF","#E94B8A","#F26B3A","#1FAFA6","#6BA547","#FFC93C"];
    function hashColor(s: string) { let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))&0xffff; return COLORS[h%COLORS.length]; }

    const channel = supabase
      .channel(`notifs-${myUserId}`)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "post_likes" },
        async (payload: any) => {
          const like = payload.new as { post_id: string; user_id: string };
          if (like.user_id === myUserId) return;
          const { data: post } = await supabase
            .from("posts")
            .select("author_id, content, kind, author_username")
            .eq("id", like.post_id)
            .eq("author_id", myUserId)
            .maybeSingle();
          if (!post) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, full_name")
            .eq("id", like.user_id)
            .maybeSingle();
          const name = profile?.username ?? "alguém";
          let detail: string | undefined;
          if ((post as any).kind !== "bg") detail = ((post as any).content ?? "").slice(0, 60) || undefined;
          pushNotif({ type: "like", user: name, name, color: hashColor(name), text: "curtiu o teu post", detail, time: "agora", read: false });
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "post_comments" },
        async (payload: any) => {
          const comment = payload.new as { post_id: string; user_id: string; author_username: string; author_color: string | null; content: string };
          if (comment.user_id === myUserId) return;
          const { data: post } = await supabase
            .from("posts")
            .select("author_id")
            .eq("id", comment.post_id)
            .eq("author_id", myUserId)
            .maybeSingle();
          if (!post) return;
          pushNotif({
            type: "comment",
            user: comment.author_username,
            name: comment.author_username,
            color: comment.author_color ?? hashColor(comment.author_username),
            text: "comentou no teu post",
            detail: comment.content.slice(0, 80) || undefined,
            time: "agora",
            read: false,
          });
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "follows", filter: `target_username=eq.${myUsername}` },
        async (payload: any) => {
          const follow = payload.new as { follower_id: string; target_username: string };
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, full_name")
            .eq("id", follow.follower_id)
            .maybeSingle();
          const name = profile?.username ?? follow.follower_id.slice(0, 8);
          pushNotif({ type: "follow", user: name, name, color: hashColor(name), text: "começou a seguir-te", time: "agora", read: false });
        }
      )
      // ── Mensagens novas ──
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: any) => {
          const msg = payload.new;
          if (msg.sender_id === myUserId) return;
          // Verificar se é para mim (conversa onde participo)
          const { data: conv } = await supabase
            .from("conversation_participants")
            .select("conversation_id")
            .eq("conversation_id", msg.conversation_id)
            .eq("user_id", myUserId)
            .maybeSingle();
          if (!conv) return;
          const { data: sender } = await supabase
            .from("profiles").select("username, full_name").eq("id", msg.sender_id).maybeSingle();
          const name = sender?.full_name || sender?.username || "alguém";
          const preview = msg.content?.slice(0, 60) || (msg.type === "image" ? "📷 Imagem" : msg.type === "video" ? "🎥 Vídeo" : "Mensagem");
          pushNotif({ type: "message", user: name, name, color: hashColor(name), text: "enviou-te uma mensagem", detail: preview, time: "agora", read: false });
        }
      )
      // ── Vídeos novos de canais seguidos ──
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "videos", filter: `status=eq.published` },
        async (payload: any) => {
          const video = payload.new;
          if (video.owner_id === myUserId) return;
          // Verificar se sigo o canal
          const { data: channelData } = await supabase
            .from("channels").select("id, name, handle").eq("id", video.channel_id).maybeSingle();
          if (!channelData) return;
          const { data: followRow } = await (supabase as any)
            .from("follows").select("id").eq("follower_id", myUserId).eq("following_id", video.channel_id).maybeSingle();
          if (!followRow) return;
          pushNotif({ type: "video_new", user: channelData.name, name: channelData.name, color: "#5B3FCF", text: "publicou um vídeo novo", detail: video.title?.slice(0, 60), time: "agora", read: false });
        }
      )
      // ── Likes nos meus vídeos ──
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "video_likes" },
        async (payload: any) => {
          const vl = payload.new;
          if (vl.user_id === myUserId) return;
          const { data: video } = await supabase.from("videos").select("owner_id, title").eq("id", vl.video_id).eq("owner_id", myUserId).maybeSingle();
          if (!video) return;
          const { data: liker } = await supabase.from("profiles").select("username").eq("id", vl.user_id).maybeSingle();
          const name = liker?.username || "alguém";
          pushNotif({ type: "video_like", user: name, name, color: hashColor(name), text: "gostou do teu vídeo", detail: (video as any).title?.slice(0, 60), time: "agora", read: false });
        }
      )
      // ── Comentários nos meus vídeos ──
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "video_comments" },
        async (payload: any) => {
          const vc = payload.new;
          if (vc.user_id === myUserId) return;
          const { data: video } = await supabase.from("videos").select("owner_id, title").eq("id", vc.video_id).eq("owner_id", myUserId).maybeSingle();
          if (!video) return;
          const { data: commenter } = await supabase.from("profiles").select("username").eq("id", vc.user_id).maybeSingle();
          const name = commenter?.username || "alguém";
          pushNotif({ type: "video_comment", user: name, name, color: hashColor(name), text: "comentou no teu vídeo", detail: vc.content?.slice(0, 60), time: "agora", read: false });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myUserId, myUsername]);

  useEffect(() => {
    // The global <AuthGate> (in __root.tsx) already guarantees this route
    // only renders once a valid session exists, so we read it from context
    // instead of issuing a second getSession() call here.
    if (!session) return;
    const uid = session.user.id;
    setMyUserId(uid);
    setReady(true);
    // O feed é buscado automaticamente pelo useQuery acima assim que
    // myUserId muda (enabled: !!myUserId) — com cache instantâneo.
    // Load username for realtime follows filter
    supabase
      .from("profiles")
      .select("username")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data: profile }) => {
        if (profile?.username) setMyUsername(profile.username);
      });
  }, [session]);


  if (!ready) return <div className="min-h-screen bg-[var(--s2)]" />;

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
      <FeedLayout
        feed={
          <>
      <header className="sticky top-0 z-30 border-b hooda-sticky-header"
        style={{ background: "var(--s0)", borderColor: "var(--border-subtle)", backdropFilter: "blur(20px)" }}>
        <div className="mx-auto px-4 h-14 flex items-center justify-between max-w-full">
          <HoodaLogo size="sm" className="lg:hidden" />
          <span className="hidden lg:block" />
          <button className="lg:hidden p-2 hover:bg-[var(--s2)] rounded-full text-[var(--text-secondary)]"
            onClick={() => navigate({ to: "/explorar" })}>
            <Search className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="w-full max-w-full">
        <div className="px-3 pt-3">
          <ComposeBox
            name={myDisplayName || "Utilizador"}
            username={myUsername || "utilizador"}
            avatarUrl={userAvatarUrl}
            onPublished={() => qc.invalidateQueries({ queryKey: QUERY_KEYS.feed(effectiveUserId) })}
          />
        </div>
        {/* Feed */}
        <section className="pt-1 pb-6 space-y-1 w-full px-3">
          {loadingFeed && <FeedSkeleton count={4} />}

          {!loadingFeed && realPosts.length === 0 && (
            refreshingFeedInBackground ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: "var(--s3)", borderTopColor: "#5B3FCF" }} />
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>A carregar publicações…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Ainda não há publicações</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Publica algo ou segue outras pessoas para veres conteúdo aqui.</p>
              </div>
            )
          )}
          {!loadingFeed && realPosts.length > 0 && refreshingFeedInBackground && (
            <div className="flex items-center justify-center gap-1.5 -mt-1 mb-1">
              <BackgroundRefreshDot show />
              <span className="text-[10px]" style={{ color: "var(--text-muted,#888)" }}>A atualizar…</span>
            </div>
          )}
          {visibleFeedPosts.map((p, idx) => (
            <React.Fragment key={p.id}>
              <UniversalPostCard post={p} />
              {/* Após o 5º post */}
              {showWhoToFollow && myUserId && idx === 4 && (
                <WhoToFollowCard myUserId={myUserId} onDismiss={() => setShowWhoToFollow(false)} offset={0} />
              )}
              {/* Após o 12º post */}
              {showWhoToFollow2 && myUserId && idx === 11 && (
                <WhoToFollowCard myUserId={myUserId} onDismiss={() => setShowWhoToFollow2(false)} offset={4} />
              )}
            </React.Fragment>
          ))}
          <div ref={feedSentinelRef} className="py-4 flex justify-center">
            {(loadingMore || (hasMorePosts && feedVisible >= realPosts.length)) && (
              <div className="h-5 w-5 rounded-full border-2 animate-spin" style={{ borderColor: "#5B3FCF44", borderTopColor: "#5B3FCF" }} />
            )}
            {!hasMorePosts && realPosts.length > 5 && (
              <p className="text-xs" style={{ color: "var(--text-muted,#888)" }}>Chegaste ao fim 🎉</p>
            )}
          </div>
        </section>
      </main>

      {/* Notification toast popup */}
      {toast && (
        <NotificationToast notif={toast} onClose={() => setToast(null)} />
      )}

      {/* Notification center */}
      {showNotifCenter && (
        <NotificationCenter
          notifications={notifications}
          onClose={() => { setShowNotifCenter(false); markAllRead(); }}
          onMarkAll={markAllRead}
        />
      )}
          </>
        }
        sidebar={<RightSidebar />}
      />
      </PageWrapper>
    </div>
  );
}


