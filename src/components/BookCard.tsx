import React, { useState } from "react";
import { Download, Bookmark, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

interface BookCardProps {
  book: {
    id: string;
    title: string;
    author_name: string;
    author_id: string;
    cover_url?: string;
    cover_color?: string;
    description?: string;
    pdf_url?: string;
    downloads_count?: number;
    average_rating?: number;
    rating_count?: number;
  };
  authorProfile?: {
    avatar_url?: string;
    username: string;
  };
  isSaved?: boolean;
  userRating?: number;
  onSaveToggle?: () => void;
  onDownload?: () => void;
}

export function BookCard({
  book,
  authorProfile,
  isSaved = false,
  userRating = 0,
  onSaveToggle,
  onDownload,
}: BookCardProps) {
  const navigate = useNavigate();
  const [rating, setRating] = useState(userRating);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [myId, setMyId] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setMyId(session.user.id);
    });
  }, []);

  // Dar uma estrela
  async function rateBook(stars: number) {
    if (!myId) return;
    setSaving(true);
    const { error } = await supabase.from("book_ratings").upsert({
      book_id: book.id,
      user_id: myId,
      stars,
    }, { onConflict: "book_id,user_id" });

    if (!error) {
      setRating(stars);
      // Recalcular média
      await supabase.rpc("update_book_rating_average", { p_book_id: book.id });
    }
    setSaving(false);
  }

  // Download
  async function handleDownload() {
    if (!book.pdf_url) return;
    setDownloading(true);
    try {
      // Incrementar contador de downloads
      await supabase.rpc("increment_book_download", { p_book_id: book.id });

      // Abrir o PDF
      window.open(book.pdf_url, "_blank");
      onDownload?.();
    } catch (err) {
      console.error("Erro ao baixar:", err);
    }
    setDownloading(false);
  }

  // Toggle guardar
  async function handleToggleSave() {
    if (!myId) return;
    setSaving(true);
    if (isSaved) {
      await supabase.from("saved_books")
        .delete()
        .eq("user_id", myId)
        .eq("book_id", book.id);
    } else {
      await supabase.from("saved_books").insert({
        user_id: myId,
        book_id: book.id,
      });
    }
    setSaving(false);
    onSaveToggle?.();
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition border border-neutral-200 dark:border-neutral-800">
      {/* Capa */}
      <div className="h-48 overflow-hidden bg-gradient-to-br flex items-center justify-center relative"
        style={{
          background: book.cover_url
            ? "transparent"
            : `linear-gradient(135deg, ${book.cover_color || "#5B3FCF"}, ${book.cover_color || "#E94B8A"})`
        }}>
        {book.cover_url ? (
          <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="text-white text-center px-4">
            <p className="font-bold text-lg">{book.title}</p>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="p-3 space-y-3">
        {/* Autor com foto */}
        <button
          onClick={() => navigate({ to: `/u/${authorProfile?.username || ""}` })}
          className="flex items-center gap-2 hover:opacity-80 transition w-full">
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
            style={{ background: authorProfile?.avatar_url ? "transparent" : "#5B3FCF" }}>
            {authorProfile?.avatar_url ? (
              <img src={authorProfile.avatar_url} alt={authorProfile.username} className="w-full h-full object-cover" />
            ) : (
              (book.author_name?.[0] ?? "?").toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{book.author_name}</p>
            <p className="text-[10px] text-neutral-500 truncate">@{authorProfile?.username}</p>
          </div>
        </button>

        {/* Rating */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <button
              key={i}
              onClick={() => rateBook(i)}
              disabled={saving}
              className="text-sm transition hover:scale-125 disabled:opacity-50"
              style={{ opacity: i <= (rating || Math.round(book.average_rating || 0)) ? 1 : 0.3 }}>
              ⭐
            </button>
          ))}
          <span className="text-[10px] text-neutral-500 ml-1">
            {(book.average_rating || 0).toFixed(1)} ({book.rating_count || 0})
          </span>
        </div>

        {/* Título + Descrição */}
        <div>
          <p className="text-sm font-bold line-clamp-2">{book.title}</p>
          {book.description && (
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400 line-clamp-2 mt-1">
              {book.description}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-2 text-[10px] text-neutral-500">
          {book.downloads_count !== undefined && (
            <span>📥 {book.downloads_count} downloads</span>
          )}
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleToggleSave}
            disabled={saving}
            className="flex-1 h-8 rounded-lg font-semibold text-xs transition active:scale-95 border flex items-center justify-center gap-1"
            style={{
              background: isSaved ? "#5B3FCF" : "transparent",
              color: isSaved ? "white" : "#5B3FCF",
              borderColor: "#5B3FCF",
            }}>
            <Bookmark className="h-3.5 w-3.5" fill={isSaved ? "white" : "none"} />
            {isSaved ? "Guardado" : "Guardar"}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 h-8 rounded-lg font-semibold text-xs text-white transition active:scale-95 flex items-center justify-center gap-1"
            style={{ background: "#5B3FCF", opacity: downloading ? 0.7 : 1 }}>
            <Download className="h-3.5 w-3.5" />
            {downloading ? "..." : "Baixar"}
          </button>
        </div>
      </div>
    </div>
  );
}
