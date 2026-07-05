import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import {
  ChevronLeft, Heart, MessageCircle, Share2, Bookmark,
  Loader, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/post/$id")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: SinglePostPage,
});

const ACCENT = "#5B3FCF";

function fmtNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0); }
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function SinglePostPage() {
  const { id } = useParams({ from: "/post/$id" });
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setMyId(session?.user?.id ?? null);

      const { data, error } = await supabase
        .from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,photo_url,photos,video_url")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setPost(data);

      const { count: likes } = await supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", id);
      setLikeCount(likes ?? 0);

      const { count: comments } = await supabase.from("post_comments").select("*", { count: "exact", head: true }).eq("post_id", id);
      setCommentCount(comments ?? 0);

      if (session?.user?.id) {
        const { data: likeRow } = await supabase.from("post_likes").select("id").eq("post_id", id).eq("user_id", session.user.id).maybeSingle();
        setLiked(!!likeRow);
        const { data: saveRow } = await supabase.from("post_saves").select("id").eq("post_id", id).eq("user_id", session.user.id).maybeSingle();
        setBookmarked(!!saveRow);
      }

      setLoading(false);
    })();
  }, [id]);

  async function toggleLike() {
    if (!myId) { toast.error("Inicia sessão para gostar."); return; }
    setLiked(l => !l);
    setLikeCount(c => liked ? c - 1 : c + 1);
    if (liked) await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", myId);
    else await supabase.from("post_likes").insert({ post_id: id, user_id: myId });
  }

  async function toggleBookmark() {
    if (!myId) { toast.error("Inicia sessão para guardar."); return; }
    setBookmarked(b => !b);
    if (bookmarked) await supabase.from("post_saves").delete().eq("post_id", id).eq("user_id", myId);
    else await supabase.from("post_saves").insert({ post_id: id, user_id: myId });
  }

  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  async function loadComments() {
    if (!post) return;
    setCommentsLoading(true);
    const { data } = await supabase
      .from("post_comments")
      .select("id, user_id, content, created_at, profiles(username, full_name, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(
      (data ?? []).map((c: any) => ({
        id: c.id,
        authorName: c.profiles?.full_name || c.profiles?.username || "Utilizador",
        authorUsername: c.profiles?.username || "",
        avatarUrl: c.profiles?.avatar_url,
        text: c.content,
        createdAt: new Date(c.created_at),
        likeCount: 0,
        likedByMe: false,
        replies: [],
      }))
    );
    setCommentsLoading(false);
  }

  useEffect(() => { if (showComments) loadComments(); }, [showComments, post?.id]);

  async function handleSendComment(text: string) {
    if (!myId || !post) { toast.error("Inicia sessão."); return; }
    setSendingComment(true);
    // Get author_username from current session profile for insert
    const { data: myProfile } = await supabase.from("profiles").select("username").eq("id", myId).maybeSingle();
    await supabase.from("post_comments").insert({ post_id: post.id, user_id: myId, author_id: myId, author_username: myProfile?.username || "user", content: text });
    setCommentCount(c => c + 1);
    await loadComments();
    setSendingComment(false);
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: "Publicação na Hooda", url }).catch(() => {});
    else { navigator.clipboard.writeText(url); toast.success("🔗 Link copiado!"); }
  }

  let text = post?.content ?? "";
  let bgColor: string | null = null;
  if (post?.kind === "bg") {
    try { const j = JSON.parse(post.content); text = j.text; bgColor = j.bgColor; } catch {}
  }

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="max-w-xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-10"
            style={{ background: "var(--s1)", borderColor: "var(--border-subtle)" }}>
            <button onClick={() => navigate({ to: "/home" })} className="p-2 rounded-full transition" style={{ background: "var(--s2)" }}>
              <ChevronLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            </button>
            <span className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Publicação</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader className="h-6 w-6 animate-spin" style={{ color: ACCENT }} />
            </div>
          ) : notFound ? (
            <div className="flex flex-col items-center gap-3 py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: ACCENT + "18" }}>
                <X className="h-7 w-7" style={{ color: ACCENT }} />
              </div>
              <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Publicação não encontrada</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Pode ter sido eliminada ou o link está incorrecto.</p>
              <button onClick={() => navigate({ to: "/home" })}
                className="mt-2 px-5 py-2.5 rounded-2xl font-bold text-sm text-white" style={{ background: ACCENT }}>
                Voltar ao Home
              </button>
            </div>
          ) : (
            <article className="border-b" style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}>
              {/* Header do autor */}
              <button
                onClick={() => navigate({ to: `/u/${post.author_username}` })}
                className="flex items-center gap-2.5 px-3 py-3 w-full text-left transition">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold"
                  style={{ background: post.author_color || ACCENT }}>
                  {post.author_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{post.author_name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>@{post.author_username} · {timeAgo(post.created_at)}</p>
                </div>
              </button>

              {/* Conteúdo */}
              {post.video_url && (
                <div className="pb-3 md:px-3">
                  <FeedVideoPlayer src={post.video_url} poster={post.photo_url || undefined} postId={post.id} kind="video" rounded="rounded-2xl" />
                </div>
              )}
              {post.photo_url && !post.video_url && (
                <img src={post.photo_url} alt="" className="w-full block" style={{ maxHeight: 600, objectFit: "cover" }} />
              )}
              {text && !post.video_url && (
                bgColor ? (
                  <div className="mx-3 mb-2 rounded-2xl flex items-center justify-center" style={{ background: bgColor, minHeight: 180 }}>
                    <p className="font-bold text-center leading-snug px-6 py-8 text-white text-[18px]">{text}</p>
                  </div>
                ) : (
                  <p className="px-3 pb-3 text-[15px] leading-relaxed" style={{ color: "var(--text-primary)" }}>{text}</p>
                )
              )}

              {/* Acções */}
              <div className="flex items-center px-3 pt-2 pb-1 gap-1">
                <button onClick={toggleLike} className="flex items-center gap-1 p-1.5 rounded-full transition active:scale-90">
                  <Heart className={`h-[22px] w-[22px] transition-all ${liked ? "fill-red-500 text-red-500 scale-110" : ""}`}
                    style={{ color: liked ? undefined : "var(--text-primary)" }} />
                </button>
                <button onClick={() => setShowComments(true)} className="flex items-center gap-1 p-1.5 rounded-full transition active:scale-90">
                  <MessageCircle className="h-[22px] w-[22px]" style={{ color: "var(--text-primary)" }} />
                </button>
                <button onClick={share} className="flex items-center gap-1 p-1.5 rounded-full transition active:scale-90">
                  <Share2 className="h-[22px] w-[22px]" style={{ color: "var(--text-primary)" }} />
                </button>
                <div className="flex-1" />
                <button onClick={toggleBookmark} className="p-1.5 rounded-full transition active:scale-90">
                  <Bookmark className={`h-[22px] w-[22px] transition ${bookmarked ? "fill-[#5B3FCF] text-[#5B3FCF]" : ""}`}
                    style={{ color: bookmarked ? undefined : "var(--text-primary)" }} />
                </button>
              </div>

              <div className="px-3 pb-3">
                {likeCount > 0 && (
                  <p className="text-[13px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                    {likeCount === 1 ? "1 gosto" : `${fmtNum(likeCount)} gostos`}
                  </p>
                )}
                {commentCount > 0 && (
                  <button onClick={() => setShowComments(true)} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    Ver {commentCount === 1 ? "1 comentário" : `todos os ${fmtNum(commentCount)} comentários`}
                  </button>
                )}
              </div>
            </article>
          )}
        </div>
      </PageWrapper>
      <BottomNav />

      {showComments && post && (
        <PostCommentsModal
          onClose={() => setShowComments(false)}
          header={
            <div className="flex items-center gap-3 pb-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ background: post.author_color || ACCENT }}>
                {post.author_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{post.author_name}</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>@{post.author_username} · {timeAgo(post.created_at)}</p>
              </div>
            </div>
          }
          body={
            <>
              {post.video_url && (
                <div className="pb-3 md:px-4">
                  <FeedVideoPlayer src={post.video_url} poster={post.photo_url || undefined} postId={post.id} kind="video" rounded="rounded-2xl" />
                </div>
              )}
              {post.photo_url && !post.video_url && <img src={post.photo_url} alt="" className="w-full block" />}
              {text && !post.video_url && (
                bgColor ? (
                  <div className="px-4 pb-3">
                    <div className="rounded-2xl px-5 py-6 flex items-center justify-center min-h-28" style={{ background: bgColor }}>
                      <p className="text-white font-bold text-lg text-center leading-snug">{text}</p>
                    </div>
                  </div>
                ) : (
                  <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{text}</p>
                )
              )}
            </>
          }
          actions={
            <div className="flex items-center gap-1 pt-2 pb-1">
              <button onClick={toggleLike}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 ${liked ? "text-red-500" : ""}`}>
                <Heart className={`h-5 w-5 ${liked ? "fill-red-500 text-red-500" : ""}`} style={{ color: liked ? undefined : "var(--text-muted)" }} />
              </button>
              <Share2 className="h-5 w-5 ml-1" style={{ color: "var(--text-muted)" }} onClick={share} />
            </div>
          }
          comments={comments}
          loading={commentsLoading}
          sending={sendingComment}
          onSend={handleSendComment}
          onReply={() => {}}
          onLikeComment={() => {}}
        />
      )}
    </>
  );
}
