import { supabase } from "@/integrations/supabase/client";
import type { PostComment } from "@/components/PostCommentsModal";

/**
 * Helpers partilhados para comentários ligados à base de dados.
 * Usados em home.tsx, explorar.tsx para que a
 * lógica de respostas encadeadas (parent_comment_id) e likes
 * (post_comment_likes) não seja duplicada em cada página.
 */

type RawComment = {
  id: string;
  post_id: string;
  user_id: string | null;
  parent_comment_id: string | null;
  author_username: string | null;
  author_color: string | null;
  content: string;
  created_at: string | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

/** Carrega todos os comentários de uma publicação (incluindo respostas e
 * contagem/estado de likes) e devolve já estruturado em árvore, pronto
 * para passar a <PostCommentsModal comments={...} />. */
export async function fetchPostComments(postId: string, myUserId?: string): Promise<PostComment[]> {
  const { data: rows, error } = await (supabase as any)
    .from("post_comments")
    .select("id,post_id,user_id,parent_comment_id,author_username,author_color,content,created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) console.error("[hooda:comments] falha ao carregar comentários:", error);
  if (error || !rows) return [];

  const all = rows as RawComment[];
  const ids = all.map((c) => c.id);

  // Avatares
  const userIds = [...new Set(all.map((c) => c.user_id).filter(Boolean) as string[])];
  const avatarMap: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id,avatar_url").in("id", userIds);
    (profs || []).forEach((p: any) => { avatarMap[p.id] = p.avatar_url || null; });
  }

  // Likes
  const likeCountMap: Record<string, number> = {};
  const likedByMeSet = new Set<string>();
  if (ids.length > 0) {
    const { data: likeRows } = await (supabase as any)
      .from("post_comment_likes")
      .select("comment_id,user_id")
      .in("comment_id", ids);
    (likeRows || []).forEach((l: any) => {
      likeCountMap[l.comment_id] = (likeCountMap[l.comment_id] || 0) + 1;
      if (myUserId && l.user_id === myUserId) likedByMeSet.add(l.comment_id);
    });
  }

  function toComment(c: RawComment): PostComment {
    return {
      id: c.id,
      authorName: c.author_username ? `@${c.author_username}` : "Anónimo",
      authorColor: c.author_color || "#5B3FCF",
      authorPhoto: (c.user_id && avatarMap[c.user_id]) || undefined,
      text: c.content,
      time: timeAgo(c.created_at),
      likeCount: likeCountMap[c.id] || 0,
      likedByMe: likedByMeSet.has(c.id),
      replies: [],
    };
  }

  const byId: Record<string, PostComment> = {};
  all.forEach((c) => { byId[c.id] = toComment(c); });

  const roots: PostComment[] = [];
  all.forEach((c) => {
    const node = byId[c.id];
    if (c.parent_comment_id && byId[c.parent_comment_id]) {
      byId[c.parent_comment_id].replies!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

/** Envia um comentário (de topo) numa publicação. */
export async function sendPostComment(opts: {
  postId: string; userId: string; username: string; color?: string; text: string;
}): Promise<PostComment | null> {
  const { data, error } = await (supabase as any)
    .from("post_comments")
    .insert({
      post_id: opts.postId,
      user_id: opts.userId,       // obrigatório para RLS: WITH CHECK (auth.uid() = user_id)
      author_id: opts.userId,     // coluna original — manter preenchida por consistência
      author_username: opts.username,
      author_color: opts.color || "#5B3FCF",
      content: opts.text.trim(),
    })
    .select()
    .single();
  if (error || !data) {
    console.error("[hooda:comments] falha ao enviar comentário:", error, "postId:", opts.postId, "userId:", opts.userId);
    return null;
  }
  const row = data as RawComment;
  return {
    id: row.id,
    authorName: `@${opts.username}`,
    authorColor: opts.color || "#5B3FCF",
    text: row.content,
    time: timeAgo(row.created_at),
    likeCount: 0,
    likedByMe: false,
    replies: [],
  };
}

/** Responde a um comentário existente (cria uma linha com parent_comment_id). */
export async function replyToPostComment(opts: {
  postId: string; parentCommentId: string; userId: string; username: string; color?: string; text: string;
}): Promise<PostComment | null> {
  const { data, error } = await (supabase as any)
    .from("post_comments")
    .insert({
      post_id: opts.postId,
      parent_comment_id: opts.parentCommentId,
      user_id: opts.userId,
      author_id: opts.userId,
      author_username: opts.username,
      author_color: opts.color || "#5B3FCF",
      content: opts.text.trim(),
    })
    .select()
    .single();
  if (error || !data) {
    console.error("[hooda:comments] falha ao responder comentário:", error, "postId:", opts.postId, "parentId:", opts.parentCommentId);
    return null;
  }
  const row = data as RawComment;
  return {
    id: row.id,
    authorName: `@${opts.username}`,
    authorColor: opts.color || "#5B3FCF",
    text: row.content,
    time: timeAgo(row.created_at),
    likeCount: 0,
    likedByMe: false,
    replies: [],
  };
}

/** Liga/desliga o "Gostei" num comentário ou resposta. Devolve o novo estado. */
export async function toggleCommentLike(commentId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await (supabase as any).from("post_comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);
    if (error) console.error("[hooda:comments] falha ao remover like:", error);
    return false;
  }
  const { error } = await (supabase as any).from("post_comment_likes").insert({ comment_id: commentId, user_id: userId });
  if (error) console.error("[hooda:comments] falha ao curtir comentário:", error);
  return true;
}

/** Extrai @menções de um texto e cria notificações na DB. */
export async function notifyMentions(opts: {
  text: string;
  authorId: string;
  authorUsername: string;
  postId?: string;
  commentId?: string;
}) {
  const matches = opts.text.match(/@([a-zA-Z0-9_À-ÿ]+)/g);
  if (!matches) return;
  const usernames = [...new Set(matches.map(m => m.slice(1).toLowerCase()))];

  // Buscar os IDs dos utilizadores mencionados
  const { data: profiles } = await (supabase as any)
    .from("profiles")
    .select("id,username,notification_prefs")
    .in("username", usernames);

  if (!profiles?.length) return;

  const inserts = profiles
    .filter((p: any) => p.id !== opts.authorId) // não notificar a si próprio
    .filter((p: any) => p.notification_prefs?.mentions !== false) // respeitar prefs
    .map((p: any) => ({
      user_id: p.id,
      type: "mention",
      actor_id: opts.authorId,
      actor_username: opts.authorUsername,
      post_id: opts.postId ?? null,
      comment_id: opts.commentId ?? null,
      read: false,
    }));

  if (inserts.length > 0) {
    await (supabase as any).from("notifications").insert(inserts);
  }
}
