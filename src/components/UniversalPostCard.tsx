import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { RichText } from "@/components/RichText";
import { registerVideo, pauseAllVideos } from "@/lib/mediaManager";
import { fetchPostComments, sendPostComment, replyToPostComment, toggleCommentLike, notifyMentions } from "@/lib/comments";
import { deletePostForEveryone } from "@/lib/posts";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { PollCard } from "@/components/PollCard";
import { SensitiveContentOverlay } from "@/components/SensitiveContentOverlay";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useFollowState, usePostLikeState, getViewerFingerprint } from "@/hooks/useSocialSystem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, REALTIME_QUERY_OPTIONS } from "@/lib/queryClient";
import {
  Search, Bell, Plus, MessageCircle, Share2, Music, X, Heart,
  ChevronLeft, ChevronRight, ImageIcon, Type as TypeIcon, Check,
  BarChart3, Trash2, Copy, Bookmark, BookmarkCheck, Forward, Repeat2,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

export const ACCENT_COLOR = "#5B3FCF";

/* ═══════════════════════════════════════════════════════════════
   TIPO CANÓNICO DE PUBLICAÇÃO
   Todas as páginas devem convergir os seus dados para este formato
   antes de os passar ao <UniversalPostCard/>. Usa normalizePost().
═══════════════════════════════════════════════════════════════ */
export type NormalizedPost = {
  id: string;
  author_id?: string | null;
  author_username?: string | null;
  user?: string;          // nome de apresentação
  name?: string;          // linha secundária, normalmente "@username"
  color?: string;
  avatar_url?: string | null;
  text?: string | null;
  photo?: string | null;
  photos?: string[] | null;
  video?: string | null;
  video_thumb?: string | null;
  bg_color?: string | null;
  kind?: string | null;
  is_ad?: boolean;
  ad?: boolean;
  likes?: number;
  liked_by_me?: boolean;
  comments?: number;
  views_count?: number;
  reposts_count?: number;
  reposted_by_name?: string | null;
  music_title?: string | null;
  music_cover?: string | null;
  music_artist?: string | null;
  poll?: { question?: string; options?: (string | { text: string })[] } | null;
  poll_ends_at?: string | null;
  // Clipes / vídeos do HoodaTV partilhados como publicação
  clip_video_id?: string | null;
  clip_start?: number;
  clip_end?: number;
  clip_title?: string | null;
  clip_thumb_url?: string | null;
  video_stream_url?: string | null;
  channel_id?: string | null;
  channel_handle?: string | null;
  channel_name?: string | null;
  channel_avatar?: string | null;
  // Fase 6 — moderação de conteúdo
  moderation_status?: string | null;
  is_sensitive?: boolean | null;
};

/* ── normalizePost — converte os formatos de dados de cada página
   para o formato canónico acima. "source" indica a origem. ── */
export function normalizePost(
  raw: any,
  source: "feed" | "profile" | "userPage" | "single",
  extra?: { name?: string; username?: string; avatarUrl?: string | null; authorId?: string | null }
): NormalizedPost {
  if (!raw) return { id: "" };

  if (source === "feed") {
    // Já está no formato canónico (home.tsx / explorar.tsx)
    return raw as NormalizedPost;
  }

  if (source === "profile") {
    // Formato camelCase usado em perfil.tsx (type Post)
    return {
      id: raw.id,
      author_id: extra?.authorId ?? raw.authorId ?? null,
      author_username: extra?.username ?? raw.authorUsername ?? null,
      user: extra?.name ?? raw.authorName ?? extra?.username,
      name: `@${extra?.username ?? raw.authorUsername ?? "?"}`,
      avatar_url: extra?.avatarUrl ?? raw.authorAvatar ?? null,
      text: raw.text,
      photo: raw.photo ?? null,
      video: raw.videoUrl ?? null,
      bg_color: raw.bgColor ?? null,
      kind: raw.kind ?? null,
      likes: raw.likes ?? 0,
      liked_by_me: raw.likedByMe ?? false,
      comments: raw.comments ?? 0,
      views_count: raw.views_count ?? 0,
      poll: raw.poll ?? null,
      poll_ends_at: raw.pollEndsAt ?? null,
      clip_video_id: raw.clipVideoId ?? null,
      clip_title: raw.clipTitle ?? null,
      clip_thumb_url: raw.clipThumb ?? null,
      video_stream_url: raw.videoStreamUrl ?? null,
    };
  }

  if (source === "userPage") {
    // Formato camelCase usado em u.$username.tsx
    return {
      id: raw.id,
      author_id: extra?.authorId ?? null,
      author_username: extra?.username ?? null,
      user: extra?.name,
      name: `@${extra?.username ?? "?"}`,
      avatar_url: extra?.avatarUrl ?? null,
      text: raw.text,
      photo: raw.photo ?? null,
      video: raw.videoUrl ?? null,
      bg_color: raw.bgColor ?? null,
      kind: raw.kind ?? null,
      likes: raw.likesCount ?? 0,
      comments: raw.commentsCount ?? 0,
      views_count: raw.viewsCount ?? 0,
      clip_video_id: raw.clipVideoId ?? null,
      clip_title: raw.clipTitle ?? null,
      clip_thumb_url: raw.clipThumb ?? null,
      clip_start: raw.clipStart ?? 0,
      clip_end: raw.clipEnd ?? 0,
      channel_name: raw.channelName ?? null,
      channel_handle: raw.channelHandle ?? null,
      channel_avatar: raw.channelAvatar ?? null,
      video_stream_url: raw.videoStreamUrl ?? null,
    };
  }

  // "single" — linha crua do Supabase, tal como usada em post/$id.tsx
  let text = raw.content;
  let bg_color: string | null = null;
  if (raw.kind === "bg") {
    try { const j = JSON.parse(raw.content); text = j.text; bg_color = j.bgColor; } catch { /* noop */ }
  }
  return {
    id: raw.id,
    author_id: raw.author_id ?? null,
    author_username: raw.author_username ?? null,
    user: raw.author_name ?? raw.author_username,
    name: `@${raw.author_username ?? "?"}`,
    color: raw.author_color ?? undefined,
    text,
    bg_color,
    photo: raw.photo_url ?? null,
    photos: raw.photos ?? null,
    video: raw.video_url ?? null,
    kind: raw.kind ?? null,
    poll: raw.poll ?? null,
    poll_ends_at: raw.poll_ends_at ?? null,
    likes: raw.likes ?? 0,
    comments: raw.comments ?? 0,
    liked_by_me: raw.liked_by_me ?? false,
    views_count: raw.views_count ?? 0,
  };
}

/* ── Instagram-style photo carousel ── */
export function PhotoGrid({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const n = photos.length;
  if (n === 0) return null;

  return (
    <>
      <div className="relative w-full select-none px-4 pb-3">
        <div className="relative w-full cursor-pointer rounded-2xl overflow-hidden"
          style={{ minHeight: 200 }}
          onClick={() => setFullscreen(true)}>
          <img loading="lazy" decoding="async" src={photos[idx]}
            alt=""
            className="w-full block"
            style={{ display: "block", minHeight: 200 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />

          {n > 1 && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-white text-xs font-bold z-10"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              {idx + 1} / {n}
            </div>
          )}

          {idx > 0 && (
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full flex items-center justify-center z-10 shadow-lg transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.88)" }}
              onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}>
              <ChevronLeft className="h-5 w-5 text-black" />
            </button>
          )}

          {idx < n - 1 && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full flex items-center justify-center z-10 shadow-lg transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.88)" }}
              onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}>
              <ChevronRight className="h-5 w-5 text-black" />
            </button>
          )}
        </div>

        {n > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-2.5" style={{ background: "var(--surface-0)" }}>
            {photos.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === idx ? 8 : 6,
                  height: i === idx ? 8 : 6,
                  background: i === idx ? "#5B3FCF" : "#c8c8d0"
                }} />
            ))}
          </div>
        )}
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: "#000" }}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-white/60 text-sm font-semibold">{idx + 1} / {n}</span>
            <button onClick={() => setFullscreen(false)}
              className="h-9 w-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)" }}>
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center relative">
            <img loading="lazy" decoding="async" src={photos[idx]} alt=""
              className="max-w-full max-h-full"
              style={{ objectFit: "contain", maxHeight: "80vh" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            {idx > 0 && (
              <button onClick={() => setIdx(i => i - 1)}
                className="absolute left-3 h-11 w-11 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <ChevronLeft className="h-6 w-6 text-white" />
              </button>
            )}
            {idx < n - 1 && (
              <button onClick={() => setIdx(i => i + 1)}
                className="absolute right-3 h-11 w-11 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <ChevronRight className="h-6 w-6 text-white" />
              </button>
            )}
          </div>
          <div className="flex gap-2 justify-center overflow-x-auto px-4 py-3 shrink-0">
            {photos.map((p, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className="shrink-0 rounded-xl overflow-hidden transition"
                style={{
                  width: 56, height: 56,
                  outline: i === idx ? "2.5px solid white" : "2px solid transparent",
                  opacity: i === idx ? 1 : 0.5
                }}>
                <img loading="lazy" decoding="async" src={p} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Repostar ── */
function RepostModal({ post, me, onClose, onReposted }: {
  post: any; me: any; onClose: () => void;
  onReposted: (count: number, didRepost: boolean) => void;
}) {
  const [mode, setMode] = useState<"menu" | "quote" | "done">("menu");
  const [quoteText, setQuoteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [alreadyReposted, setAlreadyReposted] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("reposts").select("id").eq("user_id", me.id).eq("post_id", post.id).maybeSingle();
      setAlreadyReposted(!!data);
    })();
  }, [me?.id, post.id]);

  async function doRepost(quote?: string) {
    if (!me?.id || loading) return;
    setLoading(true);
    if (alreadyReposted) {
      await (supabase as any).from("reposts").delete().eq("user_id", me.id).eq("post_id", post.id);
      onReposted((post.reposts_count ?? 1) - 1, false);
    } else {
      await (supabase as any).from("reposts").insert({
        user_id: me.id, post_id: post.id, quote_text: quote || null,
      });
      onReposted((post.reposts_count ?? 0) + 1, true);
    }
    setLoading(false);
    setMode("done");
    setTimeout(onClose, 900);
  }

  const avatarColor = (name: string) => {
    const COLORS = [ACCENT_COLOR, "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
    return COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "var(--s0)", maxHeight: "90vh" }}
        onClick={e => e.stopPropagation()}>

        {mode === "menu" && (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>
                {alreadyReposted ? "Desfazer repost?" : "Repostar"}
              </h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
                <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>

            <div className="mx-4 mb-4 p-3 rounded-2xl border" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: avatarColor(post.user) }}>
                  {post.avatar_url
                    ? <img src={post.avatar_url} alt="" className="w-full h-full object-cover" />
                    : (post.user?.[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-bold leading-none" style={{ color: "var(--text-primary)" }}>{post.user}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>@{post.author_username}</p>
                </div>
              </div>
              {post.text && (
                <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>{post.text}</p>
              )}
              {post.photo && (
                <img src={post.photo} alt="" className="w-full rounded-xl mt-2 object-cover max-h-32" />
              )}
            </div>

            <div className="px-4 pb-5 space-y-2">
              {alreadyReposted ? (
                <button onClick={() => doRepost()} disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm transition active:scale-[0.98]"
                  style={{ background: "#ef444415", color: "#ef4444" }}>
                  <Repeat2 className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-bold">Desfazer repost</p>
                    <p className="text-xs opacity-70">Remove do teu feed e dos teus seguidores</p>
                  </div>
                </button>
              ) : (
                <>
                  <button onClick={() => doRepost()} disabled={loading}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm transition active:scale-[0.98]"
                    style={{ background: "var(--s2)", color: "var(--text-primary)" }}
                    onMouseOver={e => (e.currentTarget.style.background = "var(--s3)")}
                    onMouseOut={e => (e.currentTarget.style.background = "var(--s2)")}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${ACCENT_COLOR}15` }}>
                      <Repeat2 className="w-5 h-5" style={{ color: ACCENT_COLOR }} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold" style={{ color: "var(--text-primary)" }}>Repostar</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Partilha imediatamente com os teus seguidores</p>
                    </div>
                  </button>

                  <button onClick={() => setMode("quote")}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold text-sm transition active:scale-[0.98]"
                    style={{ background: "var(--s2)", color: "var(--text-primary)" }}
                    onMouseOver={e => (e.currentTarget.style.background = "var(--s3)")}
                    onMouseOut={e => (e.currentTarget.style.background = "var(--s2)")}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#E94B8A15" }}>
                      <TypeIcon className="w-5 h-5" style={{ color: "#E94B8A" }} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold" style={{ color: "var(--text-primary)" }}>Citar publicação</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Adiciona o teu comentário a esta publicação</p>
                    </div>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {mode === "quote" && (
          <>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <button onClick={() => setMode("menu")} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
                <ChevronLeft className="w-4 h-4" style={{ color: "var(--text-primary)" }} />
              </button>
              <h3 className="font-extrabold text-base flex-1" style={{ color: "var(--text-primary)" }}>Citar publicação</h3>
              <button onClick={() => doRepost(quoteText)} disabled={!quoteText.trim() || loading}
                className="px-4 h-8 rounded-full text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${ACCENT_COLOR}, #E94B8A)` }}>
                {loading
                  ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : "Publicar"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
              <div className="flex gap-3 mb-4">
                <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: ACCENT_COLOR }}>
                  {me?.username?.[0]?.toUpperCase() ?? "?"}
                </div>
                <textarea
                  autoFocus
                  value={quoteText}
                  onChange={e => setQuoteText(e.target.value)}
                  maxLength={280}
                  placeholder="Adiciona o teu comentário…"
                  rows={3}
                  className="flex-1 resize-none outline-none text-sm leading-relaxed bg-transparent"
                  style={{ color: "var(--text-primary)" }}
                />
              </div>

              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
                <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
                  <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: avatarColor(post.user) }}>
                    {post.avatar_url
                      ? <img src={post.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (post.user?.[0] ?? "?").toUpperCase()}
                  </div>
                  <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{post.user}</p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>@{post.author_username}</p>
                </div>
                {post.text && (
                  <p className="px-3 pb-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {post.text.length > 120 ? post.text.slice(0, 120) + "…" : post.text}
                  </p>
                )}
                {post.photo && (
                  <img src={post.photo} alt="" className="w-full object-cover max-h-40" />
                )}
              </div>

              <div className="flex justify-end mt-2">
                <span className="text-xs" style={{ color: quoteText.length > 260 ? "#ef4444" : "var(--text-muted)" }}>
                  {quoteText.length}/280
                </span>
              </div>
            </div>
          </>
        )}

        {mode === "done" && (
          <div className="flex flex-col items-center gap-3 py-10 px-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: alreadyReposted ? "#ef444415" : `${ACCENT_COLOR}15` }}>
              <Repeat2 className="w-7 h-7" style={{ color: alreadyReposted ? "#ef4444" : ACCENT_COLOR }} />
            </div>
            <p className="font-extrabold text-base text-center" style={{ color: "var(--text-primary)" }}>
              {alreadyReposted ? "Repost removido" : "Repostado!"}
            </p>
            <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
              {alreadyReposted ? "A publicação foi removida do teu feed." : "Os teus seguidores já podem ver esta publicação."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Reencaminhar por mensagem ── */
function ForwardModal({ post, me, onClose }: { post: any; me: any; onClose: () => void }) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [linkCopied, setLinkCopied] = useState(false);
  useScrollLock();

  useEffect(() => {
    if (!me?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("conversations")
        .select("id,participants,updated_at")
        .contains("participants", [me.id])
        .order("updated_at", { ascending: false })
        .limit(30);
      if (!data) return;
      const otherIds = [...new Set(data.flatMap((c: any) => c.participants.filter((p: string) => p !== me.id)))];
      const { data: profs } = await (supabase as any).from("profiles").select("id,username,full_name,avatar_url").in("id", otherIds);
      const profMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { profMap[p.id] = p; });
      setConversations(data.map((c: any) => {
        const otherId = c.participants.find((p: string) => p !== me.id);
        const prof = profMap[otherId] || {};
        return { ...c, otherName: prof.full_name || prof.username || "Utilizador", otherUsername: prof.username, avatar: prof.avatar_url };
      }));
    })();
  }, [me?.id]);

  async function forward(convId: string) {
    if (!me?.id || sending) return;
    setSending(convId);
    const postUrl = `${window.location.origin}/post/${post.id}`;
    const text = `${post.text ? post.text.slice(0, 100) + (post.text.length > 100 ? "…" : "") + "\n" : ""}🔗 ${postUrl}`;
    await (supabase as any).from("messages").insert({
      conversation_id: convId, sender_id: me.id,
      content: text, type: "text",
    });
    setSent(s => new Set([...s, convId]));
    setSending(null);
  }

  const filtered = conversations.filter(c =>
    !search || c.otherName?.toLowerCase().includes(search.toLowerCase()) || c.otherUsername?.toLowerCase().includes(search.toLowerCase())
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full lg:max-w-sm lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet"
        style={{ maxHeight: "92vh", height: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>{t("post.forward", "Partilhar publicação")}</span>
          <button onClick={onClose} className="p-1.5 rounded-full transition" style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">

          <div className="mx-4 mt-3 p-3 rounded-2xl border text-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
            <p className="font-semibold text-xs mb-1" style={{ color: "var(--text-muted)" }}>@{post.author_username}</p>
            <p className="line-clamp-2">{post.text || (post.photo ? "📷 Foto" : post.video ? "🎥 Vídeo" : "Publicação")}</p>
          </div>

          <div className="px-4 pt-3">
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Link da publicação</p>
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mb-3" style={{ background: "var(--s2)" }}>
              <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }}>
                {`${window.location.origin}/post/${post.id}`}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 flex items-center gap-1"
                style={{ background: linkCopied ? "#6BA547" : "#5B3FCF", color: "#fff" }}>
                {linkCopied ? (<><Check className="h-3.5 w-3.5" /> Copiado</>) : "Copiar"}
              </button>
            </div>

            {typeof navigator.share === "function" && (
              <button
                onClick={() => {
                  navigator.share({
                    title: `Publicação de ${post.author_name ?? post.author_username}`,
                    text: post.text || "Vê esta publicação na Hooda",
                    url: `${window.location.origin}/post/${post.id}`,
                  }).catch(() => {});
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition active:scale-[0.98] border mb-1"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
                <Share2 className="h-4 w-4" /> Partilhar via...
              </button>
            )}
          </div>

          <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Enviar para conversa
          </p>
          <div className="px-4 py-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t("messages.search_user", "@username ou nome")}
              className="w-full px-4 h-9 rounded-full text-sm outline-none border"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          </div>
          <div className="px-2 pb-4">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>{t("messages.no_conversations", "Sem conversas")}</p>
            ) : filtered.map(c => (
              <button key={c.id} onClick={() => forward(c.id)} disabled={!!sending || sent.has(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition hover:bg-[var(--s2)] active:scale-[0.98]">
                <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ background: "#5B3FCF" }}>
                  {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.otherName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.otherName}</p>
                  {c.otherUsername && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>@{c.otherUsername}</p>}
                </div>
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition"
                  style={sent.has(c.id) ? { background: "#6BA54720", color: "#6BA547" } : { background: "var(--s3)", color: "var(--text-muted)" }}>
                  {sending === c.id
                    ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "#5B3FCF", borderTopColor: "transparent" }} />
                    : sent.has(c.id) ? <Check className="w-4 h-4" /> : <Forward className="w-4 h-4" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Card especial para clipes de vídeo partilhados como publicação ── */
function ClipCard({ p, liked, likeCount, viewCount, onLike, onComment }: {
  p: any; liked: boolean; likeCount: number; viewCount: number;
  onLike: () => void; onComment: () => void;
}) {
  const navigate = useNavigate();

  function fmt(s: number) {
    const m = Math.floor((s ?? 0) / 60), sec = Math.floor((s ?? 0) % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  const [clipVideoSrc, setClipVideoSrc] = useState<string | null>(null);
  useEffect(() => {
    if (p.kind !== "clip" || !p.clip_video_id) return;
    (supabase as any).from("videos").select("cf_stream_url,cf_embed_url,video_path").eq("id", p.clip_video_id).maybeSingle()
      .then(({ data }: any) => {
        if (data) setClipVideoSrc(data.cf_stream_url || data.video_path || null);
      });
  }, [p.clip_video_id]);
  const streamSrc = p.kind === "clip" ? clipVideoSrc : (p.video_stream_url || p.cf_stream_url || null);
  const dur = fmt((p.clip_end ?? 0) - (p.clip_start ?? 0));

  return (
    <article className="hooda-card overflow-hidden animate-fade-in-up">
      <button
        onClick={() => p.channel_handle && navigate({ to: `/hoodatv/canal/${p.channel_handle}` })}
        className="flex items-center gap-2.5 px-3 py-3 w-full text-left transition active:scale-[0.99]"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: "#5B3FCF20" }}>
          {p.channel_avatar
            ? <img src={p.channel_avatar} alt="" className="w-full h-full object-cover" />
            : <span className="font-bold" style={{ color: "#5B3FCF" }}>
                {p.channel_name?.[0]?.toUpperCase() ?? "?"}
              </span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>
            {p.channel_name ?? "Canal"}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            @{p.channel_handle} · HoodaTV
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold shrink-0"
          style={{ background: "#5B3FCF15", color: "#5B3FCF" }}>
          ✂ Clipe · {dur}
        </span>
      </button>

      {streamSrc ? (
        <FeedVideoPlayer src={streamSrc} poster={p.clip_thumb_url || p.thumbnail_url || undefined} postId={p.id} kind="clip" />
      ) : (
        <button
          className="w-full relative block"
          style={{ aspectRatio: "16/9", background: "#000" }}
          onClick={() => p.clip_video_id && navigate({ to: `/hoodatv/watch/${p.clip_video_id}` })}>
          {(p.clip_thumb_url || p.thumbnail_url)
            ? <img src={p.clip_thumb_url || p.thumbnail_url} alt=""
                className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center">
                <svg className="h-10 w-10 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
              <svg className="h-6 w-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white"
            style={{ background: "rgba(0,0,0,0.78)" }}>
            {fmt(p.clip_start ?? 0)} – {fmt(p.clip_end ?? 0)}
          </div>
        </button>
      )}

      <div className="px-3 pt-2.5 pb-3">
        {p.clip_title && (
          <p className="font-semibold text-sm mb-2 leading-snug" style={{ color: "var(--text-primary)" }}>
            {p.clip_title}
          </p>
        )}

        <button
          onClick={() => p.author_username && navigate({ to: "/u/$username", params: { username: p.author_username } })}
          className="flex items-center gap-1.5 mb-2.5 transition-opacity hover:opacity-70">
          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0"
            style={{ background: p.author_color || "#5B3FCF" }}>
            {p.avatar_url
              ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-[8px] font-bold text-white flex items-center justify-center h-full">
                  {p.author_username?.[0]?.toUpperCase()}
                </span>}
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Partilhado por{" "}
            <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
              @{p.author_username}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-0.5 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="flex items-center gap-1 text-xs font-semibold px-2" style={{ color: "var(--text-muted)" }}>
            <BarChart3 className="h-3.5 w-3.5" />{(viewCount ?? 0).toLocaleString("pt-PT")}
          </span>
          <button onClick={onLike}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90 group">
            <Heart className={`h-5 w-5 transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : "group-hover:text-red-400"}`}
              style={{ color: liked ? undefined : "var(--text-primary)" }} />
            <span className="text-xs font-semibold"
              style={{ color: liked ? "#ef4444" : "var(--text-muted)" }}>
              {likeCount}
            </span>
          </button>
          <button onClick={onComment}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90">
            <MessageCircle className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{p.comments ?? 0}</span>
          </button>
          <button
            onClick={() => navigator.share?.({
              title: p.clip_title ?? "Clipe HoodaTV",
              url: `${window.location.origin}/hoodatv/watch/${p.clip_video_id}`,
            }).catch(() => {})}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90">
            <Share2 className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
          </button>

          <div className="flex-1" />

          {p.clip_video_id && (
            <button
              onClick={() => navigate({ to: `/hoodatv/watch/${p.clip_video_id}` })}
              className="text-xs font-bold px-3 py-1.5 rounded-xl transition active:scale-95"
              style={{ color: "#5B3FCF", background: "#5B3FCF10" }}>
              Ver completo →
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UNIVERSAL POST CARD
   Componente único responsável por renderizar publicações em toda
   a plataforma: Home, Explorar, Perfil, u/$username, post/$id, etc.
═══════════════════════════════════════════════════════════════ */
export function UniversalPostCard({ post: p, onDeleted, onBookmarkChange }: {
  post: NormalizedPost;
  onDeleted?: (id: string) => void;
  onBookmarkChange?: (id: string, bookmarked: boolean) => void;
}) {
  const dwellRef = useRef<{ start: number; recorded: boolean }>({ start: 0, recorded: false });
  const viewRecordedRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        dwellRef.current.start = Date.now();
        // Views para conteúdo sem vídeo: conta ao aparecer no ecrã
        // (posts kind="video"/"clip" são contados pelo FeedVideoPlayer,
        // que usa tempo assistido em vez de simples aparição).
        if (!viewRecordedRef.current && p.kind !== "video" && p.kind !== "clip") {
          viewRecordedRef.current = true;
          (supabase as any).rpc("record_post_view", {
            p_post_id: p.id,
            p_viewer_fingerprint: getViewerFingerprint(),
          }).then(({ data }: any) => {
            if (data?.counted) setViewCount((c: number) => c + 1);
          }).catch(() => {});
        }
      } else if (dwellRef.current.start > 0 && !dwellRef.current.recorded) {
        const dwell_ms = Date.now() - dwellRef.current.start;
        if (dwell_ms > 1500) {
          dwellRef.current.recorded = true;
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            (supabase as any).from("post_impressions").upsert({
              user_id: user.id,
              post_id: p.id,
              author_id: p.author_id,
              dwell_ms,
            }, { onConflict: "user_id,post_id", ignoreDuplicates: false }).then(() => {});
          });
        }
        dwellRef.current.start = 0;
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [p.id, p.author_id, p.kind]);

  const [showComments, setShowComments] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [repostCount, setRepostCount] = useState(p.reposts_count ?? 0);
  const [didRepost, setDidRepost] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const qc = useQueryClient();
  type PC = import("@/components/PostCommentsModal").PostComment;
  const meRef = useRef<{ id: string; username: string } | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const { liked, likeCount, toggle: toggleLikeShared } = usePostLikeState(p.id, myUserId, { liked: p.liked_by_me ?? false, count: p.likes ?? 0 });
  const { isFollowing: following, isLoading: followLoading, toggle: toggleFollow } = useFollowState(myUserId, p.author_username, p.author_id);
  const [commentCount, setCommentCount] = useState(p.comments ?? 0);
  const [viewCount, setViewCount] = useState(Number(p.views_count ?? 0));
  const isAd = !!p.ad || !!p.is_ad;
  const isOwnPost = !!myUserId && myUserId === p.author_id;
  const navigate = useNavigate();
  const timeLabel = useTimeAgo((p as any).created_at);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
      meRef.current = { id: session.user.id, username: (prof as any)?.username || "eu" };
      setMyUserId(session.user.id);
      const { data: saveRow } = await supabase.from("post_saves").select("id").eq("post_id", p.id).eq("user_id", session.user.id).maybeSingle();
      setBookmarked(!!saveRow);
    })();
  }, [p.id]);

  useEffect(() => {
    if (showComments) {
      pauseAllVideos();
    }
  }, [showComments]);

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: QUERY_KEYS.comments(p.id),
    queryFn: () => fetchPostComments(p.id, meRef.current?.id),
    enabled: showComments && !isAd,
    ...REALTIME_QUERY_OPTIONS,
  });

  function setComments(updater: PC[] | ((prev: PC[]) => PC[])) {
    qc.setQueryData<PC[]>(QUERY_KEYS.comments(p.id), (prev) =>
      typeof updater === "function" ? (updater as (prev: PC[]) => PC[])(prev ?? []) : updater);
  }

  async function handleSendComment(text: string) {
    const me = meRef.current;
    if (!me) { toast.error("Inicia sessão para comentar."); return; }
    setSendingComment(true);
    const created = await sendPostComment({ postId: p.id, userId: me.id, username: me.username, text });
    if (created) {
      setComments((prev) => [...prev, created]);
      setCommentCount((n) => n + 1);
      if (text.includes("@")) notifyMentions({ text, authorId: me.id, authorUsername: me.username, postId: p.id, commentId: created.id });
    }
    setSendingComment(false);
  }

  async function handleReplyComment(parentId: string, text: string) {
    const me = meRef.current;
    if (!me) return;
    const created = await replyToPostComment({ postId: p.id, parentCommentId: parentId, userId: me.id, username: me.username, text });
    if (!created) return;
    setComments((prev) => prev.map((c) => c.id === parentId ? { ...c, replies: [...(c.replies || []), created] } : c));
    setCommentCount((n) => n + 1);
    if (text.includes("@")) notifyMentions({ text, authorId: me.id, authorUsername: me.username, postId: p.id, commentId: created.id });
  }

  async function handleLikeComment(commentId: string) {
    const me = meRef.current;
    if (!me) return;
    function patch(list: PC[]): PC[] {
      return list.map((c) => {
        if (c.id === commentId) {
          const nowLiked = !c.likedByMe;
          return { ...c, likedByMe: nowLiked, likeCount: (c.likeCount || 0) + (nowLiked ? 1 : -1) };
        }
        return { ...c, replies: c.replies ? patch(c.replies) : c.replies };
      });
    }
    const target = comments.flatMap((c) => [c, ...(c.replies || [])]).find((c) => c.id === commentId);
    setComments((prev) => patch(prev));
    await toggleCommentLike(commentId, me.id, !!target?.likedByMe);
  }

  async function toggleLike() {
    if (!myUserId) { toast.error("Inicia sessão para gostar."); return; }
    await toggleLikeShared();
  }

  async function toggleBookmark() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Inicia sessão para guardar."); return; }
    const next = !bookmarked;
    setBookmarked(next);
    if (!next) {
      await supabase.from("post_saves").delete().eq("post_id", p.id).eq("user_id", session.user.id);
    } else {
      await supabase.from("post_saves").insert({ post_id: p.id, user_id: session.user.id } as any);
    }
    onBookmarkChange?.(p.id, next);
  }

  async function handleDelete() {
    setShowMenu(false);
    setDeleting(true);
    const ok = await deletePostForEveryone(p.id);
    setDeleting(false);
    if (ok) { toast.success("Publicação eliminada."); onDeleted?.(p.id); }
    else toast.error("Não foi possível eliminar a publicação. Tenta novamente.");
  }

  // Card especial para clipes
  if (p.kind === "clip" && p.clip_video_id) {
    return (
      <ClipCard p={p} liked={liked} likeCount={likeCount} viewCount={viewCount}
        onLike={toggleLike}
        onComment={() => setShowComments(true)}
      />
    );
  }


  return (
    <article ref={cardRef} className="hooda-card overflow-hidden animate-fade-in-up">

      {p.reposted_by_name && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
          <Repeat2 className="h-3.5 w-3.5" style={{ color: "#1FAFA6" }} />
          <span className="text-[11px] font-semibold" style={{ color: "#1FAFA6" }}>
            {p.reposted_by_name} repostou
          </span>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <ProfileAvatarLink userId={p.author_id ?? ""} username={p.author_username ?? ""}>
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white text-sm"
              style={{ background: p.color || "#5B3FCF" }}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                : (p.user?.[0] ?? "?").toUpperCase()}
            </div>
          </ProfileAvatarLink>
          <div className="min-w-0">
            <ProfileAvatarLink userId={p.author_id ?? ""} username={p.author_username ?? ""} className="inline-flex">
              <span className="text-sm font-bold hover:underline" style={{ color: "var(--text-primary)" }}>
                {p.user}
                {isAd && <span className="text-[9px] uppercase bg-[var(--s2)] text-[var(--text-muted)] px-1.5 py-0.5 rounded font-semibold ml-1">Patrocinado</span>}
              </span>
            </ProfileAvatarLink>
            {(p.name || timeLabel) && <p className="text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>{p.name}{p.name && timeLabel ? " · " : ""}{timeLabel}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!isAd && p.author_id && !isOwnPost && (
            <button onClick={toggleFollow} disabled={followLoading}
              className="text-xs font-bold px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={following
                ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                : followLoading
                  ? { background: "var(--s2)", color: "var(--text-muted)", border: "1.5px solid var(--border-subtle)", opacity: 0.5 }
                  : { background: "#5B3FCF", color: "#fff", boxShadow: "0 2px 8px rgba(91,63,207,0.35)" }}>
              {followLoading ? "+ Seguir" : following ? "A seguir ✓" : "+ Seguir"}
            </button>
          )}
          {!isAd && isOwnPost && (
            <div className="relative">
              <button onClick={() => setShowMenu(v => !v)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition"
                style={{ color: "var(--text-muted)" }}>
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-9 rounded-2xl shadow-xl border z-40 min-w-[180px] overflow-hidden"
                    style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
                    {p.text && (
                      <button onClick={() => { navigator.clipboard?.writeText(p.text ?? ""); setShowMenu(false); toast.success("Texto copiado!"); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition"
                        style={{ color: "var(--text-secondary)" }}>
                        <Copy className="h-4 w-4" style={{ color: "var(--text-muted)" }} /> Copiar texto
                      </button>
                    )}
                    <button onClick={handleDelete} disabled={deleting}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left border-t disabled:opacity-50 transition"
                      style={{ color: "#dc2626", borderColor: "var(--border-subtle)" }}>
                      <Trash2 className="h-4 w-4" />
                      {p.kind === "clip" ? "Remover clipe do feed" : "Apagar publicação"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Vídeo */}
      {p.video && (
        <div className="pb-3 md:px-4">
          {p.is_sensitive && p.moderation_status ? (
            <SensitiveContentOverlay category={p.moderation_status} minHeight={260}>
              <FeedVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" rounded="rounded-2xl" />
            </SensitiveContentOverlay>
          ) : (
            <FeedVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" rounded="rounded-2xl" />
          )}
        </div>
      )}

      {/* Texto */}
      {p.text && !p.video && !p.photo && !(p.photos && p.photos.length > 0) && p.is_sensitive && p.moderation_status ? (
        <div className="px-4 pb-3">
          <SensitiveContentOverlay category={p.moderation_status} minHeight={90}>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <RichText text={p.text} />
            </p>
          </SensitiveContentOverlay>
        </div>
      ) : p.text && !p.video && (p.bg_color
        ? <div className="px-4 pb-3">
            <div className="rounded-2xl px-5 py-6 flex items-center justify-center min-h-28" style={{ background: p.bg_color }}>
              <RichText text={p.text} className="text-white font-bold text-lg text-center leading-snug" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
            </div>
          </div>
        : p.kind === "quote"
          ? <div className="px-4 pb-3">
              <div className="rounded-2xl bg-[#FFC93C] px-5 py-5">
                <RichText text={p.text} className="text-base italic font-medium text-black leading-relaxed" />
              </div>
            </div>
          : <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <RichText text={p.text} />
            </p>
      )}
      {p.text && p.video && (
        <p className="px-4 py-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <RichText text={p.text} />
        </p>
      )}

      {/* Fotos */}
      {(p.photos && p.photos.length > 0) || (p.photo && !p.photos && !p.video) ? (
        p.is_sensitive && p.moderation_status ? (
          <div className="px-0">
            <SensitiveContentOverlay category={p.moderation_status} minHeight={260}>
              <PhotoGrid photos={p.photos && p.photos.length > 0 ? p.photos : [p.photo!]} />
            </SensitiveContentOverlay>
          </div>
        ) : (
          <PhotoGrid photos={p.photos && p.photos.length > 0 ? p.photos : [p.photo!]} />
        )
      ) : null}

      {/* Enquete */}
      {p.poll && (
        <div className="px-4 pb-3">
          <PollCard postId={p.id} question={p.poll.question} options={p.poll.options ?? []} endsAt={p.poll_ends_at ?? undefined} />
        </div>
      )}

      {isAd && (
        <>
          <div className="mx-4 mb-3 rounded-2xl bg-orange-50 flex items-center justify-center" style={{ height: 120, fontSize: 48 }}>📖</div>
          <div className="px-4 pb-4">
            <button className="w-full h-11 rounded-xl bg-black text-white text-sm font-bold">Saber mais</button>
          </div>
        </>
      )}
      {/* Música */}
      {!isAd && p.music_title && (
        <div className="mx-4 mb-3 flex items-center gap-3 px-3 py-2.5 rounded-xl music-bar-post" style={{ background: "var(--s3)" }}>
          <div className="h-9 w-9 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--s2)]/10">
            {p.music_cover ? <img loading="lazy" decoding="async" src={p.music_cover} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="h-full w-full flex items-center justify-center">🎵</div>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{p.music_title}</p>
            <p className="text-white/50 text-[10px] truncate">{p.music_artist ?? "hooda music"}</p>
          </div>
          <Music className="h-4 w-4 text-[#5B3FCF] flex-shrink-0" />
        </div>
      )}
      {!isAd && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-50">
          <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-[var(--s1)]">
            <MessageCircle className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold text-[var(--text-muted)]">{commentCount}</span>
          </button>
          {!isOwnPost && (
            <button onClick={() => setShowRepost(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 hover:bg-[var(--s1)]">
              <Repeat2 className="h-5 w-5" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }} />
              <span className="text-xs font-semibold" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }}>{repostCount}</span>
            </button>
          )}
          <button onClick={toggleLike}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : "hover:bg-[var(--s1)]"}`}>
            <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-[var(--text-muted)]"}`} />
            <span className="text-xs font-semibold" style={{ color: liked ? "#ef4444" : "var(--text-muted)" }}>{likeCount}</span>
          </button>
          <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            <BarChart3 className="h-5 w-5" />{viewCount.toLocaleString("pt-PT")}
          </span>
          <div className="flex items-center gap-0.5">
            <button onClick={toggleBookmark} className="p-2 rounded-full hover:bg-[var(--s1)] transition">
              {bookmarked
                ? <BookmarkCheck className="h-5 w-5" style={{ color: "#5B3FCF" }} />
                : <Bookmark className="h-5 w-5 text-[var(--text-muted)]" />}
            </button>
            <button onClick={() => setShowForward(true)} className="p-2 rounded-full hover:bg-[var(--s1)] transition">
              <Share2 className="h-5 w-5 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>
      )}
      {showRepost && (
        <RepostModal
          post={p}
          me={meRef.current}
          onClose={() => setShowRepost(false)}
          onReposted={(count, did) => { setRepostCount(count); setDidRepost(did); }}
        />
      )}
      {showForward && <ForwardModal post={p} me={meRef.current} onClose={() => setShowForward(false)} />}
      {showComments && (
        <PostCommentsModal
          onClose={() => setShowComments(false)}
          creatorId={p.author_id ?? undefined}
          hasMedia={!!(p.video || p.photo || (p.photos && p.photos.length > 0))}
          header={
            <div className="flex items-center gap-3 pb-2">
              <ProfileAvatarLink userId={p.author_id ?? ""} username={p.author_username ?? ""}>
                <div className="h-9 w-9 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: p.color }}>
                  {p.avatar_url
                    ? <img loading="lazy" decoding="async" src={p.avatar_url} alt={p.user} className="w-full h-full object-cover" />
                    : <span className="text-white font-bold text-sm">{(p.user?.[0] ?? "?").toUpperCase()}</span>}
                </div>
              </ProfileAvatarLink>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{p.user}</p>
                {(p.name || timeLabel) && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.name}{p.name && timeLabel ? " · " : ""}{timeLabel}</p>}
              </div>
            </div>
          }
          body={
            <>
              {p.video && (
                <div className="pb-3 md:px-4">
                  <FeedVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" rounded="rounded-2xl" forceLoad={true} maxHeightRatio={0.42} />
                </div>
              )}
              {p.text && !p.video && (p.bg_color
                ? <div className="px-4 pb-3">
                    <div className="rounded-2xl px-5 py-6 flex items-center justify-center min-h-28" style={{ background: p.bg_color }}>
                      <p className="text-white font-bold text-lg text-center leading-snug">{p.text}</p>
                    </div>
                  </div>
                : <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{p.text}</p>
              )}
              {p.text && p.video && (
                <p className="px-4 py-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{p.text}</p>
              )}
              {p.photos && p.photos.length > 0 && <PhotoGrid photos={p.photos} />}
              {p.photo && !p.photos && !p.video && <PhotoGrid photos={[p.photo]} />}

              {p.poll && (
                <div className="px-4 pb-3">
                  <PollCard postId={p.id} question={p.poll.question} options={p.poll.options ?? []} endsAt={p.poll_ends_at ?? undefined} />
                </div>
              )}

              <div className="flex items-center gap-3 px-4 pt-2">
                <p className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  <BarChart3 className="h-3 w-3 inline mr-1 mb-0.5" />{viewCount.toLocaleString("pt-PT")} visualizaç{viewCount === 1 ? "ão" : "ões"}
                </p>
                <p className="text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>
                  <Heart className={`h-3 w-3 inline mr-1 mb-0.5 ${liked ? "fill-red-500 text-red-500" : ""}`} />{likeCount} curtida{likeCount !== 1 ? "s" : ""}
                </p>
              </div>
            </>
          }
          actions={
            <div className="flex items-center justify-between pt-2 pb-1">
              {!isOwnPost && (
                <button onClick={() => setShowRepost(true)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 hover:bg-[var(--s1)]">
                  <Repeat2 className="h-5 w-5" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }} />
                  <span className="text-xs font-semibold" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }}>{repostCount}</span>
                </button>
              )}
              <button onClick={toggleLike}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : "hover:bg-[var(--s1)]"}`}>
                <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-[var(--text-muted)]"}`} />
                <span className="text-xs font-semibold" style={{ color: liked ? "#ef4444" : "var(--text-muted)" }}>{likeCount}</span>
              </button>
              <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                <BarChart3 className="h-5 w-5" />{viewCount.toLocaleString("pt-PT")}
              </span>
              <Share2 className="h-5 w-5 text-[var(--text-muted)]" />
            </div>
          }
          comments={comments}
          loading={commentsLoading}
          sending={sendingComment}
          onSend={handleSendComment}
          onReply={handleReplyComment}
          onLikeComment={handleLikeComment}
        />
      )}
    </article>
  );
}
