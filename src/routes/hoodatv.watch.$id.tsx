import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft, Play, ThumbsUp, ThumbsDown, Share2, Eye, Clock,
  Bell, BellOff, Bookmark, BookmarkCheck, Copy, Check,
  MessageCircle, Send, Smile, Trash2, CornerDownRight, X,
  MoreVertical, Clock3, Ban, Flag, BarChart2, Repeat, Minimize2,
  ChevronRight, Gauge,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/hoodatv/watch/$id")({
  head: () => ({ meta: [{ title: "HoodaTV — A ver vídeo" }] }),
  component: WatchPage,
});

/* ── Constantes ── */
const P    = "#5B3FCF";
const PINK = "#E94B8A";
const GRAD = `linear-gradient(135deg,${P},${PINK})`;
const AVATAR_COLORS = [P, "#F26B3A", "#1FAFA6", "#6BA547", PINK];
const avatarColor = (name: string) =>
  AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
const EMOJIS = ["❤️","😂","😮","😢","👏","🔥","💯","😍"];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const REPORT_REASONS = [
  "Conteúdo sexual ou explícito",
  "Violência ou conteúdo perturbador",
  "Discurso de ódio ou discriminação",
  "Assédio ou bullying",
  "Spam ou enganoso",
  "Informação falsa",
  "Infração de direitos de autor",
  "Outro motivo",
];

/* ── Helpers ── */
const fmtDur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
    : `${m}:${String(sec).padStart(2,"0")}`;
};
const fmtV = (n: number) =>
  n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` :
  n >= 1_000     ? `${(n/1_000).toFixed(0)}K`      : String(n);
const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff/60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h`;
  const days = Math.floor(h/24); if (days < 30) return `${days}d`;
  const mo = Math.floor(days/30); if (mo < 12) return `${mo} meses`;
  return `${Math.floor(mo/12)} anos`;
};

/* ══════════════════════════════════
   QUERIES
══════════════════════════════════ */
function useVideo(id: string) {
  return useQuery({
    queryKey: ["htv-watch", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("videos")
        .select(`id,title,description,thumbnail_url,duration_seconds,
                 views_count,likes_count,created_at,published_at,
                 cf_stream_url,cf_embed_url,cf_stream_uid,video_path,channel_id,
                 channels(id,name,handle,avatar_url)`)
        .eq("id", id).maybeSingle();
      return data ?? null;
    },
    staleTime: 60_000,
  });
}

function useRelated(currentId: string) {
  return useQuery({
    queryKey: ["htv-related", currentId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("videos")
        .select(`id,title,thumbnail_url,duration_seconds,views_count,published_at,created_at,
                 channels(name,handle,avatar_url)`)
        .eq("status","published").eq("visibility","public")
        .neq("id", currentId)
        .order("views_count",{ ascending: false }).limit(12);
      return (data ?? []).map((v: any) => ({ ...v, channel: v.channels }));
    },
    staleTime: 120_000,
  });
}

