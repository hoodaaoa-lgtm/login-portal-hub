/**
 * Cloudinary — conta DEDICADA aos VÍDEOS do feed (posts).
 *
 * O feed agora usa DUAS contas Cloudinary: a antiga (dy7o7tgmk, ver
 * src/lib/cloudinary.ts) continua só com as FOTOS dos posts, e esta
 * conta nova fica só com os VÍDEOS dos posts — assim cada conta enche
 * mais devagar. Perfil e admin continuam na conta antiga (ainda não
 * separados).
 */

const FEED_VIDEO_CLOUD_NAME = "eat9omio";
const FEED_VIDEO_UPLOAD_PRESET = "videosif"; // preset unsigned, criado no dashboard desta conta

export interface FeedVideoUploadResult {
  publicId: string;
  playbackUrl: string;
  thumbnailUrl: string;
  duration: number | null;
  format: string;
  bytes: number;
}

/** URL de reprodução directa (mp4 optimizado) na conta de vídeos do feed. */
export function getFeedVideoPlaybackUrl(publicId: string): string {
  return `https://res.cloudinary.com/${FEED_VIDEO_CLOUD_NAME}/video/upload/q_auto,f_auto,vc_h264/${publicId}`;
}

/** URL de thumbnail automática para um vídeo na conta de vídeos do feed. */
export function getFeedVideoThumbnail(publicId: string, timeOffset = "0"): string {
  return `https://res.cloudinary.com/${FEED_VIDEO_CLOUD_NAME}/video/upload/so_${timeOffset},w_1280,h_720,c_fill,f_jpg/${publicId}.jpg`;
}

/**
 * Faz upload de um vídeo de post do feed para a conta dedicada de
 * vídeos, com progresso. Mesma lógica de src/lib/cloudinary.ts
 * (uploadToCloudinary), só que aponta para a conta/preset novos.
 */
/** Escapa caracteres que o formato de "context" do Cloudinary usa como
 *  delimitadores (key=value|key2=value2). Sem isto, uma legenda com "=", "|"
 *  ou quebras de linha — bastante comum em legendas mais compridas, como as
 *  de vídeos maiores — parte o parsing do lado do Cloudinary e devolve
 *  "Invalid encoding in context", travando a publicação. */
function escapeCloudinaryContextValue(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}

export function uploadFeedVideo(
  file: File,
  meta: { title: string; creatorId: string; userId: string },
  onProgress: (pct: number) => void,
): Promise<FeedVideoUploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", FEED_VIDEO_UPLOAD_PRESET);
    formData.append("folder", `hooda/videos/${meta.userId}`);
    formData.append("context",
      `title=${escapeCloudinaryContextValue(meta.title)}|creator_id=${escapeCloudinaryContextValue(meta.creatorId)}`);
    formData.append("resource_type", "video");

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({
            publicId:     data.public_id,
            playbackUrl:  getFeedVideoPlaybackUrl(data.public_id),
            thumbnailUrl: getFeedVideoThumbnail(data.public_id),
            duration:     data.duration ? Math.round(data.duration) : null,
            format:       data.format,
            bytes:        data.bytes,
          });
        } catch {
          reject(new Error("Cloudinary devolveu resposta inválida."));
        }
      } else {
        let msg = `Cloudinary erro ${xhr.status}`;
        try {
          const err = JSON.parse(xhr.responseText);
          msg = err?.error?.message ?? msg;
        } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Falha de rede ao enviar para Cloudinary."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelado."));
    });

    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${FEED_VIDEO_CLOUD_NAME}/video/upload`,
    );
    xhr.send(formData);
  });
}
