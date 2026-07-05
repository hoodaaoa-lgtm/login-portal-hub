import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Image, Film, Droplet, BarChart3, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary, uploadToCloudinary } from "@/lib/cloudinary";
import { useScrollLock } from "@/hooks/useScrollLock";

const ACCENT = "#5B3FCF";

/** Avatar simples e leve — evita depender de outros ficheiros de rota. */
function MiniAvatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const colors = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <div className="shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, background: src ? "transparent" : color, fontSize: size * 0.4 }}>
      {src
        ? <img src={src} alt={name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        : (name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

/* ── Modal de criação de publicação (texto / foto / vídeo) ── */
export function QuickPostModal({ name, username, avatarUrl, onClose, onPublished }: {
  name: string; username: string; avatarUrl?: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const MAX_PHOTOS = 10;
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle" | "upload" | "saving" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useScrollLock();

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = MAX_PHOTOS - photoFiles.length;
    const accepted = picked.slice(0, room);
    setVideoFile(null); setVideoPreview(null);
    setPhotoFiles((prev) => [...prev, ...accepted]);
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotos((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    // permite escolher o mesmo ficheiro outra vez depois de remover
    e.target.value = "";
  }

  function removePhotoAt(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setPhotoFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setPhotos([]); setPhotoFiles([]);
    setVideoPreview(URL.createObjectURL(file));
  }

  const canPublish = (text.trim().length > 0 || photos.length > 0 || !!videoFile) && !publishing && stage !== "done";

  async function publish() {
    if (!canPublish) return;
    setPublishing(true);
    setErr(null);
    setProgress(0);
    setStage("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setErr("É preciso iniciar sessão para publicar."); return; }

      let imageUrls: string[] = [];
      let videoUrl: string | null = null;

      if (photoFiles.length > 0) {
        setStage("upload");
        const total = photoFiles.length;
        for (let i = 0; i < total; i++) {
          const { url } = await uploadImageToCloudinary(
            photoFiles[i],
            `hooda/posts/${session.user.id}`,
            (pct) => setProgress(Math.round(((i + pct / 100) / total) * 100)),
          );
          imageUrls.push(url);
        }
        setProgress(100);
      }
      if (videoFile) {
        setStage("upload");
        const result = await uploadToCloudinary(
          videoFile,
          { title: text.trim().slice(0, 60) || "post-video", channelId: "feed-post", userId: session.user.id },
          setProgress,
        );
        videoUrl = result.playbackUrl;
        setProgress(100);
      }

      setStage("saving");
      const { data: prof } = await supabase.from("profiles").select("username, full_name").eq("id", session.user.id).maybeSingle();

      const { error } = await (supabase as any).from("posts").insert({
        author_id: session.user.id,
        author_username: prof?.username ?? session.user.email?.split("@")[0] ?? "",
        author_name: prof?.full_name ?? session.user.email ?? "",
        author_color: ACCENT,
        content: text,
        kind: videoUrl ? "video" : imageUrls.length > 0 ? "photo" : "post",
        photo_url: imageUrls[0] ?? null,
        image_url: imageUrls[0] ?? null,
        photos: imageUrls.length > 0 ? imageUrls : null,
        video_url: videoUrl,
      });

      if (error) {
        setErr(error.message ?? "Não foi possível publicar. Tenta novamente.");
        return;
      }

      setStage("done");
      onPublished();
      setTimeout(onClose, 700);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao publicar.");
      setStage("idle");
    } finally {
      setPublishing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-3xl hooda-modal-sheet flex flex-col" style={{ maxHeight: "85vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Criar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] transition">
            <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <MiniAvatar name={name} src={avatarUrl} size={42} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{name}</p>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              @{username}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {photos.map((p, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
                  <img src={p} alt={`foto ${i + 1}`} className="w-full h-full object-cover" style={{ display: "block" }} />
                  <button onClick={() => removePhotoAt(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center justify-center rounded-xl transition active:scale-95"
                  style={{ aspectRatio: "1/1", background: "var(--s2)", border: "1.5px dashed var(--border-subtle)" }}>
                  <Plus className="h-6 w-6" style={{ color: "var(--text-muted)" }} />
                </button>
              )}
            </div>
          )}
          {videoPreview && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <video src={videoPreview} className="w-full rounded-xl" controls />
              <button onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 z-20">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder="O que queres publicar?" rows={4}
            className="w-full outline-none resize-none bg-transparent leading-relaxed text-[15px]"
            style={{ color: "var(--text-primary)" }} />
        </div>

        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition text-sm font-semibold active:scale-95"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Image className="h-4 w-4 text-[#6BA547]" /> Foto{photos.length > 0 ? `s (${photos.length})` : "s"}
            </button>
            <button onClick={() => videoRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition text-sm font-semibold active:scale-95"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Film className="h-4 w-4 text-[#E94B8A]" /> Vídeo
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pickPhoto} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={pickVideo} />

          {err && <p className="mb-2 text-sm text-red-500">{err}</p>}

          {publishing && (
            <div className="mb-3">
              <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                <span>
                  {stage === "upload" && "A enviar…"}
                  {stage === "saving" && "A guardar publicação…"}
                  {stage === "done" && "Publicado!"}
                </span>
                {stage === "upload" && <span style={{ color: ACCENT }}>{progress}%</span>}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: stage === "saving" ? "95%" : stage === "done" ? "100%" : `${progress}%`, background: `linear-gradient(90deg, ${ACCENT}, #E94B8A)` }} />
              </div>
            </div>
          )}

          <button onClick={publish} disabled={!canPublish}
            className="w-full h-12 rounded-xl font-bold text-base transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: canPublish ? ACCENT : "var(--s3)", color: canPublish ? "#fff" : "var(--text-muted)" }}>
            {stage === "done" ? "Publicado!" : publishing ? "A publicar…" : "Publicar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Caixa de composição compacta, mostrada no topo do feed ── */
export function ComposeBox({ name, username, avatarUrl, onPublished }: {
  name: string; username: string; avatarUrl?: string | null;
  onPublished: () => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const quickActions = [
    { label: "Foto", Icon: Image, color: "#6BA547", onClick: () => setOpen(true) },
    { label: "Vídeo", Icon: Film, color: "#E94B8A", onClick: () => setOpen(true) },
    { label: "Drop", Icon: Droplet, color: "#5B3FCF", onClick: () => navigate({ to: "/drops" }) },
    { label: "Enquete", Icon: BarChart3, color: "#F26B3A", onClick: () => { window.location.href = "/studio/criar?kind=poll"; } },
  ];

  return (
    <>
      <div className="rounded-2xl mb-2" style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}>
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]">
          <MiniAvatar name={name} src={avatarUrl} size={38} />
          <span className="flex-1 text-sm" style={{ color: "var(--text-muted)" }}>O que queres publicar?</span>
          <Plus className="h-5 w-5 shrink-0" style={{ color: ACCENT }} />
        </button>
        <div className="flex items-center gap-1.5 px-3 pb-3">
          {quickActions.map(({ label, Icon, color, onClick }) => (
            <button key={label} onClick={onClick}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
              style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
              <Icon className="h-3.5 w-3.5" style={{ color }} /> {label}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <QuickPostModal
          name={name} username={username} avatarUrl={avatarUrl}
          onClose={() => setOpen(false)}
          onPublished={onPublished}
        />
      )}
    </>
  );
}
