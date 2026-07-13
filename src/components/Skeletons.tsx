// ── Skeleton Loading — placeholders animados estilo Instagram/Facebook/TikTok ──
// Usados enquanto o conteúdo real ainda não chegou, para nunca mostrar telas
// vazias ou spinners isolados. Sempre que possível, dados já em cache
// (React Query + persistência local) substituem estes skeletons instantaneamente.
//
// ─────────────────────────────────────────────────────────────────────────
// Antes: 9 componentes (PostCardSkeleton, FeedSkeleton, ConversationSkeleton,
// ConversationListSkeleton, ProfileHeaderSkeleton, ProfilePostSkeleton,
// ProfilePostsSkeleton, CommentRowSkeleton, CommentsListSkeleton) — cada
// layout novo pedia um componente novo, mesmo quando a forma real (avatar +
// linhas + bloco) já se repetia.
//
// Agora: UM componente, `UniversalSkeleton`, parametrizado por `variant` +
// `count`. Cada variant reproduz EXATAMENTE a geometria do layout real que
// substitui (mesmas alturas, mesmos offsets), para nunca causar Layout
// Shift — só o miolo (Shimmer) é genérico, a forma de fora não é.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from "react";

function Shimmer({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md ${className}`}
      style={{ background: "var(--s2)", ...style }}
    >
      <div className="skeleton-shimmer absolute inset-0" />
    </div>
  );
}

export type UniversalSkeletonVariant =
  | "feed" // post do feed: avatar + linhas + corpo + mídia + ações (PostCard)
  | "profile" // cabeçalho de perfil: capa + avatar + botões + nome/bio + stats
  | "video-grid" // grade de vídeos/mídia (Studio, BayaTV): aspect-square em grid
  | "messages" // linha de conversa: avatar + nome/hora + prévia (ContactList)
  | "chat-bubbles" // bolhas de mensagem alternadas esq/dir dentro de uma conversa aberta
  | "explorar" // linha de pessoa sugerida: avatar + nome/username + botão seguir
  | "circle-list" // fileira horizontal de avatares circulares com legenda
  | "generic"; // linha genérica: avatar + bolha de texto + meta (comentários, etc.)

/* ── Formas internas de cada variant — 1 unidade, sem loop ── */

function FeedItem() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}
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

function MessageItem() {
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

function ChatBubbleItem({ isMe, width }: { isMe: boolean; width: number }) {
  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} px-3 py-1 animate-pulse`}>
      <Shimmer className="rounded-2xl" style={{ width, height: 34 }} />
    </div>
  );
}


function ExplorarItem() {
  // Mesma geometria do PersonCard real em explorar.tsx: avatar 40 + duas
  // linhas de texto + botão de ação à direita — para o layout não saltar
  // quando a lista de pessoas sugeridas chega.
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-2xl border animate-pulse"
      style={{ borderColor: "var(--border-subtle)", background: "var(--s0)" }}
    >
      <Shimmer className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Shimmer className="h-3.5 w-32" />
        <Shimmer className="h-2.5 w-20" />
      </div>
      <Shimmer className="h-7 w-24 rounded-full shrink-0" />
    </div>
  );
}

function VideoGridItem() {
  // Mesma grid do Studio/BayaTV: aspect-square dentro de um cartão
  // arredondado com borda — grid-cols aplicado pelo wrapper do variant.
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}
    >
      <Shimmer className="aspect-square w-full rounded-none" />
    </div>
  );
}

function CircleListItem() {
  return (
    <div
      className="flex flex-col items-center gap-1.5 animate-pulse shrink-0"
      style={{ width: 68 }}
    >
      <Shimmer className="rounded-full" style={{ width: 56, height: 56 }} />
      <Shimmer className="h-2.5 w-10" />
    </div>
  );
}

function GenericItem() {
  // Linha avatar + bolha de texto + meta — forma reaproveitável para
  // comentários e qualquer outra lista simples de "quem disse o quê".
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

function ProfileHeader() {
  // Mesma geometria do cabeçalho real: capa h-32, avatar 80px deslocado
  // -42px, botões de ação, nome/username/bio, stats em grid de 3 colunas.
  return (
    <div className="animate-pulse">
      <div className="h-32 relative" style={{ background: "var(--s2)" }}>
        <div className="absolute left-5" style={{ bottom: -42 }}>
          <div className="rounded-full p-[3px]" style={{ background: "var(--s1)" }}>
            <div className="rounded-full p-[2px]" style={{ background: "var(--s0)" }}>
              <Shimmer className="rounded-full" style={{ width: 80, height: 80 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 px-4 pt-3">
        <Shimmer className="rounded-full" style={{ width: 96, height: 30 }} />
        <Shimmer className="rounded-full" style={{ width: 84, height: 30 }} />
      </div>

      <div className="px-5 pt-10 pb-3 space-y-2">
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-3.5 w-28" />
        <Shimmer className="h-3 w-full max-w-xs" />
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl py-3 flex flex-col items-center gap-1.5"
            style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}
          >
            <Shimmer className="h-4 w-8" />
            <Shimmer className="h-2.5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton Universal — substitui todos os skeletons específicos que
 * existiam neste ficheiro. Escolhe a forma certa por `variant` e repete
 * `count` vezes quando o layout real é uma lista (feed/messages/etc.);
 * `variant="profile"` é uma peça única (cabeçalho), `count` não se aplica.
 */
export function UniversalSkeleton({
  variant,
  count,
}: {
  variant: UniversalSkeletonVariant;
  count?: number;
}) {
  switch (variant) {
    case "feed":
      return (
        <div className="space-y-3">
          {Array.from({ length: count ?? 4 }).map((_, i) => (
            <FeedItem key={i} />
          ))}
        </div>
      );

    case "messages":
      return (
        <div>
          {Array.from({ length: count ?? 7 }).map((_, i) => (
            <MessageItem key={i} />
          ))}
        </div>
      );

    case "chat-bubbles": {
      // Padrão fixo (não aleatório) para nunca "saltar" entre renders —
      // alterna esq/dir com larguras variadas, como uma conversa real.
      const pattern: Array<{ isMe: boolean; width: number }> = [
        { isMe: false, width: 160 }, { isMe: false, width: 90 },
        { isMe: true, width: 130 },
        { isMe: false, width: 200 },
        { isMe: true, width: 80 }, { isMe: true, width: 150 },
        { isMe: false, width: 110 },
        { isMe: true, width: 170 },
      ];
      return (
        <div className="flex flex-col justify-end min-h-full py-3">
          {pattern.slice(0, count ?? pattern.length).map((p, i) => (
            <ChatBubbleItem key={i} isMe={p.isMe} width={p.width} />
          ))}
        </div>
      );
    }

    case "explorar":
      return (
        <div className="space-y-2">
          {Array.from({ length: count ?? 3 }).map((_, i) => (
            <ExplorarItem key={i} />
          ))}
        </div>
      );

    case "video-grid":
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
          {Array.from({ length: count ?? 8 }).map((_, i) => (
            <VideoGridItem key={i} />
          ))}
        </div>
      );

    case "circle-list":
      return (
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 py-2">
          {Array.from({ length: count ?? 6 }).map((_, i) => (
            <CircleListItem key={i} />
          ))}
        </div>
      );

    case "profile":
      return <ProfileHeader />;

    case "generic":
    default:
      return (
        <div className="space-y-4">
          {Array.from({ length: count ?? 5 }).map((_, i) => (
            <GenericItem key={i} />
          ))}
        </div>
      );
  }
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
