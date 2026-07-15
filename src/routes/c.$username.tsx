import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper, FeedLayout } from "@/components/AppShell";
import { RightSidebar } from "@/components/RightSidebar";
import { UniversalPostCard, normalizePost, type NormalizedPost } from "@/components/UniversalPostCard";
import { UniversalSkeleton } from "@/components/Skeletons";
import { QuickPostModal } from "@/components/QuickComposer";
import { CanalEditModal } from "@/components/CanalEditModal";
import { ChevronLeft, Settings, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/c/$username")({
  head: () => ({ meta: [{ title: "Canal — Snapper" }] }),
  component: CanalPage,
});

const P = "#2F6FED";
const ACCENT_LOCAL = [P, "#1FAFA6", "#6BA547", "#FFC93C"];

function fmtNum(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n ?? 0);
}

function CanalPage() {
  const { username } = useParams({ from: "/c/$username" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [myId, setMyId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setMyId(session?.user?.id ?? null));
  }, []);

  const { data: channel, isLoading: loadingChannel } = useQuery({
    queryKey: ["channel", username],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("channels")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: isFollowing = false } = useQuery({
    queryKey: ["channel-following", channel?.id, myId],
    enabled: !!channel?.id && !!myId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("channel_follows")
        .select("channel_id")
        .eq("channel_id", channel.id)
        .eq("user_id", myId)
        .maybeSingle();
      return !!data;
    },
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ["channel-posts", channel?.id],
    enabled: !!channel?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,photo_url,photos,video_url,thumbnail_url,likes_count,comments_count,views_count")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => normalizePost({
        id: p.id, authorId: p.author_id, authorName: p.author_name, authorUsername: p.author_username,
        authorAvatar: channel.avatar_url, text: p.content, photo: p.photo_url, photos: p.photos,
        videoUrl: p.video_url, kind: p.kind, likes: p.likes_count, comments: p.comments_count,
        views_count: p.views_count,
      }, "userPage", { name: channel.name, username: channel.username, avatarUrl: channel.avatar_url, authorId: p.author_id }) as NormalizedPost);
    },
  });

  const isOwner = !!myId && !!channel && channel.owner_id === myId;

  async function toggleFollow() {
    if (!myId) { toast.error("Precisas de iniciar sessão."); return; }
    if (!channel) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await (supabase as any).from("channel_follows").delete().eq("channel_id", channel.id).eq("user_id", myId);
      } else {
        await (supabase as any).from("channel_follows").insert({ channel_id: channel.id, user_id: myId });
      }
      qc.invalidateQueries({ queryKey: ["channel-following", channel.id, myId] });
      qc.invalidateQueries({ queryKey: ["channel", username] });
    } catch {
      toast.error("Não foi possível atualizar.");
    } finally {
      setFollowBusy(false);
    }
  }

  if (loadingChannel) {
    return (
      <div className="flex">
        <SideNav />
        <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
          <FeedLayout feed={<UniversalSkeleton variant="feed" count={3} />} sidebar={<RightSidebar />} />
        </PageWrapper>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex">
        <SideNav />
        <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
          <FeedLayout
            feed={
              <div className="flex flex-col items-center gap-3 py-20 text-center px-4">
                <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Canal não encontrado</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Este canal não existe ou foi removido.</p>
              </div>
            }
            sidebar={<RightSidebar />}
          />
        </PageWrapper>
      </div>
    );
  }

  return (
    <div className="flex">
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0 flex-1 min-w-0">
        <FeedLayout
          feed={
            <>
              <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b"
                style={{ background: "var(--surface-0)", borderColor: "var(--border-subtle)" }}>
                <button onClick={() => navigate({ to: "/home" })} className="p-1 -ml-1">
                  <ChevronLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
                </button>
                <span className="text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{channel.name}</span>
              </div>

              <div className="h-28" style={{ background: channel.cover_url ? undefined : "var(--s2)" }}>
                {channel.cover_url && <img src={channel.cover_url} alt="" className="w-full h-full object-cover" />}
              </div>

              <div className="px-4">
                <div className="flex items-end justify-between -mt-8 mb-2">
                  <button
                    onClick={() => isOwner && setShowEdit(true)}
                    disabled={!isOwner}
                    className="w-[68px] h-[68px] rounded-full overflow-hidden flex items-center justify-center relative group"
                    style={{ background: P, border: "3px solid var(--surface-2)" }}>
                    {channel.avatar_url
                      ? <img src={channel.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-white font-bold text-lg">{channel.name?.[0]?.toUpperCase()}</span>}
                    {isOwner && (
                      <span className="absolute inset-0 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100"
                        style={{ background: "rgba(0,0,0,0.4)" }}>
                        <Camera className="h-4 w-4 text-white" />
                      </span>
                    )}
                  </button>

                  {isOwner ? (
                    <button onClick={() => setShowEdit(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold mb-1"
                      style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}>
                      <Settings className="h-3.5 w-3.5" />Editar
                    </button>
                  ) : (
                    <button onClick={toggleFollow} disabled={followBusy}
                      className="px-4 py-2 rounded-full text-xs font-bold mb-1 flex items-center gap-1.5"
                      style={isFollowing
                        ? { border: "1px solid var(--border-default)", color: "var(--text-primary)", background: "transparent" }
                        : { background: P, color: "#fff" }}>
                      {followBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                      {isFollowing ? "A seguir" : "Seguir"}
                    </button>
                  )}
                </div>

                <p className="font-bold text-[16px]" style={{ color: "var(--text-primary)" }}>{channel.name}</p>
                <p className="text-[12px] mb-1.5" style={{ color: "var(--text-muted)" }}>
                  @{channel.username} · {channel.category}
                  {channel.is_adult && <span style={{ color: "#E24B4A" }}> · +18</span>}
                </p>
                {channel.description && (
                  <p className="text-[13px] mb-2.5" style={{ color: "var(--text-secondary)" }}>{channel.description}</p>
                )}

                <div className="flex gap-4 text-[12px] mb-3.5" style={{ color: "var(--text-secondary)" }}>
                  <span><b style={{ color: "var(--text-primary)", fontWeight: 700 }}>{fmtNum(channel.followers_count ?? 0)}</b> seguidores</span>
                  <span><b style={{ color: "var(--text-primary)", fontWeight: 700 }}>{fmtNum(channel.posts_count ?? posts.length)}</b> publicações</span>
                </div>

                {isOwner && (
                  <button onClick={() => setShowComposer(true)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl mb-4 text-left"
                    style={{ background: "var(--s2)", border: "1px solid var(--border-subtle)" }}>
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: P }}>
                      {channel.avatar_url
                        ? <img src={channel.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <Camera className="h-4 w-4 text-white" />}
                    </div>
                    <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>Publicar algo no canal</span>
                  </button>
                )}
              </div>

              <div className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                {loadingPosts && <UniversalSkeleton variant="feed" count={3} />}
                {!loadingPosts && posts.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-16 text-center px-4">
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Ainda não há publicações</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {isOwner ? "Publica algo para os teus seguidores verem aqui." : "Este canal ainda não publicou nada."}
                    </p>
                  </div>
                )}
                <div className="space-y-1 px-3 py-2">
                  {posts.map((p: NormalizedPost) => <UniversalPostCard key={p.id} post={p} />)}
                </div>
              </div>

              <BottomNav />

              {showComposer && (
                <QuickPostModal
                  name={channel.name}
                  username={channel.username}
                  avatarUrl={channel.avatar_url}
                  onClose={() => setShowComposer(false)}
                  onPublished={() => { setShowComposer(false); qc.invalidateQueries({ queryKey: ["channel-posts", channel.id] }); }}
                />
              )}

              {showEdit && (
                <CanalEditModal
                  channel={channel}
                  onClose={() => setShowEdit(false)}
                  onSaved={() => {
                    qc.invalidateQueries({ queryKey: ["channel", username] });
                    qc.invalidateQueries({ queryKey: ["channel-posts", channel.id] });
                  }}
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
