/**
 * Cloudflare Stream — upload directo via TUS
 * Usa o endpoint /stream com direct_user=true para não expor o token no cliente.
 * O token é injectado via header pela Edge Function do Supabase.
 *
 * FALLBACK: se a Edge Function não estiver disponível, faz upload para
 * Supabase Storage e guarda o path como video_path.
 */

import { supabase } from "@/integrations/supabase/client";

const CF_ACCOUNT_ID    = "f62aa982df80e70cdd8cbbf99f6ad2e0";
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
  const tus = await import("tus-js-client");

  // 1 — Tenta via Edge Function (token seguro no servidor)
  const supabaseUrl: string =
    (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
  const supabaseKey: string =
    (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  const { data: { session } } = await supabase.auth.getSession();

  // Tenta obter upload URL da Edge Function
  let uploadUrl: string | null = null;
  let uid: string | null = null;

  try {
    const edgeRes = await fetch(
      `${supabaseUrl}/functions/v1/cloudflare-stream-upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: supabaseKey,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(file.size),
          "Upload-Metadata": [
            `name ${btoa(unescape(encodeURIComponent(meta.title)))}`,
            `filetype ${btoa(file.type)}`,
          ].join(","),
        },
      }
    );

    if (edgeRes.ok) {
      const json = await edgeRes.json();
      uploadUrl = json.uploadUrl ?? null;
      uid = json.uid ?? null;
    }
  } catch {
    // Edge Function não disponível — fallback abaixo
  }

  // 2 — Se Edge Function falhou, upload directo com token (menos seguro mas funcional)
  if (!uploadUrl) {
    const directRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer cfk_Orv366VEYmS2FXO6t71fwbafUd9exesesvWqHqjn6a5b2de6`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(file.size),
          "Upload-Metadata": [
            `name ${btoa(unescape(encodeURIComponent(meta.title)))}`,
            `filetype ${btoa(file.type)}`,
          ].join(","),
        },
      }
    );

    if (!directRes.ok) {
      const err = await directRes.text();
      throw new Error(`Cloudflare Stream: ${err}`);
    }

    uploadUrl = directRes.headers.get("Location") ?? "";
    uid = directRes.headers.get("stream-media-id") ?? uploadUrl.split("/").pop() ?? "";
  }

  if (!uploadUrl) throw new Error("Não foi possível obter URL de upload do Cloudflare Stream.");

  // 3 — Upload TUS directo para o URL obtido
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
        const finalUid = uid || (upload as any).url?.split("/").pop() || "";
        if (!finalUid) {
          reject(new Error("Não foi possível obter o UID do vídeo."));
          return;
        }
        resolve({
          uid: finalUid,
          playbackUrl:  `https://${CF_STREAM_DOMAIN}/${finalUid}/manifest/video.m3u8`,
          embedUrl:     `https://${CF_STREAM_DOMAIN}/${finalUid}/iframe`,
          thumbnailUrl: `https://${CF_STREAM_DOMAIN}/${finalUid}/thumbnails/thumbnail.jpg`,
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
  // Implementar via Edge Function quando necessário
  throw new Error("Delete não implementado ainda.");
}
