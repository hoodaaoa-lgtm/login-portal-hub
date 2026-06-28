import { supabase } from "@/integrations/supabase/client";

/** Extrai todos os @usernames únicos de um texto. */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_.]{2,30})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

/** Extrai todas as #hashtags únicas de um texto. */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-zA-Z0-9_\u00C0-\u024F]{2,50})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

/**
 * Cria notificações de menção para todos os @usernames encontrados no texto.
 * Não notifica o próprio autor.
 */
export async function notifyMentions(opts: {
  text: string;
  authorId: string;
  authorUsername: string;
  postId?: string;
  commentId?: string;
}) {
  const usernames = extractMentions(opts.text);
  if (usernames.length === 0) return;

  // Resolver usernames → user_ids
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,username")
    .in("username", usernames);

  if (!profiles || profiles.length === 0) return;

  // Criar notificações (ignorar o próprio)
  const rows = profiles
    .filter((p: any) => p.id !== opts.authorId)
    .map((p: any) => ({
      user_id: p.id,
      type: "mention",
      from_user_id: opts.authorId,
      from_username: opts.authorUsername,
      post_id: opts.postId ?? null,
      comment_id: opts.commentId ?? null,
    }));

  if (rows.length === 0) return;

  await (supabase as any)
    .from("notifications")
    .insert(rows)
    .then(({ error }: any) => {
      if (error) console.error("[hooda:mentions] falha ao criar notificações:", error);
    });
}
