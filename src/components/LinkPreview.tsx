import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FeedVideoPlayer } from "@/components/FeedVideoPlayer";
import {
  getYouTubeId, getSnapperPostId, isDirectVideo, fetchOgData, fetchSnapperPost,
  type OgData, type SnapperPostPreview,
} from "@/lib/linkPreview";

/**
 * Prévia rica de um link — usada em Mensagens e em Publicações.
 * `variant="message"` respeita a bolha (isMe muda as cores);
 * `variant="post"` usa o estilo neutro do cartão de publicação.
 */
export function LinkPreview({ url, isMe = false, variant = "post", compact = false }: { url: string; isMe?: boolean; variant?: "message" | "post"; compact?: boolean }) {
  const navigate = useNavigate();
  const ytId = getYouTubeId(url);
  const isDirect = isDirectVideo(url);
  const snapperPostId = getSnapperPostId(url);
  const [og, setOg] = useState<OgData | null | "loading">("loading");
  const [snapperPost, setSnapperPost] = useState<SnapperPostPreview | null | "loading">("loading");

  useEffect(() => {
    if (compact || ytId || isDirect || snapperPostId) { setOg(null); return; }
    fetchOgData(url).then(setOg);
  }, [url, ytId, isDirect, snapperPostId, compact]);

  useEffect(() => {
    if (!snapperPostId) { setSnapperPost(null); return; }
    fetchSnapperPost(snapperPostId).then(setSnapperPost);
  }, [snapperPostId]);

  const border = variant === "message" && isMe ? "rgba(255,255,255,0.15)" : "var(--border-subtle)";
  const bg = variant === "message" && isMe ? "rgba(0,0,0,0.2)" : "var(--s2)";
  const textColor = variant === "message" && isMe ? "white" : "var(--text-primary)";
  const mutedColor = variant === "message" && isMe ? "rgba(255,255,255,0.6)" : "var(--text-muted)";
  const marginTop = variant === "message" ? "mt-2" : "mt-3";

  // Modo compacto: usado nas Salas quando a mensagem já tem foto/vídeo próprios —
  // em vez de duplicar uma imagem grande do link, mostra só o logotipo do site
  // e um botão para abrir, tipo "atalho", sem ocupar espaço.
  if (compact) {
    let domain = url;
    try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const favicon = ytId
      ? "https://www.youtube.com/s/desktop/media/favicon.ico"
      : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
    const label = ytId ? "Ver vídeo" : snapperPostId ? "Ver publicação" : "Abrir";
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        className={`${marginTop} rounded-full flex items-center gap-2 pl-1.5 pr-1 py-1 transition hover:opacity-90`}
        style={{ background: bg, border: `1px solid ${border}`, textDecoration: "none", maxWidth: "100%" }}>
        <img src={favicon} alt="" className="w-5 h-5 rounded-full shrink-0 object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
        <span className="text-xs font-semibold truncate" style={{ color: textColor, maxWidth: 140 }}>{domain}</span>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-auto text-white" style={{ background: "#2F6FED" }}>
          {label} ↗
        </span>
      </a>
    );
  }

  if (snapperPostId) {
    if (snapperPost === "loading") {
      return (
        <div className={`${marginTop} rounded-xl overflow-hidden animate-pulse`} style={{ background: bg, border: `1px solid ${border}`, height: 96 }} />
      );
    }
    if (!snapperPost) return null;
    const img = snapperPost.photo_url || snapperPost.photos?.[0] || null;
    const mediaMaxH = variant === "message" ? 140 : 256;
    return (
      <div className={`${marginTop} rounded-xl overflow-hidden`} style={{ border: `1px solid ${border}`, maxWidth: variant === "message" ? 220 : undefined }}>
        {snapperPost.video_url ? (
          <div style={{ maxHeight: mediaMaxH, overflow: "hidden" }}>
            <FeedVideoPlayer src={snapperPost.video_url} rounded="rounded-none" />
          </div>
        ) : img ? (
          <img src={img} alt="" className="w-full object-cover" style={{ maxHeight: mediaMaxH }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        ) : null}
        <button onClick={() => navigate({ to: "/post/$id", params: { id: snapperPostId } })}
          className="w-full text-left p-2.5" style={{ background: bg }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: mutedColor }}>
            Snapper · @{snapperPost.author_username}
          </p>
          {snapperPost.content && (
            <p className="text-xs font-medium leading-snug line-clamp-2 mt-0.5" style={{ color: textColor }}>
              {snapperPost.content}
            </p>
          )}
        </button>
      </div>
    );
  }

  if (ytId) {
    return (
      <div className={`${marginTop} rounded-xl overflow-hidden`} style={{ border: `1px solid ${border}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
          <iframe
            src={`https://www.youtube.com/embed/${ytId}?autoplay=0&rel=0`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </div>
    );
  }

  if (isDirect) {
    return (
      <div className={`${marginTop} rounded-xl overflow-hidden`} style={{ border: `1px solid ${border}` }} onClick={(e) => e.stopPropagation()}>
        <video src={url} controls preload="metadata" className="w-full max-h-64 bg-black" />
      </div>
    );
  }

  if (og === "loading") {
    return (
      <div className={`${marginTop} rounded-xl overflow-hidden animate-pulse`} style={{ background: bg, border: `1px solid ${border}`, height: 72 }} />
    );
  }

  if (!og) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={`${marginTop} rounded-xl overflow-hidden flex gap-0 block transition hover:opacity-90`}
      style={{ background: bg, border: `1px solid ${border}`, textDecoration: "none", maxWidth: variant === "message" ? 260 : undefined }}>
      {og.image && (
        <img src={og.image} alt="" className="w-16 h-full object-cover shrink-0 self-stretch"
          style={{ minHeight: 56, maxHeight: 80 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      )}
      <div className="p-2 min-w-0 flex-1">
        {og.siteName && (
          <p className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: mutedColor }}>{og.siteName}</p>
        )}
        {og.title && (
          <p className="text-xs font-bold leading-snug line-clamp-2" style={{ color: textColor }}>{og.title}</p>
        )}
        {og.description && (
          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: mutedColor }}>{og.description}</p>
        )}
      </div>
    </a>
  );
}
