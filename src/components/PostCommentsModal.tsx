import { t } from "@/lib/useT";
import React, { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/hooks/useScrollLock";
import { CommentsListSkeleton } from "@/components/Skeletons";
import { createPortal } from "react-dom";
import { X, Send, Loader, Smile, Heart } from "lucide-react";
import { pauseAllVideos, incrementModalDepth, decrementModalDepth } from "@/lib/mediaManager";

/* ─── Error Boundary local — impede que erros nos comentários derrubem a página ─── */
class CommentsErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("[hooda:comments] erro no modal de comentários:", err, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={this.props.onClose}
        >
          <div
            className="w-full lg:max-w-sm lg:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet"
            style={{ maxHeight: "50vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="text-sm font-extrabold">{t("common.comments")}</span>
              <button
                onClick={this.props.onClose}
                className="p-1.5 rounded-full hover:bg-neutral-100"
              >
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 px-8 text-center">
              <span className="text-3xl">💬</span>
              <p className="font-semibold text-neutral-700 text-sm">
                Não foi possível carregar os comentários
              </p>
              <p className="text-xs text-neutral-400">Tenta novamente mais tarde.</p>
              <button
                onClick={this.props.onClose}
                className="mt-2 px-5 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * PostCommentsModal — modal de comentários estilo Facebook.
 *
 * Em vez de um pequeno popup que tapa a publicação, este modal abre
 * em ecrã cheio mostrando a publicação inteira (imagem/vídeo/texto)
 * no topo, seguida da lista de comentários, com a caixa de escrever
 * sempre fixa no fundo.
 *
 * Cada comentário tem, à la Facebook: "Gostei · Responder · tempo",
 * pode ser curtido (com contador) e pode ter respostas encadeadas
 * por baixo (indentadas, com a sua própria caixa de "Responder a X").
 *
 * Uso:
 *   <PostCommentsModal
 *     onClose={...}
 *     header={<...avatar + nome + tempo...>}
 *     body={<...imagem/vídeo/texto da publicação...>}
 *     actions={<...curtir/comentar/partilhar...>}
 *     comments={[{ id, authorName, authorColor, authorPhoto, text, time, likeCount, likedByMe, replies: [...] }]}
 *     onSend={(text) => {...}}
 *     onLikeComment={(commentId) => {...}}      // opcional
 *     onReply={(parentId, text) => {...}}        // opcional
 *     loading={false}
 *   />
 */

export type PostComment = {
  id: string;
  authorId?: string;
  authorName: string;
  authorColor?: string;
  authorPhoto?: string;
  text: string;
  time: string;
  likeCount?: number;
  likedByMe?: boolean;
  replies?: PostComment[];
};

function CommentRow({
  c,
  accent,
  isReply,
  creatorId,
  onToggleLike,
  onStartReply,
  replyingTo,
  replyInput,
  setReplyInput,
  onSendReply,
  sendingReply,
}: {
  c: PostComment;
  accent: string;
  isReply?: boolean;
  creatorId?: string;
  onToggleLike: (id: string) => void;
  onStartReply: (id: string | null) => void;
  replyingTo: string | null;
  replyInput: string;
  setReplyInput: (v: string) => void;
  onSendReply: (parentId: string) => void;
  sendingReply?: boolean;
}) {
  const liked = !!c.likedByMe;
  const likeCount = c.likeCount ?? 0;
  const hasReplies = !!c.replies && c.replies.length > 0;
  const [showReplies, setShowReplies] = useState(true);

  return (
    <div className={isReply ? "pl-3" : ""}>
      <div className="flex items-start gap-3">
        <div
          className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 overflow-hidden ${isReply ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"}`}
          style={{ background: c.authorColor || accent }}
        >
          {c.authorPhoto ? (
            <img src={c.authorPhoto} alt="" className="w-full h-full object-cover" />
          ) : (
            (c.authorName?.[0]?.toUpperCase() ?? "?")
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-neutral-50 rounded-2xl px-3 py-2 inline-block max-w-full">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-[11px] font-bold text-neutral-500">{c.authorName}</p>
              {creatorId && c.authorId && c.authorId === creatorId && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: accent + "20", color: accent, border: `1px solid ${accent}40` }}>
                  ✦ Criador
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-800 whitespace-pre-line break-words">{c.text}</p>
          </div>
          {/* Linha de ações: Gostei · Responder · tempo · curtidas, como o Facebook */}
          <div className="flex items-center gap-3 mt-1 px-1">
            <span className="text-[11px] text-neutral-400">{c.time}</span>
            <button
              onClick={() => onToggleLike(c.id)}
              className="text-[11px] font-bold transition"
              style={{ color: liked ? accent : "#737373" }}
            >
              Gostei
            </button>
            <button
              onClick={() => onStartReply(replyingTo === c.id ? null : c.id)}
              className="text-[11px] font-bold text-neutral-500 hover:text-neutral-700 transition"
            >
              Responder
            </button>
            <span className="flex items-center gap-1 text-[11px] text-neutral-400 ml-auto">
              <Heart className="h-3 w-3 fill-current" style={{ color: accent }} />
              {likeCount}
            </span>
          </div>

          {/* Caixa de resposta a este comentário */}
          {replyingTo === c.id && (
            <div className="flex items-center gap-2 mt-2">
              <input
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSendReply(c.id)}
                placeholder={`Responder a ${c.authorName}…`}
                className="flex-1 h-8 px-3 rounded-full bg-neutral-100 text-xs outline-none focus:bg-white focus:ring-2 transition"
                style={{ "--tw-ring-color": accent + "33" } as React.CSSProperties}
                autoFocus
              />
              <button
                onClick={() => onSendReply(c.id)}
                disabled={!replyInput.trim() || sendingReply}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90 shrink-0"
                style={{ background: accent }}
              >
                {sendingReply ? (
                  <Loader className="h-3 w-3 text-white animate-spin" />
                ) : (
                  <Send className="h-3 w-3 text-white" />
                )}
              </button>
            </div>
          )}

          {/* Respostas encadeadas */}
          {hasReplies && (
            <div className="mt-2">
              {!showReplies ? (
                <button
                  onClick={() => setShowReplies(true)}
                  className="text-[11px] font-bold text-neutral-500 hover:text-neutral-700 pl-1"
                >
                  Ver {c.replies!.length} resposta{c.replies!.length !== 1 ? "s" : ""}
                </button>
              ) : (
                <div className="space-y-2 border-l-2 border-neutral-100 ml-1">
                  {c.replies!.map((r) => (
                    <CommentRow
                      key={r.id}
                      c={r}
                      accent={accent}
                      isReply
                      onToggleLike={onToggleLike}
                      onStartReply={onStartReply}
                      replyingTo={replyingTo}
                      replyInput={replyInput}
                      setReplyInput={setReplyInput}
                      onSendReply={onSendReply}
                      sendingReply={sendingReply}
                    />
                  ))}
                  {c.replies!.length > 1 && (
                    <button
                      onClick={() => setShowReplies(false)}
                      className="text-[11px] font-bold text-neutral-500 hover:text-neutral-700 pl-1"
                    >
                      Ocultar respostas
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCommentsModalInner({
  onClose,
  header,
  body,
  actions,
  comments,
  onSend,
  onLikeComment,
  onReply,
  loading,
  sending,
  inputPlaceholder = "Escreve um comentário…",
  accent = "#5B3FCF",
  title = "Publicação",
  creatorId,
}: {
  onClose: () => void;
  header?: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  comments: PostComment[];
  onSend: (text: string) => void;
  /** Opcional: chamado quando o utilizador curte um comentário ou resposta (recebe o id). */
  onLikeComment?: (commentId: string) => void;
  /** Opcional: chamado quando o utilizador responde a um comentário (parentId, texto). */
  onReply?: (parentId: string, text: string) => void;
  loading?: boolean;
  sending?: boolean;
  inputPlaceholder?: string;
  accent?: string;
  title?: string;
  creatorId?: string;
}) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Estado local de likes/respostas
  const [localLikes, setLocalLikes] = useState<Record<string, { liked: boolean; count: number }>>(
    {},
  );
  const [localReplies, setLocalReplies] = useState<Record<string, PostComment[]>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  useScrollLock(); // bloqueia scroll do body enquanto modal está aberto

  // Foca o input após o modal estar totalmente montado (sem interferir com vídeo)
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  // Ao montar: pausa tudo e regista modal aberto.
  // Ao desmontar: decrementa contador de modais.
  useEffect(() => {
    pauseAllVideos();
    incrementModalDepth();
    return () => {
      decrementModalDepth();
    };
  }, []);

  function findComment(id: string, list: PostComment[]): PostComment | null {
    for (const c of list) {
      if (c.id === id) return c;
      const inReplies = [...(c.replies || []), ...(localReplies[c.id] || [])];
      const found = inReplies.find((r) => r.id === id);
      if (found) return found;
    }
    return null;
  }

  function toggleLike(commentId: string) {
    const existing = localLikes[commentId];
    const base = findComment(commentId, comments);
    const baseLiked = existing?.liked ?? base?.likedByMe ?? false;
    const baseCount = existing?.count ?? base?.likeCount ?? 0;
    setLocalLikes((prev) => ({
      ...prev,
      [commentId]: { liked: !baseLiked, count: baseLiked ? baseCount - 1 : baseCount + 1 },
    }));
    onLikeComment?.(commentId);
  }

  function withLocalState(list: PostComment[]): PostComment[] {
    return list.map((c) => {
      const like = localLikes[c.id];
      const extraReplies = localReplies[c.id] || [];
      return {
        ...c,
        likedByMe: like ? like.liked : c.likedByMe,
        likeCount: like ? like.count : c.likeCount,
        replies: [...withLocalState(c.replies || []), ...withLocalState(extraReplies)],
      };
    });
  }

  function handleSendReply(parentId: string) {
    const txt = replyInput.trim();
    if (!txt) return;
    // Não adicionar localmente — o pai (handleReplyComment) já atualiza o estado após inserir na DB
    onReply?.(parentId, txt);
    setReplyInput("");
    setReplyingTo(null);
  }

  function handleSend() {
    const txt = input.trim();
    if (!txt) return;
    onSend(txt);
    setInput("");
    setTimeout(
      () => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
      80,
    );
  }

  const displayComments = withLocalState(comments);
  const hasMedia = !!body;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
      style={{ background: hasMedia ? "#000" : "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`w-full flex flex-col overflow-hidden shadow-2xl hooda-modal-sheet rounded-t-3xl ${
          hasMedia
            ? "lg:flex-row lg:rounded-none lg:max-w-[1100px] lg:w-[92vw]"
            : "lg:max-w-sm lg:rounded-3xl"
        }`}
        style={{ maxHeight: "92vh", height: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Painel de mídia — só em desktop e só quando há foto/vídeo */}
        {hasMedia && (
          <div className="hidden lg:flex lg:flex-1 min-w-0 items-center justify-center relative shrink-0" style={{ background: "#000" }}>
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center z-10 transition active:scale-90"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <X className="h-5 w-5 text-white" />
            </button>
            <div className="w-full h-full flex items-center justify-center px-6 py-6" style={{ minWidth: 0 }}>
              {body}
            </div>
          </div>
        )}

        {/* Coluna direita (desktop) / coluna única (mobile) */}
        <div
          className={`flex flex-col shrink-0 ${hasMedia ? "lg:w-[420px] lg:h-full bg-white" : "w-full"}`}
          style={!hasMedia ? { height: "100%" } : undefined}
        >
          {/* Drag indicator (mobile) */}
          <div className="flex justify-center pt-2.5 pb-0 shrink-0 lg:hidden">
            <div className="w-10 h-1 rounded-full" style={{ background: "#E5E7EB" }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
            <span className="text-sm font-extrabold">{title}</span>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 lg:hidden">
              <X className="h-5 w-5 text-neutral-500" />
            </button>
          </div>

          {/* Scrollable: post + actions + comments, tudo num scroll só, como o Facebook */}
          <div ref={listRef} className="overflow-y-auto flex-1">
            {/* Publicação inteira no topo — em desktop com mídia, a mídia já está no painel esquerdo, então só mostra header/actions aqui */}
            {(header || (body && !hasMedia)) && (
              <div className="border-b border-neutral-100">
                {header && <div className="px-4 pt-3">{header}</div>}
                {body && <div className={hasMedia ? "pt-2 lg:hidden" : "pt-2"}>{body}</div>}
                {actions && <div className="px-4 pb-1">{actions}</div>}
              </div>
            )}

            {/* Lista de comentários */}
            <div className="px-4 py-3 space-y-4">
              {loading ? (
                <CommentsListSkeleton />
              ) : displayComments.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-8">Sê o primeiro a comentar!</p>
              ) : (
                <div className="hooda-fade-in space-y-4">
                {displayComments.map((c) => (
                  <CommentRow
                    key={c.id}
                    c={c}
                    accent={accent}
                    onToggleLike={toggleLike}
                    onStartReply={setReplyingTo}
                    replyingTo={replyingTo}
                    replyInput={replyInput}
                    setReplyInput={setReplyInput}
                    onSendReply={handleSendReply}
                  />
                ))}
                </div>
              )}
            </div>
          </div>

          {/* Caixa de comentar — sempre fixa no fundo */}
          <div className="px-4 py-3 border-t border-neutral-100 flex items-center gap-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] shrink-0 hooda-modal-sheet">
            <button className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-neutral-400 hover:text-neutral-600 transition">
              <Smile className="h-[18px] w-[18px]" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={inputPlaceholder}
              ref={inputRef}
              className="flex-1 h-10 px-4 rounded-full bg-neutral-100 text-sm outline-none focus:ring-2 transition"
              style={{ "--tw-ring-color": accent + "33" } as React.CSSProperties}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90 shrink-0"
              style={{ background: accent }}
            >
              {sending ? (
                <Loader className="h-4 w-4 text-white animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Versão pública — envolvida com Error Boundary para que erros internos
 *  não derrubem a página inteira. */
export function PostCommentsModal(props: Parameters<typeof PostCommentsModalInner>[0] & { creatorId?: string }) {
  return (
    <CommentsErrorBoundary onClose={props.onClose}>
      <PostCommentsModalInner {...props} />
    </CommentsErrorBoundary>
  );
}
