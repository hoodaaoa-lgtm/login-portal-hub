import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { HoodaLogo } from "@/components/HoodaLogo";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
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
import { fetchMusic } from "@/lib/api/music.functions";
import { useTimeAgo } from "@/hooks/useTimeAgo";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { QUERY_KEYS, FEED_QUERY_OPTIONS, STATIC_QUERY_OPTIONS, REALTIME_QUERY_OPTIONS } from "@/lib/queryClient";
import { FeedSkeleton, BackgroundRefreshDot, StoriesRowSkeleton } from "@/components/Skeletons";
import { HoodaPlayer } from "@/components/HoodaPlayer";
import { usePostVideoView } from "@/hooks/usePostVideoView";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useScrollLock } from "@/hooks/useScrollLock";
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "var(--s0)", maxHeight: "80vh" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>{t("post.forward", "Reencaminhar")}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        {/* Preview do post */}
        <div className="mx-4 mt-3 p-3 rounded-2xl border text-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
          <p className="font-semibold text-xs mb-1" style={{ color: "var(--text-muted)" }}>@{post.author_username}</p>
          <p className="line-clamp-2">{post.text || (post.photo ? "📷 Foto" : post.video ? "🎥 Vídeo" : "Publicação")}</p>
        </div>
        {/* Pesquisa */}
        <div className="px-4 py-2">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("messages.search_user", "@username ou nome")}
            className="w-full px-4 h-9 rounded-full text-sm outline-none border"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>
        {/* Lista de conversas */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
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
  );
}

export const Route = createFileRoute("/home")({
  head: () => ({ meta: [{ title: "hooda — Home" }] }),
  component: HomePage,
});

/* ─── Types ─── */
type Song = {
  id: string; title: string; artist?: string; category: string;
  url: string; stream_url: string; cover_url: string;
  cover_stream_url?: string; duration?: number;
};
type StoryMusic = {
  music_title: string; music_url: string; music_cover: string;
  music_genre: string; music_artist?: string; start_time?: number;
};
type Story = {
  id?: string;
  name: string; color: string; isYou?: boolean; published?: boolean;
  music?: StoryMusic; photo?: string; bg?: string;
  storyText?: string; bw?: boolean;
  duration?: "1h" | "3h" | "6h" | "24h" | "3d" | "always";
  textAnimation?: "none" | "fade" | "bounce" | "slide" | "glow";
  textOutline?: boolean;
  stickers?: Array<{ emoji: string; x: number; y: number; size: number }>;
  hashtags?: string;
  location?: string;
  neonEffect?: string;
  isAudio?: boolean;
  audioUrl?: string;
  audioTitle?: string;
  textLayers?: TextLayer[];
  filterCss?: string;
  slides?: Story[];
  created_at?: string;
};

type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontCss: string;
  sizePx: number;
  color: string;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
  backdrop: "none" | "shadow" | "box" | "blur";
  rotation: number;
  animation: "none" | "fade" | "bounce" | "slide" | "glow";
  outline: boolean;
};

/* ─── Constants ─── */
const BASE_STORIES: Story[] = [
  { name: "Você", color: "#5B3FCF", isYou: true },
];


const POSTS: any[] = []; // feed carregado do Supabase em HomePage

const GRADIENTS = [
  "linear-gradient(160deg,#2563eb,#7c3aed)",
  "linear-gradient(160deg,#ec4899,#8b5cf6)",
  "linear-gradient(160deg,#f97316,#ec4899)",
  "linear-gradient(160deg,#10b981,#2563eb)",
  "linear-gradient(160deg,#0f172a,#1e3a5f)",
  "linear-gradient(160deg,#7c3aed,#db2777)",
  "linear-gradient(160deg,#dc2626,#7c3aed)",
  "linear-gradient(160deg,#065f46,#1e40af)",
  "linear-gradient(160deg,#fbbf24,#f97316)",
  "linear-gradient(160deg,#6d28d9,#1e40af)",
  "linear-gradient(160deg,#be185d,#9f1239)",
  "linear-gradient(160deg,#111827,#374151)",
];

const FONTS = [
  { label: "Aa", name: "Sans",    css: "system-ui, sans-serif" },
  { label: "Aa", name: "Serif",   css: "Georgia, serif" },
  { label: "Aa", name: "Bold",    css: "'Arial Black', sans-serif" },
  { label: "Aa", name: "Mono",    css: "monospace" },
  { label: "Aa", name: "Script",  css: "cursive" },
];

const TEXT_SIZES = [
  { label: "S",   px: 14 },
  { label: "M",   px: 20 },
  { label: "L",   px: 28 },
  { label: "XL",  px: 38 },
  { label: "2XL", px: 52 },
];

const TEXT_COLORS = ["#ffffff", "#111111", "#FFC93C", "#E94B8A", "#5B3FCF", "#10b981", "#f97316", "#ef4444", "#06b6d4", "#a855f7"];

const FILTERS = [
  { id: "none",   label: "Normal", css: "none" },
  { id: "vivid",  label: "Vívido", css: "saturate(1.6) contrast(1.1)" },
  { id: "warm",   label: "Quente", css: "sepia(0.35) saturate(1.3) brightness(1.05)" },
  { id: "cool",   label: "Frio",   css: "hue-rotate(30deg) saturate(0.85) brightness(0.95)" },
  { id: "fade",   label: "Fade",   css: "brightness(1.15) saturate(0.7) contrast(0.9)" },
  { id: "bw",     label: "P&B",    css: "grayscale(1)" },
  { id: "drama",  label: "Drama",  css: "contrast(1.4) brightness(0.85) saturate(0.7)" },
  { id: "rose",   label: "Rosé",   css: "sepia(0.2) saturate(1.3) hue-rotate(-15deg)" },
];

const THEMES = [
  { id: "dark",     label: "Dark",      bg: "linear-gradient(160deg,#0f172a,#1e293b)" },
  { id: "neon",     label: "Neon",      bg: "linear-gradient(160deg,#0d0221,#190042)" },
  { id: "minimal",  label: "Minimal",   bg: "linear-gradient(160deg,#f8fafc,#e2e8f0)" },
  { id: "gaming",   label: "Gaming",    bg: "linear-gradient(160deg,#0d1117,#1a1f2e)" },
  { id: "sunset",   label: "Pôr do Sol",bg: "linear-gradient(160deg,#f97316,#ec4899)" },
  { id: "oceano",   label: "Oceano",    bg: "linear-gradient(160deg,#0ea5e9,#10b981)" },
  { id: "galaxy",   label: "Galáxia",   bg: "linear-gradient(160deg,#1e1b4b,#312e81)" },
  { id: "forest",   label: "Floresta",  bg: "linear-gradient(160deg,#064e3b,#065f46)" },
  { id: "rosa",     label: "Rosa",      bg: "linear-gradient(160deg,#be185d,#f43f5e)" },
  { id: "ouro",     label: "Ouro",      bg: "linear-gradient(160deg,#92400e,#d97706)" },
];

const NEON_EFFECTS = [
  { id: "none",        label: "Sem efeito" },
  { id: "neon_purple", label: "🟣 Neon roxo" },
  { id: "neon_pink",   label: "🩷 Neon rosa" },
  { id: "neon_blue",   label: "🔵 Neon azul" },
  { id: "glitch",      label: "⚡ Glitch" },
  { id: "brilho",      label: "✨ Brilho" },
];

const STICKER_EMOJIS = [
  "❤️","🔥","💜","✨","😍","🥰","💫","🎵","📖","✍️",
  "🌙","⭐","🎉","💎","🌹","👑","🦋","🌊","⚡","🎭",
  "🫀","🧡","💛","💚","💙","🖤","🤍","💔","💯","🔮",
  "🎨","🎬","🎤","🎧","📝","🌸","🍃","❄️","☀️","🌈",
  "😂","🤣","😭","🙏","🫶","💪","🤙","👀","🫂","🎊",
];

const TEXT_ANIMATIONS = [
  { id: "none",   label: "Nenhum" },
  { id: "fade",   label: "✦ Fade" },
  { id: "bounce", label: "⬆ Bounce" },
  { id: "slide",  label: "▶ Slide" },
  { id: "glow",   label: "🌟 Brilho" },
];

const DURATIONS = [
  { id: "1h",     label: "1 hora" },
  { id: "3h",     label: "3 horas" },
  { id: "6h",     label: "6 horas" },
  { id: "24h",    label: "24 h (padrão)" },
  { id: "3d",     label: "3 dias" },
  { id: "always", label: "Sempre" },
];

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

