// ── Skeleton Loading — placeholders animados estilo Instagram/Facebook/TikTok ──
// Usados enquanto o conteúdo real ainda não chegou, para nunca mostrar telas
// vazias ou spinners isolados. Sempre que possível, dados já em cache
// (React Query + persistência local) substituem estes skeletons instantaneamente.

import type { CSSProperties } from "react";

function Shimmer({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md ${className}`}
      style={{ background: "var(--surface-2,#e9e9e4)", ...style }}
    >
      <div className="skeleton-shimmer absolute inset-0" />
    </div>
  );
}

/**
 * Skeleton circular para Stories — exatamente 56×56px (h-14 w-14) + label
 * para evitar CLS ao carregar a secção de stories.
 */
export function StorySkeleton() {
  return (
    <li className="flex flex-col items-center gap-1 shrink-0">
      {/* Anel exterior — mesmo tamanho do story real (h-14 w-14) */}
      <div
        className="h-14 w-14 rounded-full relative overflow-hidden flex-shrink-0"
        style={{ background: "var(--surface-2,#e9e9e4)" }}
      >
        <div className="skeleton-shimmer absolute inset-0" />
      </div>
      {/* Label — mesmo w-14 do story real */}
      <Shimmer className="h-2.5 w-10 rounded-full" />
    </li>
  );
}

/** Linha completa de Stories skeletons — mesma altura que a lista real (108px). */
export function StoriesRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section
      className="border-b"
      style={{
        background: "var(--surface-0)",
        borderColor: "var(--border-subtle)",
        minHeight: 108,
      }}
    >
      <ul className="flex gap-4 overflow-x-auto px-4 py-4 no-scrollbar">
        {Array.from({ length: count }).map((_, i) => (
          <StorySkeleton key={i} />
        ))}
      </ul>
    </section>
  );
}

/** Um post no feed, no formato do PostCard real (avatar + linhas + corpo). */
export function PostCardSkeleton() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{ background: "var(--surface-0,#fff)", border: "1px solid var(--border-subtle,#eee)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Shimmer className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-28" />
          <Shimmer className="h-2.5 w-16" />
        </div>
      </div>
      <Shimmer className="h-3 w-full mb-2" />
      <Shimmer className="h-3 w-4/5 mb-3" />
      <Shimmer className="h-44 w-full rounded-xl" />
      <div className="flex items-center gap-4 mt-3">
        <Shimmer className="h-4 w-10" />
        <Shimmer className="h-4 w-10" />
        <Shimmer className="h-4 w-10" />
      </div>
    </div>
  );
}

/** Lista de skeletons de posts — usado no primeiro load do feed. */
export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Uma linha de conversa, no formato do ContactList real. */
export function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <Shimmer className="h-12 w-12 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-2.5 w-8" />
        </div>
        <Shimmer className="h-2.5 w-40" />
      </div>
    </div>
  );
}

/** Lista de skeletons de conversas — usado no primeiro load da lista de mensagens. */
export function ConversationListSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <ConversationSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton do cabeçalho de Perfil (/perfil e /u/$username).
 * Reserva EXATAMENTE o mesmo espaço do conteúdo real:
 *  - Capa: h-32 (128px)
 *  - Avatar: 80px, deslocado -42px da capa (mesmo offset do real)
 *  - Botões de ação: h-8 (32px aprox, py-1.5 + texto)
 *  - Nome / username / bio: 3 linhas de altura fixa
 *  - Stats: grid 3 colunas, py-3 (mesma altura das cards reais)
 * Isto elimina qualquer Layout Shift (CLS) entre o skeleton e o
 * conteúdo final — só o conteúdo interno das caixas muda, nunca o tamanho.
 */
export function ProfileHeaderSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Capa — mesma altura (h-32 = 128px) do header real */}
      <div className="h-32 relative" style={{ background: "var(--surface-2,#e9e9e4)" }}>
        <div className="absolute left-5" style={{ bottom: -42 }}>
          <div className="rounded-full p-[3px]" style={{ background: "var(--surface-1,#f3f3ee)" }}>
            <div className="rounded-full p-[2px] bg-white">
              <Shimmer className="rounded-full" style={{ width: 80, height: 80 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Botões de ação — mesma posição/altura dos botões reais */}
      <div className="flex justify-end gap-2 px-4 pt-3">
        <Shimmer className="rounded-full" style={{ width: 96, height: 30 }} />
        <Shimmer className="rounded-full" style={{ width: 84, height: 30 }} />
      </div>

      {/* Nome / username / bio — mesmo bloco pt-10 pb-3 do real */}
      <div className="px-5 pt-10 pb-3 space-y-2">
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-3.5 w-28" />
        <Shimmer className="h-3 w-full max-w-xs" />
      </div>

      {/* Stats — mesma grid 3 colunas e mesma altura (py-3) das cards reais */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-white border border-neutral-100 rounded-2xl py-3 flex flex-col items-center gap-1.5 shadow-sm"
          >
            <Shimmer className="h-4 w-8" />
            <Shimmer className="h-2.5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton de uma publicação na lista de perfil — mesmo layout do <article> real. */
export function ProfilePostSkeleton() {
  return (
    <div className="bg-white border-b border-neutral-100 animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3">
        <Shimmer className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-32" />
          <Shimmer className="h-2.5 w-20" />
        </div>
      </div>
      <div className="px-4 pb-3 space-y-2">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-4/5" />
      </div>
      <div className="flex items-center px-3 pb-3 pt-2 gap-3">
        <Shimmer className="h-5 w-10" />
        <Shimmer className="h-5 w-10" />
        <Shimmer className="h-5 w-10" />
      </div>
    </div>
  );
}

/** Lista de skeletons de publicações do perfil — usado no primeiro load. */
export function ProfilePostsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="pb-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProfilePostSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton de um comentário — mesmo layout do CommentRow real (avatar 8x8 + balão). */
export function CommentRowSkeleton() {
  return (
    <div className="flex items-start gap-3 animate-pulse">
      <Shimmer className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Shimmer className="h-9 w-3/4 rounded-2xl" />
        <div className="flex items-center gap-3 px-1">
          <Shimmer className="h-2.5 w-8" />
          <Shimmer className="h-2.5 w-10" />
          <Shimmer className="h-2.5 w-12" />
        </div>
      </div>
    </div>
  );
}

/** Lista de skeletons de comentários — mesmo container (space-y-4) do real. */
export function CommentsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <CommentRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Pequeno indicador "atualizando em segundo plano" — discreto, nunca bloqueia a tela. */
export function BackgroundRefreshDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
      style={{ background: "#5B3FCF" }}
      aria-label="Atualizando"
      title="Atualizando…"
    />
  );
}
