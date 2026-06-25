/**
 * Cloudflare Stream — upload directo via TUS resumível
 * Documentação: https://developers.cloudflare.com/stream/uploading-videos/upload-video-file/
 */

const CF_ACCOUNT_ID    = "f62aa982df80e70cdd8cbbf99f6ad2e0";
const CF_STREAM_TOKEN  = "cfk_Orv366VEYmS2FXO6t71fwbafUd9exesesvWqHqjn6a5b2de6";
const CF_STREAM_DOMAIN = "customer-k3jvmk0ans7znle7.cloudflarestream.com";

export interface StreamUploadResult {
  uid: string;          // ID único do vídeo no Cloudflare Stream
  playbackUrl: string;  // URL HLS para reprodução
  embedUrl: string;     // URL do player iframe
  thumbnailUrl: string; // Thumbnail automática gerada pelo Stream
}

/**
 * Faz upload de um vídeo directamente para o Cloudflare Stream via TUS.
 * Suporta ficheiros grandes (sem limite prático).
 */
export async function uploadToCloudflareStream(
  file: File,
  meta: { title: string; channelId: string; userId: string },
  onProgress: (pct: number) => void,
): Promise<StreamUploadResult> {
  // 1 — Importa tus-js-client (já instalado no projecto)
  const tus = await import("tus-js-client");

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 50 * 1024 * 1024, // 50 MB por chunk
      headers: {
        Authorization: `Bearer ${CF_STREAM_TOKEN}`,
      },
      metadata: {
        name:      meta.title,
        filetype:  file.type,
        // Metadados personalizados para identificar canal/dono
        channelId: meta.channelId,
        userId:    meta.userId,
      },
      onError(err) {
        reject(new Error((err as any).message ?? "Upload para Cloudflare Stream falhou."));
      },
      onProgress(bytesUploaded, bytesTotal) {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess() {
        // O UID está no header Location devolvido pelo Cloudflare
        const location = (upload as any).url as string ?? "";
        const uid = location.split("/").pop() ?? "";

        if (!uid) {
          reject(new Error("Não foi possível obter o UID do vídeo após o upload."));
          return;
        }

        resolve({
          uid,
          playbackUrl:  `https://${CF_STREAM_DOMAIN}/${uid}/manifest/video.m3u8`,
          embedUrl:     `https://${CF_STREAM_DOMAIN}/${uid}/iframe`,
          thumbnailUrl: `https://${CF_STREAM_DOMAIN}/${uid}/thumbnails/thumbnail.jpg`,
        });
      },
    });

    upload.findPreviousUploads().then(prev => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }).catch(() => upload.start());
  });
}

/**
 * Devolve o URL do player iframe para embedar no site.
 */
export function getStreamPlayerUrl(uid: string): string {
  return `https://${CF_STREAM_DOMAIN}/${uid}/iframe`;
}

/**
 * Devolve o URL da thumbnail automática.
 */
export function getStreamThumbnailUrl(uid: string, timeSeconds = 0): string {
  return `https://${CF_STREAM_DOMAIN}/${uid}/thumbnails/thumbnail.jpg?time=${timeSeconds}s`;
}

/**
 * Devolve o URL HLS para reprodução directa (video element).
 */
export function getStreamPlaybackUrl(uid: string): string {
  return `https://${CF_STREAM_DOMAIN}/${uid}/manifest/video.m3u8`;
}

/**
 * Apaga um vídeo do Cloudflare Stream.
 * Nota: deve ser chamado de um backend seguro em produção.
 */
export async function deleteFromCloudflareStream(uid: string): Promise<void> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${uid}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${CF_STREAM_TOKEN}` },
    }
  );
  if (!res.ok) throw new Error(`Falha ao apagar vídeo: ${res.status}`);
}
