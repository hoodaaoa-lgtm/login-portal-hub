import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar, Clock, Loader2, Trash2, Edit2, Video as VideoIcon,
  FileText, Image as ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/studio/agenda")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: AgendaPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

function AgendaPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  async function load() {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await (supabase as any).from("posts")
      .select("id,title,content,kind,scheduled_at,thumbnail_url,photo_url,photos,video_url,is_draft,created_at")
      .eq("author_id", uid)
      .not("scheduled_at", "is", null)
      .gt("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });
    setPosts(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function cancelPost(id: string) {
    if (!confirm("Cancelar esta publicação agendada?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Publicação cancelada.");
    load();
  }

  async function reschedule(id: string) {
    if (!newDate || !newTime) { toast.error("Escolhe data e hora."); return; }
    const iso = new Date(`${newDate}T${newTime}`).toISOString();
    if (new Date(iso).getTime() <= Date.now()) { toast.error("Data tem de ser no futuro."); return; }
    const { error } = await supabase.from("posts").update({ scheduled_at: iso } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Reagendado!");
    setEditing(null);
    load();
  }

  // Group by date
  const groups: Record<string, any[]> = {};
  posts.forEach(p => {
    const day = new Date(p.scheduled_at).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    (groups[day] ??= []).push(p);
  });

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "var(--text-primary)" }}>Agenda</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {posts.length} publicação(ões) agendada(s)
          </p>
        </div>
        <button onClick={() => navigate({ to: "/studio/criar" as any })}
          className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition shrink-0"
          style={{ background: GRAD }}>
          + Agendar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: P }} />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-3xl p-10 text-center"
          style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
          <Calendar className="h-12 w-12 mx-auto mb-4" style={{ color: P }} />
          <p className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>Nada agendado</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Cria uma publicação e escolhe uma data futura para começar.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([day, items]) => (
            <div key={day}>
              <h2 className="text-sm font-black uppercase tracking-wide mb-3 capitalize"
                style={{ color: "var(--text-muted)" }}>{day}</h2>
              <div className="space-y-2">
                {items.map(p => {
                  const thumb = p.thumbnail_url || p.photo_url || (Array.isArray(p.photos) && p.photos[0]);
                  const Icon = p.kind === "video" ? VideoIcon : (thumb ? ImageIcon : FileText);
                  return (
                    <div key={p.id} className="rounded-2xl p-4"
                      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                      <div className="flex gap-3">
                        <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                          style={{ background: "var(--s2)" }}>
                          {thumb
                            ? <img src={thumb} className="w-full h-full object-cover" alt="" />
                            : <Icon className="h-6 w-6" style={{ color: "var(--text-muted)" }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                            {p.title || p.content?.slice(0, 60) || "Publicação"}
                          </p>
                          <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: P }}>
                            <Clock className="h-3 w-3" />
                            {new Date(p.scheduled_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {p.content && (
                            <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)" }}>
                              {p.content}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => {
                            setEditing(editing === p.id ? null : p.id);
                            const d = new Date(p.scheduled_at);
                            setNewDate(d.toISOString().slice(0, 10));
                            setNewTime(d.toTimeString().slice(0, 5));
                          }}
                            className="p-2 rounded-full hover:bg-[var(--s2)] transition"
                            style={{ color: "var(--text-muted)" }} title="Reagendar">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => cancelPost(p.id)}
                            className="p-2 rounded-full hover:bg-red-500/10 transition"
                            style={{ color: "#EF4444" }} title="Cancelar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {editing === p.id && (
                        <div className="mt-3 pt-3 border-t flex flex-col sm:flex-row gap-2" style={{ borderColor: "var(--border-subtle)" }}>
                          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="px-3 py-2 rounded-xl text-sm border flex-1"
                            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                            className="px-3 py-2 rounded-xl text-sm border flex-1"
                            style={{ background: "var(--s2)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
                          <button onClick={() => reschedule(p.id)}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                            style={{ background: GRAD }}>
                            Guardar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
