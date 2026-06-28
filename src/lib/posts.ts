import { supabase } from "@/integrations/supabase/client";

/**
 * Helpers partilhados para gerir publicações: eliminar (para mim / para
 * todos) e partilhar para outra comunidade onde o utilizador é membro.
 */

/** Esconde a publicação só para o utilizador atual (não apaga para os outros). */
export async function hidePostForMe(postId: string, userId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("post_hidden")
    .insert({ post_id: postId, user_id: userId });
  if (error) {
    console.error("[hooda:posts] falha ao esconder publicação:", error);
    return false;
  }
  return true;
}

/** Apaga a publicação definitivamente para todos. Só funciona se o utilizador for o autor (RLS). */
export async function deletePostForEveryone(postId: string): Promise<boolean> {
  try {
    // Tentar Edge Function primeiro (apaga DB + Cloudinary)
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const supabaseUrl = (supabase as any).supabaseUrl as string;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/delete-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ postId }),
        });
        if (res.ok) return true;
      } catch (_) { /* fallback para delete direto */ }
    }

    // Fallback — apagar direto pela DB (sem limpar Cloudinary)
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) { console.error("[hooda:posts] falha ao eliminar:", error); return false; }
    return true;
  } catch (err) {
    console.error("[hooda:posts] erro ao eliminar publicação:", err);
    return false;
  }
}

export type MyCommunity = { id: string; name: string; emoji: string; color: string; photo?: string | null };

/** Lista as comunidades de que o utilizador é membro e onde tem autorização para publicar
 * (membro = pode publicar nas comunidades públicas onde entrou; admins/owners sempre podem). */
export async function fetchMyShareableCommunities(userId: string): Promise<MyCommunity[]> {
  const { data: memberships, error: memErr } = await (supabase as any)
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId);
  if (memErr) {
    console.error("[hooda:posts] falha ao carregar comunidades do utilizador:", memErr);
    return [];
  }
  const ids = (memberships || []).map((m: any) => m.community_id);
  if (ids.length === 0) return [];

  const { data: communities, error } = await supabase
    .from("communities")
    .select("id,name,emoji,cover_color,photo_url")
    .in("id", ids);
  if (error) {
    console.error("[hooda:posts] falha ao carregar dados das comunidades:", error);
    return [];
  }
  return (communities || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji || "🌐",
    color: c.cover_color || "#5B3FCF",
    photo: c.photo_url,
  }));
}

/** Partilha uma publicação existente para outra comunidade, criando uma nova entrada
 * na tabela posts ligada à comunidade de destino (category = targetCommunityId). */
export async function sharePostToCommunity(opts: {
  sourcePostId: string;
  targetCommunityId: string;
  userId: string;
  username: string;
  authorName?: string;
  authorColor?: string;
}): Promise<string | null> {
  const { data: original, error: fetchErr } = await supabase
    .from("posts")
    .select("content,photos,image_url,video_url,audio_url")
    .eq("id", opts.sourcePostId)
    .maybeSingle();
  if (fetchErr || !original) {
    console.error("[hooda:posts] falha ao carregar publicação original para partilhar:", fetchErr);
    return null;
  }

  const payload: Record<string, unknown> = {
    author_id: opts.userId,
    author_username: opts.username,
    author_name: opts.authorName || opts.username,
    author_color: opts.authorColor || "#5B3FCF",
    content: (original as any).content || "",
    kind: "post",
    category: opts.targetCommunityId,
    shared_from_post_id: opts.sourcePostId,
  };
  if ((original as any).photos) payload.photos = (original as any).photos;
  if ((original as any).image_url) payload.image_url = (original as any).image_url;
  if ((original as any).video_url) payload.video_url = (original as any).video_url;
  if ((original as any).audio_url) payload.audio_url = (original as any).audio_url;

  const { data: inserted, error } = await supabase
    .from("posts").insert(payload as any).select("id").single();
  if (error || !inserted) {
    console.error("[hooda:posts] falha ao partilhar publicação:", error);
    return null;
  }
  return inserted.id;
}
