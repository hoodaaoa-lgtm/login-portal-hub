import { createFileRoute } from "@tanstack/react-router";
import { t } from "@/lib/useT";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { myChannelQuery, myVideosQuery } from "@/lib/channel-queries";
import { myPlaylistsQuery, type Playlist } from "@/lib/playlist-queries";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, X, Check, Play, Trash2, Pencil, ListVideo, Image as ImageIcon, Upload,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/studio/playlists")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: PlaylistsPage,
});

const P    = "#5B3FCF";
const GRAD = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

/* ── helpers ── */
const fmtDur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

const inputCls =
  "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all border " +
  "bg-[var(--s3)] border-[var(--border-default)] focus:border-[#5B3FCF] " +
  "focus:shadow-[0_0_0_3px_rgba(91,63,207,0.12)] text-[var(--text-primary)]";

/* ══════════════════════════════════════════════════════════
   Modal de Criar / Editar Playlist
══════════════════════════════════════════════════════════ */
function PlaylistModal({
  channelId,
  videos,
  existing,
  onClose,
  onSaved,
}: {
  channelId: string;
  videos: any[];
  existing: Playlist | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title,       setTitle]       = useState(existing?.title ?? "");
  const [desc,        setDesc]        = useState(existing?.description ?? "");
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [coverId,     setCoverId]     = useState<string | null>(existing?.cover_video_id ?? null);
  const [coverMode,   setCoverMode]   = useState<"upload" | "video">(
    existing?.cover_image_url ? "upload" : "video"
  );
  const [coverFile,   setCoverFile]   = useState<File | null>(null);
  const [coverPreview,setCoverPreview]= useState<string | null>(existing?.cover_image_url ?? null);
  const [saving,      setSaving]      = useState(false);
  const [step,        setStep]        = useState<"info" | "videos">("info");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Se a editar, carregar vídeos já na playlist */
  useEffect(() => {
    if (!existing) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("playlist_videos")
        .select("video_id")
        .eq("playlist_id", existing.id);
      if (data) setSelected(new Set((data as any[]).map((r: any) => r.video_id)));
    })();
  }, [existing]);

  function toggleVideo(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (coverId === id) setCoverId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Seleciona uma imagem válida."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem demasiado grande (máx 5MB)."); return; }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function uploadCoverImage(userId: string): Promise<string | null> {
    if (!coverFile) return coverPreview; // URL já existente
    const ext = coverFile.name.split(".").pop() ?? "jpg";
    const path = `playlist-covers/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("channel-assets")
      .upload(path, coverFile, { upsert: true, contentType: coverFile.type });
    if (error) throw error;
    return supabase.storage.from("channel-assets").getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    if (!title.trim()) { toast.error("O título não pode estar vazio."); return; }
    if (title.trim().length < 2) { toast.error("Título demasiado curto (mínimo 2 caracteres)."); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      /* Upload de imagem se necessário */
      let uploadedImageUrl: string | null = null;
      if (coverMode === "upload") {
        uploadedImageUrl = await uploadCoverImage(session.user.id);
      }

      const coverPayload = coverMode === "upload"
        ? { cover_image_url: uploadedImageUrl, cover_video_id: null }
        : { cover_image_url: null, cover_video_id: coverId };

      let playlistId = existing?.id ?? null;

      if (existing) {
        const { error } = await (supabase as any)
          .from("playlists")
          .update({ title: title.trim(), description: desc.trim() || null, ...coverPayload })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("playlists")
          .insert({
            channel_id: channelId,
            owner_id: session.user.id,
            title: title.trim(),
            description: desc.trim() || null,
            ...coverPayload,
          })
          .select("id")
          .single();
        if (error) throw error;
        playlistId = data.id;
      }

      /* Sincronizar playlist_videos */
      if (playlistId) {
        await (supabase as any).from("playlist_videos").delete().eq("playlist_id", playlistId);
        const rows = Array.from(selected).map((videoId, i) => ({
          playlist_id: playlistId,
          video_id: videoId,
          position: i,
        }));
        if (rows.length) {
          const { error } = await (supabase as any).from("playlist_videos").insert(rows);
          if (error) throw error;
        }
      }

      toast.success(existing ? "Playlist atualizada!" : "Playlist criada!");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao guardar. Tenta novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-xl rounded-3xl shadow-2xl flex flex-col"
        style={{ background: "var(--s0)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h2 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>
            {existing ? "Editar playlist" : "Nova playlist"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--s3)] transition">
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b px-6 shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          {(["info", "videos"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className="px-3 py-2.5 text-sm font-bold relative mr-2"
              style={{ color: step === s ? P : "var(--text-muted)" }}
            >
              {s === "info" ? "Detalhes" : `Vídeos${selected.size ? ` (${selected.size})` : ""}`}
              {step === s && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: P }} />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Step: Info ── */}
          {step === "info" && (
            <>
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider block mb-1.5"
                  style={{ color: "var(--text-muted)" }}>Título *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="Nome da playlist"
                  className={inputCls}
                />
                <p className="text-[11px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>
                  {title.length}/80
                </p>
              </div>

              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider block mb-1.5"
                  style={{ color: "var(--text-muted)" }}>Descrição</label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Opcional"
                  className={inputCls + " resize-none"}
                />
              </div>

              {/* Capa da playlist */}
              <div>
                <label className="text-[12px] font-bold uppercase tracking-wider block mb-2"
                  style={{ color: "var(--text-muted)" }}>
                  Capa da playlist
                </label>

                {/* Modo toggle */}
                <div className="flex gap-2 mb-3">
                  {(["upload", "video"] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setCoverMode(mode)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                      style={{
                        background: coverMode === mode ? P : "transparent",
                        borderColor: coverMode === mode ? P : "var(--border-default)",
                        color: coverMode === mode ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {mode === "upload" ? <><Upload className="w-3 h-3" /> Upload</> : <><ImageIcon className="w-3 h-3" /> Thumbnail de vídeo</>}
                    </button>
                  ))}
                </div>

                {/* Modo Upload */}
                {coverMode === "upload" && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {coverPreview ? (
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden border"
                        style={{ borderColor: "var(--border-default)" }}>
                        <img src={coverPreview} alt="Capa" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-end justify-end p-2 gap-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                            style={{ background: "rgba(91,63,207,0.85)" }}
                          >
                            Trocar
                          </button>
                          <button
                            onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                            className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                            style={{ background: "rgba(0,0,0,0.6)" }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:border-[#5B3FCF]"
                        style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
                      >
                        <Upload className="w-6 h-6" />
                        <span className="text-xs font-semibold">Clica para fazer upload</span>
                        <span className="text-[10px]">JPG, PNG, WebP · máx 5MB</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Modo Thumbnail de vídeo */}
                {coverMode === "video" && (
                  selected.size > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {videos
                        .filter(v => selected.has(v.id))
                        .map(v => (
                          <button
                            key={v.id}
                            onClick={() => setCoverId(coverId === v.id ? null : v.id)}
                            className="relative w-20 h-14 rounded-xl overflow-hidden border-2 transition-all"
                            style={{ borderColor: coverId === v.id ? P : "var(--border-default)" }}
                            title={v.title}
                          >
                            {v.thumbnail_url
                              ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"
                                  style={{ background: `${P}18` }}>
                                  <Play className="w-4 h-4" style={{ color: P }} />
                                </div>}
                            {coverId === v.id && (
                              <div className="absolute inset-0 flex items-center justify-center"
                                style={{ background: "rgba(91,63,207,0.55)" }}>
                                <Check className="w-4 h-4 text-white" strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs py-3 text-center" style={{ color: "var(--text-muted)" }}>
                      Adiciona vídeos na aba Vídeos para escolher uma thumbnail.
                    </p>
                  )
                )}
              </div>
            </>
          )}

          {/* ── Step: Vídeos ── */}
          {step === "videos" && (
            <div className="space-y-2">
              {videos.length === 0 && (
                <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                  O teu canal ainda não tem vídeos publicados.
                </p>
              )}
              {videos.map(v => {
                const sel = selected.has(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleVideo(v.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left border"
                    style={{
                      background: sel ? `${P}08` : "var(--s2)",
                      borderColor: sel ? P : "var(--border-subtle)",
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2 transition-all"
                      style={{
                        background: sel ? P : "transparent",
                        borderColor: sel ? P : "var(--border-default)",
                      }}
                    >
                      {sel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>

                    {/* Thumbnail */}
                    <div className="w-16 h-11 rounded-lg overflow-hidden shrink-0"
                      style={{ background: "var(--s3)" }}>
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-4 h-4" style={{ color: P, opacity: 0.4 }} />
                          </div>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {v.title}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {fmtDur(v.duration_seconds) || "—"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3 shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-sm font-bold border transition hover:bg-[var(--s2)]"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="px-6 py-2.5 rounded-full text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: GRAD }}
          >
            {saving ? t("settings.saving") : existing ? t("common.save") : "Criar playlist"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Card de Playlist
══════════════════════════════════════════════════════════ */
function PlaylistCard({
  playlist,
  onEdit,
  onDelete,
}: {
  playlist: Playlist;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden group transition-all hover:shadow-md"
      style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}
    >
      {/* Capa */}
      <div className="relative aspect-video" style={{ background: "var(--s3)" }}>
        {playlist.cover_thumbnail_url
          ? <img
              src={playlist.cover_thumbnail_url}
              alt={playlist.title}
              className="w-full h-full object-cover"
            />
          : <div className="w-full h-full flex flex-col items-center justify-center gap-2"
              style={{ background: `${P}12` }}>
              <ListVideo className="w-10 h-10" style={{ color: P, opacity: 0.4 }} />
            </div>}

        {/* Contagem sobre a capa */}
        <div
          className="absolute bottom-0 right-0 px-2 py-1 m-2 rounded-lg text-[11px] font-bold text-white"
          style={{ background: "rgba(0,0,0,0.72)" }}
        >
          {playlist.video_count ?? 0} vídeo{(playlist.video_count ?? 0) !== 1 ? "s" : ""}
        </div>

        {/* Ações hover */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white transition hover:scale-110"
            style={{ background: "rgba(91,63,207,0.85)" }}
            title={t("common.edit")}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white transition hover:scale-110"
            style={{ background: "rgba(233,75,138,0.85)" }}
            title={t("common.delete")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
          {playlist.title}
        </p>
        {playlist.description && (
          <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--text-muted)" }}>
            {playlist.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Página Principal
══════════════════════════════════════════════════════════ */
function PlaylistsPage() {
  const qc = useQueryClient();

  const { data: channel } = useQuery(myChannelQuery());
  const { data: videos = [] } = useQuery(myVideosQuery(channel?.id));
  const { data: playlists = [], isLoading } = useQuery(myPlaylistsQuery(channel?.id));

  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<Playlist | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists", channel?.id] });
      toast.success("Playlist apagada.");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Erro ao apagar. Tenta novamente."),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["my-playlists", channel?.id] });
  }

  /* Apenas vídeos publicados do canal */
  const publishedVideos = videos.filter(
    (v: any) => v.status === "published" && v.visibility === "public"
  );

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
            Playlists
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {playlists.length} playlist{playlists.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all active:scale-95 hover:shadow-lg"
          style={{ background: GRAD }}
        >
          <Plus className="w-4 h-4" />
          Criar playlist
        </button>
      </div>

      {/* ── Grelha ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="aspect-video rounded-2xl" style={{ background: "var(--s3)" }} />
              <div className="h-3 rounded-full w-3/4" style={{ background: "var(--s3)" }} />
            </div>
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-2xl border"
          style={{ background: "var(--s2)", borderColor: "var(--border-subtle)" }}
        >
          <ListVideo className="w-14 h-14 mb-4" style={{ color: "var(--text-muted)" }} />
          <p className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Ainda não tens playlists
          </p>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Organiza os teus vídeos em playlists temáticas.
          </p>
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: GRAD }}
          >
            <Plus className="w-4 h-4" />
            Criar primeira playlist
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {playlists.map(p => (
            <PlaylistCard
              key={p.id}
              playlist={p}
              onEdit={() => { setEditTarget(p); setShowModal(true); }}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* ── Modal criar/editar ── */}
      {showModal && channel && (
        <PlaylistModal
          channelId={channel.id}
          videos={publishedVideos}
          existing={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
          onSaved={refresh}
        />
      )}

      {/* ── Confirm apagar ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 space-y-5 shadow-2xl"
            style={{ background: "var(--s0)" }}
          >
            <h2 className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>
              Apagar playlist?
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              A playlist <strong>"{deleteTarget.title}"</strong> será apagada permanentemente.
              Os vídeos não serão afetados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-full text-sm font-bold border transition hover:bg-[var(--s2)]"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 rounded-full text-sm font-bold text-white transition disabled:opacity-50"
                style={{ background: "#E94B8A" }}
              >
                {deleteMutation.isPending ? "A apagar…" : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