/* ─── Music Library ─── */
function MusicLibrary({ onSelect, onClose }: { onSelect: (s: Song) => void; onClose: () => void }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);
  useScrollLock();

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMusic({ data: { limit: 50 } })
      .then((r) => {
        const lib = (r.library ?? []) as Song[];
        setSongs(lib);
        if (lib.length === 0) setError("Biblioteca musical vazia.");
      })
      .catch((e) => {
        setSongs([]);
        setError(e instanceof Error ? e.message : "Não foi possível carregar a biblioteca musical.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function togglePreview(song: Song) {
    if (preview?.id === song.id) { preview.audio.pause(); setPreview(null); return; }
    preview?.audio.pause();
    const audio = new Audio(song.url);
    audio.play().catch(() => {});
    audio.onended = () => setPreview(null);
    setPreview({ id: song.id, audio });
  }

  const list = songs.filter((s) =>
    !query || s.title.toLowerCase().includes(query.toLowerCase()) || (s.artist ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="bg-[#18181b] w-full rounded-t-3xl flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <span className="text-white font-bold flex items-center gap-2">
            <Music className="h-4 w-4 text-[#5B3FCF]" /> Biblioteca Musical
          </span>
          <button onClick={() => { preview?.audio.pause(); onClose(); }} className="p-1.5 rounded-full hover:bg-[var(--s2)]/10">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>
        <div className="px-4 py-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar…"
            className="w-full h-10 px-4 rounded-xl bg-[var(--s2)]/10 text-white text-sm placeholder:text-white/30 outline-none" />
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-[#5B3FCF] border-t-transparent animate-spin" />
            </div>
          ) : error && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
              <Music className="h-10 w-10 text-white/20" />
              <p className="text-white/70 text-sm">{error}</p>
              <button onClick={load}
                className="text-xs font-bold px-4 py-2 rounded-full text-white"
                style={{ background: "#5B3FCF" }}>
                Tentar novamente
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-sm">Sem resultados para "{query}".</div>
          ) : list.map((song) => (
            <div key={song.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-11 w-11 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--s2)]/10">
                {song.cover_url
                  ? <img loading="lazy" decoding="async" src={song.cover_url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  : <div className="h-full w-full flex items-center justify-center text-xl">🎵</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{song.title}</p>
                <p className="text-white/40 text-xs truncate">{song.artist ?? song.category}</p>
              </div>
              <button onClick={() => togglePreview(song)} className="p-2 rounded-full bg-[var(--s2)]/10">
                {preview?.id === song.id
                  ? <Pause className="h-3.5 w-3.5 text-white" />
                  : <Play className="h-3.5 w-3.5 text-white" />}
              </button>
              <button onClick={() => { preview?.audio.pause(); onSelect(song); }}
                className="text-xs font-bold px-3 py-1.5 rounded-full text-white"
                style={{ background: "#5B3FCF" }}>
                Usar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Music Start Time Picker (with preview play button) ─── */
function MusicStartPicker({ url, duration, value, onChange }: {
  url: string; duration: number; value: number; onChange: (v: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function togglePreview() {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
    } else {
      const a = new Audio(url);
      a.currentTime = value;
      a.play().catch(() => {});
      audioRef.current = a;
      setPlaying(true);
      // Auto-stop after 5 seconds
      setTimeout(() => {
        a.pause();
        if (audioRef.current === a) { audioRef.current = null; setPlaying(false); }
      }, 5000);
      a.onended = () => { audioRef.current = null; setPlaying(false); };
    }
  }

  // Stop preview when slider changes
  function handleChange(v: number) {
    if (playing) { audioRef.current?.pause(); audioRef.current = null; setPlaying(false); }
    onChange(v);
  }

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <div className="px-1">
      <div className="flex justify-between items-center text-white/40 text-[10px] mb-1.5">
        <span>{"Início da música"}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={togglePreview}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold transition-all"
            style={{
              background: playing ? "rgba(233,75,138,0.3)" : "rgba(91,63,207,0.4)",
              border: playing ? "1px solid rgba(233,75,138,0.6)" : "1px solid rgba(91,63,207,0.5)",
              color: playing ? "#E94B8A" : "#a78bfa",
            }}>
            {playing
              ? <><span style={{ fontSize: 8 }}>■</span> A ouvir…</>
              : <><span style={{ fontSize: 8 }}>▶</span> Ouvir</>}
          </button>
          <span className="font-bold text-white/70">{fmt(value)}</span>
        </div>
      </div>
      <input
        type="range" min={0} max={duration} step={1}
        value={value}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="w-full accent-purple-500 h-1.5"
      />
      <div className="flex justify-between text-white/20 text-[9px] mt-0.5">
        <span>0:00</span>
        <span>{fmt(duration)}</span>
      </div>
    </div>
  );
}

/* ─── Music Bar (shown on story preview / viewer) ─── */
function MusicBar({ music }: { music: StoryMusic }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(14px)" }}>
      {music.music_cover ? (
        <img loading="lazy" decoding="async" src={music.music_cover}
          alt=""
          className="flex-shrink-0 rounded object-cover"
          style={{ width: "1.75rem", height: "1.75rem" }}
          onError={(ev) => {
            const img = ev.currentTarget;
            img.style.display = "none";
            const icon = img.nextElementSibling as HTMLElement | null;
            if (icon) icon.style.display = "block";
          }}
        />
      ) : null}
      <Music
        className="h-3.5 w-3.5 text-white/70 flex-shrink-0"
        style={{ display: music.music_cover ? "none" : "block" }}
      />
      <span className="text-white text-xs font-semibold truncate flex-1">
        {music.music_artist ? `${music.music_artist} · ` : ""}{music.music_title}
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-white/50 flex-shrink-0" />
    </div>
  );
}

/* ─── Animated Waves ─── */
function Waves() {
  return (
    <div className="flex items-end gap-px h-3 flex-shrink-0">
      {[8, 12, 6, 10, 5].map((h, i) => (
        <div key={i} className="w-0.5 rounded-full animate-pulse"
          style={{ height: h, background: "rgba(255,255,255,0.75)", animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }} />
      ))}
    </div>
  );
}

/* ─── Story Creator ─── */


function genId() { return Math.random().toString(36).slice(2, 9); }

type CreatorMode = "picker" | "photo" | "text" | "audio";
type EditorTab = "bg" | "text" | "sticker" | "filter" | "music" | "settings";

function StoryCreator({ onClose, onPublish }: {
  onClose: () => void;
  onPublish: (s: Partial<Story>) => void;
}) {
  // Bloquear scroll do body enquanto o creator está aberto
  useScrollLock(); // bloqueia scroll enquanto modal aberto
  const { avatarUrl: userAvatarUrl } = useAvatar();
  const networkInfo = useNetworkInfo();
  const [mode, setMode] = useState<CreatorMode>("picker");
  const [bg, setBg] = useState(GRADIENTS[0]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [filterIdx, setFilterIdx] = useState(0);
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newFontIdx, setNewFontIdx] = useState(0);
  const [newSizeIdx, setNewSizeIdx] = useState(1);
  const [newColor, setNewColor] = useState("#ffffff");
  const [newAlign, setNewAlign] = useState<"left" | "center" | "right">("center");
  const [newBold, setNewBold] = useState(false);
  const [newItalic, setNewItalic] = useState(false);
  const [newBackdrop, setNewBackdrop] = useState<"none" | "shadow" | "box" | "blur">("shadow");
  const [newAnimation, setNewAnimation] = useState<"none" | "fade" | "bounce" | "slide" | "glow">("none");
  const [newOutline, setNewOutline] = useState(false);
  const [stickers, setStickers] = useState<Array<{ id: string; emoji: string; x: number; y: number; size: number }>>([]);
  const [music, setMusic] = useState<Song | null>(null);
  const [showMusicLib, setShowMusicLib] = useState(false);
  const [musicStartTime, setMusicStartTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioTitle, setAudioTitle] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const [neonEffect, setNeonEffect] = useState("none");
  const [duration, setDuration] = useState<"1h" | "3h" | "6h" | "24h" | "3d" | "always">("24h");
  const [location, setLocation] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [tab, setTab] = useState<EditorTab>("bg");
  const [showTextPanel, setShowTextPanel] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const stickerDragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null;

  function onPointerDownLayer(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    if (editingLayerId === id) return;
    setSelectedLayerId(id);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const layer = layers.find((l) => l.id === id)!;
    dragRef.current = { id, startX: (e.clientX - rect.left) / rect.width * 100, startY: (e.clientY - rect.top) / rect.height * 100, origX: layer.x, origY: layer.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMoveCanvas(e: React.PointerEvent) {
    if (dragRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width * 100;
      const cy = (e.clientY - rect.top) / rect.height * 100;
      setLayers((ls) => ls.map((l) => l.id === dragRef.current!.id ? {
        ...l,
        x: Math.max(2, Math.min(98, dragRef.current!.origX + (cx - dragRef.current!.startX))),
        y: Math.max(2, Math.min(98, dragRef.current!.origY + (cy - dragRef.current!.startY))),
      } : l));
    }
    if (stickerDragRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width * 100;
      const cy = (e.clientY - rect.top) / rect.height * 100;
      setStickers((ss) => ss.map((s) => s.id === stickerDragRef.current!.id ? {
        ...s,
        x: Math.max(2, Math.min(98, stickerDragRef.current!.origX + (cx - stickerDragRef.current!.startX))),
        y: Math.max(2, Math.min(98, stickerDragRef.current!.origY + (cy - stickerDragRef.current!.startY))),
      } : s));
    }
  }

  function onPointerDownSticker(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sticker = stickers.find((s) => s.id === id)!;
    stickerDragRef.current = { id, startX: (e.clientX - rect.left) / rect.width * 100, startY: (e.clientY - rect.top) / rect.height * 100, origX: sticker.x, origY: sticker.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function addTextLayer() {
    if (!newText.trim()) return;
    const layer: TextLayer = {
      id: genId(), text: newText.trim(), x: 50, y: 50,
      fontCss: FONTS[newFontIdx].css, sizePx: TEXT_SIZES[newSizeIdx].px,
      color: newColor, align: newAlign, bold: newBold, italic: newItalic,
      backdrop: newBackdrop, rotation: 0, animation: newAnimation, outline: newOutline,
    };
    setLayers((ls) => [...ls, layer]);
    setSelectedLayerId(layer.id);
    setNewText("");
    setShowTextPanel(false);
  }

  function deleteLayer(id: string) {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
    if (editingLayerId === id) setEditingLayerId(null);
  }

  function updateLayer(id: string, patch: Partial<TextLayer>) {
    setLayers((ls) => ls.map((l) => l.id === id ? { ...l, ...patch } : l));
  }

  function saveDraft() {
    const draft = {
      bg, photo, filterIdx, layers, stickers, music, musicStartTime,
      audioUrl, audioTitle, neonEffect, duration, location, hashtags, mode,
    };
    localStorage.setItem("hooda_story_draft", JSON.stringify(draft));
  }

  function buildPreviewStory(): Story {
    return {
      name: "Você", color: "#5B3FCF", isYou: true, published: false,
      bg, photo: photo ?? undefined, filterCss: FILTERS[filterIdx].css,
      textLayers: layers,
      stickers: stickers.map(({ id: _id, ...rest }) => rest),
      music: music ? { music_title: music.title, music_url: music.url, music_cover: music.cover_url, music_genre: music.category, music_artist: music.artist, start_time: musicStartTime || undefined } : undefined,
      neonEffect, duration, location: location || undefined, hashtags: hashtags || undefined,
      isAudio: mode === "audio", audioUrl: audioUrl ?? undefined, audioTitle: audioTitle || undefined,
    };
  }

  function hasRealContent() {
    const hasText = layers.some((l) => l.text && l.text.trim().length > 0);
    return !!photo || hasText || !!music || mode === "audio";
  }

  function publish() {
    if (!hasRealContent()) return;
    localStorage.removeItem("hooda_story_draft");
    onPublish({
      bg, photo: photo ?? undefined, filterCss: FILTERS[filterIdx].css,
      textLayers: layers,
      stickers: stickers.map(({ id: _id, ...rest }) => rest),
      music: music ? { music_title: music.title, music_url: music.url, music_cover: music.cover_url, music_genre: music.category, music_artist: music.artist, start_time: musicStartTime || undefined } : undefined,
      neonEffect, duration, location: location || undefined, hashtags: hashtags || undefined,
      isAudio: mode === "audio", audioUrl: audioUrl ?? undefined, audioTitle: audioTitle || undefined,
      published: true,
    });
    onClose();
  }

  const tabItems: { id: EditorTab; icon: React.ReactNode; label: string }[] = [
    { id: "bg",       icon: <Layers className="h-4 w-4" />,           label: "Fundo" },
    { id: "text",     icon: <TypeIcon className="h-4 w-4" />,         label: t("post.text") },
    { id: "sticker",  icon: <Smile className="h-4 w-4" />,            label: "Stickers" },
    { id: "filter",   icon: <SlidersHorizontal className="h-4 w-4" />,label: "Filtros" },
    { id: "music",    icon: <Music className="h-4 w-4" />,            label: "Música" },
    { id: "settings", icon: <Sliders className="h-4 w-4" />,          label: "Extras" },
  ];

  if (mode === "picker") {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-6 px-8">
        <button onClick={onClose} className="absolute top-5 left-5 p-2 rounded-full bg-[var(--s2)]/10">
          <X className="h-5 w-5 text-white" />
        </button>
        <p className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-2">{"Criar história"}</p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          {[
            { m: "photo" as CreatorMode,  icon: <ImageIcon className="h-6 w-6 text-white" />, grad: "linear-gradient(135deg,#5B3FCF,#E94B8A)", title: t("post.photo"),  sub: "Adiciona uma imagem ou fundo" },
            { m: "text"  as CreatorMode,  icon: <TypeIcon  className="h-6 w-6 text-white" />, grad: "linear-gradient(135deg,#F26B3A,#FFC93C)", title: t("post.text"), sub: "Cria uma história de texto" },
            { m: "audio" as CreatorMode,  icon: <Music     className="h-6 w-6 text-white" />, grad: "linear-gradient(135deg,#1FAFA6,#6BA547)", title: "Áudio", sub: "Partilha um momento sonoro" },
          ].map((item) => (
            <button key={item.m}
              onClick={() => {
                setMode(item.m);
                setTab(item.m === "audio" ? "music" : "bg");
                if (item.m === "text") setShowTextPanel(true);
                if (item.m === "audio") setShowMusicLib(true);
              }}
              className="flex items-center gap-4 border border-white/10 rounded-2xl p-5 transition active:scale-95"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: item.grad }}>{item.icon}</div>
              <div className="text-left">
                <p className="text-white font-bold text-base">{item.title}</p>
                <p className="text-white/40 text-sm">{item.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: "none", overflow: "hidden" }}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(to bottom,rgba(0,0,0,0.65),transparent)" }}>
        <button onClick={onClose} className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
          <X className="h-5 w-5 text-white" />
        </button>
        <div className="flex items-center gap-2">
          {mode === "photo" && (
            <button onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-semibold">
              <ImageIcon className="h-3.5 w-3.5" /> {photo ? "Trocar" : t("post.photo")}
            </button>
          )}
          <button onClick={() => { setShowTextPanel(true); setTab("text"); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs font-semibold">
            <TypeIcon className="h-3.5 w-3.5" /> Texto
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={saveDraft}
            className="px-3 py-1.5 rounded-full text-white/70 text-xs font-semibold border border-white/20 active:scale-95 transition backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.35)" }}>
            Rascunho
          </button>
          <button onClick={() => setShowPreview(true)}
            className="px-3 py-1.5 rounded-full text-white text-xs font-semibold active:scale-95 transition"
            style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
            <Eye className="h-3.5 w-3.5 inline mr-1" />Pré-ver
          </button>
          <button onClick={publish} disabled={!hasRealContent()}
            className="px-4 py-1.5 rounded-full text-white text-sm font-bold active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
            style={{ background: "#5B3FCF" }}>
            Publicar
          </button>
        </div>
      </div>

      <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setPhoto(ev.target?.result as string); r.readAsDataURL(f); e.target.value = ""; }} />
      <input ref={audioFileRef} type="file" accept="audio/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setAudioTitle(f.name.replace(/\.[^.]+$/, "")); setAudioUrl(URL.createObjectURL(f)); e.target.value = ""; }} />

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 relative overflow-hidden select-none"
        style={{ background: photo ? "#000" : bg }}
        onPointerMove={onPointerMoveCanvas}
        onPointerUp={() => { dragRef.current = null; stickerDragRef.current = null; }}
        onClick={() => { setSelectedLayerId(null); setEditingLayerId(null); }}>

        {photo && <img loading="lazy" decoding="async" src={photo} alt="" className="absolute inset-0 w-full h-full object-contain"
          style={{ filter: FILTERS[filterIdx].css !== "none" ? FILTERS[filterIdx].css : undefined }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}

        {/* Neon overlays */}
        {neonEffect === "neon_purple" && <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center,rgba(91,63,207,0.35),transparent 70%)", mixBlendMode: "screen" }} />}
        {neonEffect === "neon_pink"   && <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center,rgba(233,75,138,0.35),transparent 70%)", mixBlendMode: "screen" }} />}
        {neonEffect === "neon_blue"   && <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center,rgba(6,182,212,0.35),transparent 70%)", mixBlendMode: "screen" }} />}
        {neonEffect === "glitch"      && <div className="absolute inset-0 pointer-events-none" style={{ background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(91,63,207,0.08) 2px,rgba(91,63,207,0.08) 4px)" }} />}
        {neonEffect === "brilho"      && <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 30% 30%,rgba(255,255,255,0.15),transparent 60%)" }} />}

        {/* Text layers — fully draggable, double-tap to edit */}
        {layers.map((layer) => {
          const isSel = selectedLayerId === layer.id;
          const isEd  = editingLayerId  === layer.id;
          return (
            <div key={layer.id}
              style={{
                position: "absolute",
                left: `${layer.x}%`, top: `${layer.y}%`,
                transform: `translate(-50%,-50%) rotate(${layer.rotation}deg)`,
                fontFamily: layer.fontCss, fontSize: `${layer.sizePx}px`, color: layer.color,
                textAlign: layer.align, fontWeight: layer.bold ? "bold" : "normal",
                fontStyle: layer.italic ? "italic" : "normal",
                cursor: isEd ? "text" : "grab", userSelect: "none", WebkitUserSelect: "none",
                zIndex: isSel ? 10 : 5, maxWidth: "88%", wordBreak: "break-word", lineHeight: 1.25,
                WebkitTextStroke: layer.outline ? `1px ${layer.color === "#ffffff" ? "#000" : "#fff"}` : undefined,
                textShadow: layer.backdrop === "shadow" ? "0 2px 12px rgba(0,0,0,0.85),0 1px 4px rgba(0,0,0,0.9)" : undefined,
                background: layer.backdrop === "box"  ? "rgba(0,0,0,0.52)"  : layer.backdrop === "blur" ? "rgba(0,0,0,0.38)" : "none",
                backdropFilter: layer.backdrop === "blur" ? "blur(10px)" : undefined,
                padding: layer.backdrop !== "none" ? "5px 12px" : undefined,
                borderRadius: layer.backdrop !== "none" ? "8px" : undefined,
              }}
              onPointerDown={(e) => onPointerDownLayer(e, layer.id)}
              onDoubleClick={(e) => { e.stopPropagation(); setEditingLayerId(layer.id); setSelectedLayerId(layer.id); }}>
              {isEd ? (
                <textarea autoFocus value={layer.text}
                  onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
                  onBlur={() => setEditingLayerId(null)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingLayerId(null); }}
                  style={{
                    background: "transparent", border: "none", outline: "none", resize: "none",
                    fontFamily: layer.fontCss, fontSize: `${layer.sizePx}px`, color: layer.color,
                    textAlign: layer.align, fontWeight: layer.bold ? "bold" : "normal",
                    fontStyle: layer.italic ? "italic" : "normal", padding: 0,
                    width: "max-content", maxWidth: "70vw", minWidth: "80px",
                  }}
                  rows={Math.max(1, layer.text.split("\n").length)} />
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{layer.text}</span>
              )}
              {isSel && !isEd && (
                <>
                  <div className="absolute -inset-1.5 border-2 border-white/80 rounded pointer-events-none" style={{ borderStyle: "dashed" }} />
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                    className="absolute -top-3.5 -right-3.5 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center shadow-lg z-20">
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setEditingLayerId(layer.id); }}
                    className="absolute -top-3.5 -left-3.5 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center shadow-lg z-20">
                    <TypeIcon className="h-3.5 w-3.5 text-white" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Stickers — draggable, double-tap to delete */}
        {stickers.map((sticker) => (
          <div key={sticker.id} className="absolute cursor-grab active:cursor-grabbing select-none"
            style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: "translate(-50%,-50%)", fontSize: `${sticker.size}px`, zIndex: 6, touchAction: "none" }}
            onPointerDown={(e) => onPointerDownSticker(e, sticker.id)}
            onDoubleClick={(e) => { e.stopPropagation(); setStickers((ss) => ss.filter((s) => s.id !== sticker.id)); }}>
            {sticker.emoji}
          </div>
        ))}

        {location && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-4 py-1.5 text-white text-xs font-semibold whitespace-nowrap">
              📍 {location}
            </div>
          </div>
        )}

        {mode === "audio" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-[var(--s2)]/10 flex items-center justify-center">
              <Music className="h-10 w-10 text-white/70" />
            </div>
            <div className="flex items-end gap-1 h-10">
              {[6,10,7,14,9,12,5,11,8,13].map((h, i) => (
                <div key={i} className="w-1 rounded-full bg-[var(--s2)]/70"
                  style={{ height: `${h * (audioUrl ? 1 : 0.3)}px`, animation: audioUrl ? `wave 1.2s ease-in-out ${i * 0.1}s infinite alternate` : "none" }} />
              ))}
            </div>
            {audioTitle && <p className="text-white font-semibold text-base text-center px-8">{audioTitle}</p>}
          </div>
        )}

        {music && <MusicBar music={{ music_title: music.title, music_url: music.url, music_cover: music.cover_url, music_genre: music.category, music_artist: music.artist }} />}

        {layers.length === 0 && !showTextPanel && mode !== "audio" && (
          <button onClick={(e) => { e.stopPropagation(); setShowTextPanel(true); setTab("text"); }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            <div className="flex flex-col items-center gap-2 opacity-30">
              <TypeIcon className="h-10 w-10 text-white" />
              <span className="text-white text-sm font-medium">Toca para escrever</span>
            </div>
          </button>
        )}
      </div>

      {/* Selected layer quick-edit toolbar */}
      {selectedLayer && !editingLayerId && (
        <div className="absolute z-20 flex flex-col items-center gap-2"
          style={{ bottom: "225px", left: 0, right: 0 }}>
          <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md rounded-2xl px-2 py-2 mx-4 overflow-x-auto no-scrollbar max-w-full">
            {FONTS.map((f) => (
              <button key={f.name} onClick={() => updateLayer(selectedLayer.id, { fontCss: f.css })}
                className="flex-shrink-0 w-9 h-9 rounded-xl text-xs font-medium transition"
                style={{ fontFamily: f.css, background: selectedLayer.fontCss === f.css ? "#5B3FCF" : "rgba(255,255,255,0.1)", color: selectedLayer.fontCss === f.css ? "#fff" : "rgba(255,255,255,0.5)" }}>Aa</button>
            ))}
            <div className="w-px h-5 bg-[var(--s2)]/20 mx-0.5 flex-shrink-0" />
            <button onClick={() => updateLayer(selectedLayer.id, { sizePx: Math.max(10, selectedLayer.sizePx - 4) })}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-[var(--s2)]/10 text-white text-xl font-bold flex items-center justify-center">−</button>
            <button onClick={() => updateLayer(selectedLayer.id, { sizePx: Math.min(80, selectedLayer.sizePx + 4) })}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-[var(--s2)]/10 text-white text-xl font-bold flex items-center justify-center">+</button>
            <div className="w-px h-5 bg-[var(--s2)]/20 mx-0.5 flex-shrink-0" />
            <button onClick={() => updateLayer(selectedLayer.id, { bold: !selectedLayer.bold })}
              className="flex-shrink-0 w-9 h-9 rounded-xl transition" style={{ background: selectedLayer.bold ? "#5B3FCF" : "rgba(255,255,255,0.1)" }}>
              <Bold className="h-4 w-4 text-white" />
            </button>
            <button onClick={() => updateLayer(selectedLayer.id, { italic: !selectedLayer.italic })}
              className="flex-shrink-0 w-9 h-9 rounded-xl transition" style={{ background: selectedLayer.italic ? "#5B3FCF" : "rgba(255,255,255,0.1)" }}>
              <Italic className="h-4 w-4 text-white" />
            </button>
            <button onClick={() => updateLayer(selectedLayer.id, { rotation: (selectedLayer.rotation + 15) % 360 })}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-[var(--s2)]/10 text-white flex items-center justify-center text-lg">↻</button>
            <button onClick={() => deleteLayer(selectedLayer.id)}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-500/80 text-white flex items-center justify-center">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-2xl overflow-x-auto no-scrollbar">
            {TEXT_COLORS.map((c) => (
              <button key={c} onClick={() => updateLayer(selectedLayer.id, { color: c })}
                className="w-6 h-6 rounded-full border-2 transition flex-shrink-0"
                style={{ background: c, borderColor: selectedLayer.color === c ? "#fff" : "transparent" }} />
            ))}
          </div>
        </div>
      )}

      {/* Floating text add panel */}
      {showTextPanel && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setShowTextPanel(false)}>
          <div className="flex-1" />
          <div className="bg-[#111] rounded-t-3xl px-4 pt-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-bold text-base">{"Adicionar texto"}</p>
              <button onClick={() => setShowTextPanel(false)} className="p-1.5 rounded-full bg-[var(--s2)]/10"><X className="h-4 w-4 text-white/60" /></button>
            </div>
            <textarea autoFocus value={newText} onChange={(e) => setNewText(e.target.value)}
              placeholder={"Escreve o teu texto aqui..."}
              className="w-full rounded-xl px-4 py-3 text-white text-base placeholder:text-white/30 outline-none resize-none mb-3"
              style={{ fontFamily: FONTS[newFontIdx].css, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              rows={2} />
            {/* Fonts */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-0.5">
              {FONTS.map((f, i) => (
                <button key={f.name} onClick={() => setNewFontIdx(i)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-sm font-medium transition"
                  style={{ fontFamily: f.css, background: newFontIdx === i ? "#5B3FCF" : "rgba(255,255,255,0.08)", color: newFontIdx === i ? "#fff" : "rgba(255,255,255,0.5)" }}>
                  {f.label}
                </button>
              ))}
            </div>
            {/* Sizes */}
            <div className="flex gap-2 mb-3">
              {TEXT_SIZES.map((s, i) => (
                <button key={s.label} onClick={() => setNewSizeIdx(i)}
                  className="flex-1 py-1.5 rounded-xl text-xs font-bold transition"
                  style={{ background: newSizeIdx === i ? "#5B3FCF" : "rgba(255,255,255,0.08)", color: newSizeIdx === i ? "#fff" : "rgba(255,255,255,0.5)" }}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Colors */}
            <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-0.5">
              {TEXT_COLORS.map((c) => (
                <button key={c} onClick={() => setNewColor(c)}
                  className="flex-shrink-0 w-7 h-7 rounded-full border-2 transition"
                  style={{ background: c, borderColor: newColor === c ? "#fff" : "transparent", boxShadow: newColor === c ? "0 0 0 2px rgba(255,255,255,0.3)" : "none" }} />
              ))}
            </div>
            {/* Style controls */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => setNewAlign(newAlign === "left" ? "center" : newAlign === "center" ? "right" : "left")}
                className="p-2.5 rounded-xl bg-[var(--s2)]/8 text-white/70">
                {newAlign === "left" ? <AlignLeft className="h-4 w-4" /> : newAlign === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
              </button>
              <button onClick={() => setNewBold(!newBold)} className="p-2.5 rounded-xl transition"
                style={{ background: newBold ? "#5B3FCF" : "rgba(255,255,255,0.08)" }}><Bold className="h-4 w-4 text-white" /></button>
              <button onClick={() => setNewItalic(!newItalic)} className="p-2.5 rounded-xl transition"
                style={{ background: newItalic ? "#5B3FCF" : "rgba(255,255,255,0.08)" }}><Italic className="h-4 w-4 text-white" /></button>
              <button onClick={() => setNewOutline(!newOutline)}
                className="px-3 py-2 rounded-xl text-white font-bold text-sm transition"
                style={{ background: newOutline ? "#5B3FCF" : "rgba(255,255,255,0.08)", fontFamily: "serif" }}>T̲</button>
              {(["none","shadow","box","blur"] as const).map((b) => (
                <button key={b} onClick={() => setNewBackdrop(b)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium transition"
                  style={{ background: newBackdrop === b ? "#5B3FCF" : "rgba(255,255,255,0.08)", color: newBackdrop === b ? "#fff" : "rgba(255,255,255,0.65)" }}>
                  {b === "none" ? "Sem" : b === "shadow" ? "Sombra" : b === "box" ? "Caixa" : "Blur"}
                </button>
              ))}
            </div>
            <button onClick={addTextLayer} disabled={!newText.trim()}
              className="w-full h-13 rounded-2xl text-white font-bold text-base disabled:opacity-30 transition active:scale-95"
              style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)", height: "52px" }}>
              Adicionar à história
            </button>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="relative z-10 bg-black border-t border-white/8">
        <div className="flex border-b border-white/5">
          {tabItems.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "text") setShowTextPanel(true); }}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 min-w-0 transition"
              style={{ color: tab === t.id ? "#5B3FCF" : "rgba(255,255,255,0.3)" }}>
              {t.icon}
              <span className="text-[9px] font-semibold">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "calc(38vh - 4px)", WebkitOverflowScrolling: "touch" }}>
          {tab === "bg" && (
            <div className="p-3">
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-2">Temas</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
                {THEMES.map((theme) => (
                  <button key={theme.id} onClick={() => { setBg(theme.bg); setPhoto(null); }} className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div className="w-12 h-16 rounded-xl border-2 transition" style={{ background: theme.bg, borderColor: bg === theme.bg && !photo ? "#5B3FCF" : "transparent" }} />
                    <span className="text-white/50 text-[9px]">{theme.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-2">Gradientes</p>
              <div className="grid grid-cols-6 gap-2">
                {GRADIENTS.map((g, i) => (
                  <button key={i} onClick={() => { setBg(g); setPhoto(null); }}
                    className="aspect-square rounded-xl border-2 transition"
                    style={{ background: g, borderColor: bg === g && !photo ? "#5B3FCF" : "transparent" }} />
                ))}
              </div>
            </div>
          )}
          {tab === "text" && (
            <div className="p-3">
              <button onClick={() => setShowTextPanel(true)}
                className="w-full h-11 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition"
                style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
                <TypeIcon className="h-4 w-4" /> Novo texto
              </button>
              {layers.length > 0 && (
                <div className="mt-3">
                  <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Camadas</p>
                  {layers.map((layer) => (
                    <div key={layer.id} onClick={() => setSelectedLayerId(layer.id)}
                      className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition mb-1"
                      style={{ background: selectedLayerId === layer.id ? "rgba(91,63,207,0.3)" : "rgba(255,255,255,0.05)" }}>
                      <span className="text-white text-sm truncate flex-1"
                        style={{ fontFamily: layer.fontCss, fontWeight: layer.bold ? "bold" : "normal", fontStyle: layer.italic ? "italic" : "normal" }}>
                        {layer.text}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="p-1 text-red-400 ml-2 flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "sticker" && (
            <div className="p-3">
              <div className="grid grid-cols-8 gap-1.5">
                {STICKER_EMOJIS.map((emoji) => (
                  <button key={emoji} onClick={() => setStickers((ss) => [...ss, { id: genId(), emoji, x: 50, y: 40, size: 36 }])}
                    className="flex items-center justify-center h-9 rounded-xl text-xl transition active:scale-90"
                    style={{ background: "rgba(255,255,255,0.05)" }}>{emoji}</button>
                ))}
              </div>
              {stickers.length > 0 && (
                <button onClick={() => setStickers([])} className="mt-2 w-full h-8 rounded-xl text-white/40 text-xs" style={{ background: "rgba(255,255,255,0.05)" }}>Limpar todos</button>
              )}
            </div>
          )}
          {tab === "filter" && (
            <div className="p-3">
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {FILTERS.map((f, i) => (
                  <button key={f.id} onClick={() => setFilterIdx(i)} className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div className="w-14 h-20 rounded-xl border-2 overflow-hidden" style={{ borderColor: filterIdx === i ? "#5B3FCF" : "transparent" }}>
                      {photo
                        ? <img loading="lazy" decoding="async" src={photo} alt="" className="w-full h-full object-cover" style={{ filter: f.css !== "none" ? f.css : undefined }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        : <div className="w-full h-full" style={{ background: bg, filter: f.css !== "none" ? f.css : undefined }} />}
                    </div>
                    <span className="text-white/50 text-[10px]">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "music" && (
            <div className="p-3 flex flex-col gap-2.5">
              {music ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                    {music.cover_url ? <img loading="lazy" decoding="async" src={music.cover_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="w-10 h-10 rounded-lg bg-[var(--s2)]/10 flex items-center justify-center text-lg flex-shrink-0">🎵</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{music.title}</p>
                      <p className="text-white/40 text-xs truncate">{music.artist ?? music.category}</p>
                    </div>
                    <button onClick={() => { setMusic(null); setMusicStartTime(0); }} className="p-1.5 rounded-full bg-[var(--s2)]/10 flex-shrink-0"><X className="h-4 w-4 text-white/60" /></button>
                  </div>
                  <MusicStartPicker
                    url={music.url}
                    duration={music.duration ?? 240}
                    value={musicStartTime}
                    onChange={setMusicStartTime}
                  />
                  <button onClick={() => setShowMusicLib(true)}
                    className="w-full h-9 rounded-xl text-white/60 text-xs font-semibold border border-white/10"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    Trocar música
                  </button>
                </>
              ) : (
                <button onClick={() => setShowMusicLib(true)}
                  className="w-full h-11 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg,#5B3FCF,#1FAFA6)" }}>
                  <Music className="h-4 w-4" /> Escolher música
                </button>
              )}
            </div>
          )}
          {tab === "settings" && (
            <div className="p-3 flex flex-col gap-2.5">
              {mode === "audio" && (
                <button onClick={() => audioFileRef.current?.click()}
                  className="w-full h-10 rounded-xl border border-white/15 text-white/60 text-sm">
                  {audioUrl ? `✓ ${audioTitle}` : "🎙 Escolher ficheiro de áudio"}
                </button>
              )}
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Efeito de luz</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {NEON_EFFECTS.map((n) => (
                    <button key={n.id} onClick={() => setNeonEffect(n.id)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition"
                      style={{ background: neonEffect === n.id ? "#5B3FCF" : "rgba(255,255,255,0.08)", color: neonEffect === n.id ? "#fff" : "rgba(255,255,255,0.5)" }}>
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Duração</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {DURATIONS.map((d) => (
                    <button key={d.id} onClick={() => setDuration(d.id as any)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition"
                      style={{ background: duration === d.id ? "#5B3FCF" : "rgba(255,255,255,0.08)", color: duration === d.id ? "#fff" : "rgba(255,255,255,0.5)" }}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="📍 Localização"
                className="w-full h-9 px-3 rounded-xl text-white text-sm placeholder:text-white/30 outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="# Hashtags (ex: poesia amor)"
                className="w-full h-9 px-3 rounded-xl text-white text-sm placeholder:text-white/30 outline-none"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }} />
            </div>
          )}
        </div>
      </div>

      {showMusicLib && (
        <MusicLibrary onSelect={(song) => { setMusic(song); setShowMusicLib(false); setMusicStartTime(0); }} onClose={() => setShowMusicLib(false)} />
      )}

      {showPreview && (
        <StoryViewer
          stories={[buildPreviewStory()]}
          startIndex={0}
          onClose={() => setShowPreview(false)}
          userAvatarUrl={userAvatarUrl}
        />
      )}
    </div>,
    document.body
  );
}

/* ─── Reaction helpers ─── */
type ReactionItem = {
  id: number; emoji: string; right: number; size: number; dur: number; delay: number;
};

const REACTION_POOL = ["❤️","🔥","💜","✨","😍","🥰","💫","👏","🌟","💖","🎉","🫶"];

function HoodaBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);
  const hearts = ["❤️","💖","💗","💓","💕","🩷","✨","💫"];
  return (
    <div style={{ pointerEvents: "none", position: "relative", width: 60, height: 60 }}>
      {hearts.map((h, i) => (
        <span key={i} style={{
          position: "absolute",
          left: `${20 + Math.sin(i * 0.8) * 22}px`,
          top: `${20 + Math.cos(i * 0.8) * 22}px`,
          fontSize: 14 + (i % 3) * 4,
          animation: `floatReaction ${0.9 + i * 0.1}s ease-out ${i * 0.07}s both`,
          userSelect: "none",
        }}>{h}</span>
      ))}
    </div>
  );
}

function StoryViewer({ stories, startIndex, onClose, onDelete, userAvatarUrl }: {
  stories: Story[]; startIndex: number; onClose: () => void;
  onDelete?: (id: string) => Promise<void>;
  userAvatarUrl?: string | null;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [slideIdx, setSlideIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [adored, setAdored] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [reply, setReply] = useState("");
  const [replySent, setReplySent] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ridRef = useRef(0);

  // Bloquear scroll do body enquanto o viewer está aberto, para a tela
  // ficar fixa e centralizada (sem permitir scroll da página de fundo)
  useScrollLock(); // bloqueia scroll enquanto modal aberto

  /* Reset reaction state whenever the viewed story changes */
  useEffect(() => {
    setAdored(false);
    setShowBurst(false);
    setReactions([]);
    setReply("");
    setReplySent(false);
  }, [idx, slideIdx]);

  function sendReply() {
    if (!reply.trim()) return;
    setReplySent(true);
    setReply("");
    setTimeout(() => setReplySent(false), 2500);
  }

  /* Track views — increment for non-own stories, read own story views */
  useEffect(() => {
    const key = `hooda_views_${stories[idx]?.name}`;
    if (stories[idx]?.isYou) {
      const v = parseInt(localStorage.getItem(key) || "0", 10);
      setViewCount(v);
      return;
    }
    const timer = setTimeout(() => {
      const current = parseInt(localStorage.getItem(key) || "0", 10);
      localStorage.setItem(key, String(current + 1));
    }, 2000);
    return () => clearTimeout(timer);
  }, [idx]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const DURATION = 30000;
  const _storyUser = stories[Math.min(idx, stories.length - 1)] ?? null;
  const _slides = _storyUser?.slides;
  const story: Story | null = _storyUser
    ? (_slides && _slides.length > 0) ? (_slides[slideIdx] ?? _storyUser) : _storyUser
    : null;
  const totalSlides = (_slides && _slides.length > 0) ? _slides.length : 1;

  function stopAll() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }

  useEffect(() => {
    if (!story) return;
    stopAll();
    setProgress(0);
    if (story.music?.music_url) {
      const a = new Audio(story.music.music_url);
      if (story.music.start_time) a.currentTime = story.music.start_time;
      a.muted = false;
      a.play().catch(() => {
        a.muted = true;
        a.play().then(() => { a.muted = false; }).catch(() => {});
      });
      audioRef.current = a;
    }
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      const p = Math.min(((Date.now() - t0) / DURATION) * 100, 100);
      setProgress(p);
      if (p >= 100) {
        stopAll();
        const _tsl = stories[idx]?.slides; const _ttot = (_tsl && _tsl.length > 0) ? _tsl.length : 1;
        if (slideIdx < _ttot - 1) { setSlideIdx((s) => s + 1); }
        else if (idx < stories.length - 1) { setSlideIdx(0); setIdx((i) => i + 1); }
        else onClose();
      }
    }, 100);
    return stopAll;
  }, [idx, slideIdx]);

  useEffect(() => { if (!story) return; if (audioRef.current) audioRef.current.muted = muted; }, [muted]);

  if (!story) return null;

  function spawnReactions() {
    const count = 5 + Math.floor(Math.random() * 5);
    const newItems: ReactionItem[] = Array.from({ length: count }, (_, i) => ({
      id: ridRef.current++,
      emoji: REACTION_POOL[Math.floor(Math.random() * REACTION_POOL.length)],
      right: 12 + Math.random() * 76,
      size: 22 + Math.random() * 16,
      dur: 1.7 + Math.random() * 1.0,
      delay: i * 0.09,
    }));
    setReactions((prev) => [...prev, ...newItems]);
    setTimeout(() => {
      const ids = new Set(newItems.map((r) => r.id));
      setReactions((prev) => prev.filter((r) => !ids.has(r.id)));
    }, 4000);
  }

  function handleAdora() {
    if (!adored) { setAdored(true); setShowBurst(true); }
    spawnReactions();
  }

  const storyBg = story.bg ?? `linear-gradient(160deg, ${story.color}cc, #0a0a10)`;

  return createPortal(
    <>
    <style>{`
      @keyframes storyBounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
      @keyframes storyGlow { 0%,100% { filter: drop-shadow(0 0 3px currentColor) } 50% { filter: drop-shadow(0 0 14px currentColor) drop-shadow(0 0 28px currentColor) } }
      @keyframes storyFade { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
      @keyframes storySlide { from { opacity:0; transform:translateX(-20px) } to { opacity:1; transform:translateX(0) } }
      @keyframes floatReaction { 0% { transform: translateY(0); opacity:1 } 100% { transform: translateY(-130px); opacity:0 } }
    `}</style>
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={(e) => {
        const w = window.innerWidth;
        if (e.clientX < w / 2) {
          const _psl = stories[idx]?.slides; const _ptot = (_psl && _psl.length > 0) ? _psl.length : 1;
          if (slideIdx > 0) { setSlideIdx((s) => s - 1); }
          else if (idx > 0) { const _ps2 = stories[idx-1]?.slides; setSlideIdx(_ps2?.length ? _ps2.length - 1 : 0); setIdx((i) => i - 1); }
        } else {
          const _nsl = stories[idx]?.slides; const _ntot = (_nsl && _nsl.length > 0) ? _nsl.length : 1;
          if (slideIdx < _ntot - 1) { setSlideIdx((s) => s + 1); }
          else if (idx < stories.length - 1) { setSlideIdx(0); setIdx((i) => i + 1); }
          else onClose();
        }
      }}>

      <div className="relative rounded-3xl overflow-hidden shadow-2xl"
        style={{ height: "88vh", aspectRatio: "9/16", maxWidth: "calc(88vh * 9 / 16)" }}>

        {/* Background */}
        {story.photo
          ? <img loading="lazy" decoding="async" src={story.photo} alt="" className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: story.filterCss && story.filterCss !== "none" ? story.filterCss : undefined }}
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          : <div className="absolute inset-0"
              style={{
                background: storyBg,
                filter: story.filterCss && story.filterCss !== "none" ? story.filterCss : undefined,
              }} />}

        {/* Audio story visual */}
        {story.isAudio && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-8">
            <div className="h-24 w-24 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
              <Music className="h-12 w-12 text-white" />
            </div>
            <div className="flex items-end gap-px h-10">
              {[8,14,6,18,10,16,5,12,9,17,7,13,11,15,8,14,6,18,10,16,5,12,9,14].map((h, i) => (
                <div key={i} className="w-1 rounded-full animate-pulse"
                  style={{ height: h, background: "rgba(255,255,255,0.7)", animationDelay: `${i * 0.07}s`, animationDuration: "0.9s" }} />
              ))}
            </div>
            {story.audioTitle && (
              <p className="text-white font-bold text-base text-center" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>
                🎵 {story.audioTitle}
              </p>
            )}
          </div>
        )}

        {/* Neon overlays in viewer */}
        {story.neonEffect === "neon_purple" && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 60px rgba(139,92,246,0.5)", zIndex: 5 }} />}
        {story.neonEffect === "neon_pink"   && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 60px rgba(236,72,153,0.5)", zIndex: 5 }} />}
        {story.neonEffect === "neon_blue"   && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 60px rgba(59,130,246,0.5)", zIndex: 5 }} />}
        {story.neonEffect === "brilho"      && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 100px rgba(255,255,255,0.1)", zIndex: 5 }} />}
        {story.neonEffect === "glitch" && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, overflow: "hidden" }}>
            <div style={{ position:"absolute", inset:0, background:"rgba(255,0,0,0.06)", transform:"translateX(2px)", mixBlendMode:"screen" }} />
            <div style={{ position:"absolute", inset:0, background:"rgba(0,255,255,0.06)", transform:"translateX(-2px)", mixBlendMode:"screen" }} />
          </div>
        )}

        {/* Top gradient vignette */}
        <div className="absolute inset-x-0 top-0 h-40 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.68) 0%, transparent 100%)" }} />

        {/* Bottom gradient vignette */}
        <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
          style={{ height: "48%", background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.42) 55%, transparent 100%)" }} />

        {/* Floating reactions (inside card, float upward from bottom) */}
        {reactions.map((r) => (
          <div key={r.id} style={{
            position: "absolute",
            bottom: 78,
            right: r.right,
            fontSize: r.size,
            animation: `floatReaction ${r.dur}s ease-out ${r.delay}s both`,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 25,
            lineHeight: 1,
          }}>
            {r.emoji}
          </div>
        ))}

        {/* Progress bars — one per slide */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <div key={i} className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.28)" }}>
              <div className="h-full rounded-full"
                style={{
                  width: i < slideIdx ? "100%" : i === slideIdx ? `${progress}%` : "0%",
                  transition: "width 100ms linear",
                  background: "rgba(255,255,255,0.95)",
                }} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-8 left-4 right-4 z-20 flex items-center justify-between"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2.5">
            <div className="p-[2.5px] rounded-full flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${story.color}, #FFC93C 60%, #E94B8A)` }}>
              <div className="h-9 w-9 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-black"
                style={{ background: story.bg ?? story.color }}>
                {userAvatarUrl
                  ? <img loading="lazy" decoding="async" src={userAvatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  : (story.name?.[0] ?? "?").toUpperCase()}
              </div>
            </div>
            <div>
              <p className="text-white text-[13px] font-bold leading-tight" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
                {story.name || "Você"}
              </p>
              <p className="text-white/55 text-[10px] leading-tight">
                {story.created_at ? (() => {
                  const s = Math.floor((Date.now() - new Date(story.created_at).getTime()) / 1000);
                  if (s < 60) return "agora";
                  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
                  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
                  return `há ${Math.floor(s / 86400)} d`;
                })() : "agora"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {story.music && (
              <button onClick={() => setMuted((v) => !v)}
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.42)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}>
                {muted
                  ? <><VolumeX className="h-4 w-4 text-white" /><span className="text-white text-[10px] font-bold ml-1">Ativar som</span></>
                  : <><Volume2 className="h-4 w-4 text-white" /><span className="text-white text-[10px] font-bold ml-1">Som ON</span></>
                }
              </button>
            )}
            <button onClick={() => { stopAll(); onClose(); }}
              className="h-8 w-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.42)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* Text layers — positioned absolutely */}
        {story.textLayers && story.textLayers.map((layer) => (
          <div key={layer.id} style={{
            position: "absolute",
            left: `${layer.x}%`, top: `${layer.y}%`,
            transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
            fontFamily: layer.fontCss, fontSize: layer.sizePx, color: layer.color,
            fontWeight: layer.bold ? "bold" : "normal",
            fontStyle: layer.italic ? "italic" : "normal",
            textAlign: layer.align, maxWidth: "88%", wordBreak: "break-word",
            lineHeight: 1.25, zIndex: 12, pointerEvents: "none", whiteSpace: "pre-wrap",
            WebkitTextStroke: layer.outline ? `1.5px ${layer.color === "#ffffff" ? "#000" : "#fff"}` : undefined,
            textShadow: layer.backdrop === "shadow" ? "0 2px 12px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.9)" : undefined,
            background: layer.backdrop === "box" ? "rgba(0,0,0,0.52)" : layer.backdrop === "blur" ? "rgba(0,0,0,0.38)" : "none",
            backdropFilter: layer.backdrop === "blur" ? "blur(10px)" : undefined,
            padding: layer.backdrop !== "none" ? "5px 12px" : undefined,
            borderRadius: layer.backdrop !== "none" ? "8px" : undefined,
            animation: layer.animation === "bounce" ? "storyBounce 1.5s infinite ease-in-out"
              : layer.animation === "glow" ? "storyGlow 2s infinite"
              : layer.animation === "fade" ? "storyFade 1s ease forwards"
              : layer.animation === "slide" ? "storySlide 0.6s ease forwards"
              : undefined,
          }}>
            {layer.text}
          </div>
        ))}

        {/* Stickers overlay — positioned */}
        {story.stickers && story.stickers.map((sticker, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${sticker.x}%`, top: `${sticker.y}%`,
            transform: "translate(-50%, -50%)",
            fontSize: sticker.size, zIndex: 18, pointerEvents: "none",
            userSelect: "none", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
            lineHeight: 1,
          }}>
            {sticker.emoji}
          </div>
        ))}

        {/* Location & Hashtags */}
        {(story.location || story.hashtags) && (
          <div className="absolute left-4 right-4 flex flex-col items-center gap-1.5 pointer-events-none" style={{ bottom: 90, zIndex: 19 }}>
            {story.location && (
              <span className="text-white text-xs font-bold bg-black/50 rounded-full px-3 py-1 backdrop-blur-sm">
                📍 {story.location}
              </span>
            )}
            {story.hashtags && (
              <span className="text-[#c4b5fd] text-xs font-semibold bg-black/50 rounded-full px-3 py-1 backdrop-blur-sm">
                {story.hashtags}
              </span>
            )}
          </div>
        )}

        {/* Bottom action bar */}
        <div className="absolute bottom-0 inset-x-0 z-20 px-4 pb-4 pt-2"
          onClick={(e) => e.stopPropagation()}>

          {/* Music bar */}
          {story.music && (
            <div className="mb-2.5 rounded-xl overflow-hidden">
              <MusicBar music={story.music} />
            </div>
          )}

          {/* View count + delete — shown for own story */}
          {story.isYou && story.published && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Eye className="h-3.5 w-3.5 text-white/60" />
              <span className="text-white/60 text-xs font-semibold flex-1">{viewCount} {viewCount === 1 ? "visualização" : t("tv.views")}</span>
              {story.id && onDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all active:scale-90"
                  style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.45)", color: "#f87171" }}>
                  <Trash2 className="h-3 w-3" />
                  Apagar
                </button>
              )}
            </div>
          )}

          {/* Sent feedback */}
          {replySent && (
            <div className="flex items-center justify-center mb-2">
              <span className="text-white/80 text-xs font-semibold bg-[var(--s2)]/15 rounded-full px-4 py-1.5 backdrop-blur">
                ✓ Resposta enviada
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Reply input — hidden for own story */}
            {!story.isYou && (
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendReply()}
                placeholder={`Responder a ${story.name}…`}
                className="flex-1 h-10 px-4 rounded-full text-sm text-white outline-none placeholder:text-white/40"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(14px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  minWidth: 0,
                }}
              />
            )}

            {/* Send button — visible when there's text */}
            {!story.isYou && reply.trim().length > 0 && (
              <button
                onClick={sendReply}
                className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-90"
                style={{ background: "#5B3FCF" }}>
                <Send className="h-4 w-4 text-white" />
              </button>
            )}

            {/* Spacer for own story so share button stays right */}
            {story.isYou && <div className="flex-1" />}

            {/* Adora button — hidden for own story */}
            {!story.isYou && (
              <div className="relative flex-shrink-0">
                {/* Hearts burst */}
                {showBurst && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50">
                    <HoodaBurst onDone={() => setShowBurst(false)} />
                  </div>
                )}
                <button
                  onClick={handleAdora}
                  className="flex flex-col items-center gap-0.5 transition-transform active:scale-90"
                  style={{ transform: adored ? "scale(1.08)" : "scale(1)" }}
                >
                  <div className="h-11 w-11 rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      background: adored ? "rgba(233,75,138,0.28)" : "rgba(0,0,0,0.35)",
                      backdropFilter: "blur(14px)",
                      border: adored ? "2px solid rgba(233,75,138,0.65)" : "2px solid rgba(255,255,255,0.18)",
                      boxShadow: adored ? "0 0 22px rgba(233,75,138,0.55), inset 0 0 14px rgba(233,75,138,0.18)" : "none",
                    }}>
                    <svg width="21" height="21" viewBox="0 0 24 24"
                      fill={adored ? "#E94B8A" : "none"}
                      stroke={adored ? "#E94B8A" : "rgba(255,255,255,0.9)"}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                        transform: adored ? "scale(1.25)" : "scale(1)",
                        filter: adored ? "drop-shadow(0 0 5px #E94B8A)" : "none",
                      }}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                </button>
              </div>
            )}

            {/* Share button */}
            <button
              className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity active:opacity-70"
              style={{
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}>
              <Share2 className="h-4 w-4 text-white/80" />
            </button>
          </div>
        </div>

      </div>
    </div>
      {/* Delete confirmation overlay */}
      {showDeleteConfirm && story.id && onDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div
            className="w-full max-w-sm mx-auto mb-8 rounded-3xl overflow-hidden"
            style={{ background: "#1a1a2e" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2 flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-full flex items-center justify-center mb-1"
                style={{ background: "rgba(239,68,68,0.18)", border: "1.5px solid rgba(239,68,68,0.45)" }}>
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <p className="text-white font-bold text-base">Apagar esta história?</p>
              <p className="text-white/50 text-xs text-center">Ela será removida permanentemente e não poderá ser recuperada.</p>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-5 pt-4">
              <button
                disabled={deleting}
                onClick={async () => {
                  if (!story.id || !onDelete) return;
                  setDeleting(true);
                  await onDelete(story.id);
                  setDeleting(false);
                  setShowDeleteConfirm(false);
                }}
                className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ background: deleting ? "rgba(239,68,68,0.4)" : "#ef4444" }}>
                {deleting
                  ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> A apagar…</>
                  : <><Trash2 className="h-4 w-4" /> Apagar história</>}
              </button>
              <button
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full h-11 rounded-2xl font-semibold text-sm transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}


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

  async function handleFollow(userId: string) {
    if (following.has(userId)) {
      await (supabase as any).from("follows").delete()
        .eq("follower_id", myUserId).eq("following_id", userId);
      setFollowing(prev => { const s = new Set(prev); s.delete(userId); return s; });
    } else {
      await (supabase as any).from("follows").insert({ follower_id: myUserId, following_id: userId });
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
              <button onClick={() => handleFollow(user.id)}
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

/* ── SimpleVideoPlayer — player simples para o feed ── */
function SimpleVideoPlayer({ src, poster, postId, kind }: { src: string; poster?: string; postId?: string; kind?: string }) {
  const [isShort, setIsShort] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  // Regista view após 3s (só video/clip)
  usePostVideoView(postId, kind, ref);

  function togglePlay() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  return (
    <div
      className="w-full bg-black relative cursor-pointer"
      style={{
        aspectRatio: isShort === true ? "9/16" : isShort === false ? "16/9" : "16/9",
        maxHeight: isShort === true ? "75vh" : "560px",
      }}
      onClick={togglePlay}
    >
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          const v = ref.current;
          if (v) setIsShort(v.videoHeight > v.videoWidth);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="w-full h-full block"
        style={{ display: "block", pointerEvents: "none", objectFit: "contain" }}
      />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
            <svg className="h-7 w-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
      {playing && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.45)" }}>
            <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          </div>
        </div>
      )}
      {isShort === null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      )}
    </div>
  );
}

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
    <article className="hooda-card overflow-hidden animate-fade-in-up" style={{ borderRadius: 16 }}>

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
        <SimpleVideoPlayer src={streamSrc} poster={p.clip_thumb_url || p.thumbnail_url || undefined} postId={p.id} kind="clip" />
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
      await supabase.from("follows").insert({ follower_id: session.user.id, following_id: p.author_id, target_username: p.author_username });
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
    <article className="hooda-card overflow-hidden animate-fade-in-up" style={{ borderRadius: 16 }}>

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
        <SimpleVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" />
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
          <div className="flex items-center gap-0.5">
            <button onClick={toggleLike}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : "hover:bg-[var(--s1)]"}`}>
              <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-[var(--text-muted)]"}`} />
              <span className="text-xs font-semibold" style={{ color: liked ? "#ef4444" : "var(--text-muted)" }}>{likeCount}</span>
            </button>
            <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-[var(--s1)]">
              <MessageCircle className="h-5 w-5 text-[var(--text-muted)]" />
              <span className="text-xs font-semibold text-[var(--text-muted)]">{p.comments ?? 0}</span>
            </button>
            {/* Repost */}
            <button onClick={() => setShowRepost(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 hover:bg-[var(--s1)]">
              <Repeat2 className="h-5 w-5" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }} />
              {repostCount > 0 && (
                <span className="text-xs font-semibold" style={{ color: didRepost ? "#1FAFA6" : "var(--text-muted)" }}>{repostCount}</span>
              )}
            </button>
            <button onClick={() => setShowForward(true)} className="p-2 rounded-full hover:bg-[var(--s1)] transition">
              <Forward className="h-5 w-5 text-[var(--text-muted)]" />
            </button>
          </div>
          <BookmarkButton />
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
                <SimpleVideoPlayer src={p.video} poster={p.video_thumb || p.photo || undefined} postId={p.id} kind="video" />
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
            <div className="flex items-center gap-1 pt-2 pb-1">
              <button onClick={toggleLike}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : "hover:bg-[var(--s1)]"}`}>
                <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : "text-[var(--text-muted)]"}`} />
              </button>
              <Share2 className="h-5 w-5 text-[var(--text-muted)] ml-1" />
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
  // Stories: ver storiesQuery mais abaixo (React Query, cache + atualização
  // silenciosa em segundo plano — nunca limpa a lista nem mostra vazio).
  const [showCreator, setShowCreator] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const { avatarUrl: userAvatarUrl } = useAvatar();

  /* ── Notifications ── */
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const [toast, setToast] = useState<Notif | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const [showWhoToFollow, setShowWhoToFollow] = React.useState(true);
  const [showWhoToFollow2, setShowWhoToFollow2] = React.useState(true);
  const [feedVisible, setFeedVisible] = useState(15);
  const [feedOffset, setFeedOffset] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [extraPosts, setExtraPosts] = useState<any[]>([]); // páginas extra carregadas via scroll infinito
  const [myUserId, setMyUserId] = useState("");
  const [myUsername, setMyUsername] = useState("");

  // ─── ALGORITMO DE FEED ──────────────────────────────────────────────────────
  //
  // Score de cada post = soma ponderada de sinais:
  //
  //  RELEVÂNCIA (quem publicou)
  //    +120  post do próprio utilizador
  //    +100  post de alguém que o utilizador segue
  //    +20   post público/seed (descoberta)
  //
  //  ENGAGEMENT (popularidade do post)
  //    +8    por gosto
  //    +12   por comentário
  //    +15   por guardado (save) — indica intenção forte
  //
  //  TIPO DE CONTEÚDO
  //    +30   post com foto(s)
  //    +25   clip de vídeo
  //    +10   post de texto com fundo (bg)
  //    +5    post de texto puro
  //
  //  FRESCURA (decaimento exponencial por hora)
  //    score *= exp(-λ * horas)  onde λ = 0.08 (meia-vida ≈ 8.6h)
  //    → um post de 24h vale ~15% do score de um post novo
  //    → um post de 48h vale ~2% do score
  //    → posts com 7+ dias desaparecem quasi completamente
  //    (mas posts próprios têm decaimento 50% mais lento)
  //
  //  BOOST POR INTERAÇÃO DO UTILIZADOR
  //    +50  se o utilizador já interagiu com o autor antes
  //         (gostou de um post ou comentou → relação forte)
  //
  //  PENALIDADE
  //    -999 clips > 5 minutos (nunca mostrar)
  //    -50  posts repetidos do mesmo autor em sequência
  //         (para variedade no feed)
  // ────────────────────────────────────────────────────────────────────────────

  async function fetchFeedPage(uid: string) {
    // 1. Quem o utilizador segue + quando criou a conta
    const [{ data: followData }, { data: profileData }] = await Promise.all([
      supabase.from("follows").select("target_username").eq("follower_id", uid),
      supabase.from("profiles").select("created_at").eq("id", uid).single(),
    ]);

    const followedUsernames = [...new Set((followData || []).map((f: any) => f.target_username).filter(Boolean))];
    let followingIds: string[] = [];
    if (followedUsernames.length > 0) {
      const { data: followedProfiles } = await supabase
        .from("profiles").select("id,username").in("username", followedUsernames);
      followingIds = (followedProfiles || []).map((p: any) => p.id).filter(Boolean);
    }

    // Utilizador novo = conta < 7 dias E sem follows
    const accountAgeMs = profileData?.created_at
      ? Date.now() - new Date(profileData.created_at).getTime()
      : 0;
    const isNewUser = accountAgeMs < 7 * 24 * 60 * 60 * 1000 && followingIds.length === 0;

    // 2. Janela temporal — novos vêem 30 dias para ter mais conteúdo
    const windowDays = isNewUser ? 30 : 7;
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: postsData, error: postsErr } = await supabase
      .from("posts")
      .select("id,author_id,user_id,author_username,author_name,author_color,content,kind,is_ad,created_at,photo_url,photos,video_url,clip_video_id,clip_start,clip_end,clip_title,channel_id,channel_handle,channel_name,channel_avatar,clip_thumb_url")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(200);

    if (postsErr) console.error("Feed error:", postsErr);
    if (!postsData || postsData.length === 0) return [];

    // Deduplicate
    const seenIds = new Set<string>();
    const deduped = postsData.filter((p: any) => {
      if (!p.id || seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    // Filtro duro: clips > 5 min nunca aparecem
    const MAX_CLIP_SECONDS = 300;
    const eligible = deduped.filter((p: any) => {
      if (p.kind !== "clip") return true;
      return ((p.clip_end ?? 0) - (p.clip_start ?? 0)) <= MAX_CLIP_SECONDS;
    });

    if (eligible.length === 0) return [];

    const postIds = eligible.map((p: any) => p.id);
    const authorIds = [...new Set(eligible.map((p: any) => p.author_id || p.user_id).filter(Boolean))];

    // 3. Sinais em paralelo
    const [
      { data: likesData },
      { data: commentsData },
      { data: savesData },
      { data: authorProfiles },
      { data: myLikesData },
      { data: myCommentsData },
    ] = await Promise.all([
      supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
      supabase.from("post_comments").select("post_id").in("post_id", postIds),
      supabase.from("post_saves").select("post_id").in("post_id", postIds),
      authorIds.length > 0
        ? supabase.from("profiles").select("id,avatar_url,username,full_name").in("id", authorIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("post_likes").select("post_id").eq("user_id", uid).limit(100),
      supabase.from("post_comments").select("post_id").eq("user_id", uid).limit(100),
    ]);

    const likesByPost: Record<string, string[]> = {};
    (likesData || []).forEach((l: any) => {
      if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
      likesByPost[l.post_id].push(l.user_id);
    });
    const commentsByPost: Record<string, number> = {};
    (commentsData || []).forEach((c: any) => { commentsByPost[c.post_id] = (commentsByPost[c.post_id] || 0) + 1; });
    const savesByPost: Record<string, number> = {};
    (savesData || []).forEach((s: any) => { savesByPost[s.post_id] = (savesByPost[s.post_id] || 0) + 1; });

    const avatarMap: Record<string, string | null> = {};
    const nameMap: Record<string, string> = {};
    const usernameMap: Record<string, string> = {};
    (authorProfiles || []).forEach((p: any) => {
      avatarMap[p.id] = p.avatar_url || null;
      nameMap[p.id] = p.full_name || p.username || "";
      usernameMap[p.id] = p.username || "";
    });

    const myInteractedPostIds = new Set([
      ...(myLikesData || []).map((l: any) => l.post_id),
      ...(myCommentsData || []).map((c: any) => c.post_id),
    ]);
    const interactedAuthorIds = new Set(
      eligible.filter((p: any) => myInteractedPostIds.has(p.id)).map((p: any) => p.author_id).filter(Boolean)
    );

    const ACCENT_LOCAL = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A","#FFC93C"];

    // 4. Scoring
    const LAMBDA = 0.08;

    // Para utilizadores novos: lambda muito mais lento (conteúdo mais antigo ainda aparece)
    // e o peso de engagement é muito maior (mostrar o que é popular)
    const LAMBDA_NEW  = 0.015;
    const ENGAGEMENT_MULTIPLIER = isNewUser ? 3.0 : 1.0;

    const scored = eligible.map((p: any) => {
      const hoursOld = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
      const isOwn      = p.author_id === uid;
      const isFollowed = followingIds.includes(p.author_id);
      const isSeed     = !p.author_id;

      // Relevância base
      let score: number;
      if (isNewUser) {
        // Utilizador novo: tudo vale igual em relevância — o engagement decide
        score = 30;
        if (isOwn) score = 120; // próprio aparece sempre bem posicionado
      } else {
        score = isSeed ? 20 : isOwn ? 120 : isFollowed ? 100 : 15;
      }

      // Engagement (triplicado para novos utilizadores = mostra o mais popular)
      const likes    = (likesByPost[p.id] || []).length;
      const comments = commentsByPost[p.id] || 0;
      const saves    = savesByPost[p.id] || 0;
      score += (likes * 8 + comments * 12 + saves * 15) * ENGAGEMENT_MULTIPLIER;

      // Tipo de conteúdo
      if      (p.kind === "clip") score += 25;
      else if (p.photo_url || (Array.isArray(p.photos) && p.photos.length > 0)) score += 30;
      else if (p.kind === "bg")   score += 10;
      else                        score += 5;

      // Afinidade (não se aplica a novos pois não têm histórico)
      if (!isNewUser && p.author_id && interactedAuthorIds.has(p.author_id)) score += 50;

      // Decaimento temporal
      const lambda = isNewUser ? LAMBDA_NEW : (isOwn ? LAMBDA * 0.5 : LAMBDA);
      score *= Math.exp(-lambda * hoursOld);

      // Boost de frescura (< 2h)
      if (hoursOld < 2) score *= 1.3;

      // Aleatoriedade leve ±10%
      score *= 0.9 + Math.random() * 0.2;

      const authorKey = p.author_id || p.user_id;
      const name = p.author_name || nameMap[authorKey] || p.author_username || "hooda";
      const username = p.author_username || usernameMap[authorKey] || "";
      let text = p.content;
      let bg_color = null;
      if (p.kind === "bg") { try { const j = JSON.parse(p.content); text = j.text; bg_color = j.bgColor; } catch {} }

      return {
        _score: score,
        id: p.id, user_id: p.author_id,
        author_id: p.author_id,
        author_username: username || null,
        user: name, name: `@${username || "?"}`,
        color: p.author_color || ACCENT_LOCAL[(name.charCodeAt(0) || 0) % ACCENT_LOCAL.length],
        avatar_url: (p.author_id || p.user_id) ? (avatarMap[p.author_id] ?? avatarMap[p.user_id] ?? null) : null,
        text, photo: p.photo_url ?? null,
        photos: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : (p.photo_url ? [p.photo_url] : null),
        video: p.video_url ?? null,
        bg_color, created_at: p.created_at, kind: p.kind, is_ad: p.is_ad,
        likes, liked_by_me: (likesByPost[p.id] || []).includes(uid),
        comments: commentsByPost[p.id] || 0,
        clip_video_id: p.clip_video_id, clip_start: p.clip_start, clip_end: p.clip_end,
        clip_title: p.clip_title, clip_thumb_url: p.clip_thumb_url,
        channel_id: p.channel_id, channel_handle: p.channel_handle,
        channel_name: p.channel_name, channel_avatar: p.channel_avatar,
        _isNewUserFeed: isNewUser,
      };
    });

    // 5. Ordenar por score
    scored.sort((a, b) => b._score - a._score);

    // 6. Anti-repetição: máx 2 posts seguidos do mesmo autor
    const result: typeof scored = [];
    const recentAuthors: string[] = [];
    for (const post of scored) {
      const author = post.user_id || "seed";
      const recentCount = recentAuthors.slice(-4).filter(a => a === author).length;
      if (recentCount >= 2) continue;
      result.push(post);
      recentAuthors.push(author);
      if (result.length >= 50) break;
    }

    return result;
  }

  // persistência em localStorage configurada no root, restaura este
  // resultado instantaneamente na próxima visita — sem ecrã vazio nem
  // spinner — enquanto busca dados novos em segundo plano.
  const feedQuery = useQuery({
    queryKey: QUERY_KEYS.feed(myUserId),
    queryFn: () => fetchFeedPage(myUserId),
    enabled: !!myUserId,
    ...FEED_QUERY_OPTIONS,
    placeholderData: (prev: any) => prev,
  });

  const firstPagePosts = feedQuery.data ?? [];
  // Posts da primeira página (React Query) + páginas extra carregadas via
  // scroll infinito, sempre deduplicados por id antes de renderizar.
  const realPosts = useMemo(() => {
    const seen = new Set<string>();
    return [...firstPagePosts, ...extraPosts].filter((p: any) => {
      if (!p?.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [firstPagePosts, extraPosts]);

  // Só mostra o skeleton de loading quando NÃO há nenhum dado em cache —
  // nem da rede nem do localStorage. Se houver cache (mesmo desatualizado),
  // mostra-o já e atualiza silenciosamente em segundo plano.
  const loadingFeed = feedQuery.isLoading && firstPagePosts.length === 0;
  const refreshingFeedInBackground = feedQuery.isFetching && !loadingFeed;

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


    // ── Carregar mais publicações (scroll infinito) ──────────
    async function loadMoreFeed() {
      if (loadingMore || !hasMorePosts || !myUserId) return;
      setLoadingMore(true);
      try {
        const { data: postsData } = await supabase
          .from("posts")
          .select("id,author_id,author_username,author_name,author_color,content,kind,is_ad,created_at")
          .order("created_at", { ascending: false })
          .range(feedOffset, feedOffset + 14);
        if (!postsData || postsData.length === 0) { setHasMorePosts(false); setLoadingMore(false); return; }
        const newIds = postsData.map((p: any) => p.id);
        const { data: likesData } = await supabase.from("post_likes").select("post_id,user_id").in("post_id", newIds);
        const { data: savesData } = await supabase.from("post_saves").select("post_id").in("post_id", newIds).eq("user_id", myUserId);
        const likesByPost: Record<string, string[]> = {};
        (likesData || []).forEach((l: any) => { if (!likesByPost[l.post_id]) likesByPost[l.post_id] = []; likesByPost[l.post_id].push(l.user_id); });
        const savedIds = new Set((savesData || []).map((s: any) => s.post_id));
        const morePosts = postsData.map((p: any) => ({
          ...p, user: p.author_username || "hooda", color: p.author_color || "#5B3FCF",
          likes: (likesByPost[p.id] || []).length, liked_by_me: (likesByPost[p.id] || []).includes(myUserId),
          saved: savedIds.has(p.id), comments: 0,
        }));
        setExtraPosts(prev => {
          const seen = new Set([...firstPagePosts, ...prev].map((p: any) => p.id));
          return [...prev, ...morePosts.filter((p: any) => !seen.has(p.id))];
        });
        setHasMorePosts(postsData.length === 15);
        setFeedOffset(prev => prev + postsData.length);
        setFeedVisible(prev => prev + postsData.length);
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
    }, [hasMorePosts, loadingMore, feedOffset, myUserId]);

  
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


  async function handleDeleteStory(id: string) {
    // Optimistic local update — remove the slide immediately, direto na
    // cache do React Query (não limpa a lista, só ajusta a tua entrada).
    qc.setQueryData(QUERY_KEYS.stories(myUserId), (prev: Story[] | undefined) =>
      (prev ?? []).map((s) => {
        if (!s.isYou) return s;
        const remaining = (s.slides ?? []).filter((sl) => sl.id !== id);
        if (remaining.length === 0) {
          return { name: s.name, color: s.color, isYou: true };
        }
        return { ...remaining[remaining.length - 1], isYou: true, published: true, name: s.name, slides: remaining };
      })
    );
    // Close viewer if no slides remain
    setViewerIdx(null);
    try {
      await (supabase.from("stories") as any).delete().eq("id", id);
    } catch {
      // Optimistic update already applied; próxima atualização silenciosa sincroniza
    }
  }

  async function handlePublish(data: Partial<Story>) {
    const newSlide: Story = { ...data, published: true } as Story;
    // Prevent empty stories — ignore default bg gradient, require real content
    const hasRealText = ((data as any).textLayers ?? []).some((l: any) => l.text && l.text.trim().length > 0);
    const hasContent = !!(data as any).photo || hasRealText || !!(data as any).music || (data as any).isAudio;
    if (!hasContent) return;

    // Optimistic local update — add slide immediately, direto na cache.
    qc.setQueryData(QUERY_KEYS.stories(myUserId), (prev: Story[] | undefined) =>
      (prev ?? []).map((s) => {
        if (!s.isYou) return s;
        const existingSlides: Story[] = s.slides ?? (s.published ? [{ ...s } as Story] : []);
        const slideWithName: Story = { ...newSlide, name: s.name, color: s.color };
        return { ...s, ...slideWithName, isYou: true, published: true, slides: [...existingSlides, slideWithName] };
      })
    );
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const username = myUsername || (session.user.email?.split("@")[0] ?? "você");
      const durationMs: Record<string, number> = {
        "1h": 3600000, "3h": 10800000, "6h": 21600000,
        "24h": 86400000, "3d": 259200000,
        // "Sempre" não pode ser ms=0 (isso expirava a story na hora
        // de a criar) — usamos um horizonte de 100 anos.
        "always": 100 * 365 * 24 * 3600000,
      };
      const ms = durationMs[data.duration ?? "24h"] ?? 86400000;
      const expiresAt = new Date(Date.now() + ms).toISOString();
      await (supabase.from("stories") as any).insert({
        user_id: session.user.id,
        author_username: username,
        author_color: "#5B3FCF",
        photo_url: (data as any).photo ?? null,
        bg_grad: (data as any).bg ?? null,
        text: (data as any).storyText ?? (data as any).textLayers?.[0]?.text ?? null,
        story_data: data,
        expires_at: expiresAt,
      });
      // After saving, reload from DB to get correct slides list
      const now = new Date().toISOString();
      const { data: rows } = await (supabase as any)
        .from("stories")
        .select("id, user_id, author_username, author_color, photo_url, bg_grad, text, story_data, expires_at, created_at")
        .eq("user_id", session.user.id)
        .gt("expires_at", now)
        .order("created_at", { ascending: true });
      if (rows && rows.length > 0) {
        const slides: Story[] = rows.map((r: any) => {
          const sd = r.story_data && typeof r.story_data === "object" ? r.story_data : {};
          return { ...sd, id: r.id, name: username, color: "#5B3FCF", photo: r.photo_url ?? sd.photo ?? undefined, bg: r.bg_grad ?? sd.bg ?? undefined, published: true };
        });
        qc.setQueryData(QUERY_KEYS.stories(myUserId), (prev: Story[] | undefined) =>
          (prev ?? []).map((s) => s.isYou
            ? { ...s, ...slides[slides.length - 1], isYou: true, published: true, name: username, slides }
            : s
          )
        );
      }
    } catch {
      // Optimistic update already applied
    }
  }

  // Busca pura dos stories (sem tocar em estado React) — usada como
  // queryFn do React Query. Devolve sempre [youStory, ...otherStories],
  // nunca um array vazio "a limpar" o anterior: se não houver stories de
  // ninguém, youStory ainda aparece (placeholder "+"), e React Query só
  // substitui os dados quando a busca termina com sucesso — nunca antes.
  async function fetchStoriesPage(uid: string, username: string): Promise<Story[]> {
    const now = new Date().toISOString();

    // 1 — Buscar IDs de quem me segue
    const { data: followRows } = await (supabase as any)
      .from("follows")
      .select("follower_id")
      .eq("following_id", uid);
    const followerIds: string[] = (followRows ?? []).map((r: any) => r.follower_id);

    // 2 — Buscar IDs de contactos de mensagens
    const { data: convRows } = await (supabase as any)
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", uid);
    const convIds = (convRows ?? []).map((r: any) => r.conversation_id);
    let contactIds: string[] = [];
    if (convIds.length > 0) {
      const { data: partRows } = await (supabase as any)
        .from("conversation_participants")
        .select("user_id")
        .in("conversation_id", convIds)
        .neq("user_id", uid);
      contactIds = (partRows ?? []).map((r: any) => r.user_id);
    }

    // 3 — União de IDs permitidos (eu + seguidores + contactos)
    const allowedIds = Array.from(new Set([uid, ...followerIds, ...contactIds]));

    const { data: rows, error } = await (supabase as any)
      .from("stories")
      .select("id, user_id, author_username, author_color, photo_url, bg_grad, text, story_data, expires_at, created_at")
      .gt("expires_at", now)
      .in("user_id", allowedIds)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    if (!rows || rows.length === 0) {
      return [{ name: username || "Você", color: "#5B3FCF", isYou: true }];
    }

    // Group rows by user_id (rows already newest-first)
    const byUser = new Map<string, any[]>();
    for (const row of rows) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id)!.push(row);
    }

    function rowToSlide(r: any): Story {
      const sd = r.story_data && typeof r.story_data === "object" ? r.story_data : {};
      return {
        ...sd,
        id: r.id,
        name: r.author_username ?? "?",
        color: r.author_color ?? "#5B3FCF",
        photo: r.photo_url ?? sd.photo ?? undefined,
        bg: r.bg_grad ?? sd.bg ?? undefined,
        published: true,
        // Preservar o timestamp real de criação para cálculo correto de tempo
        created_at: r.created_at,
      };
    }

    // Current user's story
    const myRows = byUser.get(uid) ?? [];
    const youStory: Story = myRows.length > 0
      ? {
          ...rowToSlide(myRows[0]),
          isYou: true,
          published: true,
          // slides in chronological order (oldest first = left swipe)
          slides: [...myRows].reverse().map(rowToSlide),
        }
      : { name: username || "Você", color: "#5B3FCF", isYou: true };

    // Other users
    const otherStories: Story[] = [];
    for (const [rowUid, userRows] of byUser) {
      if (rowUid === uid) continue;
      const latest = userRows[0];
      otherStories.push({
        ...rowToSlide(latest),
        slides: userRows.length > 1 ? [...userRows].reverse().map(rowToSlide) : undefined,
      });
    }

    return [youStory, ...otherStories];
  }

  // React Query cuida do cache e da atualização silenciosa em segundo
  // plano dos Stories — exatamente como o feed acima:
  //  - placeholderData: keepPreviousData → durante um refetch (manual ou
  //    pelo refetchInterval), os Stories já carregados NUNCA desaparecem
  //    nem piscam; o array antigo continua visível até o novo chegar.
  //  - staleTime curto + refetchInterval → re-busca silenciosa periódica
  //    (estilo Instagram), sem mostrar skeleton nem estado vazio.
  //  - cache persistido (ver queryClient.ts) → reabrir a Home mostra os
  //    Stories instantaneamente, mesmo antes da rede responder.
  const storiesQuery = useQuery({
    queryKey: QUERY_KEYS.stories(myUserId),
    queryFn: () => fetchStoriesPage(myUserId, myUsername),
    enabled: !!myUserId,
    staleTime: 20_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
  const stories = storiesQuery.data ?? BASE_STORIES;
  // Só mostra o skeleton quando NÃO há nenhum dado em cache (primeiríssimo
  // carregamento). Em qualquer atualização seguinte — manual, por
  // intervalo, ou ao voltar à página — os Stories antigos permanecem
  // visíveis e a busca acontece silenciosamente atrás deles.
  const loadingStories = storiesQuery.isLoading && !storiesQuery.data;

  if (!ready) return <div className="min-h-screen bg-[var(--s2)]" />;

  return (
    <>
    <SideNav />
    <PageWrapper className="pb-20 lg:pb-0">
      {viewerIdx !== null && (
        <StoryViewer stories={stories} startIndex={viewerIdx} onClose={() => setViewerIdx(null)} onDelete={handleDeleteStory} userAvatarUrl={userAvatarUrl} />
      )}
      {showCreator && (
        <StoryCreator onClose={() => setShowCreator(false)} onPublish={handlePublish} />
      )}

      <header className="sticky top-0 z-30 border-b hooda-sticky-header"
        style={{ background: "var(--s0)", borderColor: "var(--border-subtle)", backdropFilter: "blur(20px)" }}>
        <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 h-14 flex items-center justify-between">
          <HoodaLogo size="sm" className="lg:hidden" />
          <span className="hidden lg:block" />
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-[var(--s2)] rounded-full text-[var(--text-secondary)]">
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={() => { setShowNotifCenter(true); setToast(null); }}
              className="p-2 hover:bg-[var(--s2)] rounded-full text-[var(--text-secondary)] relative"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white" style={{ background: "#E94B8A" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl lg:max-w-3xl">
        {/* Stories row — mostra skeleton circular imediatamente, substitui pelo conteúdo real */}
        {loadingStories ? (
          <StoriesRowSkeleton count={6} />
        ) : (
        <section className="border-b mb-2" style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)", minHeight: 108 }}>
          <ul className="flex gap-4 overflow-x-auto px-4 py-4 no-scrollbar">
            {stories.map((s, i) => (
              <li key={s.name} className="flex flex-col items-center gap-1 shrink-0">
                {s.isYou ? (
                  /* Own story: always show + button; if also published show the story ring too */
                  <div className="relative">
                    {/* Story ring — visible once published, click to view */}
                    {s.published && (
                      <button
                        onClick={() => setViewerIdx(i)}
                        aria-label="Ver a tua história"
                        className="block">
                        <div className="h-14 w-14 rounded-full p-[2.5px]"
                          style={{ background: `conic-gradient(${s.color},#FFC93C,${s.color})` }}>
                          <div className="h-full w-full rounded-full bg-[var(--s2)] p-[2px]">
                            {s.photo
                              ? <img loading="eager" decoding="async" src={s.photo} alt={s.name}
                                  width={48} height={48}
                                  className="h-full w-full rounded-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              : <div className="h-full w-full rounded-full flex items-center justify-center text-white font-bold"
                                  style={{ background: s.bg ?? s.color }}>
                                  {(s.name?.[0] ?? "?").toUpperCase()}
                                </div>}
                          </div>
                        </div>
                      </button>
                    )}

                    {/* + button */}
                    {s.published ? (
                      <button
                        onClick={() => setShowCreator(true)}
                        aria-label="Adicionar nova história"
                        className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white transition-transform active:scale-90"
                        style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)", zIndex: 2 }}>
                        <Plus className="h-3.5 w-3.5 text-white" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowCreator(true)}
                        aria-label="Adicionar história"
                        className="block">
                        <div className="h-14 w-14 rounded-full p-[2.5px]"
                          style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
                          <div className="h-full w-full rounded-full bg-[var(--s2)] p-[2px]">
                            <div className="h-full w-full rounded-full flex items-center justify-center text-white font-bold"
                              style={{ background: s.color }}>
                              <Plus className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                ) : (
                  /* Other users' stories */
                  <button onClick={() => setViewerIdx(i)} aria-label={s.name} className="relative">
                    <div className="h-14 w-14 rounded-full p-[2.5px]"
                      style={{ background: `conic-gradient(${s.color},#FFC93C,${s.color})` }}>
                      <div className="h-full w-full rounded-full bg-[var(--s2)] p-[2px]">
                        {s.photo
                          ? <img loading="eager" decoding="async" src={s.photo} alt={s.name}
                              width={48} height={48}
                              className="h-full w-full rounded-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }} />
                          : <div className="h-full w-full rounded-full flex items-center justify-center text-white font-bold"
                              style={{ background: s.bg ?? s.color }}>
                              {(s.name?.[0] ?? "?").toUpperCase()}
                            </div>}
                      </div>
                    </div>
                    {s.music && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center border-2 border-white text-[9px]"
                        style={{ background: "#5B3FCF" }}>🎵</span>
                    )}
                  </button>
                )}
                <span className="text-[10px] truncate w-14 text-center" style={{ color: "var(--text-muted)" }}>
                  {s.isYou ? (s.published ? t("home.your_story", "Tua hist.") : t("common.add", "Adicionar")) : s.name}
                </span>
              </li>
            ))}
          </ul>
        </section>
        )}

        {/* Feed */}
        <section className="pt-2 pb-6 space-y-4 max-w-xl mx-auto w-full px-3">
          {loadingFeed && <FeedSkeleton count={4} />}

          {/* Banner boas-vindas para utilizadores novos */}
          {!loadingFeed && realPosts.length > 0 && realPosts[0]?._isNewUserFeed && (
            <div className="rounded-2xl p-4 mb-2"
              style={{ background: "linear-gradient(135deg,#5B3FCF18,#E94B8A12)", border: "1px solid #5B3FCF22" }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">👋</span>
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                    Bem-vindo à hooda!
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Estás a ver os conteúdos mais populares da plataforma. Segue pessoas para personalizar o teu feed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!loadingFeed && realPosts.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-4xl">📚</p>
              <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>O teu feed está vazio</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Segue outras pessoas para ver as publicações delas aqui.</p>
            </div>
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
    </PageWrapper>
    </>
  );
}
