import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { myChannelQuery, channelStatsQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Eye, Users, Heart, MessageCircle, Share2, TrendingUp, Loader2 } from "lucide-react";

export const Route = createFileRoute("/studio/estatisticas")({
  head: () => ({ meta: [{ title: "Estatísticas — Hooda Studio" }] }),
  component: StatsPage,
});

const P = "#5B3FCF";
type Stats = { views?: number; reach?: number; followers?: number; likes?: number; comments?: number; shares?: number };

function StatsPage() {
  const { data: channel } = useQuery(myChannelQuery());
  const { data: stats } = useQuery(channelStatsQuery(channel?.id));
  const [top, setTop] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) { setLoading(false); return; }
      const { data } = await (supabase as any).from("posts")
        .select("id,title,content,thumbnail_url,photo_url,video_url,views,likes_count,comments_count")
        .eq("author_id", uid)
        .eq("is_draft", false)
        .order("views", { ascending: false, nullsFirst: false })
        .limit(10);
      setTop(data ?? []);
      setLoading(false);
    })();
  }, []);

  const s = (stats ?? {}) as Stats;
  const cards = [
    { label: "Visualizações", value: s.views ?? 0, icon: Eye },
    { label: "Alcance",       value: s.reach ?? s.views ?? 0, icon: TrendingUp },
    { label: "Seguidores",    value: s.followers ?? 0, icon: Users },
    { label: "Gostos",        value: s.likes ?? 0, icon: Heart },
    { label: "Comentários",   value: s.comments ?? 0, icon: MessageCircle },
    { label: "Partilhas",     value: s.shares ?? 0, icon: Share2 },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Estatísticas</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Desempenho do teu canal.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl p-4"
            style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <c.icon className="h-4 w-4" style={{ color: P }} />
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{c.label}</span>
            </div>
            <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
              {(c.value ?? 0).toLocaleString("pt-PT")}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5"
        style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
        <h2 className="text-lg font-black mb-3" style={{ color: "var(--text-primary)" }}>Melhores conteúdos</h2>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" style={{ color: P }} /></div>
        ) : top.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ainda sem dados.</p>
        ) : (
          <div className="space-y-2">
            {top.map((p, i) => {
              const thumb = p.thumbnail_url || p.photo_url;
              return (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className="text-sm font-black w-6" style={{ color: P }}>#{i + 1}</span>
                  <div className="h-12 w-12 rounded-lg overflow-hidden shrink-0" style={{ background: "var(--s2)" }}>
                    {thumb && <img src={thumb} className="w-full h-full object-cover" alt="" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {p.title || p.content?.slice(0, 60) || "Publicação"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {(p.views ?? 0).toLocaleString()} views · {(p.likes_count ?? 0).toLocaleString()} gostos
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
