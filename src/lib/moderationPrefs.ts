import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type SensitivityMode = "auto" | "warn" | "hide";

export const SENSITIVITY_QUERY_KEY = ["sensitivity-mode"] as const;

export const SENSITIVITY_LABELS: Record<SensitivityMode, { title: string; description: string }> = {
  auto: {
    title: "Mostrar automaticamente",
    description: "Conteúdo sensível aparece sem desfoque nem aviso.",
  },
  warn: {
    title: "Mostrar apenas com aviso",
    description: "Conteúdo sensível fica desfocado com um aviso — tu escolhes ver ou não.",
  },
  hide: {
    title: "Ocultar completamente",
    description: "Conteúdo sensível não é mostrado no feed, pesquisa, perfil ou comentários.",
  },
};

/** Lê o modo de sensibilidade do utilizador autenticado (cacheado em
 * react-query — todos os componentes que usam este hook partilham o mesmo
 * pedido em vez de o repetir por cada post/comentário do ecrã). */
export function useSensitivityMode() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SENSITIVITY_QUERY_KEY,
    queryFn: async (): Promise<SensitivityMode> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return "warn";
      const { data, error } = await db.rpc("get_sensitivity_mode");
      if (error) {
        console.error("[hooda:moderation] falha ao obter modo de sensibilidade:", error);
        return "warn";
      }
      return (data as SensitivityMode) ?? "warn";
    },
    staleTime: 5 * 60 * 1000,
  });

  const setMode = useCallback(async (mode: SensitivityMode) => {
    queryClient.setQueryData(SENSITIVITY_QUERY_KEY, mode);
    const { error } = await db.rpc("set_sensitivity_mode", { p_mode: mode });
    if (error) {
      console.error("[hooda:moderation] falha ao gravar modo de sensibilidade:", error);
      queryClient.invalidateQueries({ queryKey: SENSITIVITY_QUERY_KEY });
      throw error;
    }
  }, [queryClient]);

  return { mode: (data ?? "warn") as SensitivityMode, isLoading, setMode };
}

/** Recorre da classificação de um post (só o autor pode). */
export async function appealPostModeration(postId: string, reason?: string) {
  const { error } = await db.rpc("appeal_moderation", { p_post_id: postId, p_reason: reason ?? null });
  if (error) throw error;
}
