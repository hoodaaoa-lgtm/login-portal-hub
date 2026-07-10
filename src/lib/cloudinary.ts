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

/** Escapa caracteres que o formato de "context" do Cloudinary usa como
 *  delimitadores (key=value|key2=value2). Sem isto, um título com "=", "|"
 *  ou quebras de linha parte o parsing do lado do Cloudinary e devolve
 *  "Invalid encoding in context", travando o upload. */
function escapeCloudinaryContextValue(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
}

/**
 * Faz upload de um vídeo para o Cloudinary com progresso.
 * Usa XMLHttpRequest para suportar onProgress (fetch não suporta).
 */
export function uploadToCloudinary(
  file: File,
  meta: { title: string; creatorId: string; userId: string },
  onProgress: (pct: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET_VIDEO);
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
 * URL de entrega BRUTA, sem nenhuma transformação (nem q_auto, nem
 * f_auto, nem vc_h264, nem redimensionamento). Último recurso quando até
 * a URL "oficial" (getVideoPlaybackUrl) falha com 400 — normalmente
 * porque o vídeo original ultrapassa o limite de transformação síncrona
 * do plano Cloudinary atual (ex.: 40MB no plano free). Como não pede
 * nenhum processamento, a Cloudinary só serve o ficheiro tal como foi
 * enviado — nunca dispara esse limite. Pode devolver o formato original
 * (nem sempre mp4/H.264), mas pelo menos carrega em vez de dar 400.
 */
export function getCloudinaryRawUrl(mp4Url: string): string | null {
  const match = mp4Url.match(
    /res\.cloudinary\.com\/([^/]+)\/video\/upload\/[^/]+\/(.+?)(?:\.[a-zA-Z0-9]+)?$/,
  );
  if (!match) return null;
  const [, cloud, publicId] = match;
  return `https://res.cloudinary.com/${cloud}/video/upload/${publicId}.mp4`;
}

/**
 * Deriva a URL de miniatura (thumbnail) a partir de QUALQUER URL de
 * reprodução Cloudinary já existente — usada para gerar o "poster" do HoodaPlayer
 * quando não há uma coluna dedicada de thumbnail (ex.: vídeos de chat),
 * para que o fundo desfocado (em vez de barra preta) tenha uma imagem
 * para desfocar. Devolve null se o URL não for do Cloudinary.
 */
export function getCloudinaryPosterFromUrl(mp4Url: string, timeOffset = "0"): string | null {
  const match = mp4Url.match(
    /res\.cloudinary\.com\/([^/]+)\/video\/upload\/[^/]+\/(.+?)(?:\.[a-zA-Z0-9]+)?$/,
  );
  if (!match) return null;
  const [, cloud, publicId] = match;
  // w_1280,c_limit (sem h_/c_fill): mantém a proporção REAL do vídeo em
  // vez de forçar sempre 16:9 — importante porque o HoodaPlayer usa as
  // dimensões desta imagem para adivinhar a proporção da caixa antes do
  // vídeo carregar metadata (evita o "salto" de tamanho em vídeos
  // verticais, que antes nasciam numa caixa 16:9 errada).
  return `https://res.cloudinary.com/${cloud}/video/upload/so_${timeOffset},w_1280,c_limit,f_jpg/${publicId}.jpg`;
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
