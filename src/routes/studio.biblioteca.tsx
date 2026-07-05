import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, FileText, Image as ImageIcon, Video as VideoIcon,
  Trash2, Send, Filter,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio/biblioteca")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: LibraryPage,
});

const P = "#5B3FCF";
type Filt = "all" | "published" | "draft" | "scheduled" | "video" | "image" | "text";

function LibraryPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filt, setFilt] = useState<Filt>("all");

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await (supabase as any).from("posts")
      .select("id,title,content,kind,scheduled_at,is_draft,thumbnail_url,photo_url,photos,video_url,created_at,views,likes_count")
      .eq("author_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    setPosts(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return posts.filter(p => {
      if (q && !`${p.title ?? ""} ${p.content ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (filt === "draft") return p.is_draft;
      if (filt === "scheduled") return p.scheduled_at && new Date(p.scheduled_at).getTime() > now;
      if (filt === "published") return !p.is_draft && (!p.scheduled_at || new Date(p.scheduled_at).getTime() <= now);
      if (filt === "video") return p.kind === "video" || !!p.video_url;
      if (filt === "image") return !!p.photo_url || (Array.isArray(p.photos) && p.photos.length);
      if (filt === "text") return p.kind !== "video" && !p.photo_url && !(Array.isArray(p.photos) && p.photos.length);
      return true;
    });
  }, [posts, q, filt]);

  async function del(id: string) {
    if (!confirm("Apagar publicação?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Apagada.");
    setPosts(x => x.filter(p => p.id !== id));
  }

  async function publishDraft(id: string) {
    const { error } = await (supabase as any).from("posts").update({ is_draft: false, scheduled_at: null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Publicada!");
    load();
  }

  const chips: { k: Filt; label: string }[] = [
    { k: "all", label: "Tudo" },
    { k: "published", label: "Publicadas" },
    { k: "scheduled", label: "Agendadas" },
    { k: "draft", label: "Rascunhos" },
    { k: "video", label: "Vídeos" },
    { k: "image", label: "Imagens" },
    { k: "text", label: "Texto" },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Biblioteca</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Gere todo o teu conteúdo.</p>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border"
        style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>
        <Search className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar…"
          className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text-primary)" }} />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {chips.map(c => (
          <button key={c.k} onClick={() => setFilt(c.k)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition"
            style={{
              background: filt === c.k ? P : "var(--s0)",
              color: filt === c.k ? "#fff" : "var(--text-secondary)",
              borderColor: filt === c.k ? P : "var(--border-subtle)",
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: P }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl p-10 text-center"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <Filter className="h-10 w-10 mx-auto mb-3" style={{ color: P }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nada encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(p => {
            const thumb = p.thumbnail_url || p.photo_url || (Array.isArray(p.photos) && p.photos[0]);
            const scheduled = p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now();
            const Icon = p.kind === "video" ? VideoIcon : (thumb ? ImageIcon : FileText);
            return (
              <div key={p.id} className="rounded-2xl overflow-hidden group"
                style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                <div className="aspect-square relative cursor-pointer"
                  style={{ background: "var(--s2)" }}
                  onClick={() => navigate({ to: `/post/${p.id}` as any })}>
                  {thumb
                    ? <img src={thumb} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Icon className="h-10 w-10" style={{ color: "var(--text-muted)" }} />
                      </div>}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {p.is_draft && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(0,0,0,.7)", color: "#fff" }}>RASCUNHO</span>}
                    {scheduled && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: P }}>AGENDADA</span>}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold line-clamp-1" style={{ color: "var(--text-primary)" }}>
                    {p.title || p.content?.slice(0, 40) || "Sem título"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {scheduled
                      ? new Date(p.scheduled_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                      : new Date(p.created_at).toLocaleDateString("pt-PT")}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    {p.is_draft && (
                      <button onClick={() => publishDraft(p.id)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1"
                        style={{ background: P }}>
                        <Send className="h-3 w-3" /> Publicar
                      </button>
                    )}
                    <button onClick={() => del(p.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: "#EF4444" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
