/**
 * useTrackEvent — hook central para registar sinais de comportamento
 * (Fase 1 da IA da Hooda). Fire-and-forget: nunca bloqueia a UI e
 * nunca quebra a experiência se falhar.
 *
 * A IA usa estes eventos para construir o perfil dinâmico de interesses
 * de cada utilizador. Ver migração `user_events` + `user_interest_scores`.
 */
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TrackEventType =
  | "view"
  | "dwell"
  | "click"
  | "like"
  | "unlike"
  | "comment"
  | "share"
  | "save"
  | "unsave"
  | "follow"
  | "unfollow"
  | "search"
  | "profile_visit"
  | "channel_visit"
  | "reaction"
  | "hide"
  | "report"
  | "not_interested"
  | "sensitive_view"
  | "sensitive_hide";

export interface TrackEventInput {
  type: TrackEventType;
  targetType?: string;   // "post" | "video" | "channel" | "user" | "book" | ...
  targetId?: string;
  authorId?: string | null;
  category?: string | null;
  weight?: number;       // peso do sinal (like=3, view=1, dwell longo=2, share=5, hide=-3)
  dwellMs?: number;
  context?: Record<string, unknown>;
}

// Sessão local (por aba) — útil para agrupar eventos sem depender de auth
function getSessionId(): string {
  const KEY = "hooda_track_session";
  try {
    let s = sessionStorage.getItem(KEY);
    if (!s) {
      s = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(KEY, s);
    }
    return s;
  } catch {
    return "no-session";
  }
}

const DEFAULT_WEIGHTS: Record<TrackEventType, number> = {
  view: 1,
  dwell: 2,
  click: 1,
  like: 3,
  unlike: -3,
  comment: 4,
  share: 5,
  save: 4,
  unsave: -2,
  follow: 6,
  unfollow: -3,
  search: 2,
  profile_visit: 2,
  channel_visit: 2,
  reaction: 2,
  hide: -4,
  report: -6,
  not_interested: -5,
  sensitive_view: 1,
  sensitive_hide: -4,
};

export function useTrackEvent() {
  const sessionId = useMemo(() => getSessionId(), []);

  const track = useCallback(async (ev: TrackEventInput): Promise<void> => {
    try {
      const weight = ev.weight ?? DEFAULT_WEIGHTS[ev.type] ?? 1;
      await (supabase as any).rpc("track_event", {
        p_event_type:  ev.type,
        p_target_type: ev.targetType ?? null,
        p_target_id:   ev.targetId ?? null,
        p_author_id:   ev.authorId ?? null,
        p_category:    ev.category ?? null,
        p_weight:      weight,
        p_dwell_ms:    ev.dwellMs ?? null,
        p_session_id:  sessionId,
        p_context:     ev.context ?? {},
      });
    } catch {
      // silencioso — sinais nunca podem quebrar a UI
    }
  }, [sessionId]);

  return { track };
}

/** Versão global (sem hook) para usar fora de componentes React. */
export async function trackEvent(ev: TrackEventInput): Promise<void> {
  try {
    const weight = ev.weight ?? DEFAULT_WEIGHTS[ev.type] ?? 1;
    await (supabase as any).rpc("track_event", {
      p_event_type:  ev.type,
      p_target_type: ev.targetType ?? null,
      p_target_id:   ev.targetId ?? null,
      p_author_id:   ev.authorId ?? null,
      p_category:    ev.category ?? null,
      p_weight:      weight,
      p_dwell_ms:    ev.dwellMs ?? null,
      p_session_id:  getSessionId(),
      p_context:     ev.context ?? {},
    });
  } catch {
    // silencioso
  }
}
