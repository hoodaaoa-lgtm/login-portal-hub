import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STATIC_QUERY_OPTIONS } from "@/lib/queryClient";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { HoodaLogo } from "@/components/HoodaLogo";
import {
  Settings, LogOut, MessageCircle, Flag, X, Image, Type, Plus,
  BookOpen, ChevronRight, Lock, Shield, TrendingUp, Bookmark,
  Info, Camera, Link, MapPin, Calendar, Bell, HelpCircle,
  Banknote, BarChart3, Users, Eye, Star, Heart, Share2,
  MoreHorizontal, Trash2, Send, Copy, Moon, Sun, ExternalLink,
  Twitter, Instagram, Youtube, Facebook, Linkedin, Music2, Loader, Tv, Film,
  ArrowLeft, Check,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAvatar } from "@/contexts/AvatarContext";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { fetchPostComments, sendPostComment, replyToPostComment, toggleCommentLike } from "@/lib/comments";
import { deletePostForEveryone, fetchMyShareableCommunities, sharePostToCommunity, type MyCommunity } from "@/lib/posts";
import { toast } from "sonner";
import { PhotoViewer } from "@/components/PhotoViewer";
import { HoodaPlayer } from "@/components/HoodaPlayer";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Hooda — Perfil" }] }),
  component: ProfilePage,
});

type Profile = { id?: string; username: string; full_name: string; age: number | null; bio: string | null };
type Post = {
  id: string; text: string; photo: string | null; bgColor: string | null; createdAt: Date;
  likes: number; likedByMe: boolean; comments: number; bookmarked: boolean;
  videoUrl?: string;
};
type SavedPost = Post & { authorId: string; authorName: string; authorUsername: string; authorAvatar: string | null };

const ACCENT = "#5B3FCF";
const ACCENT_COLORS = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
const BG_COLORS: { label: string; value: string | null; preview: string }[] = [
  { label: "Sem cor",  value: null,      preview: "#f0f0f0" },
  { label: "Roxo",    value: "#5B3FCF", preview: "#5B3FCF" },
  { label: "Laranja", value: "#F26B3A", preview: "#F26B3A" },
  { label: "Teal",    value: "#1FAFA6", preview: "#1FAFA6" },
  { label: "Verde",   value: "#6BA547", preview: "#6BA547" },
  { label: "Rosa",    value: "#E94B8A", preview: "#E94B8A" },
];

function textColorForBg(bg: string | null): string { if (!bg) return "#0f0f14"; return "#ffffff"; }
function getColor(name: string) { return ACCENT_COLORS[(name?.charCodeAt(0) ?? 0) % ACCENT_COLORS.length]; }
function timeAgo(date: Date) {
  const d = Math.floor((Date.now() - date.getTime()) / 1000);
  if (d < 60) return "agora";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}
function fmtNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

/* ─── Avatar ─── */
function Avatar({ name, size = 72, src }: { name: string; size?: number; src?: string | null }) {
  const color = getColor(name);
  return (
    <div style={{
      background: color, width: size, height: size, borderRadius: "50%",
      border: "3px solid white", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.36, fontWeight: 700,
      color: "white", flexShrink: 0, overflow: "hidden",
    }}>
      {src
        ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        : (name?.[0] ?? "?").toUpperCase()
      }
    </div>
  );
}

/* ─── Stats ─── */
function StatsGrid({ publications, followers, following, onFollowersClick, onFollowingClick }: {
  publications: number; followers: number; following: number;
  onFollowersClick?: () => void; onFollowingClick?: () => void;
}) {
  const items = [
    { n: publications, l: "Publicações", onClick: undefined },
    { n: followers, l: "Seguidores", onClick: onFollowersClick },
    { n: following, l: "Seguindo", onClick: onFollowingClick },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-5 pb-4">
      {items.map((s) => (
        <button key={s.l} onClick={s.onClick} disabled={!s.onClick}
          className="bg-white border border-neutral-100 rounded-2xl py-3 text-center stat-card transition active:scale-[0.97] disabled:active:scale-100"
          style={{ cursor: s.onClick ? "pointer" : "default" }}>
          <p className="text-lg font-extrabold text-black">{fmtNum(s.n)}</p>
          <p className="text-[11px] text-neutral-400 mt-0.5 font-medium">{s.l}</p>
        </button>
      ))}
    </div>
  );
}

/* ─── Lista de Seguidores / Seguindo ─── */
type FollowListUser = { id: string; username: string; fullName: string; avatarUrl: string | null; color: string };

