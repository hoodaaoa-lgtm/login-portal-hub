import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { HoodaLogo } from "@/components/HoodaLogo";
import { Search, X, BookOpen, ThumbsUp, MessageCircle, Bookmark, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatarLink } from "@/components/ProfileAvatarLink";
import { PostCommentsModal } from "@/components/PostCommentsModal";
import { replyToPostComment, toggleCommentLike, fetchPostComments } from "@/lib/comments";
import { FEED_QUERY_OPTIONS } from "@/lib/queryClient";

import imgPoesia from "@/assets/categorias/poesia.png";
import imgRomance from "@/assets/categorias/romance.png";
import imgFiccao from "@/assets/categorias/ficcao.png";
import imgDrama from "@/assets/categorias/drama.png";
import imgAutoajuda from "@/assets/categorias/autoajuda.png";
import imgBiografias from "@/assets/categorias/biografias.png";
import imgMisterio from "@/assets/categorias/misterio.png";
import imgCulinaria from "@/assets/categorias/culinaria.png";

export const Route = createFileRoute("/explorar")({
  head: () => ({ meta: [{ title: "hooda — Explorar" }] }),
  component: ExplorePage,
});

const ACCENT = "#5B3FCF";

type Tile = { t: string; slug: string; img: string; color: string };
const TILES: Tile[] = [
  { t: "Poesia",     slug: "poesia",     img: imgPoesia,     color: "#E94B8A" },
  { t: "Romance",    slug: "romance",    img: imgRomance,    color: "#F26B3A" },
  { t: "Ficção",     slug: "ficcao",     img: imgFiccao,     color: "#5B3FCF" },
  { t: "Drama",      slug: "drama",      img: imgDrama,      color: "#1FAFA6" },
  { t: "Autoajuda",  slug: "autoajuda",  img: imgAutoajuda,  color: "#6BA547" },
  { t: "Biografias", slug: "biografias", img: imgBiografias, color: "#F26B3A" },
  { t: "Mistério",   slug: "misterio",   img: imgMisterio,   color: "#5B3FCF" },
  { t: "Culinária",  slug: "culinaria",  img: imgCulinaria,  color: "#E94B8A" },
  { t: "Fantasia",   slug: "fantasia",   img: imgRomance,    color: "#1FAFA6" },
];

type DbPost = {
  id: string; author_id: string | null; author_username: string | null; author_color: string | null;
  content: string; created_at: string | null;
  author_avatar_url?: string | null;
};
type DbComment = {
  id: string; post_id: string; user_id: string | null;
  author_username: string | null; author_color: string | null;
  content: string; created_at: string | null;
  author_avatar_url?: string | null;
};

async function attachAvatars<T extends { author_id?: string | null; user_id?: string | null }>(
  rows: T[],
  userIdKey: "author_id" | "user_id" = "author_id",
): Promise<(T & { author_avatar_url: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r[userIdKey]).filter(Boolean) as string[])];
  if (ids.length === 0) return rows.map((r) => ({ ...r, author_avatar_url: null }));
  const { data } = await supabase.from("profiles").select("id,avatar_url").in("id", ids);
  const map: Record<string, string | null> = {};
  (data ?? []).forEach((p: any) => { map[p.id] = p.avatar_url || null; });
  return rows.map((r) => ({ ...r, author_avatar_url: (r[userIdKey] && map[r[userIdKey] as string]) || null }));
}

