/**
 * Cloudflare Stream — upload via Cloudflare Worker (proxy seguro)
 * O Worker em hoodatv.infocriar178.workers.dev gera a URL de upload
 * e o browser faz o upload TUS directo para o Cloudflare Stream.
 */

import * as tus from "tus-js-client";

const WORKER_URL       = "https://hoodatv.infocriar178.workers.dev";
const CF_STREAM_DOMAIN = "customer-k3jvmk0ans7znle7.cloudflarestream.com";

export interface StreamUploadResult {
  uid: string;
  playbackUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
}

export async function uploadToCloudflareStream(
  file: File,
  meta: { title: string; channelId: string; userId: string },
  onProgress: (pct: number) => void,
): Promise<StreamUploadResult> {

  // 1 — Pede ao Worker uma URL de upload TUS
  let res: Response;
  try {
    res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:    meta.title,
        fileSize: file.size,
        fileType: file.type,
      }),
    });
  } catch (fetchErr: any) {
    throw new Error(`Não foi possível contactar o Worker: ${fetchErr?.message ?? fetchErr}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Worker falhou (${res.status}): ${err}`);
  }

  let workerBody: any;
  try {
    workerBody = await res.json();
  } catch {
    throw new Error("Worker devolveu resposta inválida (não é JSON).");
  }

  const { uploadUrl, uid: initialUid } = workerBody;
  console.log("[CF Stream] Worker response:", workerBody);

  if (!uploadUrl) throw new Error("Worker não devolveu URL de upload.");

  // 2 — Upload TUS directo para o Cloudflare Stream
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      uploadUrl,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 50 * 1024 * 1024,
      onError(err) {
        reject(new Error((err as any).message ?? "Upload falhou."));
      },
      onProgress(bytesUploaded, bytesTotal) {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess() {
        const uid = initialUid || (upload as any).url?.split("/").pop() || "";
        if (!uid) {
          reject(new Error("Não foi possível obter o UID do vídeo."));
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
    upload.start();
  });
}

export function getStreamPlayerUrl(uid: string): string {
  return `https://${CF_STREAM_DOMAIN}/${uid}/iframe`;
}

export function getStreamThumbnailUrl(uid: string, timeSeconds = 0): string {
  return `https://${CF_STREAM_DOMAIN}/${uid}/thumbnails/thumbnail.jpg?time=${timeSeconds}s`;
}

export function getStreamPlaybackUrl(uid: string): string {
  return `https://${CF_STREAM_DOMAIN}/${uid}/manifest/video.m3u8`;
}

export async function deleteFromCloudflareStream(_uid: string): Promise<void> {
  throw new Error("Delete não implementado ainda.");
}
