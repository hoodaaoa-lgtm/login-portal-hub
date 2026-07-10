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
import { HoodaTipCard } from "@/components/HoodaTipCard";
import { registerVideo, notifyVideoPlaying, pauseAllVideos } from "@/lib/mediaManager";
import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { fetchPostComments, sendPostComment, replyToPostComment, toggleCommentLike, notifyMentions } from "@/lib/comments";
import { useNotifications } from "@/hooks/useNotifications";
import { WelcomeInstallPrompt } from "@/components/WelcomeInstallPrompt";
import { useFollowState } from "@/hooks/useSocialSystem";
import {
  NotificationToast,
  NotificationCenter,
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
import { UniversalSkeleton, BackgroundRefreshDot } from "@/components/Skeletons";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { PollCard } from "@/components/PollCard";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useScrollLock } from "@/hooks/useScrollLock";
import { ComposeBox } from "@/components/QuickComposer";
import { getSeenPostIds, addSeenPostIds, getSeenVideoIds, addSeenVideoIds, diversifyByAuthor, diversifyByAuthorAndTopic } from "@/lib/feedSeen";
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
          <p className="font-extrabold text-[15px]" style={{ color: "var(--text-primary)" }}>Quem acompanhar</p>
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
        {suggestions.map((user) => (
          <WhoToFollowSuggestionCard key={user.id} user={user} myUserId={myUserId} navigate={navigate} />
        ))}

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

