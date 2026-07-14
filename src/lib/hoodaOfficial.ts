import { supabase } from "@/integrations/supabase/client";

/**
 * Id da conta "Snapper Oficial" (admin). Esta conta nunca deve aparecer em
 * pesquisas, sugestões de "seguir", ou no modal de "adicionar contacto" —
 * um utilizador normal nunca deve conseguir encontrá-la e abrir uma conversa
 * comum com ela; só o admin, a partir do painel, é que fala com utilizadores
 * (e sempre marcado como "comunicação oficial", nunca como conversa normal).
 *
 * Faz cache em memória para o separador atual, para não pedir isto ao
 * servidor em cada pesquisa/keystroke.
 */
let cachedOfficialId: string | null | undefined;
let inFlight: Promise<string | null> | null = null;

export async function getSnapperOfficialId(): Promise<string | null> {
  if (cachedOfficialId !== undefined) return cachedOfficialId;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_hooda_official_id");
      cachedOfficialId = error ? null : (data ?? null);
    } catch {
      cachedOfficialId = null;
    }
    inFlight = null;
    return cachedOfficialId ?? null;
  })();
  return inFlight;
}
