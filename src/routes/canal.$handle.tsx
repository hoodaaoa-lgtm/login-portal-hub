import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useScrollLock } from "@/hooks/useScrollLock";
import {
  ChevronLeft, Heart, MessageCircle, Share2, Bookmark,
  Play, Loader, X, Bell, BellOff, MoreHorizontal,
  Check, Forward, Link as LinkIcon, Calendar, Users,
  Eye, Grid3x3, Film, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/canal/$handle")({
  head: () => ({ meta: [{ title: "Canal — Hooda" }] }),
  component: CanalPage,
});

const P = "#5B3FCF";
const GRAD = `linear-gradient(135deg, ${P}, #E94B8A)`;

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

/* ── SimpleVideoPlayer ── */
function SimpleVideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const [isShort, setIsShort] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    v.paused ? (v.play(), setPlaying(true)) : (v.pause(), setPlaying(false));
  }

  return (
    <div className="w-full bg-black relative cursor-pointer"
      style={{ aspectRatio: isShort ? "9/16" : "16/9", maxHeight: isShort ? "75vh" : "560px" }}
      onClick={toggle}>
      <video ref={ref} src={src} poster={poster} playsInline preload="metadata"
        onLoadedMetadata={() => { const v = ref.current; if (v) setIsShort(v.videoHeight > v.videoWidth); }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        className="w-full h-full block" style={{ objectFit: "contain" }} />
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
            <Play className="h-7 w-7 text-white ml-1" fill="white" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ForwardModal ── */
function ForwardModal({ item, myId, onClose, isVideo = false }: { item: any; myId: string; onClose: () => void; isVideo?: boolean }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [linkCopied, setLinkCopied] = useState(false);
  useScrollLock();

  const shareUrl = isVideo
    ? `${window.location.origin}/watch/${item.id}`
    : `${window.location.origin}/post/${item.id}`;

  useEffect(() => {
    if (!myId) return;
    (async () => {
      const { data } = await (supabase as any).from("conversations")
        .select("id,participants,updated_at").contains("participants", [myId])
        .order("updated_at", { ascending: false }).limit(30);
      if (!data) return;
      const otherIds = [...new Set(data.flatMap((c: any) => c.participants.filter((p: string) => p !== myId)))];
      const { data: profs } = await (supabase as any).from("profiles").select("id,username,full_name,avatar_url").in("id", otherIds);
      const profMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { profMap[p.id] = p; });
      setConversations(data.map((c: any) => {
        const otherId = c.participants.find((p: string) => p !== myId);
        const prof = profMap[otherId] || {};
        return { ...c, otherName: prof.full_name || prof.username || "Utilizador", otherUsername: prof.username, avatar: prof.avatar_url };
      }));
    })();
  }, [myId]);

  async function forward(convId: string) {
    if (!myId || sending) return;
    setSending(convId);
    const text = `${item.title || item.text || ""}\n🔗 ${shareUrl}`.trim();
    await (supabase as any).from("messages").insert({ conversation_id: convId, sender_id: myId, content: text, type: "text" });
    setSent(s => new Set([...s, convId]));
    setSending(null);
  }

  const filtered = conversations.filter(c => !search || c.otherName?.toLowerCase().includes(search.toLowerCase()));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-sm lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet"
        style={{ maxHeight: "92vh", height: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-2.5 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-default)" }} />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--text-primary)" }}>Partilhar</span>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: "var(--s2)" }}>
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="px-4 pt-4">
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mb-3" style={{ background: "var(--s2)" }}>
              <span className="flex-1 text-xs truncate" style={{ color: "var(--text-muted)" }}>{shareUrl}</span>
              <button onClick={() => { navigator.clipboard.writeText(shareUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 shrink-0 flex items-center gap-1"
                style={{ background: linkCopied ? "#6BA547" : P, color: "#fff" }}>
                {linkCopied ? <><Check className="h-3.5 w-3.5" /> Copiado</> : "Copiar"}
              </button>
            </div>
            {typeof navigator.share === "function" && (
              <button onClick={() => navigator.share({ title: item.title || "Hooda", url: shareUrl }).catch(() => {})}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border mb-1 transition active:scale-[0.98]"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
                <Share2 className="h-4 w-4" /> Partilhar via...
              </button>
            )}
          </div>
          <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Enviar para conversa</p>
          <div className="px-4 py-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar…"
              className="w-full px-4 h-9 rounded-full text-sm outline-none border"
              style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          </div>
          <div className="px-2 pb-4">
            {filtered.map(c => (
              <button key={c.id} onClick={() => forward(c.id)} disabled={!!sending || sent.has(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition hover:bg-[var(--s2)] active:scale-[0.98]">
                <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: P }}>
                  {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.otherName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.otherName}</p>
                  {c.otherUsername && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>@{c.otherUsername}</p>}
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={sent.has(c.id) ? { background: "#6BA54720", color: "#6BA547" } : { background: "var(--s3)", color: "var(--text-muted)" }}>
                  {sending === c.id ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: P, borderTopColor: "transparent" }} />
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

/* ── VideoCard ── */
function VideoCard({ v, myId }: { v: any; myId: string | null }) {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(v.likes_count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sending, setSending] = useState(false);

  async function toggleLike() {
    if (!myId) { toast.error("Inicia sessão."); return; }
    setLiked(l => !l);
    setLikeCount((c: number) => liked ? c - 1 : c + 1);
    if (liked) await (supabase as any).from("video_likes").delete().eq("video_id", v.id).eq("user_id", myId);
    else await (supabase as any).from("video_likes").insert({ video_id: v.id, user_id: myId });
  }

  async function loadComments() {
    setCommentsLoading(true);
    const { data } = await (supabase as any).from("video_comments")
      .select("id,user_id,content,created_at,profiles(username,full_name,avatar_url)")
      .eq("video_id", v.id).order("created_at", { ascending: true });
    setComments((data ?? []).map((c: any) => ({
      id: c.id, authorName: c.profiles?.full_name || c.profiles?.username || "Utilizador",
      authorUsername: c.profiles?.username || "", avatarUrl: c.profiles?.avatar_url,
      text: c.content, createdAt: new Date(c.created_at), likeCount: 0, likedByMe: false, replies: [],
    })));
    setCommentsLoading(false);
  }

  useEffect(() => { if (showComments) loadComments(); }, [showComments]);

  const streamSrc = v.cf_stream_url || v.video_path || null;

  return (
    <article className="border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}>
      {/* Header do vídeo */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: P + "20" }}>
          {v.channel?.avatar_url ? <img src={v.channel.avatar_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-sm font-bold" style={{ color: P }}>{v.channel?.name?.[0]}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{timeAgo(v.published_at || v.created_at)} · <Eye className="inline h-3 w-3" /> {fmtNum(v.views_count ?? 0)}</p>
        </div>
        <button onClick={() => navigate({ to: `/watch/${v.id}` })}
          className="text-xs font-bold px-3 py-1.5 rounded-xl transition active:scale-95"
          style={{ color: P, background: P + "15" }}>Ver</button>
      </div>

      {/* Player */}
      {streamSrc && <SimpleVideoPlayer src={streamSrc} poster={v.thumbnail_url || undefined} />}
      {!streamSrc && v.thumbnail_url && (
        <button onClick={() => navigate({ to: `/watch/${v.id}` })} className="w-full relative block aspect-video bg-black">
          <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
              <Play className="h-7 w-7 text-white ml-1" fill="white" />
            </div>
          </div>
        </button>
      )}

      {/* Acções */}
      <div className="flex items-center px-3 pt-2 pb-1 gap-1">
        <button onClick={toggleLike} className="flex items-center gap-1 p-1.5 rounded-full transition active:scale-90">
          <Heart className={`h-[22px] w-[22px] transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : ""}`}
            style={{ color: liked ? undefined : "var(--text-primary)" }} />
        </button>
        {likeCount > 0 && <span className="text-xs font-semibold mr-2" style={{ color: "var(--text-muted)" }}>{fmtNum(likeCount)}</span>}
        <button onClick={() => setShowComments(true)} className="p-1.5 rounded-full transition active:scale-90">
          <MessageCircle className="h-[22px] w-[22px]" style={{ color: "var(--text-primary)" }} />
        </button>
        <button onClick={() => setShowShare(true)} className="p-1.5 rounded-full transition active:scale-90">
          <Share2 className="h-[22px] w-[22px]" style={{ color: "var(--text-primary)" }} />
        </button>
        <div className="flex-1" />
        <button onClick={() => setBookmarked(b => !b)} className="p-1.5 rounded-full transition active:scale-90">
          <Bookmark className={`h-[22px] w-[22px] transition ${bookmarked ? "fill-[#5B3FCF] text-[#5B3FCF]" : ""}`}
            style={{ color: bookmarked ? undefined : "var(--text-primary)" }} />
        </button>
      </div>

      {showComments && (
        <PostCommentsModal onClose={() => setShowComments(false)}
          comments={comments} loading={commentsLoading} sending={sending}
          onSend={async (text: string) => {
            if (!myId) { toast.error("Inicia sessão."); return; }
            setSending(true);
            await (supabase as any).from("video_comments").insert({ video_id: v.id, user_id: myId, content: text });
            await loadComments();
            setSending(false);
          }}
          onReply={() => {}} onLikeComment={() => {}} />
      )}
      {showShare && myId && <ForwardModal item={v} myId={myId} onClose={() => setShowShare(false)} isVideo />}
    </article>
  );
}

/* ── Main Canal Page ── */
function CanalPage() {
  const { handle } = useParams({ from: "/canal/$handle" });
  const navigate = useNavigate();
  const [channel, setChannel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [tab, setTab] = useState<"posts" | "videos" | "media">("posts");
  const [videos, setVideos] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [showShare, setShowShare] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);
  const [notifOn, setNotifOn] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setMyId(session?.user?.id ?? null);

      const { data: ch } = await (supabase as any).from("channels")
        .select("id,name,handle,description,avatar_url,banner_url,created_at,owner_id,category")
        .eq("handle", handle).maybeSingle();

      if (!ch) { setLoading(false); return; }
      setChannel(ch);

      // Seguidores
      const { count } = await (supabase as any).from("follows")
        .select("*", { count: "exact", head: true }).eq("following_id", ch.id);
      setFollowCount(count ?? 0);

      if (session?.user?.id) {
        const { data: fw } = await (supabase as any).from("follows")
          .select("id").eq("follower_id", session.user.id).eq("following_id", ch.id).maybeSingle();
        setFollowing(!!fw);
      }

      // Vídeos
      const { data: vids } = await (supabase as any).from("videos")
        .select("id,title,thumbnail_url,cf_stream_url,video_path,views_count,likes_count,published_at,created_at,duration_seconds,channels(name,handle,avatar_url)")
        .eq("channel_id", ch.id).eq("status", "published").eq("visibility", "public")
        .order("published_at", { ascending: false });
      setVideos(vids ?? []);

      // Posts do canal
      const { data: ps } = await (supabase as any).from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,photo_url,photos,video_url,image_url")
        .eq("channel_id", ch.id).order("created_at", { ascending: false });
      setPosts(ps ?? []);

      setLoading(false);
    })();
  }, [handle]);

  async function toggleFollow() {
    if (!myId || !channel) { toast.error("Inicia sessão."); return; }
    setFollowing(f => !f);
    setFollowCount(c => following ? c - 1 : c + 1);
    if (following) await (supabase as any).from("follows").delete().eq("follower_id", myId).eq("following_id", channel.id);
    else await (supabase as any).from("follows").insert({ follower_id: myId, following_id: channel.id });
  }

  const isOwner = myId === channel?.owner_id;
  const mediaItems = [...posts.filter(p => p.photo_url || p.image_url || p.video_url),
    ...videos.map(v => ({ ...v, _isVideo: true }))];

  if (loading) return (
    <>
      <SideNav /><PageWrapper className="pb-20 lg:pb-0">
        <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin" style={{ color: P }} /></div>
      </PageWrapper><BottomNav />
    </>
  );

  if (!channel) return (
    <>
      <SideNav /><PageWrapper className="pb-20 lg:pb-0">
        <div className="flex flex-col items-center py-20 gap-3 text-center px-6">
          <X className="h-10 w-10" style={{ color: P }} />
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>Canal não encontrado</p>
          <button onClick={() => navigate({ to: "/home" })} className="px-5 py-2 rounded-2xl text-white font-bold text-sm" style={{ background: P }}>Voltar</button>
        </div>
      </PageWrapper><BottomNav />
    </>
  );

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="w-full max-w-[960px]">

          {/* Header fixo */}
          <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-10"
            style={{ background: "var(--s1)", borderColor: "var(--border-subtle)" }}>
            <button onClick={() => navigate({ to: "/home" })} className="p-2 rounded-full transition" style={{ background: "var(--s2)" }}>
              <ChevronLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base truncate" style={{ color: "var(--text-primary)" }}>{channel.name}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{videos.length} vídeos</p>
            </div>
          </div>

          {/* Banner */}
          <div className="relative">
            <div className="h-32 w-full" style={{
              background: channel.banner_url ? undefined : GRAD,
            }}>
              {channel.banner_url && <img src={channel.banner_url} alt="" className="w-full h-full object-cover" />}
            </div>

            {/* Avatar */}
            <div className="absolute -bottom-10 left-4">
              <button onClick={() => channel.avatar_url && setPhotoViewer(channel.avatar_url)}
                className="w-20 h-20 rounded-full border-4 overflow-hidden flex items-center justify-center"
                style={{ borderColor: "var(--s1)", background: P + "20" }}>
                {channel.avatar_url
                  ? <img src={channel.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold" style={{ color: P }}>{channel.name?.[0]}</span>}
              </button>
            </div>

            {/* Botões direita */}
            <div className="absolute bottom-3 right-4 flex items-center gap-2">
              <button onClick={() => setShowShare(true)} className="w-9 h-9 rounded-full border flex items-center justify-center transition"
                style={{ background: "var(--s1)", borderColor: "var(--border-default)" }}>
                <Share2 className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
              </button>
              {!isOwner && (
                <button onClick={() => setNotifOn(n => !n)} className="w-9 h-9 rounded-full border flex items-center justify-center transition"
                  style={{ background: "var(--s1)", borderColor: "var(--border-default)" }}>
                  {notifOn ? <BellOff className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    : <Bell className="h-4 w-4" style={{ color: "var(--text-primary)" }} />}
                </button>
              )}
              <button onClick={() => setShowMenu(m => !m)} className="w-9 h-9 rounded-full border flex items-center justify-center transition"
                style={{ background: "var(--s1)", borderColor: "var(--border-default)" }}>
                <MoreHorizontal className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="px-4 pt-12 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>{channel.name}</h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>@{channel.handle}</p>
              </div>
              {!isOwner && (
                <button onClick={toggleFollow}
                  className="px-5 py-2 rounded-full font-bold text-sm transition active:scale-95 shrink-0"
                  style={following ? { background: "var(--s2)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }
                    : { background: P, color: "#fff" }}>
                  {following ? "A seguir" : "+ Seguir"}
                </button>
              )}
              {isOwner && (
                <button onClick={() => navigate({ to: "/studio" })}
                  className="px-4 py-2 rounded-full font-bold text-sm border transition active:scale-95 shrink-0"
                  style={{ borderColor: P, color: P }}>
                  Gerir canal
                </button>
              )}
            </div>

            {channel.description && (
              <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{channel.description}</p>
            )}

            <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
              <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Users className="h-3.5 w-3.5" />
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>{fmtNum(followCount)}</span> seguidores
              </span>
              <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Film className="h-3.5 w-3.5" />
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>{videos.length}</span> vídeos
              </span>
              <span className="flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                <Calendar className="h-3.5 w-3.5" />
                Desde {new Date(channel.created_at).toLocaleDateString("pt-PT", { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b sticky top-[57px] z-10" style={{ background: "var(--s1)", borderColor: "var(--border-subtle)" }}>
            {[
              { key: "posts", label: "Posts", icon: Grid3x3 },
              { key: "videos", label: "Vídeos", icon: Film },
              { key: "media", label: "Media", icon: ImageIcon },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition relative"
                style={{ color: tab === t.key ? P : "var(--text-muted)" }}>
                <t.icon className="h-4 w-4" />
                {t.label}
                {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: P }} />}
              </button>
            ))}
          </div>

          {/* Tab Posts — vídeos e posts como no Home */}
          {tab === "posts" && (
            <div>
              {videos.length === 0 && posts.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-2 text-center px-6">
                  <Film className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
                  <p className="font-semibold" style={{ color: "var(--text-secondary)" }}>Nenhuma publicação ainda</p>
                </div>
              ) : (
                <>
                  {videos.map(v => <VideoCard key={v.id} v={v} myId={myId} />)}
                </>
              )}
            </div>
          )}

          {/* Tab Vídeos */}
          {tab === "videos" && (
            <div>
              {videos.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-2">
                  <Film className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
                  <p className="font-semibold" style={{ color: "var(--text-secondary)" }}>Nenhum vídeo publicado</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-0.5 p-0.5">
                  {videos.map(v => (
                    <button key={v.id} onClick={() => navigate({ to: `/watch/${v.id}` })}
                      className="relative aspect-video bg-black overflow-hidden group">
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><Play className="h-8 w-8 text-white/30" /></div>}
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: "rgba(0,0,0,0.75)" }}>
                        {v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}:${String(v.duration_seconds % 60).padStart(2, "0")}` : ""}
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                        <Play className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition" fill="white" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Media — fotos e vídeos em grelha */}
          {tab === "media" && (
            <div>
              {mediaItems.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-2">
                  <ImageIcon className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
                  <p className="font-semibold" style={{ color: "var(--text-secondary)" }}>Nenhum media ainda</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5 p-0.5">
                  {mediaItems.map((item: any) => (
                    <button key={item.id}
                      onClick={() => {
                        if (item._isVideo) navigate({ to: `/watch/${item.id}` });
                        else if (item.photo_url || item.image_url) setPhotoViewer(item.photo_url || item.image_url);
                      }}
                      className="relative aspect-square bg-black overflow-hidden group">
                      {item._isVideo ? (
                        item.thumbnail_url
                          ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          : <div className="w-full h-full flex items-center justify-center bg-neutral-900"><Play className="h-6 w-6 text-white/40" /></div>
                      ) : (
                        <img src={item.photo_url || item.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      )}
                      {item._isVideo && (
                        <div className="absolute top-1 right-1">
                          <Play className="h-4 w-4 text-white drop-shadow" fill="white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </PageWrapper>
      <BottomNav />

      {/* Modais */}
      {showShare && myId && (
        <ForwardModal
          item={{ id: channel.id, title: `Canal @${channel.handle} na Hooda` }}
          myId={myId}
          onClose={() => setShowShare(false)}
          isVideo={false}
        />
      )}

      {photoViewer && (
        <PhotoViewer
          src={photoViewer}
          alt={channel.name}
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </>
  );
}
