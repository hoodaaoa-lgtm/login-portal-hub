import { supabase } from "@/integrations/supabase/client";

export async function getBooks(options?: {
  search?: string;
  orderBy?: "downloads" | "rating" | "recent";
  limit?: number;
}) {
  let q = (supabase as any).from("stories_books")
    .select("*, profiles!inner(avatar_url, username)")
    .eq("status", "published");

  if (options?.search) {
    q = q.or(`title.ilike.%${options.search}%,author_name.ilike.%${options.search}%`);
  }

  // Ordenar por downloads + rating
  q = q.order("downloads_count", { ascending: false })
    .order("average_rating", { ascending: false });

  if (options?.limit) {
    q = q.limit(options.limit);
  }

  const { data, error } = await q;
  return { data: data ?? [], error };
}

export async function getUserRating(bookId: string, userId: string) {
  const { data } = await supabase
    .from("book_ratings")
    .select("stars")
    .eq("book_id", bookId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.stars ?? 0;
}

export async function getSavedBooks(userId: string) {
  const { data } = await supabase
    .from("saved_books")
    .select("book_id")
    .eq("user_id", userId);
  return new Set(data?.map((s: any) => s.book_id) ?? []);
}
