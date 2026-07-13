import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper, PageHeader } from "@/components/AppShell";
import { UniversalPostCard, normalizePost } from "@/components/UniversalPostCard";
import { Loader, X } from "lucide-react";

export const Route = createFileRoute("/post/$id")({
  head: () => ({ meta: [{ title: "Baya" }] }),
  component: SinglePostPage,
});

const ACCENT = "#5B3FCF";

function SinglePostPage() {
  const { id } = useParams({ from: "/post/$id" });
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id,author_id,author_username,author_name,author_color,content,kind,created_at,photo_url,photos,video_url,poll,poll_ends_at")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoading(false); return; }

      let avatar_url: string | null = null;
      let is_verified = false;
      if ((data as any).author_id) {
        const { data: authorProf } = await supabase.from("profiles")
          .select("avatar_url,is_verified").eq("id", (data as any).author_id).maybeSingle();
        avatar_url = (authorProf as any)?.avatar_url ?? null;
        is_verified = !!(authorProf as any)?.is_verified;
      }

      const { count: likes } = await supabase.from("post_likes").select("*", { count: "exact", head: true }).eq("post_id", id);
      const { count: comments } = await supabase.from("post_comments").select("*", { count: "exact", head: true }).eq("post_id", id);

      const { data: { session } } = await supabase.auth.getSession();
      let liked_by_me = false;
      if (session?.user?.id) {
        const { data: likeRow } = await supabase.from("post_likes").select("id").eq("post_id", id).eq("user_id", session.user.id).maybeSingle();
        liked_by_me = !!likeRow;
      }

      setPost({ ...data, avatar_url, is_verified, likes: likes ?? 0, comments: comments ?? 0, liked_by_me });
      setLoading(false);
    })();
  }, [id]);

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="max-w-xl mx-auto w-full">
          <PageHeader title="Publicação" onBack={() => navigate({ to: "/home" })} />

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
            <UniversalPostCard
              post={normalizePost(post, "single", { avatarUrl: post.avatar_url, isVerified: post.is_verified })}
              onDeleted={() => navigate({ to: "/home" })}
            />
          )}
        </div>
      </PageWrapper>
      <BottomNav />
    </>
  );
}
