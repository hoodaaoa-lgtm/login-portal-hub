import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Image, Film, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { uploadFeedVideo } from "@/lib/cloudinaryFeedVideo";
import { optimizePostPhoto } from "@/lib/imageOptimize";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import { useScrollLock } from "@/hooks/useScrollLock";

export const ACCENT = "#2F6FED";

function getColor(name: string) {
  const colors = ["#2F6FED", "#2F6FED", "#1FAFA6", "#6BA547", "#2F6FED"];
  return colors[(name?.charCodeAt(0) ?? 0) % colors.length];
}

function ModalAvatar({ name, size = 42, src }: { name: string; size?: number; src?: string | null }) {
  const color = getColor(name);
  return (
    <div style={{
      background: color, width: size, height: size, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, color: "white", flexShrink: 0, overflow: "hidden",
    }}>
      {src
        ? <img loading="lazy" decoding="async" src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

export type NewPublishedPost = {
  id: string; text: string; photo: string | null; bgColor: string | null;
  videoUrl?: string; createdAt: Date;
  likes: number; likedByMe: boolean; comments: number; bookmarked: boolean;
};

/** Modal "Criar publicação" — usado no Lar e no Perfil. Publica texto,
 * foto ou vídeo diretamente para a tabela `posts` do Supabase. */
export function CreatePostModal({
  name, username, avatarUrl, onClose, onPublish,
}: {
  name: string; username: string; avatarUrl?: string | null;
  onClose: () => void;
  onPublish: (post: NewPublishedPost) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [bgColor] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle" | "upload" | "saving" | "done">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setVideoFile(null); setVideoPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setPhoto(null); setPhotoFile(null);
    setVideoPreview(URL.createObjectURL(file));
  }

  async function publish() {
    if (!text.trim() && !photoFile && !photo && !videoFile) return;
    if (publishing || done) return;
    setPublishing(true);
    setPublishErr(null);
    setUploadProgress(0);
    setUploadStage("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPublishErr("É preciso iniciar sessão para publicar."); return; }

      let imageUrl: string | null = photo;
      let videoUrl: string | null = null;

      if (photoFile) {
        setUploadStage("upload");
        const { url } = await uploadImageToCloudinary(
          photoFile,
          `hooda/posts/${session.user.id}`,
          (pct) => setUploadProgress(pct),
        );
        imageUrl = url;
        setUploadProgress(100);
      }

      if (videoFile) {
        setUploadStage("upload");
        const result = await uploadFeedVideo(
          videoFile,
          { title: text.trim().slice(0, 60) || "post-video", creatorId: "feed-post", userId: session.user.id },
          (pct) => setUploadProgress(pct),
        );
        videoUrl = result.playbackUrl;
        setUploadProgress(100);
      }

      setUploadStage("saving");
      const { data: prof } = await supabase.from("profiles").select("username, full_name").eq("id", session.user.id).maybeSingle();
      const contentJson = bgColor ? JSON.stringify({ text, bgColor }) : text;

      const { data: inserted, error } = await (supabase as any)
        .from("posts")
        .insert({
          author_id: session.user.id,
          author_username: prof?.username ?? session.user.email?.split("@")[0] ?? "",
          author_name: prof?.full_name ?? session.user.email ?? "",
          author_color: "#2F6FED",
          content: contentJson,
          kind: videoUrl ? "video" : bgColor ? "bg" : imageUrl ? "photo" : "post",
          photo_url: imageUrl,
          image_url: imageUrl,
          video_url: videoUrl,
        })
        .select("id, created_at")
        .single();

      if (error || !inserted?.id) {
        setPublishErr(error?.message ?? "Não foi possível publicar. Tenta novamente.");
        console.error("Erro ao publicar post:", error);
        return;
      }

      setUploadStage("done");
      onPublish({
        id: inserted.id, text, photo: imageUrl, bgColor,
        videoUrl: videoUrl ?? undefined,
        createdAt: new Date(inserted.created_at ?? Date.now()),
        likes: 0, likedByMe: false, comments: 0, bookmarked: false,
      });
      setDone(true);
      setTimeout(onClose, 900);
    } catch (err: any) {
      setPublishErr(err.message ?? "Erro ao publicar.");
      setUploadStage("idle");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = (text.trim().length > 0 || photo !== null || videoFile !== null) && !publishing && !done;

  useScrollLock();

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg mx-4 rounded-3xl hooda-modal-sheet flex flex-col" style={{ maxHeight: "85vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Criar publicação</span>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--s2)] transition">
            <X className="h-5 w-5 text-[var(--text-muted)]" />
          </button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <ModalAvatar name={name} size={42} src={avatarUrl} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{name}</p>
            <span className="text-[11px] bg-[var(--s2)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full font-medium">
              @{username || "utilizador"}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {photo && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <img src={optimizePostPhoto(photo, 700)} alt="foto" className="w-full rounded-xl" style={{ display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <button onClick={() => { setPhoto(null); setPhotoFile(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {videoPreview && (
            <div className="relative mb-3">
              <FeedVideoPlayer src={videoPreview} rounded="rounded-xl" isShortHint={false} />
              <button onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 z-20">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="rounded-2xl transition-all">
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t("post.placeholder")}
              rows={4}
              className="w-full outline-none resize-none bg-transparent leading-relaxed"
              style={{ color: "var(--text-primary,#111)", fontSize: 15, fontWeight: 400, textAlign: "left" }} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--text-muted)] font-medium">Adicionar à publicação</span>
            <div className="flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--s2)] hover:bg-[var(--s3)] transition text-sm font-semibold text-[var(--text-secondary)] active:scale-95">
                <Image className="h-4 w-4 text-[#6BA547]" /> {t("post.photo")}
              </button>
              <button onClick={() => videoRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--s2)] hover:bg-[var(--s3)] transition text-sm font-semibold text-[var(--text-secondary)] active:scale-95">
                <Film className="h-4 w-4 text-[#2F6FED]" /> {"Vídeo"}
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={pickVideo} />
          {publishErr && <p className="mb-2 text-sm text-red-600">{publishErr}</p>}

          {publishing && (
            <div className="mb-3">
              <div className="flex justify-between text-xs font-semibold mb-1.5"
                style={{ color: "var(--text-muted)" }}>
                <span>
                  {uploadStage === "upload" && (photoFile ? "A enviar foto…" : "A enviar vídeo…")}
                  {uploadStage === "saving" && "A guardar publicação…"}
                  {uploadStage === "done" && t("post.published")}
                </span>
                {uploadStage === "upload" && (
                  <span style={{ color: ACCENT }}>{uploadProgress}%</span>
                )}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: uploadStage === "saving" ? "95%" : uploadStage === "done" ? "100%" : `${uploadProgress}%`,
                    background: `#2F6FED`,
                    boxShadow: `0 0 8px ${ACCENT}80`,
                  }}
                />
              </div>
            </div>
          )}

          <button onClick={publish} disabled={!canPublish}
            className="w-full h-12 rounded-xl font-bold text-base transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: canPublish ? ACCENT : "var(--s3)", color: canPublish ? "#fff" : "var(--text-muted)" }}>
            {done
              ? t("post.published")
              : publishing
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />{t("post.publishing", "A publicar…")}</>
                : t("post.publish")}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}

/** Barra "Em que estás a pensar" que abre o CreatePostModal ao clicar
 * em qualquer parte dela (texto ou ícones de vídeo/foto/live). */
export function PostComposerBar({
  name, avatarUrl, onOpen,
}: {
  name: string; avatarUrl?: string | null; onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-3 py-2.5 mb-2 rounded-2xl border transition hover:brightness-95 active:scale-[0.99] text-left"
      style={{ background: "var(--s1)", borderColor: "var(--border-subtle)" }}
    >
      <ModalAvatar name={name} size={34} src={avatarUrl} />
      <span className="flex-1 min-w-0 truncate text-sm" style={{ color: "var(--text-muted)" }}>
        Em que estás a pensar, {name}?
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#EF444422" }}>
          <Film className="h-4 w-4" style={{ color: "#EF4444" }} />
        </span>
        <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#6BA54722" }}>
          <Image className="h-4 w-4" style={{ color: "#6BA547" }} />
        </span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); toast.info("Transmissões ao vivo em breve."); }}
          className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#EF444422" }}>
          <Radio className="h-4 w-4" style={{ color: "#EF4444" }} />
        </span>
      </span>
    </button>
  );
}
