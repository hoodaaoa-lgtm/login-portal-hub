import { supabase } from "@/integrations/supabase/client";

export type Rede = {
  id: string;
  username: string;
  nome: string;
  avatar_url: string | null;
  capa_url: string | null;
  categoria: string | null;
  tipo: "publica" | "privada" | "canal";
  tem_chat: boolean;
  descricao: string | null;
  regras: string | null;
  quem_publica: "todos" | "admins";
  quem_comenta: "todos" | "membros" | "admins";
  criador_id: string | null;
  conversation_id: string | null;
  membros_count: number;
  verificada: boolean;
  created_at: string;
};

export type MinhaRede = {
  id: string; username: string; nome: string; avatar_url: string | null;
  verificada: boolean; novidades: number;
};

export type RedeMembro = {
  rede_id: string; user_id: string; papel: "admin" | "moderador" | "membro";
  estado: "ativo" | "pendente"; joined_at: string;
  profile?: { username: string; full_name: string | null; avatar_url: string | null };
};

/** Rede pela @username — usada na página /redes/$username. */
export async function fetchRedeByUsername(username: string): Promise<Rede | null> {
  const { data, error } = await (supabase as any)
    .from("redes").select("*").eq("username", username.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data;
}

/** Meu estado de membro nessa Rede (ou null se não sou membro). */
export async function fetchMinhaAdesao(redeId: string, userId: string): Promise<RedeMembro | null> {
  const { data, error } = await (supabase as any)
    .from("rede_membros").select("*").eq("rede_id", redeId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Descobrir Redes públicas — feed de exploração /redes. */
export async function fetchRedesPublicas(opts?: { categoria?: string; termo?: string }): Promise<Rede[]> {
  let q = (supabase as any).from("redes").select("*").eq("tipo", "publica").order("membros_count", { ascending: false }).limit(40);
  if (opts?.categoria) q = q.eq("categoria", opts.categoria);
  if (opts?.termo) q = q.or(`nome.ilike.%${opts.termo}%,username.ilike.%${opts.termo}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Redes das quais sou membro, com contagem de novidades — usado na
 * barra de círculos no topo do feed principal. */
export async function fetchMinhasRedes(): Promise<MinhaRede[]> {
  const { data, error } = await (supabase as any).rpc("rede_minhas");
  if (error) throw error;
  return data ?? [];
}

export async function marcarRedeVista(redeId: string) {
  await (supabase as any).rpc("rede_marcar_vista", { p_rede_id: redeId });
}

export type CriarRedeInput = {
  username: string; nome: string; avatarUrl: string | null; categoria: string | null;
  tipo: "publica" | "privada" | "canal"; temChat: boolean;
};

export async function criarRede(input: CriarRedeInput): Promise<Rede> {
  const { data, error } = await (supabase as any).rpc("rede_criar", {
    p_username: input.username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ""),
    p_nome: input.nome.trim(),
    p_avatar_url: input.avatarUrl,
    p_categoria: input.categoria,
    p_tipo: input.tipo,
    p_tem_chat: input.temChat,
  });
  if (error) throw error;
  return data;
}

/** 'ativo' (entrou logo) ou 'pendente' (Rede privada, aguarda aprovação). */
export async function entrarNaRede(redeId: string): Promise<"ativo" | "pendente"> {
  const { data, error } = await (supabase as any).rpc("rede_entrar", { p_rede_id: redeId });
  if (error) throw error;
  return data;
}

export async function sairDaRede(redeId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("rede_sair", { p_rede_id: redeId });
  if (error) throw error;
}

export async function aprovarMembro(redeId: string, userId: string, aprovar: boolean): Promise<void> {
  const { error } = await (supabase as any).rpc("rede_aprovar_membro", { p_rede_id: redeId, p_user_id: userId, p_aprovar: aprovar });
  if (error) throw error;
}

export async function fetchMembros(redeId: string, estado: "ativo" | "pendente" = "ativo"): Promise<RedeMembro[]> {
  const { data, error } = await (supabase as any)
    .from("rede_membros")
    .select("rede_id,user_id,papel,estado,joined_at,profile:profiles(username,full_name,avatar_url)")
    .eq("rede_id", redeId).eq("estado", estado)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Publicações da Rede — mesma tabela `posts`, filtrada por rede_id. */
export async function fetchPostsDaRede(redeId: string, cursor?: string | null) {
  let q = (supabase as any).from("posts").select("*")
    .eq("rede_id", redeId).eq("is_draft", false)
    .order("created_at", { ascending: false }).limit(20);
  if (cursor) q = q.lt("created_at", cursor);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** IDs dos membros com papel 'admin' nesta Rede — usado para decidir se um
 * post aparece como voz oficial da Rede (sem "Publicado por") ou como
 * publicação de um membro comum (com atribuição, estilo Reddit). */
export async function fetchAdminIdsDaRede(redeId: string): Promise<Set<string>> {
  const { data, error } = await (supabase as any)
    .from("rede_membros").select("user_id").eq("rede_id", redeId).eq("papel", "admin").eq("estado", "ativo");
  if (error) throw error;
  return new Set((data ?? []).map((m: any) => m.user_id as string));
}

export async function atualizarConfigRede(redeId: string, patch: Partial<Rede>): Promise<void> {
  const { error } = await (supabase as any).from("redes").update(patch).eq("id", redeId);
  if (error) throw error;
}