function useMe() {
  return useQuery({
    queryKey: ["htv-me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user ?? null,
    staleTime: 60_000,
  });
}

function useVideoReactions(videoId: string, userId: string | null) {
  return useQuery({
    queryKey: ["htv-reactions", videoId, userId],
    queryFn: async () => {
      const [likesRes, dislikesRes, myLikeRes, myDislikeRes] = await Promise.all([
        (supabase as any).from("video_likes").select("*", { count: "exact", head: true }).eq("video_id", videoId),
        (supabase as any).from("video_dislikes").select("*", { count: "exact", head: true }).eq("video_id", videoId),
        userId ? (supabase as any).from("video_likes").select("id").eq("video_id", videoId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
        userId ? (supabase as any).from("video_dislikes").select("id").eq("video_id", videoId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return {
        likes:        likesRes.count ?? 0,
        dislikes:     dislikesRes.count ?? 0,
        userLiked:    !!myLikeRes.data,
        userDisliked: !!myDislikeRes.data,
      };
    },
    staleTime: 30_000,
  });
}

function useSaved(videoId: string, userId: string | null) {
  return useQuery({
    queryKey: ["htv-saved", videoId, userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await (supabase as any).from("saved_videos")
        .select("id").eq("video_id", videoId).eq("user_id", userId).maybeSingle();
      return !!data;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

function useComments(videoId: string) {
  return useQuery({
    queryKey: ["htv-comments", videoId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("video_comments")
        .select(`id,content,created_at,parent_id,user_id,
                 profiles(username,avatar_url,display_name),
                 video_comment_reactions(id,emoji,user_id)`)
        .eq("video_id", videoId)
        .is("parent_id", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function useReplies(commentId: string) {
  return useQuery({
    queryKey: ["htv-replies", commentId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("video_comments")
        .select(`id,content,created_at,parent_id,user_id,
                 profiles(username,avatar_url,display_name),
                 video_comment_reactions(id,emoji,user_id)`)
        .eq("parent_id", commentId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function useIsFollowing(userId: string | null, channelId: string | undefined) {
  return useQuery({
    queryKey: ["htv-is-following", userId, channelId],
    queryFn: async () => {
      if (!userId || !channelId) return false;
      const { data } = await (supabase as any).from("follows").select("id")
        .eq("follower_id", userId).eq("following_id", channelId).maybeSingle();
      return !!data;
    },
    enabled: !!userId && !!channelId,
    staleTime: 30_000,
  });
}

/* ══════════════════════════════════
   SUB-COMPONENTES
══════════════════════════════════ */

/* ── Vídeo lateral ── */
function RelatedCard({ v, onClick }: { v: any; onClick: () => void }) {
  const ch = v.channel;
  const bg = avatarColor(ch?.name ?? "");
  return (
    <div className="flex gap-2.5 cursor-pointer group" onClick={onClick}>
      <div className="relative shrink-0 w-[140px] aspect-video rounded-xl overflow-hidden" style={{ background: "var(--s3)" }}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: `${bg}22` }}>
              <Play className="w-6 h-6" style={{ color: bg, opacity: 0.5 }} />
            </div>}
        {v.duration_seconds && (
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-white px-1 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.80)" }}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[12px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>{v.title}</p>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{ch?.name ?? "Canal"}</p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {fmtV(v.views_count ?? 0)} views · {timeAgo(v.published_at ?? v.created_at)}
        </p>
      </div>
    </div>
  );
}

/* ── Sheet de partilha ── */
function ShareSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        style={{ background: "var(--s0)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>Partilhar</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-2xl border mb-4"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          <p className="flex-1 text-sm truncate" style={{ color: "var(--text-secondary)" }}>{url}</p>
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={copied ? { background: "#6BA547", color: "#fff" } : { background: GRAD, color: "#fff" }}>
            {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal de denúncia ── */
function ReportModal({ onClose, videoTitle }: { onClose: () => void; videoTitle: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  function submit() {
    if (!selected) return;
    setSent(true);
    setTimeout(() => { onClose(); toast.success("Denúncia enviada. Obrigado!"); }, 1200);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        style={{ background: "var(--s0)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>Denunciar vídeo</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <p className="text-xs mb-4 truncate" style={{ color: "var(--text-muted)" }}>{videoTitle}</p>
        {sent ? (
          <div className="py-8 flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#6BA54720" }}>
              <Check className="w-6 h-6" style={{ color: "#6BA547" }} />
            </div>
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Denúncia enviada!</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-5">
              {REPORT_REASONS.map(r => (
                <button key={r} onClick={() => setSelected(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-left transition-all"
                  style={selected === r
                    ? { background: `${P}15`, border: `1.5px solid ${P}`, color: P }
                    : { background: "var(--s2)", border: "1.5px solid transparent", color: "var(--text-secondary)" }}>
                  <div className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                    style={{ borderColor: selected === r ? P : "var(--border-default)" }}>
                    {selected === r && <div className="w-2 h-2 rounded-full" style={{ background: P }} />}
                  </div>
                  {r}
                </button>
              ))}
            </div>
            <button onClick={submit} disabled={!selected}
              className="w-full h-11 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}>
              Enviar denúncia
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Modal de estatísticas ── */
function StatsModal({ video, reactions, onClose }: { video: any; reactions: any; onClose: () => void }) {
  const totalReactions = (reactions?.likes ?? 0) + (reactions?.dislikes ?? 0);
  const likeRatio = totalReactions > 0 ? Math.round(((reactions?.likes ?? 0) / totalReactions) * 100) : 0;
  const stats = [
    { label: "Visualizações", value: fmtV(video.views_count ?? 0), icon: "👁️" },
    { label: "Gostos", value: fmtV(reactions?.likes ?? 0), icon: "👍" },
    { label: "Não gostos", value: fmtV(reactions?.dislikes ?? 0), icon: "👎" },
    { label: "Rácio de aprovação", value: `${likeRatio}%`, icon: "📊" },
    { label: "Duração", value: fmtDur(video.duration_seconds) || "—", icon: "⏱️" },
    { label: "Publicado há", value: timeAgo(video.published_at ?? video.created_at), icon: "📅" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        style={{ background: "var(--s0)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>📊 Estatísticas</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        {/* Barra de aprovação */}
        <div className="mb-5 p-4 rounded-2xl" style={{ background: "var(--s2)" }}>
          <div className="flex justify-between text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            <span>👍 {likeRatio}% aprovação</span>
            <span>👎 {100 - likeRatio}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${likeRatio}%`, background: GRAD }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {stats.map(s => (
            <div key={s.label} className="p-3 rounded-2xl" style={{ background: "var(--s2)" }}>
              <p className="text-lg mb-0.5">{s.icon}</p>
              <p className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>{s.value}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Menu de 3 pontinhos ── */
function VideoOptionsMenu({
  onClose, onWatchLater, onNotInterested, onReport, onStats,
  onSpeedChange, onLoopToggle, onPiP,
  speed, looping, hasPiP,
  isSaved,
}: {
  onClose: () => void;
  onWatchLater: () => void;
  onNotInterested: () => void;
  onReport: () => void;
  onStats: () => void;
  onSpeedChange: (s: number) => void;
  onLoopToggle: () => void;
  onPiP: () => void;
  speed: number;
  looping: boolean;
  hasPiP: boolean;
  isSaved: boolean;
}) {
  const [showSpeed, setShowSpeed] = useState(false);

  const items = [
    { icon: <Clock3 className="w-4 h-4" />, label: "Assistir mais tarde", sub: isSaved ? "Já guardado" : undefined, action: onWatchLater },
    { icon: <Gauge className="w-4 h-4" />, label: "Velocidade", sub: `${speed}x`, action: () => setShowSpeed(s => !s), chevron: true },
    { icon: <Repeat className="w-4 h-4" />, label: "Repetir vídeo", sub: looping ? "Ativo" : "Desativado", action: onLoopToggle, active: looping },
    ...(hasPiP ? [{ icon: <Minimize2 className="w-4 h-4" />, label: "Miniplayer (PiP)", action: onPiP }] : []),
    { icon: <BarChart2 className="w-4 h-4" />, label: "Estatísticas", action: () => { onStats(); onClose(); } },
    { icon: <Ban className="w-4 h-4" />, label: "Não tenho interesse", action: () => { onNotInterested(); onClose(); } },
    { icon: <Flag className="w-4 h-4" />, label: "Denunciar", action: () => { onReport(); onClose(); }, danger: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        style={{ background: "var(--s0)" }} onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Opções</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--s2)" }}>
            <X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {showSpeed ? (
          <div className="p-3">
            <button onClick={() => setShowSpeed(false)}
              className="flex items-center gap-2 text-sm font-semibold mb-3 px-1"
              style={{ color: "var(--text-secondary)" }}>
              <ChevronLeft className="w-4 h-4" /> Velocidade de reprodução
            </button>
            <div className="grid grid-cols-3 gap-2">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => { onSpeedChange(s); setShowSpeed(false); onClose(); }}
                  className="h-10 rounded-2xl text-sm font-bold transition-all active:scale-95"
                  style={s === speed
                    ? { background: GRAD, color: "#fff" }
                    : { background: "var(--s2)", color: "var(--text-secondary)" }}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2">
            {items.map((item: any, i) => (
              <button key={i} onClick={item.action}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition hover:bg-[var(--s2)] text-left"
                style={{ color: item.danger ? "#ef4444" : item.active ? P : "var(--text-primary)" }}>
                <span style={{ color: item.danger ? "#ef4444" : item.active ? P : "var(--text-muted)" }}>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.sub && <span className="text-xs" style={{ color: item.active ? P : "var(--text-muted)" }}>{item.sub}</span>}
                {item.chevron && <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Reações num comentário ── */
function CommentReactions({ comment, me, qc, videoId }: { comment: any; me: any; qc: any; videoId: string }) {
  const [showPicker, setShowPicker] = useState(false);
  const reactions = comment.video_comment_reactions ?? [];

  const grouped = reactions.reduce((acc: Record<string, { count: number; mine: boolean }>, r: any) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count++;
    if (r.user_id === me?.id) acc[r.emoji].mine = true;
    return acc;
  }, {});

  async function toggleReaction(emoji: string) {
    if (!me) { toast.error("Inicia sessão para reagir."); return; }
    const mine = grouped[emoji]?.mine;
    if (mine) {
      await (supabase as any).from("video_comment_reactions")
        .delete().eq("comment_id", comment.id).eq("user_id", me.id).eq("emoji", emoji);
    } else {
      await (supabase as any).from("video_comment_reactions")
        .insert({ comment_id: comment.id, user_id: me.id, emoji });
    }
    qc.invalidateQueries({ queryKey: ["htv-comments", videoId] });
    qc.invalidateQueries({ queryKey: ["htv-replies", comment.parent_id ?? comment.id] });
    setShowPicker(false);
  }

  return (
    <div className="relative flex items-center gap-1 flex-wrap mt-1.5">
      {Object.entries(grouped).map(([emoji, { count, mine }]: any) => (
        <button key={emoji} onClick={() => toggleReaction(emoji)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-all active:scale-95"
          style={mine
            ? { background: `${P}20`, border: `1.5px solid ${P}`, color: P }
            : { background: "var(--s3)", border: "1.5px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
          {emoji} {count}
        </button>
      ))}
      <button onClick={() => setShowPicker(p => !p)}
        className="w-6 h-6 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
        style={{ color: "var(--text-muted)" }}>
        <Smile className="w-3.5 h-3.5" />
      </button>
      {showPicker && (
        <div className="absolute left-0 top-8 z-20 flex gap-1 p-2 rounded-2xl shadow-xl border"
          style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => toggleReaction(e)}
              className="w-8 h-8 text-lg rounded-xl flex items-center justify-center transition hover:bg-[var(--s2)] active:scale-95">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Comentário individual ── */
function CommentItem({ comment, me, videoId, qc, depth = 0 }: {
  comment: any; me: any; videoId: string; qc: any; depth?: number;
}) {
  const [replying, setReplying]       = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText]     = useState("");
  const { data: replies = [] } = useReplies(comment.id);

  const profile = comment.profiles;
  const name    = profile?.display_name || profile?.username || "Utilizador";
  const avatar  = profile?.avatar_url;
  const bg      = avatarColor(name);

  async function submitReply() {
    if (!me) { toast.error("Inicia sessão para responder."); return; }
    if (!replyText.trim()) return;
    await (supabase as any).from("video_comments").insert({
      video_id: videoId, user_id: me.id,
      parent_id: comment.id, content: replyText.trim(),
    });
    setReplyText(""); setReplying(false);
    qc.invalidateQueries({ queryKey: ["htv-replies", comment.id] });
    qc.invalidateQueries({ queryKey: ["htv-comments", videoId] });
  }

  async function deleteComment() {
    await (supabase as any).from("video_comments").delete().eq("id", comment.id);
    qc.invalidateQueries({ queryKey: ["htv-comments", videoId] });
    qc.invalidateQueries({ queryKey: ["htv-replies", comment.parent_id ?? ""] });
  }

  return (
    <div style={{ marginLeft: depth > 0 ? "40px" : "0" }}>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold"
          style={{ background: bg }}>
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{name}</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{timeAgo(comment.created_at)}</span>
            {me?.id === comment.user_id && (
              <button onClick={deleteComment}
                className="ml-auto w-6 h-6 rounded-full flex items-center justify-center transition hover:bg-red-50"
                style={{ color: "#ef4444" }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {comment.content}
          </p>
          <CommentReactions comment={comment} me={me} qc={qc} videoId={videoId} />
          <div className="flex items-center gap-3 mt-1.5">
            {depth === 0 && (
              <button onClick={() => setReplying(r => !r)}
                className="flex items-center gap-1 text-[11px] font-semibold transition hover:opacity-70"
                style={{ color: "var(--text-muted)" }}>
                <CornerDownRight className="w-3.5 h-3.5" /> Responder
              </button>
            )}
            {depth === 0 && replies.length > 0 && (
              <button onClick={() => setShowReplies(s => !s)}
                className="flex items-center gap-1 text-[11px] font-semibold transition"
                style={{ color: P }}>
                {showReplies ? "Ocultar" : `Ver ${replies.length} resposta${replies.length > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
          {replying && (
            <div className="flex gap-2 mt-2">
              <input
                autoFocus
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
                placeholder="Escreve uma resposta…"
                className="flex-1 rounded-full px-4 h-9 text-sm outline-none border"
                style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}
              />
              <button onClick={submitReply}
                disabled={!replyText.trim()}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-95 disabled:opacity-40"
                style={{ background: GRAD }}>
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
        </div>
      </div>
      {showReplies && depth === 0 && (
        <div className="mt-3 space-y-4">
          {replies.map((r: any) => (
            <CommentItem key={r.id} comment={r} me={me} videoId={videoId} qc={qc} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Secção de comentários ── */
function CommentsSection({ videoId, me }: { videoId: string; me: any }) {
  const qc = useQueryClient();
  const { data: comments = [], isLoading } = useComments(videoId);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  async function submit() {
    if (!me) { toast.error("Inicia sessão para comentar."); return; }
    if (!text.trim()) return;
    await (supabase as any).from("video_comments").insert({
      video_id: videoId, user_id: me.id, content: text.trim(),
    });
    setText("");
    qc.invalidateQueries({ queryKey: ["htv-comments", videoId] });
  }

  return (
    <div className="mt-6 space-y-5">
      <h3 className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>
        Comentários {comments.length > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>({comments.length})</span>}
      </h3>
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ background: me ? avatarColor(me.email ?? "") : "var(--s3)" }}>
          {me?.email?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 space-y-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={me ? "Adiciona um comentário…" : "Inicia sessão para comentar"}
            className="w-full rounded-2xl px-4 h-10 text-sm outline-none border transition-all"
            style={{ background: "var(--s2)", borderColor: focused ? P : "var(--border-default)", color: "var(--text-primary)" }}
          />
          {focused && (
            <div className="flex justify-end gap-2">
              <button onClick={() => { setFocused(false); setText(""); }}
                className="px-4 h-8 rounded-full text-xs font-bold border transition"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                Cancelar
              </button>
              <button onClick={submit} disabled={!text.trim()}
                className="px-4 h-8 rounded-full text-xs font-bold text-white transition active:scale-95 disabled:opacity-40"
                style={{ background: GRAD }}>
                Comentar
              </button>
            </div>
          )}
        </div>
      </div>
      {isLoading
        ? <div className="space-y-4">{Array.from({length:3}).map((_,i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full shrink-0" style={{ background: "var(--s3)" }} />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded-full w-1/4" style={{ background: "var(--s3)" }} />
                <div className="h-3 rounded-full w-3/4" style={{ background: "var(--s3)" }} />
              </div>
            </div>
          ))}</div>
        : !comments.length
          ? <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Ainda não há comentários. Sê o primeiro!</p>
          : <div className="space-y-5">
              {comments.map((c: any) => (
                <CommentItem key={c.id} comment={c} me={me} videoId={videoId} qc={qc} />
              ))}
            </div>}
    </div>
  );
}

/* ══════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════ */
function WatchPage() {
  const { id } = useParams({ from: "/hoodatv/watch/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: video, isLoading } = useVideo(id);
  const ch = video?.channels;
  const { data: related = [] } = useRelated(id);
  const { data: me } = useMe();
  const { data: reactions } = useVideoReactions(id, me?.id ?? null);
  const { data: isSaved = false } = useSaved(id, me?.id ?? null);
  const { data: isFollowing = false } = useIsFollowing(me?.id ?? null, ch?.id);

  const [showShare, setShowShare]     = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [showReport, setShowReport]   = useState(false);
  const [showStats, setShowStats]     = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [looping, setLooping]         = useState(false);
  const [hasPiP, setHasPiP]          = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const bg = avatarColor(ch?.name ?? "");

  /* ── Detectar suporte PiP ── */
  useEffect(() => {
    setHasPiP(document.pictureInPictureEnabled ?? false);
  }, []);

  /* ── Restaurar posição guardada ── */
  useEffect(() => {
    if (!videoRef.current || !id) return;
    const saved = localStorage.getItem(`htv-pos-${id}`);
    if (saved && parseFloat(saved) > 5) {
      videoRef.current.currentTime = parseFloat(saved);
      toast.info(`Continuado em ${fmtDur(Math.floor(parseFloat(saved)))}`, { duration: 2500 });
    }
  }, [id, videoRef.current]);

  /* ── Guardar posição periodicamente ── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    function save() {
      if (vid && vid.currentTime > 5) {
        localStorage.setItem(`htv-pos-${id}`, String(vid.currentTime));
      }
    }
    vid.addEventListener("timeupdate", save);
    return () => vid.removeEventListener("timeupdate", save);
  }, [id, videoRef.current]);

  /* ── Aplicar velocidade ── */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  /* ── Aplicar loop ── */
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = looping;
  }, [looping]);

  /* ── Like ── */
  async function toggleLike() {
    if (!me) { toast.error("Inicia sessão para gostar."); return; }
    if (reactions?.userLiked) {
      await (supabase as any).from("video_likes").delete().eq("video_id", id).eq("user_id", me.id);
    } else {
      await (supabase as any).from("video_likes").insert({ video_id: id, user_id: me.id });
      await (supabase as any).from("video_dislikes").delete().eq("video_id", id).eq("user_id", me.id);
    }
    qc.invalidateQueries({ queryKey: ["htv-reactions", id, me.id] });
  }

  /* ── Dislike ── */
  async function toggleDislike() {
    if (!me) { toast.error("Inicia sessão para reagir."); return; }
    if (reactions?.userDisliked) {
      await (supabase as any).from("video_dislikes").delete().eq("video_id", id).eq("user_id", me.id);
    } else {
      await (supabase as any).from("video_dislikes").insert({ video_id: id, user_id: me.id });
      await (supabase as any).from("video_likes").delete().eq("video_id", id).eq("user_id", me.id);
    }
    qc.invalidateQueries({ queryKey: ["htv-reactions", id, me.id] });
  }

  /* ── Guardar ── */
  async function toggleSave() {
    if (!me) { toast.error("Inicia sessão para guardar."); return; }
    if (isSaved) {
      await (supabase as any).from("saved_videos").delete().eq("video_id", id).eq("user_id", me.id);
      toast.success("Removido dos guardados.");
    } else {
      await (supabase as any).from("saved_videos").insert({ video_id: id, user_id: me.id });
      toast.success("Vídeo guardado!");
    }
    qc.invalidateQueries({ queryKey: ["htv-saved", id, me?.id] });
  }

  /* ── Seguir ── */
  async function toggleFollow() {
    if (!me) { toast.error("Inicia sessão para seguir."); return; }
    if (!ch?.id) return;
    if (isFollowing) {
      await (supabase as any).from("follows").delete().eq("follower_id", me.id).eq("following_id", ch.id);
      toast.success("Deixaste de seguir.");
    } else {
      await (supabase as any).from("follows").insert({ follower_id: me.id, following_id: ch.id });
      toast.success("Canal seguido!");
    }
    qc.invalidateQueries({ queryKey: ["htv-is-following", me.id, ch.id] });
  }

  /* ── Não tenho interesse ── */
  function handleNotInterested() {
    toast.success("Vídeo ocultado. Não voltarás a ver este conteúdo.");
    navigate({ to: "/hoodatv" });
  }

  /* ── PiP ── */
  async function handlePiP() {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
        toast.success("Miniplayer ativo!");
      }
    } catch {
      toast.error("PiP não suportado neste browser.");
    }
    setShowMenu(false);
  }

  /* ── Player URL ── */
  function getPlayerUrl(): string | null {
    if (!video) return null;
    if (video.cf_stream_url) return video.cf_stream_url;
    if (video.video_path) {
      const { data } = supabase.storage.from("videos").getPublicUrl(video.video_path);
      return data?.publicUrl ?? null;
    }
    return null;
  }

  const playerUrl = getPlayerUrl();
  const hasEmbed  = !!video?.cf_embed_url;
  const watchUrl  = typeof window !== "undefined" ? window.location.href : "";

  /* ── Título limpo — remove IDs e handles expostos acidentalmente ── */
  function cleanTitle(raw: string | null): string {
    if (!raw) return "";
    // Remove padrões: handle@..., UUIDs numéricos compridos, sequências de dígitos longas
    return raw
      .replace(/\b\d{10,}\b/g, "")      // sequências de dígitos longas (IDs)
      .replace(/@\S+/g, "")              // @handles
      .replace(/\s{2,}/g, " ")           // espaços duplos
      .trim();
  }

  /* Loading */
  if (isLoading) return (
    <><SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
          <div className="animate-pulse space-y-4">
            <div className="aspect-video rounded-2xl" style={{ background: "var(--s3)" }} />
            <div className="h-5 rounded-full w-3/4" style={{ background: "var(--s3)" }} />
            <div className="h-4 rounded-full w-1/2" style={{ background: "var(--s3)" }} />
          </div>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  if (!video) return (
    <><SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
          <Play className="w-16 h-16 mb-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Vídeo não encontrado</h2>
          <button onClick={() => navigate({ to: "/hoodatv" })}
            className="mt-4 px-6 py-2.5 rounded-full text-white font-bold text-sm" style={{ background: GRAD }}>
            Voltar à HoodaTV
          </button>
        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );

  return (
    <><SideNav />
      <PageWrapper className="pb-20 lg:pb-0">

        {showShare  && <ShareSheet url={watchUrl} onClose={() => setShowShare(false)} />}
        {showReport && <ReportModal onClose={() => setShowReport(false)} videoTitle={video.title ?? ""} />}
        {showStats  && <StatsModal video={video} reactions={reactions} onClose={() => setShowStats(false)} />}
        {showMenu   && (
          <VideoOptionsMenu
            onClose={() => setShowMenu(false)}
            onWatchLater={toggleSave}
            onNotInterested={handleNotInterested}
            onReport={() => setShowReport(true)}
            onStats={() => setShowStats(true)}
            onSpeedChange={s => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; toast.success(`Velocidade: ${s}x`); }}
            onLoopToggle={() => { setLooping(l => !l); toast.success(looping ? "Repetição desativada" : "Repetição ativada"); setShowMenu(false); }}
            onPiP={handlePiP}
            speed={speed}
            looping={looping}
            hasPiP={hasPiP && !!playerUrl}
            isSaved={isSaved}
          />
        )}

        {/* Back bar */}
        <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 border-b"
          style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
          <button onClick={() => navigate({ to: "/hoodatv" })}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
            style={{ color: "var(--text-primary)" }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold truncate flex-1" style={{ color: "var(--text-primary)" }}>HoodaTV</span>
          {/* Indicador de velocidade ativa */}
          {speed !== 1 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${P}20`, color: P }}>{speed}x</span>
          )}
          {/* Botão 3 pontinhos */}
          <button onClick={() => setShowMenu(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]"
            style={{ color: "var(--text-primary)" }}>
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">

          {/* ══ COLUNA ESQUERDA ══ */}
          <div className="space-y-4">

            {/* Player */}
            <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black relative"
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
              {playerUrl ? (
                <>
                  <video
                    ref={videoRef}
                    key={playerUrl}
                    src={playerUrl}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    loop={looping}
                    className="w-full h-full"
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => setIsBuffering(false)}
                    onCanPlay={() => setIsBuffering(false)}
                  />
                  {/* Buffer spinner */}
                  {isBuffering && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ background: "rgba(0,0,0,0.35)" }}>
                      <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                    </div>
                  )}
                </>
              ) : hasEmbed ? (
                <iframe src={`${video.cf_embed_url}?autoplay=true`} className="w-full h-full"
                  allow="autoplay; fullscreen" allowFullScreen />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <Play className="w-16 h-16" style={{ color: P, opacity: 0.35 }} />
                  <p className="text-white text-sm opacity-50">Vídeo não disponível</p>
                </div>
              )}
            </div>

            {/* Título limpo */}
            <h1 className="text-lg font-extrabold leading-snug" style={{ color: "var(--text-primary)" }}>
              {cleanTitle(video.title)}
            </h1>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{fmtV(video.views_count ?? 0)} visualizações</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeAgo(video.published_at ?? video.created_at)}</span>
              {looping && <span className="flex items-center gap-1 font-semibold" style={{ color: P }}><Repeat className="w-3.5 h-3.5" /> A repetir</span>}
            </div>

            {/* Acções */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={toggleLike}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold border transition-all active:scale-95"
                style={reactions?.userLiked
                  ? { background: GRAD, color: "#fff", border: "none" }
                  : { background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                <ThumbsUp className="w-4 h-4" />
                {fmtV(reactions?.likes ?? 0)}
              </button>

              <button onClick={toggleDislike}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold border transition-all active:scale-95"
                style={reactions?.userDisliked
                  ? { background: "#ef444420", color: "#ef4444", borderColor: "#ef4444" }
                  : { background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                <ThumbsDown className="w-4 h-4" />
                {fmtV(reactions?.dislikes ?? 0)}
              </button>

              <button onClick={toggleSave}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold border transition-all active:scale-95"
                style={isSaved
                  ? { background: `${P}18`, color: P, borderColor: P }
                  : { background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {isSaved ? "Guardado" : "Guardar"}
              </button>

              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold border transition-all active:scale-95"
                style={{ background: "var(--s2)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
                <Share2 className="w-4 h-4" /> Partilhar
              </button>
            </div>

            {/* Canal */}
            <div className="flex items-center justify-between p-4 rounded-2xl border"
              style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center gap-3 cursor-pointer"
                onClick={() => ch?.handle && navigate({ to: "/hoodatv/canal/$handle", params: { handle: ch.handle } })}>
                <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: bg }}>
                  {ch?.avatar_url ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" /> : (ch?.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold hover:underline" style={{ color: "var(--text-primary)" }}>{ch?.name ?? "Canal"}</p>
                  <p className="text-xs" style={{ color: P }}>@{ch?.handle}</p>
                </div>
              </div>
              <button onClick={toggleFollow}
                className="flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-bold transition-all active:scale-95 shrink-0"
                style={isFollowing
                  ? { background: "var(--s3)", color: "var(--text-secondary)", border: "1.5px solid var(--border-default)" }
                  : { background: GRAD, color: "#fff" }}>
                {isFollowing ? <><BellOff className="w-4 h-4" /> A seguir</> : <><Bell className="w-4 h-4" /> Seguir</>}
              </button>
            </div>

            {/* Descrição */}
            {video.description && (
              <div className="p-4 rounded-2xl border text-sm leading-relaxed"
                style={{ background: "var(--s2)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}>
                {video.description}
              </div>
            )}

            {/* Comentários */}
            <CommentsSection videoId={id} me={me} />
          </div>

          {/* ══ COLUNA DIREITA — A Seguir ══ */}
          <aside className="mt-6 lg:mt-0 space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>A Seguir</h3>
            <div className="space-y-3">
              {related.map((v: any, i: number) => (
                <div key={v.id} className="flex items-start gap-1">
                  <span className="text-xs font-bold mt-2 w-5 shrink-0 text-center" style={{ color: "var(--text-muted)" }}>{i+1}</span>
                  <RelatedCard v={v} onClick={() => navigate({ to: "/hoodatv/watch/$id", params: { id: v.id } })} />
                </div>
              ))}
              {!related.length && (
                <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Sem vídeos relacionados.</p>
              )}
            </div>
          </aside>

        </div>
        <BottomNav />
      </PageWrapper>
    </>
  );
}
