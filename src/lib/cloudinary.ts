/**
 * Cloudinary — upload de vídeos directo do browser
 * Substitui o cloudflare-stream.ts
 */

const CLOUD_NAME = "dy7o7tgmk";
const UPLOAD_PRESET_VIDEO = "hooda_videos";  // preset unsigned para vídeos
const UPLOAD_PRESET_IMAGE = "hooda_videos";  // usa o mesmo preset que já existe

export interface CloudinaryUploadResult {
  publicId: string;
  playbackUrl: string;
  thumbnailUrl: string;
  duration: number | null;
  format: string;
  bytes: number;
}

/**
 * Faz upload de um vídeo para o Cloudinary com progresso.
 * Usa XMLHttpRequest para suportar onProgress (fetch não suporta).
 */
export function uploadToCloudinary(
  file: File,
  meta: { title: string; channelId: string; userId: string },
  onProgress: (pct: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET_VIDEO);
    formData.append("folder", `hooda/videos/${meta.userId}`);
    formData.append("context", `title=${meta.title}|channel_id=${meta.channelId}`);
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
            // Usa a URL transformada (vc_h264/SDR), não o secure_url em
            // bruto — corrige vídeos HDR (iPhone) que tocavam escuros.
            playbackUrl:  getVideoPlaybackUrl(data.public_id),
            thumbnailUrl: getVideoThumbnail(data.public_id),
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
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
    );
    xhr.send(formData);
  });
}

/** URL de thumbnail automática para um vídeo no Cloudinary */
export function getVideoThumbnail(publicId: string, timeOffset = "0"): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_${timeOffset},w_1280,h_720,c_fill,f_jpg/${publicId}.jpg`;
}

/**
 * Deriva um "ladder" de resoluções mp4 a partir de QUALQUER URL de
 * reprodução já existente do Cloudinary — incluindo vídeos publicados
 * antes do sistema de qualidade adaptativa existir. Não precisa de
 * re-upload nem migração: o public_id já está codificado no próprio URL.
 *
 * Usa transformações "h_<altura>,c_limit" (redimensiona só para baixo,
 * nunca amplia um vídeo de baixa resolução) — isto funciona em qualquer
 * plano do Cloudinary, ao contrário do streaming HLS (sp_auto), que
 * exige o add-on de Adaptive Bitrate Streaming e não estava disponível.
 *
 * Devolve null se o URL não for do Cloudinary (ex.: outro CDN/Cloudflare
 * Stream, que já trata disto sozinho via HLS nativo).
 */
export interface CloudinaryRendition {
  height: number;
  url: string;
}

const RENDITION_LADDER = [144, 240, 360, 480, 720, 1080];

export function getCloudinaryRenditions(mp4Url: string): CloudinaryRendition[] | null {
  const match = mp4Url.match(
    /res\.cloudinary\.com\/([^/]+)\/video\/upload\/[^/]+\/(.+?)(?:\.[a-zA-Z0-9]+)?$/,
  );
  if (!match) return null;
  const [, cloud, publicId] = match;

  return RENDITION_LADDER.map((height) => ({
    height,
    url: `https://res.cloudinary.com/${cloud}/video/upload/q_auto,f_auto,vc_h264,h_${height},c_limit/${publicId}.mp4`,
  }));
}

/** URL de reprodução directa (mp4 optimizado).
 *  vc_h264 força um recodifica para H.264/SDR — sem isto, vídeos HDR
 *  (comuns em iPhones — Dolby Vision/HDR10) tocavam com o URL original
 *  (secure_url em bruto) e apareciam escuros/lavados no browser, porque
 *  o <video> não faz tone-mapping de HDR para SDR sozinho (o som tocava
 *  normalmente, só a imagem ficava errada). A miniatura (.jpg) já não
 *  tinha este problema porque o Cloudinary já a gera sempre em SDR. */
export function getVideoPlaybackUrl(publicId: string): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/q_auto,f_auto,vc_h264/${publicId}`;
}

/**
 * Faz upload de uma IMAGEM para o Cloudinary (unsigned preset).
 */
export function uploadImageToCloudinary(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET_IMAGE);
    formData.append("folder", folder);
    formData.append("resource_type", "image");

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, publicId: data.public_id });
        } catch {
          reject(new Error("Cloudinary devolveu resposta inválida."));
        }
      } else {
        let msg = `Cloudinary erro ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error?.message ?? msg; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Falha de rede.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelado.")));

    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.send(formData);
  });
}
