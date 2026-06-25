/**
 * STUB — Cloudflare Stream foi substituído por Supabase Storage.
 * Mantido apenas para não quebrar imports existentes.
 */

export interface StreamUploadResult {
  uid: string;
  playbackUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
}

export function getStreamPlayerUrl(_uid: string): string { return ""; }
export function getStreamThumbnailUrl(_uid: string): string { return ""; }
export function getStreamPlaybackUrl(_uid: string): string { return ""; }
export async function deleteFromCloudflareStream(_uid: string): Promise<void> {}
export async function uploadToCloudflareStream(): Promise<StreamUploadResult> {
  throw new Error("Cloudflare Stream não está em uso.");
}
