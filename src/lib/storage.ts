import { supabase } from "@/integrations/supabase/client";

export async function getSignedVideoUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export function getPublicAssetUrl(bucket: "thumbnails" | "channel-assets", path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