function FollowListModal({ mode, targetUsername, targetUserId, onClose }: {
  mode: "followers" | "following";
  targetUsername: string;
  targetUserId: string;
  onClose: () => void;
}) {
  const { data: users = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["followList", mode, mode === "followers" ? targetUsername : targetUserId],
    queryFn: async (): Promise<FollowListUser[]> => {
      if (mode === "followers") {
        const { data: rows, error } = await supabase.from("follows")
          .select("follower_id").eq("target_username", targetUsername);
        if (error) throw error;
        const ids = [...new Set((rows ?? []).map((r: any) => r.follower_id))];
        if (ids.length === 0) return [];
        const { data: profs, error: profErr } = await supabase.from("profiles")
          .select("id,username,full_name,avatar_url").in("id", ids);
        if (profErr) throw profErr;
        return (profs ?? []).map((p: any) => ({
          id: p.id, username: p.username ?? "?", fullName: p.full_name ?? p.username ?? "?",
          avatarUrl: p.avatar_url ?? null, color: ACCENT,
        }));
      } else {
        const { data: rows, error } = await supabase.from("follows")
          .select("target_username").eq("follower_id", targetUserId);
        if (error) throw error;
        const usernames = [...new Set((rows ?? []).map((r: any) => r.target_username).filter(Boolean))];
        if (usernames.length === 0) return [];
        const { data: profs, error: profErr } = await supabase.from("profiles")
          .select("id,username,full_name,avatar_url").in("username", usernames);
        if (profErr) throw profErr;
        return (profs ?? []).map((p: any) => ({
          id: p.id, username: p.username ?? "?", fullName: p.full_name ?? p.username ?? "?",
          avatarUrl: p.avatar_url ?? null, color: ACCENT,
        }));
      }
    },
    enabled: mode === "followers" ? !!targetUsername : !!targetUserId,
    ...STATIC_QUERY_OPTIONS,
  });
  const err = queryError ? (queryError instanceof Error ? queryError.message : "Erro ao carregar lista") : "";

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-sm sm:rounded-2xl hooda-modal-sheet rounded-t-3xl overflow-hidden flex flex-col" style={{ maxHeight: "75vh" }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100 shrink-0">
          <p className="font-extrabold text-base text-black">{mode === "followers" ? "Seguidores" : "Seguindo"}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100">
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
            </div>
          ) : err ? (
            <p className="text-sm text-red-500 text-center py-10 px-5">{err}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-10">
              {mode === "followers" ? "Ainda sem seguidores" : "Ainda não segue ninguém"}
            </p>
          ) : (
            <div className="divide-y divide-neutral-50">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <ProfileAvatarLink userId={u.id} username={u.username}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0"
                      style={{ background: u.color }}>
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        : (u.username?.[0] ?? "?").toUpperCase()}
                    </div>
                  </ProfileAvatarLink>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-black truncate">{u.fullName}</p>
                    <p className="text-xs text-neutral-400">@{u.username}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function PostCard({
  post, name, username, isOwner,
  onLike, onBookmark, onDelete, avatarUrl, myUserId, authorId,
}: {
  post: Post; name: string; username: string; isOwner: boolean;
  onLike: (id: string) => void; onBookmark: (id: string) => void;
  onDelete: (id: string) => void; avatarUrl?: string | null;
  myUserId?: string; authorId?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCommunities, setShareCommunities] = useState<MyCommunity[]>([]);
  const [loadingShareTargets, setLoadingShareTargets] = useState(false);
  const [sharingToId, setSharingToId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<import("@/components/PostCommentsModal").PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments);

  useEffect(() => { setCommentCount(post.comments); }, [post.comments]);

  useEffect(() => {
    if (shareOpen || showComments) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [shareOpen, showComments]);

  useEffect(() => {
    if (!showComments) return;
    setCommentsLoading(true);
    fetchPostComments(post.id, myUserId).then((c) => {
      setComments(c);
      setCommentsLoading(false);
    });
  }, [showComments, post.id, myUserId]);

  async function handleSendComment(text: string) {
    if (!myUserId) { toast.error("A iniciar sessão… tenta novamente em 1 segundo."); return; }
    setSendingComment(true);
    const created = await sendPostComment({ postId: post.id, userId: myUserId, username, text });
    if (created) { setComments((prev) => [...prev, created]); setCommentCount((n) => n + 1); }
    else toast.error("Não foi possível enviar o comentário.");
    setSendingComment(false);
  }

  async function handleReplyComment(parentId: string, text: string) {
    if (!myUserId) { toast.error("A iniciar sessão… tenta novamente em 1 segundo."); return; }
    const created = await replyToPostComment({ postId: post.id, parentCommentId: parentId, userId: myUserId, username, text });
    if (!created) { toast.error("Não foi possível enviar a resposta."); return; }
    setComments((prev) => prev.map((c) => c.id === parentId ? { ...c, replies: [...(c.replies || []), created] } : c));
    setCommentCount((n) => n + 1);
  }

  async function handleLikeComment(commentId: string) {
    if (!myUserId) return;
    type PC = import("@/components/PostCommentsModal").PostComment;
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
    await toggleCommentLike(commentId, myUserId, !!target?.likedByMe);
  }

  async function openShareSheet() {
    if (!myUserId) { toast.error("A iniciar sessão… tenta novamente em 1 segundo."); return; }
    setMenuOpen(false);
    setShareOpen(true);
    setLoadingShareTargets(true);
    const list = await fetchMyShareableCommunities(myUserId);
    setShareCommunities(list);
    setLoadingShareTargets(false);
  }

  async function handleShareTo(targetCommunityId: string) {
    if (!myUserId) return;
    setSharingToId(targetCommunityId);
    const newId = await sharePostToCommunity({
      sourcePostId: post.id,
      targetCommunityId,
      userId: myUserId,
      username,
      authorName: name,
      authorColor: getColor(name),
    });
    setSharingToId(null);
    if (newId) { toast.success("Publicação partilhada!"); setShareOpen(false); }
    else toast.error("Não foi possível partilhar.");
  }

  async function handleDelete() {
    setMenuOpen(false);
    setDeleting(true);
    const ok = await deletePostForEveryone(post.id);
    setDeleting(false);
    if (ok) { toast.success("Publicação eliminada."); onDelete(post.id); }
    else toast.error("Não foi possível eliminar a publicação. Tenta novamente.");
  }

  const GROUPS = shareCommunities;

  return (
    <article className="hooda-card rounded-none border-b border-neutral-100">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <Avatar name={name} size={42} src={avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-bold text-[15px] text-black">{name}</span>
              <p className="text-[12px] text-neutral-400 mt-0.5">@{username} · {timeAgo(post.createdAt)}</p>
            </div>
            {isOwner ? (
              <div className="relative shrink-0">
                <button onClick={() => { setMenuOpen(o => !o); setShareOpen(false); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-100 transition">
                  <MoreHorizontal className="h-5 w-5 text-neutral-400" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-9 bg-white rounded-2xl shadow-xl border border-neutral-100 z-30 min-w-[180px] overflow-hidden">
                    <button onClick={openShareSheet}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-neutral-50 text-neutral-700">
                      <Send className="h-4 w-4 text-[#5B3FCF]" /> Partilhar em grupo
                    </button>
                    <button onClick={() => { navigator.clipboard?.writeText(post.text); setMenuOpen(false); toast.success("Texto copiado!"); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-neutral-50 text-neutral-700 border-t border-neutral-50">
                      <Copy className="h-4 w-4 text-neutral-400" /> Copiar texto
                    </button>
                    <button onClick={handleDelete} disabled={deleting}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-red-50 text-red-500 border-t border-neutral-50 disabled:opacity-50">
                      {deleting ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Apagar publicação
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="shrink-0 text-[13px] font-bold border border-[#5B3FCF] text-[#5B3FCF] rounded-full px-4 py-1 hover:bg-[#5B3FCF]/5 transition">
                Seguir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {post.videoUrl && (
        <div className="w-full">
          <HoodaPlayer src={post.videoUrl} rounded="rounded-none" aspectRatio="16/9" />
        </div>
      )}
      {post.photo && !post.videoUrl && <img src={post.photo} alt="" className="w-full" style={{ display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      {post.text && (
        post.bgColor ? (
          <div className="px-4 pb-3">
            <div className="rounded-2xl px-5 py-7 flex items-center justify-center" style={{ background: post.bgColor, minHeight: 110 }}>
              <p className="font-bold text-center leading-snug" style={{ fontSize: 18, color: "#fff" }}>{post.text}</p>
            </div>
          </div>
        ) : (
          <p className="px-4 pb-3 text-[15px] text-neutral-800 leading-relaxed">{post.text}</p>
        )
      )}

      {/* Action bar */}
      <div className="flex items-center px-3 pb-3 border-t border-neutral-50 pt-2">
        <button onClick={() => onLike(post.id)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-neutral-50 transition group">
          <Heart className={`h-[19px] w-[19px] transition ${post.likedByMe ? "fill-red-500 text-red-500" : "text-neutral-400 group-hover:text-red-400"}`} />
          <span className={`text-[13px] font-semibold ${post.likedByMe ? "text-red-500" : "text-neutral-500"}`}>{fmtNum(post.likes)}</span>
        </button>
        <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-neutral-50 transition group">
          <MessageCircle className="h-[19px] w-[19px] text-neutral-400 group-hover:text-blue-400 transition" />
          <span className="text-[13px] font-semibold text-neutral-500">{fmtNum(commentCount)}</span>
        </button>
        <button onClick={openShareSheet}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-neutral-50 transition group">
          <Share2 className="h-[19px] w-[19px] text-neutral-400 group-hover:text-green-500 transition" />
        </button>
        <div className="flex-1" />
        <button onClick={() => onBookmark(post.id)} className="px-2 py-1.5 rounded-xl hover:bg-neutral-50 transition">
          <Bookmark className={`h-[19px] w-[19px] transition ${post.bookmarked ? "fill-[#5B3FCF] text-[#5B3FCF]" : "text-neutral-400"}`} />
        </button>
      </div>

      {/* Modal de comentários */}
      {showComments && (
        <PostCommentsModal
          onClose={() => setShowComments(false)}
          header={
            <div className="flex items-center gap-3 pb-2">
              <Avatar name={name} size={36} src={avatarUrl} />
              <div>
                <p className="text-sm font-bold text-black">{name}</p>
                <p className="text-[11px] text-neutral-400">@{username} · {timeAgo(post.createdAt)}</p>
              </div>
            </div>
          }
          body={
            <>
              {post.videoUrl && (
                <div className="w-full">
                  <HoodaPlayer src={post.videoUrl} rounded="rounded-none" aspectRatio="16/9" />
                </div>
              )}
              {post.photo && !post.videoUrl && <img src={post.photo} alt="" className="w-full" style={{ display: "block" }} />}
              {post.text && (
                post.bgColor ? (
                  <div className="px-4 pb-3">
                    <div className="rounded-2xl px-5 py-6 flex items-center justify-center min-h-28" style={{ background: post.bgColor }}>
                      <p className="text-white font-bold text-lg text-center leading-snug">{post.text}</p>
                    </div>
                  </div>
                ) : (
                  <p className="px-4 pb-3 text-sm leading-relaxed text-neutral-700">{post.text}</p>
                )
              )}
            </>
          }
          actions={
            <div className="flex items-center gap-1 pt-2 pb-1">
              <button onClick={() => onLike(post.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95 ${post.likedByMe ? "text-red-500" : "hover:bg-neutral-50"}`}>
                <Heart className={`h-5 w-5 ${post.likedByMe ? "fill-red-500 text-red-500" : "text-neutral-400"}`} />
              </button>
              <Share2 className="h-5 w-5 text-neutral-400 ml-1" />
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

      {/* Share to group picker */}
      {shareOpen && (
        <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center overflow-hidden" style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => e.target === e.currentTarget && setShareOpen(false)}>
          <div className="w-full lg:max-w-md lg:rounded-3xl rounded-t-3xl hooda-modal-sheet flex flex-col overflow-hidden shadow-2xl max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
            </div>
            <div className="overflow-y-auto px-3 py-2">
              {loadingShareTargets ? (
                <div className="flex justify-center py-10">
                  <Loader className="h-6 w-6 animate-spin" style={{ color: ACCENT }} />
                </div>
              ) : GROUPS.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-10 px-4">
                  Ainda não fazes parte de nenhuma comunidade onde possas publicar.
                </p>
              ) : (
                GROUPS.map((g) => (
                  <button key={g.id} onClick={() => handleShareTo(g.id)} disabled={!!sharingToId}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-neutral-50 transition disabled:opacity-50">
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-lg shrink-0"
                      style={{ background: g.color }}>
                      {g.photo ? <img src={g.photo} alt="" className="w-full h-full object-cover" /> : g.emoji}
                    </div>
                    <span className="flex-1 text-left text-sm font-semibold text-neutral-800">{g.name}</span>
                    {sharingToId === g.id ? (
                      <Loader className="h-4 w-4 animate-spin" style={{ color: ACCENT }} />
                    ) : (
                      <Send className="h-4 w-4 text-neutral-400" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/* ─── Feed ─── */
function PostsFeed({ posts, name, username, avatarUrl, onLike, onBookmark, onDelete, myUserId }: {
  posts: Post[]; name: string; username: string; avatarUrl?: string | null;
  onLike: (id: string) => void; onBookmark: (id: string) => void; onDelete: (id: string) => void;
  myUserId?: string;
}) {
  if (posts.length === 0) return (
    <div className="px-5 py-14 flex flex-col items-center gap-3 text-center">
      <div className="w-16 h-16 rounded-full bg-[#5B3FCF]/10 flex items-center justify-center">
        <BookOpen className="h-7 w-7 text-[#5B3FCF]" />
      </div>
      <p className="text-sm font-semibold text-neutral-500">Ainda não tens publicações</p>
      <p className="text-xs text-neutral-400">Cria a tua primeira publicação acima!</p>
    </div>
  );
  return (
    <div className="pb-6">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} name={name} username={username}
          isOwner avatarUrl={avatarUrl} myUserId={myUserId} authorId={myUserId}
          onLike={onLike} onBookmark={onBookmark} onDelete={onDelete} />
      ))}
    </div>
  );
}

/* ─── Modal Criar Publicação ─── */
function CreatePostModal({
  profile, email, onClose, onPublish,
}: {
  profile: Profile | null; email: string;
  onClose: () => void;
  onPublish: (post: Post) => void;
}) {
  const navigate = useNavigate();
  const name = profile?.full_name || email || "?";
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle"|"upload"|"saving"|"done">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setVideoFile(null); setVideoPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => { setPhoto(ev.target?.result as string); setBgColor(null); };
    reader.readAsDataURL(file);
  }

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setPhoto(null); setPhotoFile(null); setBgColor(null);
    setVideoPreview(URL.createObjectURL(file));
  }

  async function publish() {
    if (!text.trim() && !photoFile && !photo && !videoFile) return;
    if (publishing || done) return;
    setPublishing(true);
    setPublishErr(null);
    setUploadProgress(0);
    setUploadStage("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPublishErr("É preciso iniciar sessão para publicar."); return; }

      let imageUrl: string | null = photo;
      let videoUrl: string | null = null;

      if (photoFile) {
        setUploadStage("upload");
        const { url } = await uploadImageToCloudinary(
          photoFile,
          `hooda/posts/${session.user.id}`,
          (pct) => setUploadProgress(pct),
        );
        imageUrl = url;
        setUploadProgress(100);
      }

      if (videoFile) {
        setUploadStage("upload");
        const { url } = await uploadImageToCloudinary(
          videoFile,
          `hooda/posts/videos/${session.user.id}`,
          (pct) => setUploadProgress(pct),
        );
        videoUrl = url;
        setUploadProgress(100);
      }

      setUploadStage("saving");
      const { data: prof } = await supabase.from("profiles").select("username, full_name").eq("id", session.user.id).single();
      const contentJson = bgColor ? JSON.stringify({ text, bgColor }) : text;

      const { data: inserted, error } = await supabase
        .from("posts")
        .insert({
          author_id: session.user.id,
          author_username: prof?.username ?? session.user.email?.split("@")[0] ?? "",
          author_name: prof?.full_name ?? session.user.email ?? "",
          author_color: "#5B3FCF",
          content: contentJson,
          kind: videoUrl ? "video" : bgColor ? "bg" : imageUrl ? "photo" : "post",
          image_url: imageUrl,
          video_url: videoUrl,
        })
        .select("id, created_at")
        .single();

      if (error || !inserted?.id) {
        setPublishErr("Não foi possível publicar. Tenta novamente.");
        return;
      }

      setUploadStage("done");
      onPublish({
        id: inserted.id, text, photo: imageUrl, bgColor,
        videoUrl: videoUrl ?? undefined,
        createdAt: new Date(inserted.created_at ?? Date.now()),
        likes: 0, likedByMe: false, comments: 0, bookmarked: false,
      });
      setDone(true);
      setTimeout(onClose, 900);
    } catch (err: any) {
      setPublishErr(err.message ?? "Erro ao publicar.");
      setUploadStage("idle");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = (text.trim().length > 0 || photo !== null || videoFile !== null) && !publishing && !done;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center pb-0"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-lg lg:rounded-3xl rounded-t-2xl hooda-modal-sheet flex flex-col" style={{ maxHeight: "80vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <span className="text-base font-bold text-black">Criar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 transition">
            <X className="h-5 w-5 text-neutral-500" />
          </button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar name={name} size={42} />
          <div>
            <p className="text-sm font-bold text-black">{name}</p>
            <span className="text-[11px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-medium">
              @{profile?.username || "utilizador"}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {photo && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <img src={photo} alt="foto" className="w-full rounded-xl" style={{ display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <button onClick={() => { setPhoto(null); setPhotoFile(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {videoPreview && (
            <div className="relative mb-3">
              <HoodaPlayer src={videoPreview} rounded="rounded-xl" aspectRatio="16/9" />
              <button onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 z-20">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="rounded-2xl transition-all"
            style={{ background: bgColor || "transparent", padding: bgColor ? "28px 20px" : "0",
              minHeight: bgColor ? 150 : "auto", display: "flex", alignItems: "center" }}>
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
              placeholder={bgColor ? "O que queres partilhar?" : "Em que estás a pensar?"}
              rows={bgColor ? 3 : 4}
              className="w-full outline-none resize-none bg-transparent leading-relaxed"
              style={{ color: textColorForBg(bgColor), fontSize: bgColor ? 20 : 15,
                fontWeight: bgColor ? 700 : 400, textAlign: bgColor ? "center" : "left" }} />
          </div>
          {!photo && (
            <div className="mt-4">
              <p className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wide mb-2">Cor de fundo</p>
              <div className="flex gap-2 flex-wrap">
                {BG_COLORS.map((c) => (
                  <button key={c.label} onClick={() => setBgColor(c.value)} title={c.label}
                    className="transition-all active:scale-95"
                    style={{ width: 32, height: 32, borderRadius: "50%", background: c.preview,
                      border: bgColor === c.value ? `3px solid ${ACCENT}` : "2px solid #e5e5e5" }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-neutral-500 font-medium">Adicionar à publicação</span>
            <div className="flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 transition text-sm font-semibold text-neutral-700 active:scale-95">
                <Image className="h-4 w-4 text-[#6BA547]" /> Foto
              </button>
              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 transition text-sm font-semibold text-neutral-700 active:scale-95">
                <Film className="h-4 w-4 text-[#E94B8A]" /> Vídeo
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={pickVideo} />
          {publishErr && <p className="mb-2 text-sm text-red-600">{publishErr}</p>}

          {/* Barra de progresso real durante upload */}
          {publishing && (
            <div className="mb-3">
              <div className="flex justify-between text-xs font-semibold mb-1.5"
                style={{ color: "var(--text-muted)" }}>
                <span>
                  {uploadStage === "upload" && (photoFile ? "A enviar foto…" : "A enviar vídeo…")}
                  {uploadStage === "saving" && "A guardar publicação…"}
                  {uploadStage === "done"   && "Publicado! ✓"}
                </span>
                {uploadStage === "upload" && (
                  <span style={{ color: ACCENT }}>{uploadProgress}%</span>
                )}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: uploadStage === "saving" ? "95%" : uploadStage === "done" ? "100%" : `${uploadProgress}%`,
                    background: `linear-gradient(90deg, ${ACCENT}, #E94B8A)`,
                    boxShadow: `0 0 8px ${ACCENT}80`,
                  }}
                />
              </div>
            </div>
          )}

          <button onClick={publish} disabled={!canPublish}
            className="w-full h-12 rounded-xl font-bold text-base transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: canPublish ? ACCENT : "var(--s3)", color: canPublish ? "#fff" : "var(--text-muted)" }}>
            {done
              ? "Publicado! ✓"
              : publishing
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />A publicar…</>
                : "Publicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal Editar Perfil ─── */
function EditProfileModal({
  profile, email, onClose, onSave,
}: {
  profile: Profile | null; email: string;
  onClose: () => void;
  onSave: (data: Partial<Profile> & { website?: string; location?: string }) => void;
}) {
  const [name, setName] = useState(profile?.full_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [website, setWebsite] = useState((profile as any)?.website || "");
  const [location, setLocation] = useState((profile as any)?.location || "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle"|"checking"|"available"|"taken"|"invalid">("idle");
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUsernameChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9_.]/g, "");
    setUsername(clean);
    setUsernameStatus("idle");
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (!clean || clean === (profile?.username || "")) { setUsernameStatus("idle"); return; }
    if (clean.length < 3) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    usernameTimer.current = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").eq("username", clean).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 600);
  }

  async function save() {
    if (usernameStatus === "taken" || usernameStatus === "invalid") return;
    if (usernameStatus === "checking") return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("profiles").update({
          full_name: name,
          username,
          bio,
          website,
          location,
          updated_at: new Date().toISOString(),
        } as any).eq("id", session.user.id);
      }
    } catch (_) {}
    onSave({ full_name: name, username, bio, website, location });
    setDone(true);
    setSaving(false);
    setTimeout(onClose, 600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-lg lg:rounded-3xl rounded-t-3xl hooda-modal-sheet flex flex-col"
        style={{ maxHeight: "96vh", overflow: "hidden" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100">
            <X className="h-5 w-5 text-neutral-500" />
          </button>
          <span className="text-base font-extrabold text-black">Editar perfil</span>
          <button onClick={save}
            disabled={saving || done || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"}
            className="text-sm font-bold px-4 py-1.5 rounded-full text-white transition active:scale-95 disabled:opacity-50"
            style={{ background: ACCENT }}>
            {done ? "✓" : saving ? "..." : "Guardar"}
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Avatar + foto de capa (placeholder) */}
          <div className="relative">
            <div className="h-24 w-full" style={{ background: "linear-gradient(135deg,#5B3FCF,#1FAFA6,#FFC93C)" }} />
            <button className="absolute top-2 right-2 bg-black/40 rounded-full p-1.5">
              <Camera className="h-4 w-4 text-white" />
            </button>
            <div className="absolute" style={{ bottom: -28, left: 20 }}>
              <div className="relative">
                <Avatar name={name || email || "?"} size={64} />
                <button className="absolute -bottom-1 -right-1 bg-neutral-800 rounded-full p-1 border-2 border-white">
                  <Camera className="h-3 w-3 text-white" />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-12 px-5 pb-6 space-y-4">
            {/* Nome */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="O teu nome completo"
                className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-[#5B3FCF] focus:ring-2 focus:ring-[#5B3FCF]/20 transition"
              />
            </div>

            {/* Username */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Nome de utilizador</label>
              <div className="relative mt-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">@</span>
                <input value={username} onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="nomedeutilizador"
                  className="w-full rounded-xl pl-8 pr-10 py-2.5 text-sm font-medium outline-none transition"
                  style={{
                    border: `1.5px solid ${usernameStatus === "available" ? "#6BA547" : usernameStatus === "taken" || usernameStatus === "invalid" ? "#ef4444" : "#e5e7eb"}`,
                    boxShadow: usernameStatus === "available" ? "0 0 0 3px #6BA54720" : usernameStatus === "taken" ? "0 0 0 3px #ef444420" : "none",
                  }}
                />
                {/* Indicador direito */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && (
                    <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
                  )}
                  {usernameStatus === "available" && <span className="text-[#6BA547] text-lg">✓</span>}
                  {usernameStatus === "taken" && <span className="text-red-500 text-lg">✗</span>}
                  {usernameStatus === "invalid" && <span className="text-red-500 text-lg">✗</span>}
                </div>
              </div>
              {usernameStatus === "available" && <p className="text-[11px] text-[#6BA547] mt-1">Disponível!</p>}
              {usernameStatus === "taken" && <p className="text-[11px] text-red-500 mt-1">Este nome de utilizador já está em uso.</p>}
              {usernameStatus === "invalid" && <p className="text-[11px] text-red-500 mt-1">Mínimo 3 caracteres. Apenas letras, números, . e _</p>}
            </div>

            {/* Bio */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Biografia</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                placeholder="Fala um pouco sobre ti..."
                rows={3}
                className="mt-1 w-full border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#5B3FCF] focus:ring-2 focus:ring-[#5B3FCF]/20 transition resize-none leading-relaxed"
              />
              <p className="text-[11px] text-neutral-400 text-right mt-1">{bio.length}/160</p>
            </div>

            {/* Website */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Website</label>
              <div className="relative mt-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input value={website} onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#5B3FCF] focus:ring-2 focus:ring-[#5B3FCF]/20 transition"
                />
              </div>
            </div>

            {/* Localização */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Localização</label>
              <div className="relative mt-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input value={location} onChange={(e) => setLocation(e.target.value)}
                  placeholder="Lisboa, Portugal"
                  className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#5B3FCF] focus:ring-2 focus:ring-[#5B3FCF]/20 transition"
                />
              </div>
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Email</label>
              <input value={email} readOnly
                className="mt-1 w-full border border-neutral-100 rounded-xl px-4 py-2.5 text-sm text-neutral-400 bg-neutral-50 cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Painel ClickAds ─── */
function MonetizationPanel() {
  return (
    <div className="px-5 py-16 flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
        <TrendingUp className="h-8 w-8 text-white" />
      </div>
      <p className="text-xl font-extrabold text-black">ClickAds</p>
      <div className="flex items-center gap-2 bg-neutral-100 rounded-full px-5 py-2.5">
        <div className="w-2 h-2 rounded-full bg-[#E94B8A] animate-pulse" />
        <p className="text-sm font-bold text-neutral-600">Em breve</p>
      </div>
    </div>
  );
}

/* ─── Gaveta de Configurações ─── */
function SettingsDrawer({
  onClose, onEditProfile, onSignOut, msgPermission, onMsgPermissionChange,
  onOpenNotifications, onOpenActivity, onOpenPrivacy, onOpenSecurity,
  onOpenHelp, onOpenMsgPrivacy, profile,
}: {
  onClose: () => void;
  onEditProfile: () => void;
  onSignOut: () => void;
  msgPermission: string;
  onMsgPermissionChange: (v: string) => void;
  onOpenNotifications: () => void;
  onOpenActivity: () => void;
  onOpenPrivacy: () => void;
  onOpenSecurity: () => void;
  onOpenHelp: () => void;
  onOpenMsgPrivacy: () => void;
  profile?: Profile | null;
}) {
  const { theme, toggle } = useTheme();
  const { avatarUrl } = useAvatar();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const sections = [
    {
      title: "Conta",
      items: [
        { icon: Settings, label: "Editar perfil", desc: "Nome, foto, bio e mais", action: () => { handleClose(); setTimeout(onEditProfile, 300); }, color: ACCENT },
        { icon: Bell, label: "Notificações", desc: "Gere os teus alertas", action: onOpenNotifications, color: "#F26B3A" },
        { icon: Calendar, label: "Atividade", desc: "Histórico de ações", action: onOpenActivity, color: "#1FAFA6" },
      ],
    },
    {
      title: "Privacidade & Segurança",
      items: [
        { icon: Lock, label: "Privacidade", desc: "Quem pode ver o teu perfil", action: onOpenPrivacy, color: "#6BA547" },
        { icon: Shield, label: "Segurança", desc: "Palavra-passe e autenticação", action: onOpenSecurity, color: "#5B3FCF" },
      ],
    },
  ];

  const displayName = profile?.full_name || profile?.username || "Utilizador";
  const handle = profile?.username || "";
  const avatar = avatarUrl || (profile as any)?.avatar_url;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Painel */}
      <div
        className="relative flex flex-col shadow-2xl transition-transform duration-300 ease-out"
        style={{
          background: "var(--s1, #fff)",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          width: "100%",
          maxWidth: "384px",
          height: "100dvh",
          maxHeight: "100dvh",
        }}
      >
        {/* Header gradiente com avatar */}
        <div className="shrink-0 px-5 pt-6 pb-5"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, #E94B8A)` }}>
          <div className="flex items-center justify-between mb-5">
            <span className="text-white font-extrabold text-lg tracking-tight">Configurações</span>
            <button onClick={handleClose}
              className="p-2 rounded-full transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/50 shrink-0 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              {avatar
                ? <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                : <span className="text-white font-bold text-xl">{displayName[0]?.toUpperCase()}</span>
              }
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">{displayName}</p>
              {handle && <p className="text-white/70 text-sm truncate">@{handle}</p>}
            </div>
          </div>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto py-2 min-h-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }}>

          {/* Tema */}
          <div className="mb-1">
            <p className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}>Aparência</p>
            <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm"
              style={{ background: "var(--s2, #f9f9f9)", borderColor: "var(--border-default, #eee)" }}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: theme === "dark" ? "#1e1c2e" : "#F3F0FF" }}>
                  {theme === "dark"
                    ? <Moon className="h-4 w-4" style={{ color: "#8B5CF6" }} />
                    : <Sun className="h-4 w-4" style={{ color: ACCENT }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                    {theme === "dark" ? "Modo escuro" : "Modo claro"}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Altera o tema da app</p>
                </div>
                <button onClick={toggle}
                  className="relative w-12 h-6 rounded-full transition-all duration-300 shrink-0"
                  style={{ background: theme === "dark" ? ACCENT : "#D1D5DB" }}>
                  <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300"
                    style={{ left: theme === "dark" ? "calc(100% - 22px)" : "2px" }} />
                </button>
              </div>
            </div>
          </div>

          {/* Secções */}
          {sections.map((sec) => (
            <div key={sec.title} className="mb-1">
              <p className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}>{sec.title}</p>
              <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm"
                style={{ background: "var(--s2, #f9f9f9)", borderColor: "var(--border-default, #eee)" }}>
                {sec.items.map((item, idx) => (
                  <button key={item.label} onClick={item.action}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:scale-[0.98] ${idx > 0 ? "border-t" : ""}`}
                    style={{ borderColor: "var(--border-default, #eee)" }}
                    onMouseOver={e => (e.currentTarget.style.background = "var(--s3, #f0f0f0)")}
                    onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: item.color + "18" }}>
                      <item.icon className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{item.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Privacidade de Mensagens */}
          <div className="mb-1">
            <p className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}>Mensagens</p>
            <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm"
              style={{ background: "var(--s2, #f9f9f9)", borderColor: "var(--border-default, #eee)" }}>
              <button onClick={onOpenMsgPrivacy}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:scale-[0.98]"
                onMouseOver={e => (e.currentTarget.style.background = "var(--s3, #f0f0f0)")}
                onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "#F26B3A18" }}>
                  <MessageCircle className="h-4 w-4" style={{ color: "#F26B3A" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Privacidade de mensagens</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {msgPermission === "todos" ? "Todos podem enviar-te mensagens"
                      : msgPermission === "seguidos" ? "Apenas quem segues"
                      : "Ninguém pode enviar-te mensagens"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "#F26B3A18", color: "#F26B3A" }}>
                    {msgPermission === "todos" ? "Todos" : msgPermission === "seguidos" ? "Seguidos" : "Ninguém"}
                  </span>
                  <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                </div>
              </button>
            </div>
          </div>

          {/* Terminar sessão */}
          <div className="mx-3 mb-4">
            <button onClick={onSignOut}
              className="w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
              style={{ background: "#fee2e2", color: "#dc2626", border: "1.5px solid #fca5a5" }}
              onMouseOver={e => (e.currentTarget.style.background = "#fecaca")}
              onMouseOut={e => (e.currentTarget.style.background = "#fee2e2")}>
              <LogOut className="h-4 w-4" /> Terminar sessão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Painel genérico — ocupa a página inteira (estilo Instagram) ─── */
function SettingsSubPanel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBack = () => {
    setVisible(false);
    setTimeout(onBack, 250);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col transition-transform duration-250 ease-out"
      style={{
        background: "var(--s1, #f8f8f8)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b shrink-0"
        style={{ background: "var(--s0, #fff)", borderColor: "var(--border-default, #eee)" }}>
        <button onClick={handleBack}
          className="flex items-center justify-center w-9 h-9 rounded-full transition active:scale-90"
          style={{ background: "var(--s2, #f0f0f0)" }}>
          <ArrowLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
        </button>
        <span className="text-base font-extrabold flex-1" style={{ color: "var(--text-primary)" }}>{title}</span>
      </div>
      {/* Conteúdo scrollável */}
      <div className="overflow-y-auto flex-1 py-3">{children}</div>
    </div>
  );
}

function ToggleRow({ icon: Icon, color, label, desc, checked, onChange }: {
  icon: React.ElementType; color: string; label: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "18" }}>
        <Icon className="h-4.5 w-4.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-black leading-tight">{label}</p>
        <p className="text-[11px] text-neutral-400 mt-0.5">{desc}</p>
      </div>
      <button onClick={() => onChange(!checked)}
        className="relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0"
        style={{ background: checked ? ACCENT : "#D1D5DB" }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300"
          style={{ left: checked ? "calc(100% - 22px)" : "2px" }} />
      </button>
    </div>
  );
}

/* ─── Notificações ─── */
function NotificationsPanel({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState({ likes: true, comments: true, follows: true, messages: true, mentions: true });
  const [loading, setLoading] = useState(true);
  const [savingErr, setSavingErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data, error } = await supabase.from("profiles")
        .select("notification_prefs").eq("id", session.user.id).maybeSingle();
      if (!error && (data as any)?.notification_prefs) {
        setPrefs(p => ({ ...p, ...(data as any).notification_prefs }));
      }
      setLoading(false);
    })();
  }, []);

  async function update(key: keyof typeof prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingErr("");
    setSavedOk(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSavingErr("Não autenticado."); return; }
    const { error } = await supabase.from("profiles")
      .update({ notification_prefs: next } as any).eq("id", session.user.id);
    if (error) setSavingErr(`Erro ao guardar: ${error.message}`);
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
  }

  const ITEMS: { key: keyof typeof prefs; icon: React.ElementType; color: string; label: string; desc: string }[] = [
    { key: "likes",    icon: Heart,         color: "#E94B8A", label: "Gostos",           desc: "Quando alguém gosta das tuas publicações" },
    { key: "comments", icon: MessageCircle, color: "#1FAFA6", label: "Comentários",      desc: "Quando alguém comenta as tuas publicações" },
    { key: "follows",  icon: Users,         color: "#6BA547", label: "Novos seguidores", desc: "Quando alguém começa a seguir-te" },
    { key: "messages", icon: Bell,          color: "#F26B3A", label: "Mensagens",        desc: "Quando recebes uma nova mensagem" },
    { key: "mentions", icon: Type,          color: ACCENT,    label: "Menções",          desc: "Quando alguém te menciona numa publicação" },
  ];

  return (
    <SettingsSubPanel title="Notificações" onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="mb-2">
          {savedOk && (
            <p className="mx-5 mb-3 text-xs font-semibold text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Preferências guardadas
            </p>
          )}
          <p className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Alertas</p>
          <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm divide-y"
            style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
            {ITEMS.map(it => (
              <ToggleRow key={it.key} icon={it.icon} color={it.color} label={it.label} desc={it.desc}
                checked={prefs[it.key]} onChange={(v) => update(it.key, v)} />
            ))}
          </div>
          {savingErr && <p className="px-5 pt-2 text-xs text-red-500">{savingErr}</p>}
        </div>
      )}
    </SettingsSubPanel>
  );
}

/* ─── Atividade ─── */
function ActivityPanel({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<{ id: string; type: string; text: string; time: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const uid = session.user.id;

      const [postsRes, followsRes] = await Promise.all([
        supabase.from("posts").select("id,created_at").eq("author_id", uid).order("created_at", { ascending: false }).limit(10),
        supabase.from("follows").select("target_username,follower_id").eq("follower_id", uid).limit(10),
      ]);

      const list: { id: string; type: string; text: string; time: string }[] = [];

      (postsRes.data ?? []).forEach((p: any) => list.push({
        id: `p-${p.id}`, type: "post", text: "Criaste uma publicação", time: p.created_at,
      }));

      (followsRes.data ?? []).forEach((f: any, i: number) => list.push({
        id: `f-${i}`, type: "follow",
        text: `Estás a seguir @${f.target_username || "utilizador"}`,
        time: new Date(Date.now() - i * 60000).toISOString(),
      }));

      list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setItems(list.slice(0, 20));
      if (postsRes.error) setErr("Erro ao carregar publicações.");
      setLoading(false);
    })();
  }, []);

  const ICONS: Record<string, { icon: React.ElementType; color: string }> = {
    post:   { icon: Type,     color: ACCENT },
    like:   { icon: Heart,    color: "#E94B8A" },
    follow: { icon: Users,    color: "#6BA547" },
  };

  return (
    <SettingsSubPanel title="Atividade" onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : err ? (
        <p className="px-5 text-sm text-red-500">{err}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center px-6">
          <Calendar className="h-8 w-8 text-neutral-300" />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Sem atividade ainda</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>As tuas ações vão aparecer aqui</p>
        </div>
      ) : (
        <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm divide-y"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          {items.map(it => {
            const cfg = ICONS[it.type] ?? { icon: Calendar, color: "#888" };
            return (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.color + "18" }}>
                  <cfg.icon className="h-4 w-4" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{it.text}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{timeAgo(new Date(it.time))}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SettingsSubPanel>
  );
}

/* ─── Privacidade ─── */
function PrivacyPanel({ onBack }: { onBack: () => void }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data, error } = await supabase.from("profiles").select("is_private").eq("id", session.user.id).maybeSingle();
      if (!error) setIsPrivate(!!(data as any)?.is_private);
      else setErr(error.message);
      setLoading(false);
    })();
  }, []);

  async function toggle(v: boolean) {
    setIsPrivate(v);
    setErr(""); setSavedOk(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setErr("Não autenticado."); return; }
    const { error } = await supabase.from("profiles").update({ is_private: v } as any).eq("id", session.user.id);
    if (error) { setErr(`Erro ao guardar: ${error.message}`); setIsPrivate(!v); }
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
  }

  return (
    <SettingsSubPanel title="Privacidade" onBack={onBack}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
        </div>
      ) : (
        <div className="mb-2">
          {savedOk && (
            <p className="mx-5 mb-3 text-xs font-semibold text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Guardado
            </p>
          )}
          <p className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Visibilidade do perfil</p>
          <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
            <ToggleRow icon={Lock} color="#6BA547" label="Conta privada"
              desc="Só seguidores aprovados veem as tuas publicações"
              checked={isPrivate} onChange={toggle} />
          </div>
          {err && <p className="px-5 pt-2 text-xs text-red-500">{err}</p>}
          <p className="px-5 pt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Com a conta privada, novos seguidores precisam de aprovação e o teu conteúdo deixa de aparecer em pesquisas públicas.
          </p>
        </div>
      )}
    </SettingsSubPanel>
  );
}

/* ─── Segurança ─── */
function SecurityPanel({ onBack, email }: { onBack: () => void; email: string }) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function changePassword() {
    setMsg(null);
    if (pwd.length < 6) { setMsg({ type: "err", text: "A senha tem de ter pelo menos 6 caracteres." }); return; }
    if (pwd !== pwd2) { setMsg({ type: "err", text: "As senhas não coincidem." }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setMsg({ type: "ok", text: "Senha atualizada com sucesso." });
    setPwd(""); setPwd2("");
  }

  return (
    <SettingsSubPanel title="Segurança" onBack={onBack}>
      <div className="mb-2">
        <p className="px-5 pb-1.5 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Conta</p>
        <div className="bg-white mx-3 rounded-2xl overflow-hidden border border-neutral-100 shadow-sm px-4 py-3.5">
          <p className="text-[11px] text-neutral-400">Email associado</p>
          <p className="text-sm font-semibold text-black mt-0.5">{email}</p>
        </div>
      </div>

      <div className="mb-2">
        <p className="px-5 pb-1.5 pt-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Alterar palavra-passe</p>
        <div className="bg-white mx-3 rounded-2xl overflow-hidden border border-neutral-100 shadow-sm px-4 py-3.5 space-y-3">
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
            placeholder="Nova senha" className="w-full h-10 px-3 rounded-xl text-sm outline-none bg-neutral-50 border border-neutral-100" />
          <input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)}
            placeholder="Confirmar nova senha" className="w-full h-10 px-3 rounded-xl text-sm outline-none bg-neutral-50 border border-neutral-100" />
          {msg && (
            <p className={`text-xs ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
          )}
          <button onClick={changePassword} disabled={saving || !pwd || !pwd2}
            className="w-full h-10 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition active:scale-[0.98]"
            style={{ background: ACCENT }}>
            {saving ? "A guardar..." : "Atualizar senha"}
          </button>
        </div>
      </div>
    </SettingsSubPanel>
  );
}


/* ─── Privacidade de Mensagens ─── */
function MsgPrivacyPanel({ onBack, msgPermission, onMsgPermissionChange }: {
  onBack: () => void; msgPermission: string; onMsgPermissionChange: (v: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  // Valores que a constraint da DB aceita: todos, seguidores, mutuos, aprovados
  const OPTIONS = [
    { value: "todos",      label: "Toda a gente",     desc: "Qualquer utilizador pode escrever-te" },
    { value: "seguidores", label: "Seguidores",        desc: "Apenas quem te segue" },
    { value: "mutuos",     label: "Seguimento mútuo", desc: "Quem segues e te segue" },
    { value: "aprovados",  label: "Apenas aprovados", desc: "Tens de aceitar cada pedido" },
  ];

  async function choose(v: string) {
    setSaving(true); setErr(""); setSavedOk(false);
    onMsgPermissionChange(v); // atualiza estado pai imediatamente
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setErr("Não autenticado."); setSaving(false); return; }
    const { error } = await supabase.from("profiles")
      .update({ msg_permission: v } as any).eq("id", session.user.id);
    setSaving(false);
    if (error) { setErr(`Erro: ${error.message}`); }
    else { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); }
  }

  return (
    <SettingsSubPanel title="Privacidade de Mensagens" onBack={onBack}>
      <div className="mb-2">
        {savedOk && (
          <p className="mx-5 mb-3 text-xs font-semibold text-green-600 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Guardado
          </p>
        )}
        <p className="px-5 pb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Quem pode enviar-te mensagens?</p>
        <div className="mx-3 rounded-2xl overflow-hidden border shadow-sm divide-y"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          {OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => choose(opt.value)} disabled={saving}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition active:scale-[0.98] disabled:opacity-60"
              onMouseOver={e => (e.currentTarget.style.background = "var(--s3)")}
              onMouseOut={e => (e.currentTarget.style.background = "transparent")}>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition"
                style={{
                  borderColor: msgPermission === opt.value ? ACCENT : "var(--border-default)",
                  background:  msgPermission === opt.value ? ACCENT : "transparent",
                }}>
                {msgPermission === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{opt.desc}</p>
              </div>
              {saving && msgPermission === opt.value && (
                <div className="w-4 h-4 rounded-full border-2 animate-spin shrink-0" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
              )}
            </button>
          ))}
        </div>
        {err && <p className="px-5 pt-2 text-xs text-red-500">{err}</p>}
        <p className="px-5 pt-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Esta definição aplica-se a novos pedidos. Conversas existentes não são afetadas.
        </p>
      </div>
    </SettingsSubPanel>
  );
}

/* ─── Ajuda ─── */
function HelpPanel({ onBack }: { onBack: () => void }) {
  const faqs = [
    { q: "Como altero a minha foto de perfil?", a: "Vai ao teu perfil e clica na foto de perfil para fazer upload de uma nova imagem." },
    { q: "Como publico um vídeo?", a: "Vai ao HoodaStudio e clica em 'Novo vídeo'. Podes fazer upload e definir título, descrição e visibilidade." },
    { q: "Como sigo um canal?", a: "Na HoodaTV, clica no canal que queres seguir e depois no botão 'Seguir'." },
    { q: "Como altero a minha palavra-passe?", a: "Vai a Configurações → Segurança → Alterar palavra-passe." },
    { q: "Como torno o meu perfil privado?", a: "Vai a Configurações → Privacidade e ativa 'Conta privada'." },
    { q: "Como envio mensagens?", a: "Usa o separador Mensagens na barra de navegação. Podes enviar mensagens a outros utilizadores." },
    { q: "Como apago uma publicação?", a: "Vai à publicação, clica no menu (⋯) e seleciona 'Eliminar'." },
    { q: "Como contacto o suporte?", a: "Envia um email para suporte@hooda.app e responderemos em até 48 horas." },
  ];
  const [open, setOpen] = useState<number | null>(null);

  return (
    <SettingsSubPanel title="Ajuda" onBack={onBack}>
      <div className="px-3 space-y-2 mb-6">
        <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Perguntas frequentes</p>
        {faqs.map((faq, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border shadow-sm" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left transition"
              style={{ background: "transparent" }}>
              <span className="text-sm font-semibold leading-snug pr-3" style={{ color: "var(--text-primary)" }}>{faq.q}</span>
              <span className="shrink-0 text-lg font-bold" style={{ color: "var(--text-muted)" }}>{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4">
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{faq.a}</p>
              </div>
            )}
          </div>
        ))}
        <div className="mt-4 rounded-2xl p-4 border text-center" style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Ainda tens dúvidas?</p>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>A nossa equipa responde em até 48 horas.</p>
          <a href="mailto:suporte@hooda.app"
            className="inline-block px-5 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: ACCENT }}>
            Contactar suporte
          </a>
        </div>
      </div>
    </SettingsSubPanel>
  );
}

/* ─── Tab Vídeos do Utilizador ─── */
function MyVideosFeed({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("videos")
        .select("id,title,thumbnail_url,duration_seconds,views_count,created_at,status,visibility,channels(handle)")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      setVideos(data ?? []);
      setLoading(false);
    })();
  }, [userId]);

  const fmtDur = (s: number | null) => {
    if (!s) return "";
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  if (loading) return (
    <div className="flex justify-center py-14">
      <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
    </div>
  );

  if (videos.length === 0) return (
    <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: ACCENT + "18" }}>
        <Tv className="h-7 w-7" style={{ color: ACCENT }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Nenhum vídeo publicado</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Publica o teu primeiro vídeo no HoodaStudio</p>
      <button onClick={() => navigate({ to: "/studio/upload" })}
        className="mt-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
        style={{ background: ACCENT }}>
        Ir para o Studio
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {videos.map((v) => (
        <button key={v.id}
          onClick={() => navigate({ to: `/hoodatv/canal/${v.channels?.handle ?? ""}` })}
          className="relative rounded-xl overflow-hidden bg-black text-left group active:scale-[0.97] transition">
          {/* Thumbnail */}
          <div className="aspect-video w-full bg-neutral-900 relative">
            {v.thumbnail_url
              ? <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center">
                  <Tv className="h-8 w-8 text-neutral-600" />
                </div>
            }
            {/* Duração */}
            {v.duration_seconds && (
              <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                {fmtDur(v.duration_seconds)}
              </span>
            )}
            {/* Status badge */}
            {v.status !== "published" && (
              <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: v.status === "processing" ? "#F26B3A" : "#6B7280", color: "white" }}>
                {v.status === "processing" ? "A processar" : "Privado"}
              </span>
            )}
          </div>
          {/* Título */}
          <div className="p-2">
            <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: "var(--text-primary)" }}>{v.title}</p>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{v.views_count ?? 0} visualizações</p>
          </div>
        </button>
      ))}
    </div>
  );
}


function MyProfile({ profile: initialProfile, email, onSignOut }: {
  profile: Profile | null; email: string; onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(initialProfile);
  const name = profile?.full_name || email || "?";
  const [tab, setTab] = useState<"posts" | "saved" | "info" | "monetization">("posts");
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMsgPrivacy, setShowMsgPrivacy] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const { setAvatarUrl: setGlobalAvatarUrl } = useAvatar();
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [msgPermission, setMsgPermission] = useState("todos");
  const [followListMode, setFollowListMode] = useState<"followers" | "following" | null>(null);
  const [myUserId, setMyUserId] = useState<string>("");
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [photoViewerSrc, setPhotoViewerSrc] = useState<string | null>(null);

  function pickFile(ref: React.RefObject<HTMLInputElement | null>, onDone: (url: string) => void, saveToDb?: "avatar" | "cover") {
    if (!ref.current) return;
    ref.current.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      (e.target as HTMLInputElement).value = "";
      try {
        const folder = saveToDb === "avatar" ? "hooda/avatars" : "hooda/covers";
        toast.loading(saveToDb === "avatar" ? "A carregar foto..." : "A carregar capa...", { id: "img-upload" });
        const { url } = await uploadImageToCloudinary(file, folder);
        onDone(url);
        toast.dismiss("img-upload");
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (saveToDb === "avatar") {
            await supabase.from("profiles").update({ avatar_url: url } as any).eq("id", session.user.id);
            setGlobalAvatarUrl(url);
            toast.success("Foto de perfil actualizada!");
          } else if (saveToDb === "cover") {
            await supabase.from("profiles").update({ cover_url: url } as any).eq("id", session.user.id);
            toast.success("Foto de capa actualizada!");
          }
        }
      } catch (err: any) {
        toast.dismiss("img-upload");
        toast.error(err.message ?? "Erro ao carregar imagem.");
      }
    };
    ref.current.click();
  }

  useEffect(() => { setProfile(initialProfile); }, [initialProfile]);

  /* Load user's posts + follower counts from Supabase on mount */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMyUserId(session.user.id);

      // Carregar avatar_url e username do perfil
      const { data: profData } = await supabase
        .from("profiles")
        .select("avatar_url, username, msg_permission, website, location, cover_url")
        .eq("id", session.user.id)
        .maybeSingle();
      if ((profData as any)?.avatar_url) setAvatarUrl((profData as any).avatar_url);
      if ((profData as any)?.msg_permission) setMsgPermission((profData as any).msg_permission);
      if ((profData as any)?.website) setWebsite((profData as any).website);
      if ((profData as any)?.location) setLocation((profData as any).location);
      if ((profData as any)?.cover_url) setCoverUrl((profData as any).cover_url);

      // follows: target_username é texto (username), não UUID
      const myUsername = (profData as any)?.username ?? "";
      const [{ count: fc }, { count: foc }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("target_username", myUsername),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", session.user.id),
      ]);
      setFollowerCount(fc ?? 0);
      setFollowingCount(foc ?? 0);

      const { data } = await supabase
        .from("posts")
        .select("id, content, kind, created_at, image_url, video_url, photos")
        .eq("author_id", session.user.id)
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        const postIds = data.map((p: any) => p.id);
        const [{ data: likesData }, { data: commentsData }, { data: savesData }] = await Promise.all([
          supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
          supabase.from("post_comments").select("post_id").in("post_id", postIds),
          supabase.from("post_saves").select("post_id").eq("user_id", session.user.id).in("post_id", postIds),
        ]);
        const likesByPost: Record<string, string[]> = {};
        (likesData ?? []).forEach((l: any) => {
          if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
          likesByPost[l.post_id].push(l.user_id);
        });
        const commentsByPost: Record<string, number> = {};
        (commentsData ?? []).forEach((c: any) => { commentsByPost[c.post_id] = (commentsByPost[c.post_id] ?? 0) + 1; });
        const savedSet = new Set((savesData ?? []).map((s: any) => s.post_id));

        // Each post is identified by its real database id (UUID) — never by
        // array position — and deduplicated up front so the same post can
        // never render twice even if the query were to return it more than
        // once.
        const seenIds = new Set<string>();
        const loaded: Post[] = data
          .filter((p) => {
            if (!p.id || seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          })
          .map((p) => {
            let text = p.content;
            let bgColor: string | null = null;
            if (p.kind === "bg") {
              try {
                const j = JSON.parse(p.content);
                text = j.text;
                bgColor = j.bgColor;
              } catch (_) {}
            }
            const photo = (p as any).image_url || ((p as any).photos && (p as any).photos[0]) || null;
            const videoUrl = (p as any).video_url || undefined;
            const likeIds = likesByPost[p.id] ?? [];
            return {
              id: p.id, text, photo, bgColor, createdAt: new Date(p.created_at ?? Date.now()),
              likes: likeIds.length, likedByMe: likeIds.includes(session.user.id),
              comments: commentsByPost[p.id] ?? 0, bookmarked: savedSet.has(p.id),
            };
          });
        setPosts(loaded);
      }
    })();
  }, []);

  function addPost(post: Post) {
    setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
  }

  /* Carregar publicações guardadas (tab "Guardado") sob pedido */
  useEffect(() => {
    if (tab !== "saved" || !myUserId) return;
    (async () => {
      setSavedLoading(true);
      const { data: saveRows } = await supabase.from("post_saves").select("post_id").eq("user_id", myUserId);
      const postIds = [...new Set((saveRows ?? []).map((r: any) => r.post_id))];
      if (postIds.length === 0) { setSavedPosts([]); setSavedLoading(false); return; }

      const { data: postsData } = await supabase
        .from("posts")
        .select("id, content, kind, created_at, image_url, photos, author_id, author_username, author_name")
        .in("id", postIds);
      const rows = postsData ?? [];

      const [{ data: likesData }, { data: commentsData }] = await Promise.all([
        supabase.from("post_likes").select("post_id,user_id").in("post_id", postIds),
        supabase.from("post_comments").select("post_id").in("post_id", postIds),
      ]);
      const likesByPost: Record<string, string[]> = {};
      (likesData ?? []).forEach((l: any) => {
        if (!likesByPost[l.post_id]) likesByPost[l.post_id] = [];
        likesByPost[l.post_id].push(l.user_id);
      });
      const commentsByPost: Record<string, number> = {};
      (commentsData ?? []).forEach((c: any) => { commentsByPost[c.post_id] = (commentsByPost[c.post_id] ?? 0) + 1; });

      const authorIds = [...new Set(rows.map((p: any) => p.author_id).filter(Boolean))];
      const { data: authorProfiles } = authorIds.length > 0
        ? await supabase.from("profiles").select("id,avatar_url").in("id", authorIds)
        : { data: [] as any[] };
      const avatarByAuthor: Record<string, string | null> = {};
      (authorProfiles ?? []).forEach((p: any) => { avatarByAuthor[p.id] = p.avatar_url ?? null; });

      const loaded: SavedPost[] = rows.map((p: any) => {
        let text = p.content;
        let bgColor: string | null = null;
        if (p.kind === "bg") {
          try { const j = JSON.parse(p.content); text = j.text; bgColor = j.bgColor; } catch (_) {}
        }
        const photo = p.image_url || (p.photos && p.photos[0]) || null;
        const likeIds = likesByPost[p.id] ?? [];
        return {
          id: p.id, text, photo, bgColor, createdAt: new Date(p.created_at ?? Date.now()),
          likes: likeIds.length, likedByMe: likeIds.includes(myUserId),
          comments: commentsByPost[p.id] ?? 0, bookmarked: true,
          authorId: p.author_id, authorName: p.author_name || p.author_username || "hooda",
          authorUsername: p.author_username || "utilizador",
          authorAvatar: p.author_id ? avatarByAuthor[p.author_id] ?? null : null,
        };
      }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setSavedPosts(loaded);
      setSavedLoading(false);
    })();
  }, [tab, myUserId]);

  async function toggleLike(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("A iniciar sessão… tenta novamente em 1 segundo."); return; }
    const target = posts.find((p) => p.id === id) ?? savedPosts.find((p) => p.id === id);
    if (!target) return;
    if (target.likedByMe) {
      await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", session.user.id);
    } else {
      await supabase.from("post_likes").insert({ post_id: id, user_id: session.user.id } as any);
    }
    setPosts(prev => prev.map(p => p.id === id
      ? { ...p, likedByMe: !p.likedByMe, likes: p.likedByMe ? p.likes - 1 : p.likes + 1 }
      : p));
  }

  async function toggleBookmark(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("A iniciar sessão… tenta novamente em 1 segundo."); return; }
    const target = posts.find((p) => p.id === id) ?? savedPosts.find((p) => p.id === id);
    if (!target) return;
    if (target.bookmarked) {
      await supabase.from("post_saves").delete().eq("post_id", id).eq("user_id", session.user.id);
    } else {
      await supabase.from("post_saves").insert({ post_id: id, user_id: session.user.id } as any);
    }
    setPosts(prev => prev.map(p => p.id === id ? { ...p, bookmarked: !p.bookmarked } : p));
  }

  async function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id));
  }

  function saveProfile(data: Partial<Profile> & { website?: string; location?: string }) {
    setProfile((p) => p ? { ...p, ...data } : p);
    if (data.website) setWebsite(data.website);
    if (data.location) setLocation(data.location);
  }

  const tabs = [
    { key: "posts", label: "Publicações", icon: Type },
    { key: "saved", label: "Guardado", icon: Bookmark },
    { key: "info", label: "Info", icon: Info },
    { key: "monetization", label: "Studio", icon: Tv },
  ] as const;

  return (
    <>
    <SideNav />
    <PageWrapper className="pb-20 lg:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b" style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
        <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 h-14 flex items-center justify-between">
          <HoodaLogo size="sm" className="lg:hidden" />
          <span className="hidden lg:block text-sm font-bold" style={{ color: "var(--text-primary)" }}>Perfil</span>
          <button onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-neutral-100 rounded-full transition active:scale-90" aria-label="Configurações">
            <Settings className="h-5 w-5 text-neutral-600" />
          </button>
        </div>
      </header>

      {/* Inputs de ficheiro ocultos */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" />

      <main className="mx-auto max-w-2xl lg:max-w-3xl">
        {/* Capa */}
        <div className="relative">
          <div className="h-32 relative overflow-hidden"
            style={coverUrl ? undefined : { background: "linear-gradient(135deg,#5B3FCF 0%,#1FAFA6 50%,#FFC93C 100%)" }}>
            {coverUrl && <img src={coverUrl} alt="capa" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            {/* Botão câmera da capa */}
            <button onClick={() => pickFile(coverInputRef, setCoverUrl, "cover")}
              className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow"
              style={{ background: "rgba(0,0,0,0.45)" }}>
              <Camera className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="absolute left-5" style={{ bottom: -48 }}>
            <div className="relative">
              {/* Anel gradiente estilo Instagram */}
              <div className="rounded-full p-[3px]"
                style={{ background: "linear-gradient(135deg, #5B3FCF 0%, #E94B8A 50%, #FFC93C 100%)" }}>
                <div className="rounded-full p-[2px] bg-white">
                  <div
                    onClick={() => avatarUrl && setPhotoViewerSrc(avatarUrl)}
                    style={{
                      width: 90, height: 90, borderRadius: "50%",
                      overflow: "hidden", background: avatarUrl ? "transparent" : getColor(name),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 32, fontWeight: 700, color: "white",
                      cursor: avatarUrl ? "pointer" : "default",
                    }}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      : (name?.[0] ?? "?").toUpperCase()}
                  </div>
                </div>
              </div>
              <button onClick={() => pickFile(avatarInputRef, setAvatarUrl, "avatar")}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow"
                style={{ background: ACCENT }}>
                <Camera className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Editar perfil */}
        <div className="flex justify-end gap-2 px-4 pt-3 pb-0">
          <button onClick={() => setShowEditProfile(true)}
            className="text-sm font-bold border border-neutral-300 rounded-full px-5 py-1.5 bg-white hover:bg-neutral-50 transition active:scale-95">
            Editar perfil
          </button>
        </div>

        {/* Info pessoal */}
        <div className="px-5 pt-10 pb-4">
          <p className="text-xl font-extrabold text-black leading-tight">{name}</p>
          <p className="text-sm text-neutral-400 font-medium mt-0.5">@{profile?.username || "utilizador"}</p>
          {profile?.bio && (
            <p className="text-sm text-neutral-700 mt-2 leading-relaxed">{profile.bio}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2.5">
            {location && (
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <MapPin className="h-3.5 w-3.5" /> {location}
              </span>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: ACCENT }}>
                <Link className="h-3.5 w-3.5" /> {website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <Calendar className="h-3.5 w-3.5" /> Membro desde 2025
            </span>
          </div>
        </div>

        <StatsGrid publications={posts.length} followers={followerCount} following={followingCount} onFollowersClick={() => setFollowListMode("followers")} onFollowingClick={() => setFollowListMode("following")} />

        {/* Caixa criar publicação */}
        {tab === "posts" && (
          <div className="px-5 mb-4">
            <button onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-3 bg-white border border-neutral-200 rounded-2xl px-4 py-3.5 hover:bg-neutral-50 transition active:scale-[0.99] text-left shadow-sm">
              <Avatar name={name} size={36} src={avatarUrl} />
              <span className="text-neutral-400 text-sm flex-1">Em que estás a pensar?</span>
              <Plus className="h-5 w-5 text-[#5B3FCF]" />
            </button>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowCreate(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition active:scale-95 shadow-sm">
                <Image className="h-4 w-4 text-[#6BA547]" /> Foto
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition active:scale-95 shadow-sm">
                <Type className="h-4 w-4 text-[#5B3FCF]" /> Texto
              </button>
              <button onClick={() => setShowCreate(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition active:scale-95 shadow-sm">
                <Film className="h-4 w-4 text-[#E94B8A]" /> Vídeo
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 mb-3">
          <div className="flex bg-white border border-neutral-100 rounded-2xl p-1 shadow-sm">
            {tabs.map((t) => (
              <button key={t.key}
                onClick={async () => {
                  if (t.key === "monetization") {
                    navigate({ to: "/studio" });
                    return;
                  }
                  setTab(t.key);
                }}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-all ${tab === t.key ? "text-white shadow-sm" : "text-neutral-400 hover:text-neutral-600"}`}
                style={{ background: tab === t.key ? ACCENT : "transparent" }}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo das tabs */}
        {tab === "posts" && (
          <PostsFeed posts={posts} name={name} username={profile?.username || "utilizador"}
            avatarUrl={avatarUrl} onLike={toggleLike} onBookmark={toggleBookmark} onDelete={deletePost}
            myUserId={myUserId} />
        )}



        {tab === "saved" && (
          savedLoading ? (
            <div className="flex justify-center py-14">
              <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
            </div>
          ) : savedPosts.length === 0 ? (
            <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-[#F26B3A]/10 flex items-center justify-center">
                <Bookmark className="h-7 w-7 text-[#F26B3A]" />
              </div>
              <p className="text-sm font-semibold text-neutral-500">Nada guardado ainda</p>
              <p className="text-xs text-neutral-400">As publicações que guardares aparecem aqui.</p>
            </div>
          ) : (
            <div className="pb-6">
              {savedPosts.map((sp) => (
                <PostCard key={sp.id} post={sp} name={sp.authorName} username={sp.authorUsername}
                  isOwner={sp.authorId === myUserId} avatarUrl={sp.authorAvatar}
                  myUserId={myUserId} authorId={sp.authorId}
                  onLike={async (id) => { await toggleLike(id); setSavedPosts(prev => prev.map(p => p.id === id ? { ...p, likedByMe: !p.likedByMe, likes: p.likedByMe ? p.likes - 1 : p.likes + 1 } : p)); }}
                  onBookmark={async (id) => { await toggleBookmark(id); setSavedPosts(prev => prev.filter(p => p.id !== id)); }}
                  onDelete={(id) => setSavedPosts(prev => prev.filter(p => p.id !== id))} />
              ))}
            </div>
          )
        )}

        {tab === "info" && (
          <div className="px-5 py-4 space-y-3">
            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
              <p className="px-5 py-3 text-xs font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-100">Sobre</p>
              {[
                { label: "Nome completo", value: name },
                { label: "Username", value: `@${profile?.username || "—"}` },
                { label: "Email", value: email },
                { label: "Localização", value: location || "—" },
                { label: "Website", value: website || "—" },
              ].map((row, i) => (
                <div key={row.label} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                  <span className="text-xs text-neutral-400 font-medium">{row.label}</span>
                  <span className="text-sm font-semibold text-black text-right max-w-[60%] truncate">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "monetization" && <MonetizationPanel />}
      </main>

      {/* Drawers & Modais */}
      {showSettings && (
        <SettingsDrawer
          onClose={() => setShowSettings(false)}
          onEditProfile={() => setShowEditProfile(true)}
          onSignOut={onSignOut}
          msgPermission={msgPermission}
          profile={profile}
          onMsgPermissionChange={async (v) => {
            setMsgPermission(v);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
          }}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenActivity={() => setShowActivity(true)}
          onOpenPrivacy={() => setShowPrivacy(true)}
          onOpenSecurity={() => setShowSecurity(true)}
          onOpenHelp={() => { setShowSettings(false); setShowHelp(true); }}
          onOpenMsgPrivacy={() => { setShowSettings(false); setShowMsgPrivacy(true); }}
        />
      )}
      {showNotifications && <NotificationsPanel onBack={() => setShowNotifications(false)} />}
      {showActivity && <ActivityPanel onBack={() => setShowActivity(false)} />}
      {showPrivacy && <PrivacyPanel onBack={() => setShowPrivacy(false)} />}
      {showSecurity && <SecurityPanel onBack={() => setShowSecurity(false)} email={email} />}
      {showHelp && <HelpPanel onBack={() => setShowHelp(false)} />}
      {showMsgPrivacy && <MsgPrivacyPanel onBack={() => setShowMsgPrivacy(false)} msgPermission={msgPermission} onMsgPermissionChange={async (v) => {
        setMsgPermission(v);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
      }} />}
      {followListMode && profile && (
        <FollowListModal
          mode={followListMode}
          targetUsername={profile.username || ""}
          targetUserId={profile.id || ""}
          onClose={() => setFollowListMode(null)}
        />
      )}
      {showEditProfile && (
        <EditProfileModal
          profile={profile}
          email={email}
          onClose={() => setShowEditProfile(false)}
          onSave={(data) => { saveProfile(data); setShowEditProfile(false); }}
        />
      )}
      {showCreate && (
        <CreatePostModal
          profile={profile} email={email}
          onClose={() => setShowCreate(false)}
          onPublish={(data) => { addPost(data); setShowCreate(false); }}
        />
      )}
      {photoViewerSrc && (
        <PhotoViewer src={photoViewerSrc} alt={name} subtitle={profile?.username ? `@${profile.username}` : undefined} onClose={() => setPhotoViewerSrc(null)} />
      )}
    </PageWrapper>
    </>
  );
}

/* ─── Perfil público ─── */
function PublicProfile({ profile, email }: { profile: Profile | null; email: string }) {
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [myUserId, setMyUserId] = useState("");
  const [followListMode, setFollowListMode] = useState<"followers" | "following" | null>(null);
  const navigate = useNavigate();
  const name = profile?.full_name || email || "?";

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMyUserId(session.user.id);
      // follows table: follower_id = UUID, target_username = text username
      const targetUsername = profile.username;
      const { data: followRow } = await supabase.from("follows")
        .select("follower_id").eq("follower_id", session.user.id).eq("target_username", targetUsername).maybeSingle();
      setFollowing(!!followRow);
      const [{ count: fc }, { count: foc }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("target_username", targetUsername),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", (profile as any).id),
      ]);
      setFollowerCount(fc ?? 0);
      setFollowingCount(foc ?? 0);
    })();
  }, [profile]);

  async function toggleFollow() {
    if (!profile || !myUserId) return;
    const targetUsername = profile.username;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", myUserId).eq("target_username", targetUsername);
      setFollowing(false);
      setFollowerCount((n) => Math.max(0, n - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: myUserId, target_username: targetUsername });
      setFollowing(true);
      setFollowerCount((n) => n + 1);
    }
  }

  return (
    <>
    <SideNav />
    <PageWrapper className="pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 border-b" style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
        <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 h-14 flex items-center">
          <HoodaLogo size="sm" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl lg:max-w-3xl">
        <div className="h-32 relative" style={{ background: "linear-gradient(135deg,#5B3FCF 0%,#1FAFA6 50%,#FFC93C 100%)" }}>
          <div className="absolute left-5" style={{ bottom: -42 }}>
            <Avatar name={name} size={84} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 pt-3">
          <button
            onClick={() => navigate({ to: "/mensagens" })}
            className="text-sm font-semibold border border-neutral-300 rounded-full px-4 py-1.5 bg-white hover:bg-neutral-50 flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
          >
            <MessageCircle className="h-4 w-4" style={{ color: "#5B3FCF" }} /> Mensagem
          </button>
          <button onClick={toggleFollow}
            className={`text-sm font-bold rounded-full px-5 py-1.5 transition shadow-sm ${following ? "border border-neutral-300 bg-white text-black" : "text-white"}`}
            style={{ background: following ? undefined : ACCENT }}>
            {following ? "Seguindo" : "Seguir"}
          </button>
        </div>
        <div className="px-5 pt-9 pb-4">
          <p className="text-xl font-extrabold text-black">{name}</p>
          <p className="text-sm text-neutral-400 mt-0.5">@{profile?.username || "..."}</p>
          {profile?.bio && <p className="text-sm text-neutral-700 mt-2 leading-relaxed">{profile.bio}</p>}
        </div>
        <StatsGrid publications={0} followers={followerCount} following={followingCount} onFollowersClick={() => setFollowListMode("followers")} onFollowingClick={() => setFollowListMode("following")} />
        <div className="px-5 py-12 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-[#5B3FCF]/10 flex items-center justify-center">
            <BookOpen className="h-7 w-7 text-[#5B3FCF]" />
          </div>
          <p className="text-sm font-semibold text-neutral-500">Ainda não há publicações.</p>
        </div>
        <div className="px-4 pb-6">
          <button className="w-full h-11 rounded-xl border border-neutral-200 text-neutral-400 text-sm flex items-center justify-center gap-2 hover:bg-neutral-100 shadow-sm">
            <Flag className="h-4 w-4" /> Denunciar perfil
          </button>
        </div>
      </main>
      {followListMode && profile && (
        <FollowListModal
          mode={followListMode}
          targetUsername={profile.username || ""}
          targetUserId={(profile as any).id || ""}
          onClose={() => setFollowListMode(null)}
        />
      )}
    </PageWrapper>
    </>
  );
}

/* ─── Página principal ─── */
function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [isOwner] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate({ to: "/", replace: true }); return; }
      setEmail(session.session.user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, age, bio")
        .eq("id", session.session.user.id)
        .maybeSingle();
      if (data) setProfile(data as Profile);
    })();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (isOwner) return <MyProfile profile={profile} email={email} onSignOut={signOut} />;
  return <PublicProfile profile={profile} email={email} />;
}