function CategoryModal({ cat, userId, username, onClose }: { cat: Tile; userId: string; username: string; onClose: () => void }) {
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [openComments, setOpenComments] = useState<DbPost | null>(null);

  const { data: posts = [], isLoading: loading } = useQuery({
    queryKey: ["explorarCategoria", cat.slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("posts").select("id,author_id,author_username,author_color,content,created_at")
        .eq("category", cat.slug).order("created_at", { ascending: false });
      const raw = (data as DbPost[]) ?? [];
      return attachAvatars(raw, "author_id");
    },
    ...FEED_QUERY_OPTIONS,
  });

  useEffect(() => {
    (async () => {
      const ids = posts.map((p) => p.id);
      if (!ids.length) return;
      const [{ data: ls }, { data: cs }, { data: sv }] = await Promise.all([
        supabase.from("post_likes").select("post_id,user_id").in("post_id", ids),
        supabase.from("post_comments").select("post_id").in("post_id", ids),
        supabase.from("post_saves").select("post_id").eq("user_id", userId).in("post_id", ids),
      ]);
      const lc: Record<string, number> = {}; const myLikes = new Set<string>();
      (ls ?? []).forEach((r: any) => { lc[r.post_id] = (lc[r.post_id] || 0) + 1; if (r.user_id === userId) myLikes.add(r.post_id); });
      setLikeCounts(lc); setLiked(myLikes);
      const cc: Record<string, number> = {};
      (cs ?? []).forEach((r: any) => { cc[r.post_id] = (cc[r.post_id] || 0) + 1; });
      setCommentCounts(cc);
      setSaved(new Set((sv ?? []).map((r: any) => r.post_id)));
    })();
  }, [posts, userId]);

  async function toggleLike(id: string) {
    const isL = liked.has(id);
    setLiked((s) => { const n = new Set(s); isL ? n.delete(id) : n.add(id); return n; });
    setLikeCounts((c) => ({ ...c, [id]: (c[id] || 0) + (isL ? -1 : 1) }));
    if (isL) await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", userId);
    else await supabase.from("post_likes").insert({ post_id: id, user_id: userId });
  }
  async function toggleSave(id: string) {
    const isS = saved.has(id);
    setSaved((s) => { const n = new Set(s); isS ? n.delete(id) : n.add(id); return n; });
    if (isS) await supabase.from("post_saves").delete().eq("post_id", id).eq("user_id", userId);
    else await supabase.from("post_saves").insert({ post_id: id, user_id: userId });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md bg-white sm:rounded-2xl rounded-t-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}>
        <div className="relative h-32 flex-shrink-0">
          <img src={cat.img} alt={cat.t} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${cat.color}ee, transparent)` }} />
          <button onClick={onClose} className="absolute top-3 right-3 bg-black/40 rounded-full p-1.5 backdrop-blur">
            <X className="h-4 w-4 text-white" />
          </button>
          <h2 className="absolute bottom-3 left-4 text-white font-extrabold text-xl">{cat.t}</h2>
        </div>

        <div className="overflow-y-auto flex-1 bg-neutral-50">
          {loading ? (
            <p className="text-xs text-neutral-400 text-center py-12">A carregar...</p>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center px-5">
              <BookOpen className="h-8 w-8 text-neutral-300" />
              <p className="text-sm text-neutral-400">Em breve publicações desta categoria</p>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {posts.map((p) => {
                const isL = liked.has(p.id), isS = saved.has(p.id);
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <ProfileAvatarLink userId={p.author_id ?? ""} username={p.author_username ?? ""} disableStoryCheck={!p.author_id || !p.author_username}>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden"
                          style={{ background: p.author_color || "#5B3FCF" }}>
                          {p.author_avatar_url
                            ? <img src={p.author_avatar_url} alt={p.author_username || ""} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : (p.author_username || "?")[0]?.toUpperCase()}
                        </div>
                      </ProfileAvatarLink>
                      <p className="text-sm font-semibold text-black">@{p.author_username || "anon"}</p>
                    </div>
                    <p className="px-4 pb-3 text-[14px] text-neutral-800 leading-relaxed whitespace-pre-line">{p.content}</p>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-neutral-100">
                      <button onClick={() => toggleLike(p.id)} className="flex items-center gap-1.5 text-sm transition active:scale-90">
                        <ThumbsUp className={`h-4 w-4 ${isL ? "fill-[#FFC93C] stroke-[#FFC93C]" : "stroke-neutral-400"}`} strokeWidth={1.8} />
                        <span className={`text-xs font-semibold ${isL ? "text-[#E5A800]" : "text-neutral-400"}`}>
                          {likeCounts[p.id] || 0}
                        </span>
                      </button>
                      <button onClick={() => setOpenComments(p)} className="flex items-center gap-1.5 text-xs text-neutral-400 transition active:scale-90">
                        <MessageCircle className="h-4 w-4" />
                        <span className="font-semibold">{commentCounts[p.id] || 0}</span>
                      </button>
                      <div className="flex-1" />
                      <button onClick={() => toggleSave(p.id)} className="transition active:scale-90">
                        <Bookmark className={`h-4 w-4 ${isS ? "fill-[#5B3FCF] stroke-[#5B3FCF]" : "stroke-neutral-400"}`} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {openComments && (
        <CommentsModal post={openComments} userId={userId} username={username}
          onClose={() => setOpenComments(null)}
          onCount={(d) => setCommentCounts((c) => ({ ...c, [openComments.id]: Math.max(0, (c[openComments.id] || 0) + d) }))}
        />
      )}
    </div>
  );
}

function CommentsModal({ post, userId, username, onClose, onCount }: {
  post: DbPost; userId: string; username: string;
  onClose: () => void; onCount: (d: number) => void;
}) {
  const [comments, setComments] = useState<import("@/components/PostCommentsModal").PostComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const list = await fetchPostComments(post.id, userId);
      setComments(list);
      setLoading(false);
    })();
  }, [post.id]);

  async function send(txt: string) {
    if (!txt.trim()) return;
    const { data } = await supabase.from("post_comments").insert({
      post_id: post.id, user_id: userId, author_username: username, author_color: "#5B3FCF", content: txt.trim(),
    }).select().single();
    if (data) {
      const created = data as any;
      setComments((c) => [...c, {
        id: created.id, authorName: `@${username}`, authorColor: "#5B3FCF",
        text: created.content,
        time: created.created_at ? new Date(created.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "",
        likeCount: 0, likedByMe: false, replies: [],
      }]);
      onCount(1);
    }
  }

  async function reply(parentId: string, txt: string) {
    const created = await replyToPostComment({ postId: post.id, parentCommentId: parentId, userId, username, text: txt });
    if (!created) return;
    setComments((prev) => prev.map((c) => c.id === parentId ? { ...c, replies: [...(c.replies || []), created] } : c));
    onCount(1);
  }

  async function likeComment(commentId: string) {
    function patch(list: import("@/components/PostCommentsModal").PostComment[]): import("@/components/PostCommentsModal").PostComment[] {
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
    await toggleCommentLike(commentId, userId, !!target?.likedByMe);
  }

  return (
    <PostCommentsModal
      onClose={onClose}
      title={`@${post.author_username || "anon"}`}
      header={
        <div className="flex items-center gap-3 pb-2">
          <ProfileAvatarLink userId={post.author_id ?? ""} username={post.author_username ?? ""} disableStoryCheck={!post.author_id || !post.author_username}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden"
              style={{ background: post.author_color || "#5B3FCF" }}>
              {post.author_avatar_url
                ? <img src={post.author_avatar_url} alt={post.author_username || ""} className="w-full h-full object-cover" />
                : (post.author_username || "?")[0]?.toUpperCase()}
            </div>
          </ProfileAvatarLink>
          <p className="text-sm font-semibold text-black">@{post.author_username || "anon"}</p>
        </div>
      }
      body={<p className="px-4 pb-2 text-[14px] text-neutral-800 leading-relaxed whitespace-pre-line">{post.content}</p>}
      comments={comments}
      loading={loading}
      onSend={send}
      onReply={reply}
      onLikeComment={likeComment}
      inputPlaceholder="Comentar..."
    />
  );
}

type SearchProfile = { id: string; username: string; full_name: string | null; bio: string | null; avatar_url: string | null };
type SearchBook = { id: string; author_username: string; title: string; cover_color: string; chapter_count: number };

function ExplorePage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Tile | null>(null);
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("eu");
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [books, setBooks] = useState<SearchBook[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);
      const { data: prof } = await supabase.from("profiles").select("username").eq("id", session.user.id).maybeSingle();
      if (prof?.username) setUsername(prof.username);
    })();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setProfiles([]); setBooks([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const q = query.trim();
      const [{ data: ps }, { data: bs }] = await Promise.all([
        supabase.from("profiles").select("id,username,full_name,bio,avatar_url").ilike("username", `%${q}%`).limit(8),
        supabase.from("stories_books").select("id,author_id,title,status").ilike("title", `%${q}%`).limit(6),
      ]);
      setProfiles((ps as SearchProfile[]) ?? []);
      setBooks((bs as unknown as SearchBook[]) ?? []);
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = TILES.filter((t) => !query || t.t.toLowerCase().includes(query.toLowerCase()));
  const hasSearch = query.trim().length > 0;

  return (
    <>
    <SideNav />
    <PageWrapper className="pb-20 lg:pb-0">
      <header className="sticky top-0 z-30 bg-white border-b border-neutral-100 shadow-sm">
        <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 h-14 flex items-center">
          <HoodaLogo size="sm" />
        </div>
        <div className="mx-auto max-w-2xl lg:max-w-3xl px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar livros, criadores, comunidades..."
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-neutral-100 text-sm outline-none focus:bg-white focus:ring-2 transition" />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-neutral-200 transition">
                <X className="h-4 w-4 text-neutral-400" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl lg:max-w-3xl p-4">
        {hasSearch && (profiles.length > 0 || books.length > 0) && (
          <div className="mb-6 space-y-4">
            {profiles.length > 0 && (
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Criadores</p>
                <div className="space-y-2">
                  {profiles.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 bg-white rounded-2xl border border-neutral-100 px-4 py-3 shadow-sm">
                      <ProfileAvatarLink userId={p.id} username={p.username}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                          style={{
                            background: p.avatar_url ? "transparent" : ACCENT,
                            overflow: "hidden",
                          }}>
                          {p.avatar_url
                            ? <img src={p.avatar_url} alt={p.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : (p.username || "?")[0].toUpperCase()}
                        </div>
                      </ProfileAvatarLink>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-black truncate">{p.full_name || p.username}</p>
                        <p className="text-xs text-neutral-400">@{p.username}</p>
                        {p.bio && <p className="text-xs text-neutral-500 truncate">{p.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {books.length > 0 && (
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Livros</p>
                <div className="grid grid-cols-2 gap-2">
                  {books.map((b) => (
                    <div key={b.id} className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
                      <div className="h-20 flex items-center justify-center text-3xl text-white font-extrabold"
                        style={{ background: `linear-gradient(135deg,${b.cover_color}ee,${b.cover_color}88)` }}>
                        {b.title[0]?.toUpperCase()}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-bold text-black truncate">{b.title}</p>
                        <p className="text-[10px] text-neutral-400">@{b.author_username} · {b.chapter_count} cap.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-black">{query ? `Categorias com "${query}"` : "Categorias"}</h2>
          {query && <span className="text-xs text-neutral-400 font-medium">{filtered.length} encontrada{filtered.length !== 1 ? "s" : ""}</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: ACCENT + "18" }}>
              <Search className="h-6 w-6" style={{ color: ACCENT }} />
            </div>
            <p className="text-sm font-semibold text-neutral-500">Sem resultados para "{query}"</p>
            <button onClick={() => setQuery("")} className="text-sm font-bold px-4 py-2 rounded-full text-white transition active:scale-95" style={{ background: ACCENT }}>
              Ver todas as categorias
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((tile) => (
              <button key={tile.t} onClick={() => setSelected(tile)}
                className="relative overflow-hidden rounded-2xl aspect-[3/4] group active:scale-[0.97] transition-transform">
                <img src={tile.img} alt={tile.t} className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <span className="absolute bottom-3 left-3 text-white font-extrabold text-base drop-shadow-sm">{tile.t}</span>
              </button>
            ))}
          </div>
        )}
      </main>
      {selected && userId && <CategoryModal cat={selected} userId={userId} username={username} onClose={() => setSelected(null)} />}
    </PageWrapper>
    </>
  );
}
