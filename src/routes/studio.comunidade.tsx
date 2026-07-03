import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Loader2, Users, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/studio/comunidade")({
  head: () => ({ meta: [{ title: "Comunidade — Hooda Studio" }] }),
  component: CommunityPage,
});

const P = "#5B3FCF";

function CommunityPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"followers" | "comments">("followers");
  const [followers, setFollowers] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) { setLoading(false); return; }

      const { data: fol } = await (supabase as any).from("follows")
        .select("follower_id,created_at,profiles:follower_id(id,username,full_name,avatar_url)")
        .eq("following_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      setFollowers(fol ?? []);

      const { data: com } = await (supabase as any).from("comments")
        .select("id,content,created_at,post_id,author_username,author_name,author_avatar")
        .eq("post_author_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      setComments(com ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Comunidade</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Gere os teus seguidores e comentários.</p>
      </div>

      <div className="flex gap-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {[
          { k: "followers" as const, label: "Seguidores", Icon: Users },
          { k: "comments"  as const, label: "Comentários", Icon: MessageSquare },
        ].map(({ k, label, Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition"
            style={{
              color: tab === k ? P : "var(--text-muted)",
              borderColor: tab === k ? P : "transparent",
            }}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" style={{ color: P }} /></div>
      ) : tab === "followers" ? (
        followers.length === 0
          ? <p className="text-center text-sm py-10" style={{ color: "var(--text-muted)" }}>Sem seguidores.</p>
          : (
            <div className="space-y-2">
              {followers.map(f => {
                const p = f.profiles;
                if (!p) return null;
                return (
                  <button key={f.follower_id}
                    onClick={() => navigate({ to: `/perfil/${p.username}` as any })}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition hover:opacity-90"
                    style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                    <div className="h-11 w-11 rounded-full overflow-hidden shrink-0" style={{ background: "var(--s2)" }}>
                      {p.avatar_url && <img src={p.avatar_url} className="w-full h-full object-cover" alt="" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{p.full_name || p.username}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{p.username}</p>
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(f.created_at).toLocaleDateString("pt-PT")}
                    </span>
                  </button>
                );
              })}
            </div>
          )
      ) : (
        comments.length === 0
          ? <p className="text-center text-sm py-10" style={{ color: "var(--text-muted)" }}>Sem comentários.</p>
          : (
            <div className="space-y-2">
              {comments.map(c => (
                <button key={c.id}
                  onClick={() => navigate({ to: `/post/${c.post_id}` as any })}
                  className="w-full flex items-start gap-3 p-3 rounded-2xl text-left transition hover:opacity-90"
                  style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                  <div className="h-9 w-9 rounded-full overflow-hidden shrink-0" style={{ background: "var(--s2)" }}>
                    {c.author_avatar && <img src={c.author_avatar} className="w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                      {c.author_name || c.author_username}
                    </p>
                    <p className="text-sm mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{c.content}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {new Date(c.created_at).toLocaleString("pt-PT")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )
      )}
    </div>
  );
}
