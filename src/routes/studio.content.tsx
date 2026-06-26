import { createFileRoute, Link } from "@tanstack/react-router";
import { t } from "@/lib/useT";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { myChannelQuery, myVideosQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, MoreVertical, Trash2, Globe, Lock, Link as LinkIcon,
  Video as VideoIcon, Eye, Pencil, X, Save, CheckCircle,
  Search, Filter,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { deleteFromCloudflareStream } from "@/lib/cloudflare-stream";

export const Route = createFileRoute("/studio/content")({
  head: () => ({ meta: [{ title: "Conteúdo — Hooda Studio" }] }),
  component: ContentPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";
type Vis = "public" | "private" | "unlisted";

/* ── Edit modal ── */
function EditModal({ v, onClose, onSave }: { v: any; onClose: () => void; onSave: () => void }) {
  const [title, setTitle]       = useState(v.title ?? "");
  const [desc,  setDesc]        = useState(v.description ?? "");
  const [vis,   setVis]         = useState<Vis>(v.visibility ?? "private");
  const [saving, setSaving]     = useState(false);

  async function save() {
    if (!title.trim()) { toast.error("O título não pode estar vazio."); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("videos").update({
      title: title.trim(),
      description: desc.trim() || null,
      visibility: vis,
      published_at: vis === "public" && !v.published_at ? new Date().toISOString() : v.published_at,
    }).eq("id", v.id);
    setSaving(false);
    if (error) { toast.error("Erro ao guardar. Tenta novamente."); return; }
    toast.success("Vídeo atualizado!");
    onSave();
    onClose();
  }

  const inputCls = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all border " +
    "bg-[var(--s3)] border-[var(--border-default)] focus:border-[#5B3FCF] " +
    "focus:shadow-[0_0_0_3px_rgba(91,63,207,0.12)] text-[var(--text-primary)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl"
        style={{ background: "var(--s0)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>Editar vídeo</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--s3)] transition">
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div>
          <label className="text-[12px] font-bold uppercase tracking-wider block mb-1.5"
            style={{ color: "var(--text-muted)" }}>Título *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className={inputCls} />
        </div>

        <div>
          <label className="text-[12px] font-bold uppercase tracking-wider block mb-1.5"
            style={{ color: "var(--text-muted)" }}>Descrição</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} maxLength={5000}
            className={inputCls + " resize-none"} />
        </div>

        <div>
          <label className="text-[12px] font-bold uppercase tracking-wider block mb-2"
            style={{ color: "var(--text-muted)" }}>Visibilidade</label>
          <div className="flex gap-2">
            {([
              { key: "public",   icon: Globe,    label: t("studio.public")   },
              { key: "unlisted", icon: LinkIcon,  label: "Com link"  },
              { key: "private",  icon: Lock,     label: t("studio.private")   },
            ] as const).map(opt => {
              const Icon = opt.icon;
              const sel  = vis === opt.key;
              return (
                <button key={opt.key} onClick={() => setVis(opt.key)}
                  className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl border-2 transition-all"
                  style={{
                    borderColor: sel ? P : "var(--border-default)",
                    background:  sel ? `${P}08` : "var(--s3)",
                  }}>
                  <Icon className="w-4 h-4" style={{ color: sel ? P : "var(--text-muted)" }} />
                  <span className="text-[11px] font-bold" style={{ color: sel ? P : "var(--text-secondary)" }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold border transition"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition"
            style={{ background: GRAD }}>
            {saving ? t("settings.saving") : <><Save className="w-3.5 h-3.5" /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
function ContentPage() {
  const qc = useQueryClient();
  const { data: channel } = useQuery(myChannelQuery());
  const { data: videos, isLoading } = useQuery(myVideosQuery((channel as any)?.id));
  const [openMenu,  setOpenMenu]  = useState<string | null>(null);
  const [editVideo, setEditVideo] = useState<any | null>(null);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState<"all" | "public" | "private">("all");
  const [deleting,  setDeleting]  = useState<string | null>(null);

  /* ── Change visibility ── */
  const updateVis = useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: Vis }) => {
      const { error } = await (supabase as any).from("videos").update({
        visibility,
        published_at: visibility === "public" ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-videos"] });
      toast.success("Visibilidade atualizada!");
    },
    onError: () => toast.error("Erro ao atualizar visibilidade."),
  });

  /* ── Delete ── */
  const remove = useMutation({
    mutationFn: async (v: { id: string; video_path: string | null; cf_stream_uid: string | null }) => {
      if (v.cf_stream_uid) {
        try { await deleteFromCloudflareStream(v.cf_stream_uid); } catch (_) {}
      }
      if (v.video_path) {
        await supabase.storage.from("videos").remove([v.video_path]);
      }
      const { error } = await (supabase as any).from("videos").delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-videos"] });
      qc.invalidateQueries({ queryKey: ["channel-stats"] });
      setDeleting(null);
      toast.success("Vídeo eliminado.");
    },
    onError: () => { setDeleting(null); toast.error("Erro ao eliminar. Tenta novamente."); },
  });

  /* ── Filtered list ── */
  const filtered = (videos ?? []).filter(v => {
    const matchVis = filter === "all" ? true : filter === "public" ? v.visibility === "public" : v.visibility !== "public";
    const matchQ   = !search || v.title?.toLowerCase().includes(search.toLowerCase());
    return matchVis && matchQ;
  });

  const visIcon  = { public: Globe, private: Lock, unlisted: LinkIcon } as const;
  const visLabel = { public: t("studio.public"), private: t("studio.private"), unlisted: "Com link" } as const;
  const visBg    = { public: "#d1fae5", private: "#f1f5f9", unlisted: "#ede9fe" } as const;
  const visCl    = { public: "#065f46", private: "#475569", unlisted: P } as const;

  return (
    <div className="max-w-5xl mx-auto px-5 py-7">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>Conteúdo</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {videos?.length ?? 0} vídeo{(videos?.length ?? 0) !== 1 ? "s" : ""} no canal
          </p>
        </div>
        <Link to="/studio/upload"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white transition hover:-translate-y-0.5 active:scale-95"
          style={{ background: GRAD, boxShadow: "0 4px 14px rgba(91,63,207,0.3)" }}>
          <Upload className="w-4 h-4" /> Enviar vídeo
        </Link>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 rounded-2xl px-4 h-10 border"
          style={{ background: "var(--s2)", borderColor: "var(--border-default)" }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar vídeos…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }} />
          {search && <button onClick={() => setSearch("")}><X className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} /></button>}
        </div>
        <div className="flex gap-2">
          {(["all","public","private"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3.5 h-10 rounded-2xl text-xs font-bold transition"
              style={filter === f
                ? { background: P, color: "#fff" }
                : { background: "var(--s2)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
              {f === "all" ? "Todos" : f === "public" ? "Públicos" : "Privados"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}>

        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[1fr_120px_130px_90px_44px] gap-3 px-5 py-3 border-b text-[11px] font-bold uppercase tracking-wider"
          style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div>Vídeo</div>
          <div>Visibilidade</div>
          <div>Data</div>
          <div className="text-right">Vistas</div>
          <div />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <VideoIcon className="w-10 h-10" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {search ? `Sem resultados para "${search}"` : "Ainda não tens vídeos."}
            </p>
            {!search && (
              <Link to="/studio/upload"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white"
                style={{ background: GRAD }}>
                <Upload className="w-4 h-4" /> Enviar primeiro vídeo
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {filtered.map(v => {
              const VIcon = visIcon[v.visibility as Vis] ?? Lock;
              const isDeleting = deleting === v.id;
              return (
                <li key={v.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_120px_130px_90px_44px] gap-3 px-5 py-4 items-center transition-colors hover:bg-[var(--s1)]"
                  style={{ opacity: isDeleting ? 0.4 : 1 }}>

                  {/* Thumbnail + title */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-[52px] w-[92px] rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: "var(--s2)" }}>
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        : <VideoIcon className="w-5 h-5" style={{ color: "var(--text-muted)" }} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {v.description ? v.description.slice(0, 60) + (v.description.length > 60 ? "…" : "") : "Sem descrição"}
                      </p>
                    </div>
                  </div>

                  {/* Visibility toggle */}
                  <div>
                    <select
                      value={v.visibility}
                      onChange={e => updateVis.mutate({ id: v.id, visibility: e.target.value as Vis })}
                      disabled={updateVis.isPending}
                      className="text-[11px] font-bold rounded-full px-2.5 py-1.5 border-0 cursor-pointer outline-none"
                      style={{
                        background: visBg[v.visibility as Vis] ?? "#f1f5f9",
                        color: visCl[v.visibility as Vis] ?? "#475569",
                      }}
                    >
                      <option value="private">Privado</option>
                      <option value="unlisted">Com link</option>
                      <option value="public">Público</option>
                    </select>
                  </div>

                  {/* Date */}
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {format(new Date(v.created_at), "d MMM yyyy", { locale: pt })}
                  </div>

                  {/* Views */}
                  <div className="text-right text-sm font-semibold tabular-nums"
                    style={{ color: "var(--text-primary)" }}>
                    {Number(v.views_count ?? 0).toLocaleString("pt-PT")}
                  </div>

                  {/* Menu */}
                  <div className="relative flex justify-end">
                    <button onClick={() => setOpenMenu(openMenu === v.id ? null : v.id)}
                      className="p-2 rounded-xl transition hover:bg-[var(--s2)]"
                      style={{ color: "var(--text-muted)" }}>
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {openMenu === v.id && (
                      <div className="absolute right-0 top-full mt-1 rounded-2xl shadow-2xl z-20 overflow-hidden min-w-[160px] border"
                        style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}
                        onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditVideo(v); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition hover:bg-[var(--s2)]"
                          style={{ color: "var(--text-primary)" }}>
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => setOpenMenu(null)}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition hover:bg-[var(--s2)]"
                          style={{ color: "var(--text-primary)" }}>
                          <Eye className="w-3.5 h-3.5" /> Ver na HoodaTV
                        </button>
                        <div style={{ height:1, background:"var(--border-subtle)" }} />
                        <button
                          onClick={() => {
                            setDeleting(v.id);
                            setOpenMenu(null);
                            remove.mutate({ id: v.id, video_path: v.video_path, cf_stream_uid: (v as any).cf_stream_uid ?? null });
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition hover:bg-red-50"
                          style={{ color: "#E94B8A" }}>
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Close menus on outside click */}
      {openMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}

      {/* Edit modal */}
      {editVideo && (
        <EditModal
          v={editVideo}
          onClose={() => setEditVideo(null)}
          onSave={() => qc.invalidateQueries({ queryKey: ["my-videos"] })}
        />
      )}
    </div>
  );
}
