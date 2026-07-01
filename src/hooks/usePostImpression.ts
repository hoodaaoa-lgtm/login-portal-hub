/**
 * usePostImpression — regista silenciosamente quanto tempo o utilizador
 * ficou a ver um post (dwell time). Usa IntersectionObserver para detetar
 * quando o post entra/sai do viewport. Só regista se ficar > 2s visível.
 *
 * Não bloqueia o render, não faz chamadas síncronas, não impacta performance.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const FLUSH_AFTER_MS   = 2_000;   // só regista se ficou > 2s
const DEBOUNCE_MS      = 30_000;  // não regista o mesmo post mais de 1x por 30s
const MAX_DWELL_MS     = 120_000; // cap: máximo 2 minutos por post

// Cache local para não fazer upserts duplicados dentro da mesma sessão
const _recentlyFlushed = new Map<string, number>();

export function usePostImpression(opts: {
  postId: string | null | undefined;
  authorId: string | null | undefined;
  userId: string | null | undefined;
  kind?: string;
  enabled?: boolean;
}) {
  const { postId, authorId, userId, kind, enabled = true } = opts;
  const ref = useRef<HTMLDivElement | null>(null);
  const enterTime = useRef<number | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !postId || !userId || !ref.current) return;

    const el = ref.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // Post entrou no viewport
          enterTime.current = Date.now();

          // Agendar flush após FLUSH_AFTER_MS
          if (flushTimer.current) clearTimeout(flushTimer.current);
          flushTimer.current = setTimeout(() => {
            flush();
          }, FLUSH_AFTER_MS);
        } else {
          // Post saiu do viewport
          if (flushTimer.current) clearTimeout(flushTimer.current);
          flush();
        }
      },
      { threshold: 0.5 } // pelo menos 50% visível
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, userId, enabled]);

  function flush() {
    if (!enterTime.current || !postId || !userId) return;

    const dwell = Math.min(Date.now() - enterTime.current, MAX_DWELL_MS);
    enterTime.current = null;

    if (dwell < FLUSH_AFTER_MS) return; // muito rápido, não conta

    // Debounce: não registar o mesmo post várias vezes rápido
    const lastFlushed = _recentlyFlushed.get(postId) ?? 0;
    if (Date.now() - lastFlushed < DEBOUNCE_MS) return;
    _recentlyFlushed.set(postId, Date.now());

    // Gravar silenciosamente (fire & forget)
    ;(async () => {
      try {
        await (supabase as any)
          .from("post_impressions")
          .upsert(
            {
              user_id:   userId,
              post_id:   postId,
              author_id: authorId ?? null,
              dwell_ms:  dwell,
              kind:      kind ?? "post",
            },
            { onConflict: "user_id,post_id", ignoreDuplicates: false }
          );

        // Actualizar user_interests se dwell > 5s e há autor
        if (dwell > 5_000 && authorId && authorId !== userId) {
          const interestScore = Math.min(dwell / 1_000, 30); // máx 30 pontos por sessão
          await (supabase as any)
            .from("user_interests")
            .upsert(
              {
                user_id:      userId,
                author_id:    authorId,
                score:        interestScore,
                interactions: 1,
                updated_at:   new Date().toISOString(),
              },
              { onConflict: "user_id,author_id", ignoreDuplicates: false }
            )
            .select();
        }
      } catch {
        // silencioso — nunca deve quebrar a experiência do utilizador
      }
    })();
  }

  return ref;
}
