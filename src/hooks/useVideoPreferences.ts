import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QualityMode, ResolutionLabel, VideoPreference } from "@/lib/videoQuality";

/**
 * useVideoPreferences — preferência global de qualidade de vídeo.
 *
 * Fluxo (ponto 2/3 do sistema): o utilizador escolhe uma vez ("Usar
 * 480p", "Economia de dados", ...) e essa escolha aplica-se a TODOS os
 * próximos vídeos, em qualquer sessão/dispositivo — gravada na tabela
 * video_preferences via a RPC set_video_preference. Também guardamos uma
 * cópia em localStorage para o player poder decidir a qualidade inicial
 * instantaneamente, sem esperar pelo round-trip ao Supabase.
 */

const LOCAL_KEY = "hooda_video_pref_v1";
export const VIDEO_PREF_QUERY_KEY = ["video-preferences"] as const;

const DEFAULT_PREF: VideoPreference = {
  quality_mode: "auto",
  preferred_resolution: null,
  data_saver_enabled: false,
};

function readLocal(): VideoPreference {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREF;
    return { ...DEFAULT_PREF, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREF;
  }
}

function writeLocal(pref: VideoPreference) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(pref));
  } catch {
    /* ignora — localStorage pode estar indisponível (modo privado, etc.) */
  }
}

/** Leitura síncrona instantânea — usada pelo player no primeiro render,
 * antes do React Query ter tido tempo de ir buscar a versão do servidor. */
export function getCachedVideoPreference(): VideoPreference {
  return readLocal();
}

export function useVideoPreferences() {
  const qc = useQueryClient();
  const [optimistic, setOptimistic] = useState<VideoPreference>(readLocal);

  const query = useQuery({
    queryKey: VIDEO_PREF_QUERY_KEY,
    queryFn: async (): Promise<VideoPreference> => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return readLocal();

      // `video_preferences` é criada pela migração deste sistema; os tipos
      // gerados do Supabase só a incluem depois da migração correr contra
      // a base de dados real e o `supabase gen types` ser refeito.
      const { data, error } = await (supabase as any)
        .from("video_preferences")
        .select("quality_mode, preferred_resolution, data_saver_enabled")
        .eq("user_id", sessionData.session.user.id)
        .maybeSingle();

      if (error || !data) return readLocal();

      const pref: VideoPreference = {
        quality_mode: data.quality_mode as QualityMode,
        preferred_resolution: (data.preferred_resolution as ResolutionLabel) ?? null,
        data_saver_enabled: !!data.data_saver_enabled,
      };
      writeLocal(pref);
      return pref;
    },
    staleTime: 5 * 60 * 1000,
    initialData: readLocal,
  });

  useEffect(() => {
    if (query.data) setOptimistic(query.data);
  }, [query.data]);

  const setPreference = useCallback(
    async (
      quality_mode: QualityMode,
      preferred_resolution: ResolutionLabel | null = null,
      data_saver_enabled = false,
    ) => {
      const next: VideoPreference = { quality_mode, preferred_resolution, data_saver_enabled };

      // Aplica já ao player atual e a todos os próximos, sem esperar a rede.
      writeLocal(next);
      setOptimistic(next);
      qc.setQueryData(VIDEO_PREF_QUERY_KEY, next);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return; // convidado: só guarda localmente

      await (supabase as any).rpc("set_video_preference", {
        p_quality_mode: quality_mode,
        p_preferred_resolution: preferred_resolution,
        p_data_saver_enabled: data_saver_enabled,
      });
    },
    [qc],
  );

  return {
    preference: optimistic,
    isLoading: query.isLoading,
    setPreference,
  };
}
