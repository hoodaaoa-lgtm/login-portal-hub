import { supabase } from "@/integrations/supabase/client";

/**
 * Helpers partilhados para gerir publicações: esconder para mim e
 * eliminar definitivamente (para todos).
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
