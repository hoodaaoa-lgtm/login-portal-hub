/**
 * Feed inteligente — duas camadas para nunca repetir conteúdo:
 *
 * 1) "Já mostrado" (este ficheiro): guardado no dispositivo, marca uma
 *    publicação como mostrada assim que ela aparece no ecrã — sem precisar
 *    de tempo de leitura. Resolve o caso mais comum: atualizar a página
 *    e ver logo a mesma publicação no topo outra vez.
 *
 * 2) post_impressions (Supabase): sinal mais forte — só conta quando o
 *    utilizador fica mesmo parado a olhar (>1.5s). Persiste entre
 *    dispositivos/sessões e é o que get_personalized_feed usa no servidor
 *    para nunca repetir a sério.
 *
 * As duas juntas: o servidor já não escolhe outra vez o que a IA marcou
 * como "visto"; e este ficheiro cobre o intervalo entre a publicação
 * aparecer no ecrã e esse sinal mais lento ser gravado.
 */

const MAX_TRACKED = 400;
const KEY_PREFIX = "hooda:feed-seen:";

function storageKey(uid: string) {
  return `${KEY_PREFIX}${uid}`;
}

/** IDs de publicações já mostradas a este utilizador (mais recentes por último). */
export function getSeenPostIds(uid: string): string[] {
  if (!uid || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Regista novas publicações como "já mostradas" (ignora duplicados). */
export function addSeenPostIds(uid: string, ids: string[]) {
  if (!uid || typeof window === "undefined") return;
  const clean = ids.filter((id) => typeof id === "string" && id.length > 0);
  if (clean.length === 0) return;
  try {
    const current = getSeenPostIds(uid);
    const currentSet = new Set(current);
    const merged = [...current, ...clean.filter((id) => !currentSet.has(id))];
    // Só guarda as MAX_TRACKED mais recentes — as mais antigas "expiram"
    // desta lista local e podem voltar a aparecer (o resgate no servidor
    // trata disso de forma mais inteligente, por ordem de há-quanto-tempo-
    // não-vê; isto aqui é só para não crescer para sempre no dispositivo).
    window.localStorage.setItem(storageKey(uid), JSON.stringify(merged.slice(-MAX_TRACKED)));
  } catch {
    // localStorage indisponível (modo privado, quota cheia) — sem problema,
    // o feed continua a funcionar, só sem esta camada extra no dispositivo.
  }
}

/**
 * Reordena uma lista de itens do feed para nunca deixar dois seguidos do
 * mesmo autor. Best-effort: troca cada item repetido pelo primeiro item
 * mais à frente que sirva (não bate com o autor anterior nem com o
 * seguinte); se não encontrar nenhum candidato, deixa como está — mais
 * vale mostrar o conteúdo do que escondê-lo por causa da ordem.
 */
export function diversifyByAuthor<T extends { author_id?: string | null; user_id?: string | null }>(
  items: T[],
): T[] {
  const arr = [...items];
  const authorOf = (it: T) => it.author_id || it.user_id || "";
  for (let i = 1; i < arr.length; i++) {
    const prevAuthor = authorOf(arr[i - 1]);
    if (!prevAuthor || authorOf(arr[i]) !== prevAuthor) continue;
    const nextAuthor = i + 1 < arr.length ? authorOf(arr[i + 1]) : "";
    let swapIdx = -1;
    for (let j = i + 1; j < arr.length; j++) {
      const candidateAuthor = authorOf(arr[j]);
      if (candidateAuthor !== prevAuthor && candidateAuthor !== nextAuthor) {
        swapIdx = j;
        break;
      }
    }
    if (swapIdx !== -1) {
      const tmp = arr[i];
      arr[i] = arr[swapIdx];
      arr[swapIdx] = tmp;
    }
  }
  return arr;
}
