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
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Send, Eye,
  Trash2, Layers, Smile, Sliders, SlidersHorizontal,
  Bookmark, BookmarkCheck, Forward, Repeat2,
} from "lucide-react";
import { MusicLibrary, type Song } from "@/components/MusicLibrary";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { QUERY_KEYS, FEED_QUERY_OPTIONS, STATIC_QUERY_OPTIONS, REALTIME_QUERY_OPTIONS } from "@/lib/queryClient";
import { FeedSkeleton, BackgroundRefreshDot } from "@/components/Skeletons";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useScrollLock } from "@/hooks/useScrollLock";
import { ComposeBox } from "@/components/QuickComposer";
function t(key: string, opts?: Record<string, unknown>) { return i18n.t(key, opts) as string; }

/* ── RichText — renderiza @menções e #hashtags clicáveis ── */
function RichText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const navigate = useNavigate();
  const parts = text.split(/([@#][a-zA-Z0-9_À-ÿ]+)/g);
  return (
    <span className={className} style={style}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const username = part.slice(1);
          return (
            <button key={i} onClick={e => { e.stopPropagation(); navigate({ to: "/u/$username", params: { username } }); }}
              className="font-semibold hover:underline transition-opacity hover:opacity-80"
              style={{ color: "#5B3FCF" }}>
              {part}
            </button>
          );
        }
        if (part.startsWith("#")) {
          const tag = part.slice(1);
          return (
            <button key={i} onClick={e => { e.stopPropagation(); navigate({ to: "/explorar", search: { q: tag } }); }}
              className="font-semibold hover:underline transition-opacity hover:opacity-80"
              style={{ color: "#E94B8A" }}>
              {part}
            </button>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
}

/* ── RepostModal — repost simples ou quote repost ── */
const ACCENT_COLOR = "#5B3FCF";

function RepostModal({ post, me, onClose, onReposted }: {
  post: any; me: any; onClose: () => void;
  onReposted: (count: number, didRepost: boolean) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"menu" | "quote" | "done">("menu");
  const [quoteText, setQuoteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [alreadyReposted, setAlreadyReposted] = useState(false);

  // Verificar se já repostou
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
      // Desfazer repost
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

        {/* ── MENU INICIAL ── */}
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

            {/* Preview do post original */}
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

            {/* Opções */}
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

        {/* ── QUOTE REPOST ── */}
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
              {/* Caixa de texto */}
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

              {/* Post original encaixado */}
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

              {/* Contador de caracteres */}
              <div className="flex justify-end mt-2">
                <span className="text-xs" style={{ color: quoteText.length > 260 ? "#ef4444" : "var(--text-muted)" }}>
                  {quoteText.length}/280
                </span>
              </div>
            </div>
          </>
        )}

        {/* ── CONFIRMAÇÃO ── */}
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
      // Buscar perfis dos outros participantes
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
        {/* Drag indicator mobile */}
        <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>{t("post.forward", "Partilhar publicação")}</span>
          <button onClick={onClose} className="p-1.5 rounded-full transition" style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Conteúdo scrollável: preview + link + partilha nativa + lista de conversas, tudo num scroll só */}
        <div className="overflow-y-auto flex-1">

          {/* Preview do post */}
          <div className="mx-4 mt-3 p-3 rounded-2xl border text-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
            <p className="font-semibold text-xs mb-1" style={{ color: "var(--text-muted)" }}>@{post.author_username}</p>
            <p className="line-clamp-2">{post.text || (post.photo ? "📷 Foto" : post.video ? "🎥 Vídeo" : "Publicação")}</p>
          </div>

          {/* Link directo */}
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
          {/* Pesquisa */}
          <div className="px-4 py-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t("messages.search_user", "@username ou nome")}
              className="w-full px-4 h-9 rounded-full text-sm outline-none border"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          </div>
          {/* Lista de conversas */}
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

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: HomePage,
});

/* ─── Constants ─── */
const POSTS: any[] = []; // feed carregado do Supabase em HomePage

/* ─── Feed Components ─── */
function LikeButton({ n }: { n: number }) {
  const [liked, setLiked] = useState(false);
  const [pop, setPop] = useState(false);
  return (
    <button onClick={() => { setLiked((v) => !v); setPop(true); setTimeout(() => setPop(false), 350); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{ background: liked ? "#fff0f5" : "transparent" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? "#E94B8A" : "none"}
        stroke={liked ? "#E94B8A" : "#888"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: "transform 0.2s", transform: pop ? "scale(1.5)" : liked ? "scale(1.15)" : "scale(1)" }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span className="text-xs font-semibold" style={{ color: liked ? "#E94B8A" : "#888" }}>
        {(liked ? n + 1 : n).toLocaleString("pt-PT")}
      </span>
    </button>
  );
}

function BookmarkButton() {
  const [saved, setSaved] = useState(false);
  return (
    <button onClick={() => setSaved((v) => !v)} className="p-2 rounded-full"
      style={{ background: saved ? "#f0edff" : "transparent" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? "#5B3FCF" : "none"}
        stroke={saved ? "#5B3FCF" : "#888"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

/* ── Instagram-style photo carousel ── */
function PhotoGrid({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const n = photos.length;
  if (n === 0) return null;

  return (
    <>
      {/* ── Instagram-style: adapts to image ratio ── */}
      <div className="relative w-full select-none">

        {/* Image container: adapts naturally to image — no cropping */}
        <div className="relative w-full cursor-pointer"
          style={{ minHeight: 200 }}
          onClick={() => setFullscreen(true)}>
          <img loading="lazy" decoding="async" src={photos[idx]}
            alt=""
            className="w-full block"
            style={{ display: "block", minHeight: 200 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />

          {/* Counter top-right */}
          {n > 1 && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-white text-xs font-bold z-10"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              {idx + 1} / {n}
            </div>
          )}

          {/* Left arrow */}
          {idx > 0 && (
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full flex items-center justify-center z-10 shadow-lg transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.88)" }}
              onClick={e => { e.stopPropagation(); setIdx(i => i - 1); }}>
              <ChevronLeft className="h-5 w-5 text-black" />
            </button>
          )}

          {/* Right arrow */}
          {idx < n - 1 && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full flex items-center justify-center z-10 shadow-lg transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.88)" }}
              onClick={e => { e.stopPropagation(); setIdx(i => i + 1); }}>
              <ChevronRight className="h-5 w-5 text-black" />
            </button>
          )}
        </div>

        {/* Dot indicators */}
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

      {/* Fullscreen viewer */}
      {fullscreen && (
        <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: "#000" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-white/60 text-sm font-semibold">{idx + 1} / {n}</span>
            <button onClick={() => setFullscreen(false)}
              className="h-9 w-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)" }}>
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
          {/* Main image */}
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
          {/* Thumbnails */}
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

/* ── Card de Clipe no Feed ── */
function ClipCard({ p, liked, likeCount, viewCount, onLike, onComment }: {
  p: any; liked: boolean; likeCount: number; viewCount: number;
  onLike: () => void; onComment: () => void;
}) {
  const navigate = useNavigate();

  function fmt(s: number) {
    const m = Math.floor((s ?? 0) / 60), sec = Math.floor((s ?? 0) % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // URL de stream: para clipes, busca o vídeo original; para posts normais usa campos directos
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

      {/* ── Cabeçalho do canal ── */}
      <button
        onClick={() => p.channel_handle && navigate({ to: `/hoodatv/canal/${p.channel_handle}` })}
        className="flex items-center gap-2.5 px-3 py-3 w-full text-left transition active:scale-[0.99]"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {/* Avatar canal */}
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
        {/* Badge clipe */}
        <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold shrink-0"
          style={{ background: "#5B3FCF15", color: "#5B3FCF" }}>
          ✂ Clipe · {dur}
        </span>
      </button>

      {/* ── Player do clipe ── */}
      {streamSrc ? (
        <FeedVideoPlayer src={streamSrc} poster={p.clip_thumb_url || p.thumbnail_url || undefined} postId={p.id} kind="clip" />
      ) : (
        /* Sem stream URL — mostra thumbnail clicável que vai para o vídeo */
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
          {/* Overlay play */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
              <svg className="h-6 w-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* Badge tempo */}
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white"
            style={{ background: "rgba(0,0,0,0.78)" }}>
            {fmt(p.clip_start ?? 0)} – {fmt(p.clip_end ?? 0)}
          </div>
        </button>
      )}

      {/* ── Título + ações ── */}
      <div className="px-3 pt-2.5 pb-3">
        {/* Título do clipe */}
        {p.clip_title && (
          <p className="font-semibold text-sm mb-2 leading-snug" style={{ color: "var(--text-primary)" }}>
            {p.clip_title}
          </p>
        )}

        {/* Quem partilhou */}
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

        {/* Botões de ação */}
        <div className="flex items-center gap-0.5 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          {/* 👁 Views */}
          <span className="flex items-center gap-1 text-xs font-semibold px-2" style={{ color: "var(--text-muted)" }}>
            <Eye className="h-3.5 w-3.5" />{(viewCount ?? 0).toLocaleString("pt-PT")}
          </span>
          {/* ❤️ Gosto */}
          <button onClick={onLike}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90 group">
            <Heart className={`h-5 w-5 transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : "group-hover:text-red-400"}`}
              style={{ color: liked ? undefined : "var(--text-primary)" }} />
            {likeCount > 0 && (
              <span className="text-xs font-semibold"
                style={{ color: liked ? "#ef4444" : "var(--text-muted)" }}>
                {likeCount}
              </span>
            )}
          </button>
          {/* 💬 Comentar */}
          <button onClick={onComment}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90">
            <MessageCircle className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
          </button>
          {/* ↗️ Partilhar */}
          <button
            onClick={() => navigator.share?.({
              title: p.clip_title ?? "Clipe HoodaTV",
              url: `${window.location.origin}/hoodatv/watch/${p.clip_video_id}`,
            }).catch(() => {})}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition active:scale-90">
            <Share2 className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
          </button>

          <div className="flex-1" />

          {/* Ver vídeo completo */}
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

function PostCard({ p }: { p: any }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  // Dwell time tracking — Fase 2 do algoritmo
  const dwellRef = useRef<{ start: number; recorded: boolean }>({ start: 0, recorded: false });
  const cardRef  = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        dwellRef.current.start = Date.now();
      } else if (dwellRef.current.start > 0 && !dwellRef.current.recorded) {
        const dwell_ms = Date.now() - dwellRef.current.start;
        if (dwell_ms > 1500) { // só regista se ficou mais de 1.5s
          dwellRef.current.recorded = true;
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            (supabase as any).from("post_impressions").upsert({
              user_id:   user.id,
              post_id:   p.id,
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
  }, [p.id, p.author_id]);
  const [showComments, setShowComments] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showRepost, setShowRepost] = useState(false);
  const [repostCount, setRepostCount] = useState(p.reposts_count ?? 0);
  const [didRepost, setDidRepost] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const qc = useQueryClient();
  type PC = import("@/components/PostCommentsModal").PostComment;
  // meRef garante que o valor de "me" está sempre disponível nos handlers
  // mesmo que o componente ainda não tenha re-renderizado após o useEffect
  const meRef = useRef<{ id: string; username: string } | null>(null);
  const [liked, setLiked] = useState(p.liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState(p.likes ?? 0);
  const [viewCount, setViewCount] = useState(Number(p.views_count ?? 0));
  const isAd = !!p.ad;
  const navigate = useNavigate();
  const cardVideoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);
  const cardVideoId = `post-card-${p.id}`;
  const dynamicTime = useTimeAgo(p.created_at);
  const modalVideoId = `post-modal-${p.id}`;

  // Carrega a sessão uma vez — usa ref para evitar race condition nos handlers
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
      meRef.current = { id: session.user.id, username: (prof as any)?.username || "eu" };
    })();
  }, []);

  // Incrementar views do post (uma vez por sessão por post)
  useEffect(() => {
    const key = `post_view_${p.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setViewCount((c: number) => c + 1);
    (supabase as any).from("posts").update({ views_count: (p.views_count ?? 0) + 1 } as any).eq("id", p.id).then(() => {});
  }, [p.id]);

  // Regista o vídeo do card no mediaManager
  useEffect(() => {
    const el = cardVideoRef.current;
    if (!el) return;
    return registerVideo(cardVideoId, el);
  }, [cardVideoId]);

  // Pausa TUDO ao abrir modal; para+reseta o vídeo do modal ao fechar
  useEffect(() => {
    if (showComments) {
      // Pausa todos os vídeos do feed imediatamente
      pauseAllVideos();
      // Regista o vídeo do modal no próximo frame (DOM já montado)
      const frame = requestAnimationFrame(() => {
        const el = modalVideoRef.current;
        if (el) registerVideo(modalVideoId, el);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      // Modal a fechar — para e reseta o vídeo do modal
      const modalEl = modalVideoRef.current;
      if (modalEl) {
        if (!modalEl.paused) modalEl.pause();
        try { modalEl.currentTime = 0; } catch {}
      }
    }
  }, [showComments, modalVideoId]);

  // Carrega comentários quando o modal abre — espera que meRef esteja preenchido.
  // useQuery com cache: reabrir os comentários do mesmo post mostra-os
  // instantaneamente (cache de 15s) enquanto atualiza em segundo plano.
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
    if (!me) return;
    setSendingComment(true);
    const created = await sendPostComment({ postId: p.id, userId: me.id, username: me.username, text });
    if (created) {
      setComments((prev) => [...prev, created]);
      // notificar menções
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
    // notificar menções
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

  // Verificar se já segue este utilizador
  useEffect(() => {
    if (isAd || !p.author_id) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (p.author_id === session.user.id) { setFollowing(null); return; }
      // Tenta por following_id (novo schema) ou target_username (schema antigo)
      const { data: row } = await supabase.from("follows").select("follower_id")
        .eq("follower_id", session.user.id)
        .or(`following_id.eq.${p.author_id},target_username.eq.${p.author_username ?? ""}`)
        .maybeSingle();
      setFollowing(!!row); // sempre sai de null → false ou true
    })();
  }, [p.author_id]);

  async function toggleFollow() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !p.author_username) return;
    if (!p.author_id) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", session.user.id).eq("following_id", p.author_id);
      setFollowing(false);
    } else {
      await supabase.from("follows").upsert({ follower_id: session.user.id, following_id: p.author_id, target_username: p.author_username } as any, { onConflict: "follower_id,target_username", ignoreDuplicates: true });
      setFollowing(true);
    }
  }

  async function toggleLike() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    if (liked) {
      await (supabase as any).from("post_likes").delete().eq("post_id", p.id).eq("user_id", session.user.id);
      setLikeCount((n: number) => n - 1);
    } else {
      await (supabase as any).from("post_likes").insert({ post_id: p.id, user_id: session.user.id });
      setLikeCount((n: number) => n + 1);
    }
    setLiked((v: boolean) => !v);
  }

  // Card especial para clipes
  if (p.kind === "clip" && p.clip_video_id) {
    return (
      <ClipCard p={p} liked={liked} likeCount={likeCount} viewCount={viewCount}
        onLike={async () => {
          if (!meRef.current) return;
          setLiked((l: boolean) => !l);
          setLikeCount((c: number) => liked ? c - 1 : c + 1);
          if (liked) {
            await supabase.from("post_likes").delete().eq("post_id", p.id).eq("user_id", meRef.current!.id);
          } else {
            await supabase.from("post_likes").insert({ post_id: p.id, user_id: meRef.current!.id });
          }
        }}
        onComment={() => setShowComments(true)}
      />
    );
  }

  return (
    <article className="hooda-card overflow-hidden animate-fade-in-up">

      {/* Banner "X repostou" */}
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
          <ProfileAvatarLink userId={p.author_id || p.user_id} username={p.author_username} disableStoryCheck={isAd || !p.author_username}>
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white text-sm"
              style={{ background: p.color || "#5B3FCF" }}>
              {p.avatar_url
                ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover"/>
                : (p.user?.[0] ?? "?").toUpperCase()}
            </div>
          </ProfileAvatarLink>
          <div className="min-w-0">
            <ProfileAvatarLink userId={p.author_id || p.user_id} username={p.author_username} disableStoryCheck={isAd || !p.author_username} className="inline-flex">
              <span className="text-sm font-bold hover:underline" style={{ color: "var(--text-primary)" }}>
                {p.user}
                {isAd && <span className="text-[9px] uppercase bg-[var(--s2)] text-[var(--text-muted)] px-1.5 py-0.5 rounded font-semibold ml-1">Patrocinado</span>}
              </span>
            </ProfileAvatarLink>
            {(p.name || dynamicTime) && <p className="text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>{p.name}{p.name && dynamicTime ? " · " : ""}{dynamicTime}</p>}
          </div>
        </div>
        {!isAd && p.author_id && (
          <button onClick={toggleFollow} disabled={following === null}
            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={following
              ? { background: "var(--s2)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
              : following === null
                ? { background: "var(--s2)", color: "var(--text-muted)", border: "1.5px solid var(--border-subtle)", opacity: 0.5 }
                : { background: "#5B3FCF", color: "#fff", boxShadow: "0 2px 8px rgba(91,63,207,0.35)" }}>
            {following === null ? "+ Seguir" : following ? "A seguir ✓" : "+ Seguir"}
          </button>
        )}
      </div>

      {/* Vídeo */}
      {p.video && (
        <div className="pb-3">
          <FeedVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" rounded="rounded-none" />
        </div>
      )}

      {/* Texto */}
      {p.text && !p.video && (p.bg_color
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
      {p.photos && p.photos.length > 0 && <PhotoGrid photos={p.photos} />}
      {p.photo && !p.photos && !p.video && <PhotoGrid photos={[p.photo]} />}

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
          {/* Comentar */}
          <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-[var(--s1)]">
            <MessageCircle className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold text-[var(--text-muted)]">{p.comments ?? 0}</span>
          </button>
          {/* Repost */}
          <button onClick={() => setShowRepost(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 hover:bg-[var(--s1)]">
            <Repeat2 className="h-5 w-5" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }} />
            {repostCount > 0 && (
              <span className="text-xs font-semibold" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }}>{repostCount}</span>
            )}
          </button>
          {/* Gosto */}
          <button onClick={toggleLike}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : "hover:bg-[var(--s1)]"}`}>
            <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-[var(--text-muted)]"}`} />
            <span className="text-xs font-semibold" style={{ color: liked ? "#ef4444" : "var(--text-muted)" }}>{likeCount}</span>
          </button>
          {/* Visualizações */}
          <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            <Eye className="h-5 w-5" />{viewCount > 0 ? viewCount.toLocaleString("pt-PT") : 0}
          </span>
          <div className="flex items-center gap-0.5">
            <BookmarkButton />
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
          creatorId={p.author_id}
          header={
            <div className="flex items-center gap-3 pb-2">
              <ProfileAvatarLink userId={p.author_id} username={p.author_username} disableStoryCheck={isAd || !p.author_username}>
                <div className="h-9 w-9 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: p.color }}>
                  {p.avatar_url
                    ? <img loading="lazy" decoding="async" src={p.avatar_url} alt={p.user} className="w-full h-full object-cover" />
                    : <span className="text-white font-bold text-sm">{(p.user?.[0] ?? "?").toUpperCase()}</span>}
                </div>
              </ProfileAvatarLink>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{p.user}</p>
                {(p.name || dynamicTime) && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.name}{p.name && dynamicTime ? " · " : ""}{dynamicTime}</p>}
              </div>
            </div>
          }
          body={
            <>
              {p.video && (
                <div className="pb-3">
                  <FeedVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" rounded="rounded-none" />
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
              <div className="flex items-center gap-3 px-4 pt-2">
                {viewCount > 0 && (
                  <p className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                    <Eye className="h-3 w-3 inline mr-1 mb-0.5" />{viewCount.toLocaleString("pt-PT")} visualizaç{viewCount === 1 ? "ão" : "ões"}
                  </p>
                )}
                {likeCount > 0 && (
                  <p className="text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>
                    <Heart className="h-3 w-3 inline mr-1 mb-0.5 fill-red-500 text-red-500" />{likeCount} curtida{likeCount !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </>
          }
          actions={
            <div className="flex items-center justify-between pt-2 pb-1">
              <button onClick={() => setShowRepost(true)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 hover:bg-[var(--s1)]">
                <Repeat2 className="h-5 w-5" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }} />
              </button>
              <button onClick={toggleLike}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : "hover:bg-[var(--s1)]"}`}>
                <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-[var(--text-muted)]"}`} />
              </button>
              <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                <Eye className="h-5 w-5" />{viewCount > 0 ? viewCount.toLocaleString("pt-PT") : 0}
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
        .select("id,author_id,user_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,clip_video_id,clip_start,clip_end,clip_title,channel_id,channel_handle,channel_name,channel_avatar,clip_thumb_url")
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
        };
      });
    }
  }

  const FEED_CHUNK_SIZE = 30;
  const ACCENT_LOCAL = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A","#FFC93C"];
  const POST_SELECT_FIELDS = "id,author_id,user_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,clip_video_id,clip_start,clip_end,clip_title,channel_id,channel_handle,channel_name,channel_avatar,clip_thumb_url,views_count,reposts_count";
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
      // ── Posts em comunidades que faço parte ──
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "community_posts" },
        async (payload: any) => {
          const cp = payload.new;
          if (cp.author_id === myUserId) return;
          // Verificar se sou membro da comunidade
          const { data: membership } = await (supabase as any)
            .from("community_members").select("id").eq("community_id", cp.community_id).eq("user_id", myUserId).maybeSingle();
          if (!membership) return;
          const { data: community } = await (supabase as any)
            .from("communities").select("name").eq("id", cp.community_id).maybeSingle();
          const { data: author } = await supabase.from("profiles").select("username").eq("id", cp.author_id).maybeSingle();
          const name = author?.username || "alguém";
          pushNotif({ type: "community_post", user: name, name, color: hashColor(name), text: `publicou em ${community?.name || "comunidade"}`, detail: cp.content?.slice(0, 60), time: "agora", read: false });
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
              <PostCard p={p} />
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