/* ══════════════════════════════════════════════
   Cartão individual de sugestão — usa useFollowState,
   a mesma fonte de verdade partilhada com o resto da
   app (post cards, perfil, u/$username...). Sem isto,
   clicar aqui não sincronizava com os outros sítios.
══════════════════════════════════════════════ */
function WhoToFollowSuggestionCard({ user, myUserId, navigate }: { user: any; myUserId: string; navigate: any }) {
  const ACCENT = "#5B3FCF";
  const AVATAR_COLORS = [ACCENT, "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
  const name = user.full_name || user.username || "Utilizador";
  const bg = AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
  const { isFollowing, isPending, isLoading: followLoading, toggle } = useFollowState(myUserId, user.username, user.id);

  return (
    <div className="shrink-0 flex flex-col items-center rounded-2xl p-3 border transition"
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

      {/* Botão seguir — skeleton enquanto o estado real ainda não chegou,
          para não piscar "Acompanhar" e depois saltar para "A acompanhar" */}
      {followLoading ? (
        <div className="relative overflow-hidden w-full h-8 rounded-full mt-auto" style={{ background: "var(--s2)" }}>
          <div className="skeleton-shimmer absolute inset-0" />
        </div>
      ) : (
        <button onClick={toggle} disabled={isPending}
          className="w-full h-8 rounded-full text-[12px] font-bold transition active:scale-95 mt-auto disabled:opacity-60"
          style={isFollowing
            ? { background: "var(--s3)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
            : { background: ACCENT, color: "#fff", border: "none" }}>
          {isFollowing ? "A acompanhar" : "Acompanhar"}
        </button>
      )}
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

  /* ── Notifications (dados reais do Supabase + realtime + som + push) ── */
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const {
    notifications, unreadCount, loading: notifLoading,
    toast, dismissToast, markAllRead, markOneRead,
  } = useNotifications(session?.user?.id ?? null);

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
    function openFromEvent() { setShowNotifCenter(true); dismissToast(); }
    window.addEventListener("hooda:open-notifications", openFromEvent);
    return () => window.removeEventListener("hooda:open-notifications", openFromEvent);
  }, [dismissToast]);

  function handleNotifClick(notif: Notif) {
    markOneRead(notif.id);
    setShowNotifCenter(false);
    if (notif.type === "message") navigate({ to: "/mensagens" });
    else if (notif.type === "follow") navigate({ to: `/u/${notif.user}` } as any);
  }

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
        .select("id,author_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,thumbnail_url,clip_video_id,clip_start,clip_end,clip_title,clip_thumb_url,poll,poll_ends_at,moderation_status,is_sensitive")
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(50);
      return diversifyByAuthor((data ?? []).map((p: any) => {
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
          video_thumb: p.thumbnail_url ?? null,
          bg_color, created_at: p.created_at, kind: p.kind, is_ad: p.is_ad,
          likes: 0, liked_by_me: false, comments: 0,
          clip_video_id: p.clip_video_id, clip_start: p.clip_start, clip_end: p.clip_end,
          clip_title: p.clip_title, clip_thumb_url: p.clip_thumb_url,
          poll: p.poll ?? null, poll_ends_at: p.poll_ends_at ?? null,
          moderation_status: p.moderation_status ?? null, is_sensitive: !!p.is_sensitive,
        };
      }));
    }
  }

  const FEED_CHUNK_SIZE = 30;
  const ACCENT_LOCAL = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A","#FFC93C"];
  const POST_SELECT_FIELDS = "id,author_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,thumbnail_url,clip_video_id,clip_start,clip_end,clip_title,clip_thumb_url,views_count,reposts_count,poll,poll_ends_at,moderation_status,is_sensitive";
  const VIDEO_SELECT_FIELDS = "id,title,thumbnail_url,duration_seconds,views_count,likes_count,comments_count,created_at,owner_id";

  // ─── FEED COM RANKING (Fase 6) — busca posts via get_personalized_feed_v2 ─
  //
  // v2 acrescenta à v1 (afinidade por autor + qualidade + frescura +
  // descoberta + tendências): similaridade semântica por embedding
  // (pgvector, vetor de interesse calculado em user_taste_vectors) e
  // anti-fadiga por autor E por tópico já resolvido no servidor (nunca mais
  // de 2 seguidos do mesmo autor/tópico, mesmo entre páginas). Os vídeos
  // publicados nos canais continuam por agora só por frescura (ainda não
  // têm embedding/content_quality), e entram no mesmo merge final por uma
  // pontuação comparável (0-100).
  // `cursor` (created_at ISO) delimita a janela de candidatos "mais antigos
  // que X", para o scroll infinito continuar de onde a página anterior parou.
  async function fetchFeedChunk(uid: string, cursor: string | null) {
    const rpcCursor = cursor ?? new Date().toISOString();

    const [{ data: rankedRows, error: rankErr }, { data: rankedVideoRows, error: videoRankErr }] = await Promise.all([
      (supabase as any).rpc("get_personalized_feed_v2", {
        p_user_id: uid, p_cursor: rpcCursor, p_limit: FEED_CHUNK_SIZE,
        // Publicações já mostradas neste dispositivo (mesmo sem terem sido
        // "vistas" a sério) — para nunca repetir a mesma ao atualizar a
        // página. Cruzado no servidor com post_impressions (janela de
        // p_hard_exclude_hours, default 24h) para um sinal mais forte e
        // persistente entre sessões/dispositivos.
        p_exclude_ids: getSeenPostIds(uid),
      }),
      // Mesma lógica de "nunca repetir" dos posts, aplicada aos vídeos:
      // exclui vídeos já vistos a sério (video_views) e já mostrados neste
      // dispositivo (getSeenVideoIds) — sem isto, o vídeo mais recente
      // aparecia sempre no topo, igual, a cada atualização da página.
      (supabase as any).rpc("get_feed_videos", {
        p_user_id: uid, p_cursor: rpcCursor, p_limit: FEED_CHUNK_SIZE,
        p_exclude_ids: getSeenVideoIds(uid),
      }),
    ]);

    // Se a RPC de vídeos falhar por qualquer razão, cai de volta à busca
    // cronológica simples — nunca deixa o feed sem vídeos por causa disto.
    let videosData: any[] = [];
    if (videoRankErr || !rankedVideoRows) {
      console.error("get_feed_videos falhou, a usar ordem cronológica:", videoRankErr);
      let fallbackVideosQuery = (supabase as any)
        .from("videos")
        .select(VIDEO_SELECT_FIELDS)
        .eq("status", "published").eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(FEED_CHUNK_SIZE);
      if (cursor) fallbackVideosQuery = fallbackVideosQuery.lt("created_at", cursor);
      const { data } = await fallbackVideosQuery;
      videosData = data ?? [];
    } else if (rankedVideoRows.length > 0) {
      const videoIds = rankedVideoRows.map((r: any) => r.video_id);
      const { data } = await (supabase as any).from("videos").select(VIDEO_SELECT_FIELDS).in("id", videoIds);
      const byId = new Map((data ?? []).map((v: any) => [v.id, v]));
      const scoreByVideoId: Record<string, number> = {};
      rankedVideoRows.forEach((r: any) => { scoreByVideoId[r.video_id] = r.rank_score; });
      videosData = videoIds
        .map((id: string) => byId.get(id))
        .filter(Boolean)
        .map((v: any) => ({ ...v, __rank_score: scoreByVideoId[v.id] }));
    }

    // Se a RPC de ranking falhar por qualquer razão, cai de volta à busca
    // cronológica simples de posts — nunca deixa o feed vazio por causa disto.
    let rawPosts: any[] = [];
    let rankByPostId: Record<string, number> = {};
    let topicByPostId: Record<string, string | null> = {};
    if (rankErr || !rankedRows) {
      console.error("get_personalized_feed_v2 falhou, a usar ordem cronológica:", rankErr);
      let fallbackQuery = supabase.from("posts").select(POST_SELECT_FIELDS)
        .eq("is_draft", false)
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false }).limit(FEED_CHUNK_SIZE);
      if (cursor) fallbackQuery = fallbackQuery.lt("created_at", cursor);
      const { data } = await fallbackQuery;
      rawPosts = data ?? [];
    } else {
      const postIds = rankedRows.map((r: any) => r.post_id);
      // IMPORTANTE: a v2 já devolve os posts na sequência anti-fadiga
      // (nunca 2+ seguidos do mesmo autor/tópico) — usar o rank_score CRU
      // no merge final com vídeos (que também ordena por rank_score, ver
      // mais abaixo) anularia essa sequência, porque itens trocados de
      // posição pelo re-rank mantêm o rank_score original. Por isso aqui
      // convertemos a POSIÇÃO na lista (já diversificada) num score
      // ordinal decrescente na mesma escala 0-100 dos vídeos — preserva a
      // ordem exata entre posts, e ainda deixa os vídeos entrarem no ponto
      // certo por frescura.
      rankedRows.forEach((r: any, i: number) => {
        rankByPostId[r.post_id] = postIds.length > 1 ? 100 - (i * (100 / (postIds.length - 1))) : 100;
        topicByPostId[r.post_id] = r.top_category ?? null;
      });
      if (postIds.length > 0) {
        const { data } = await supabase.from("posts").select(POST_SELECT_FIELDS).in("id", postIds);
        const byId = new Map((data ?? []).map((p: any) => [p.id, p]));
        rawPosts = postIds.map((id: string) => byId.get(id)).filter(Boolean);
      }
    }

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
    const videoIds   = eligibleVideos.map((v: any) => v.id);
    const authorIds  = new Set<string>();
    eligiblePosts.forEach((p: any) => { const k = p.author_id || p.user_id; if (k) authorIds.add(k); });
    eligibleVideos.forEach((v: any) => { if (v.owner_id) authorIds.add(v.owner_id); });

    // ── Sinais de exibição (likes/comentários/perfis) — sem influenciar ordem ──
    const [
      { data: likesData },
      { data: commentsData },
      { data: authorProfiles },
      { data: videoLikesData },
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
      videoIds.length > 0 && uid
        ? (supabase as any).from("video_likes").select("video_id").eq("user_id", uid).in("video_id", videoIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const likedVideoSet = new Set((videoLikesData || []).map((l: any) => l.video_id));

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
        video_thumb: p.thumbnail_url ?? null,
        bg_color, created_at: p.created_at, kind: p.kind, is_ad: p.is_ad,
        likes: (likesByPost[p.id] || []).length, liked_by_me: (likesByPost[p.id] || []).includes(uid),
        comments: commentsByPost[p.id] || 0,
        views_count: p.views_count ?? 0, reposts_count: p.reposts_count ?? 0,
        clip_video_id: p.clip_video_id, clip_start: p.clip_start, clip_end: p.clip_end,
        clip_title: p.clip_title, clip_thumb_url: p.clip_thumb_url,
        moderation_status: p.moderation_status ?? null, is_sensitive: !!p.is_sensitive,
        poll: p.poll ?? null, poll_ends_at: p.poll_ends_at ?? null,
        rank_score: rankByPostId[p.id] ?? 0,
        top_category: topicByPostId[p.id] ?? null,
      };
    });

    // ── Mapear vídeos publicados (aparecem como "clipe" completo no feed) ──
    const mappedVideos = eligibleVideos.map((v: any) => {
      const authorKey = v.owner_id;
      const name = nameMap[authorKey] || usernameMap[authorKey] || "hooda";
      const username = usernameMap[authorKey] || "";
      return {
        id: `vidfeed_${v.id}`, user_id: authorKey, author_id: authorKey,
        author_username: username || null,
        user: name, name: `@${username || "?"}`,
        color: ACCENT_LOCAL[(name.charCodeAt(0) || 0) % ACCENT_LOCAL.length],
        avatar_url: authorKey ? (avatarMap[authorKey] ?? null) : null,
        text: null, photo: null, photos: null, video: null,
        bg_color: null, created_at: v.created_at, kind: "clip", is_ad: false,
        likes: v.likes_count ?? 0, liked_by_me: likedVideoSet.has(v.id), comments: v.comments_count ?? 0,
        views_count: v.views_count ?? 0, reposts_count: 0,
        clip_video_id: v.id, clip_start: 0, clip_end: v.duration_seconds ?? 0,
        clip_title: v.title, clip_thumb_url: v.thumbnail_url,
        // Se veio de get_feed_videos, já tem anti-repetição + jitter
        // aplicados no score. Só cai para frescura pura no fallback
        // cronológico (RPC indisponível).
        rank_score: v.__rank_score ?? Math.max(0, 100 - ((Date.now() - new Date(v.created_at).getTime()) / 259200000) * 100),
      };
    });

    // ── Fundir pela pontuação de ranking (não por ordem cronológica) ──
    const merged = [...mappedPosts, ...mappedVideos].sort(
      (a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0)
    );

    // Nunca dois seguidos do mesmo autor NEM do mesmo tópico — reordena
    // mantendo a pontuação como critério principal, só troca posições
    // quando há repetição.
    const diversified = diversifyByAuthorAndTopic(merged);

    const page = diversified.slice(0, FEED_CHUNK_SIZE);

    // Marca já estas publicações/vídeos como "mostrados" neste dispositivo —
    // para a próxima busca (scroll infinito ou atualizar a página) não os
    // trazer outra vez. Posts e vídeos vão para listas separadas porque
    // cada um tem o seu próprio p_exclude_ids na RPC correspondente.
    if (uid) {
      const seenPostIds: string[] = [];
      const seenVideoIds: string[] = [];
      page.forEach((it: any) => {
        if (typeof it.id !== "string") return;
        if (it.id.startsWith("vidfeed_")) {
          if (it.clip_video_id) seenVideoIds.push(it.clip_video_id);
        } else {
          seenPostIds.push(it.id);
        }
      });
      addSeenPostIds(uid, seenPostIds);
      addSeenVideoIds(uid, seenVideoIds);
    }

    // O cursor da próxima página é o created_at mais ANTIGO desta página
    // (não o último da lista, já que a ordem agora é por score, não por
    // tempo) — garante que a janela de candidatos avança sem repetir.
    const nextCursor = page.length > 0
      ? page.reduce((oldest: string, it: any) => (new Date(it.created_at) < new Date(oldest) ? it.created_at : oldest), page[0].created_at)
      : null;
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
    const combined = [...base, ...extraPosts].filter((p: any) => {
      if (!p?.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return diversifyByAuthor(combined);
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

  

  useEffect(() => {
    if (!myUserId || !myUsername) return;

    async function insertNotif(type: string, actorId: string, actorUsername: string | null, postId?: string) {
      if (actorId === myUserId) return;
      try {
        await (supabase as any).from("notifications").insert({
          user_id: myUserId, type, actor_id: actorId, actor_username: actorUsername, post_id: postId ?? null,
        });
      } catch { /* silencioso */ }
    }

    const channel = supabase
      .channel(`notifs-videos-${myUserId}`)
      // ── Vídeos novos de canais seguidos ──
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "videos", filter: `status=eq.published` },
        async (payload: any) => {
          const video = payload.new;
          if (video.owner_id === myUserId) return;
          const { data: profileData } = await supabase
            .from("profiles").select("id, full_name, username").eq("id", video.owner_id).maybeSingle();
          if (!profileData) return;
          const { data: followRow } = await (supabase as any)
            .from("follows").select("id").eq("follower_id", myUserId).eq("following_id", video.owner_id).maybeSingle();
          if (!followRow) return;
          insertNotif("video_new", video.owner_id, (profileData as any).full_name);
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
          insertNotif("video_like", vl.user_id, liker?.username ?? null);
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
          insertNotif("video_comment", vc.user_id, commenter?.username ?? null);
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
          {loadingFeed && <UniversalSkeleton variant="feed" count={4} />}

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
              {/* Após o 8º post — dica/sugestão rotativa. Só no telemóvel/tablet
                  (abaixo de xl), porque no computador largo a mesma dica já
                  aparece fixa na sidebar direita (RightSidebar). */}
              {idx === 7 && (
                <div className="xl:hidden">
                  <HoodaTipCard variant="feed" />
                </div>
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
        <NotificationToast notif={toast} onClose={dismissToast} onClick={() => handleNotifClick(toast)} />
      )}

      <WelcomeInstallPrompt userId={session?.user?.id ?? null} />

      {/* Notification center */}
      {showNotifCenter && (
        <NotificationCenter
          notifications={notifications}
          loading={notifLoading}
          onClose={() => { setShowNotifCenter(false); markAllRead(); }}
          onMarkAll={markAllRead}
          onItemClick={handleNotifClick}
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


