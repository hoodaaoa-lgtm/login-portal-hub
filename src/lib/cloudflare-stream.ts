/**
 * Cloudflare Stream — upload via Supabase Edge Function (proxy seguro)
 * O token do Cloudflare fica nos Secrets do Supabase, nunca exposto no browser.
 */

import { supabase } from "@/integrations/supabase/client";

const CF_STREAM_DOMAIN = "customer-k3jvmk0ans7znle7.cloudflarestream.com";

export interface StreamUploadResult {
  uid: string;
  playbackUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
}

/**
 * Pede à Edge Function um URL de upload TUS e depois
 * faz o upload directo do browser para o Cloudflare Stream.
 */
export async function uploadToCloudflareStream(
  file: File,
  meta: { title: string; channelId: string; userId: string },
  onProgress: (pct: number) => void,
): Promise<StreamUploadResult> {
  // 1 — Pede o URL de upload à Edge Function (token fica no servidor)
  const { data: { session } } = await supabase.auth.getSession();

  const metadataB64 = btoa(
    `name ${btoa(meta.title)},filetype ${btoa(file.type)},channelId ${btoa(meta.channelId)},userId ${btoa(meta.userId)}`
  );

  const supabaseUrl: string =
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    (supabase as any).supabaseUrl ||
    "";

  const edgeRes = await fetch(
    `${supabaseUrl}/functions/v1/cloudflare-stream-upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        apikey: (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "",
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(file.size),
        "Upload-Metadata": metadataB64,
      },
    }
  );

  if (!edgeRes.ok) {
    const err = await edgeRes.text();
    throw new Error(`Edge Function falhou: ${err}`);
  }

  const { uploadUrl, uid: initialUid } = await edgeRes.json();

  if (!uploadUrl) throw new Error("Edge Function não devolveu URL de upload.");

  // 2 — Faz o upload TUS directo para o Cloudflare (usando o URL obtido)
  const tus = await import("tus-js-client");

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      uploadUrl,                          // URL já autenticado pelo servidor
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 50 * 1024 * 1024,
      onError(err) {
        reject(new Error((err as any).message ?? "Upload para Cloudflare Stream falhou."));
      },
      onProgress(bytesUploaded, bytesTotal) {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess() {
        const location = (upload as any).url as string ?? "";
        const uid = initialUid || (location.split("/").pop() ?? "");

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

/**
 * Apaga um vídeo do Cloudflare Stream via Edge Function.
 */
export async function deleteFromCloudflareStream(_uid: string): Promise<void> {
  // Operação de delete deve ser feita via backend seguro.
  // Por agora lança erro informativo — implementar Edge Function separada se necessário.
  throw new Error("Delete não implementado via Edge Function ainda.");
}
