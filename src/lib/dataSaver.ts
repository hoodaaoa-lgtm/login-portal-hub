/**
 * dataSaver — "Hooda Leve", modo de poupar dados.
 *
 * Quando ativo, os vídeos do feed (Home, Perfil, Explorar, Canal) NÃO
 * carregam nem tocam sozinhos — mostram só a capa (poster) com um aviso
 * a dizer que o Hooda Leve está ativo, e só carregam quando o
 * utilizador tocar de propósito em "Ver vídeo".
 *
 * Não afeta vídeo aberto diretamente (post individual, HoodaTV watch,
 * modais) — usar forceLoad nesses casos, que já ignora este módulo.
 *
 * Preferência local ao aparelho (localStorage), igual ao padrão do
 * mediaManager para o som global — sem precisar de tabela nova no
 * Supabase.
 */

const STORAGE_KEY = "hooda:data-saver";

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = readInitial();

export function isDataSaverEnabled(): boolean {
  return enabled;
}

export function setDataSaverEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* localStorage indisponível (modo privado, etc.) — ignora */
  }
  listeners.forEach((l) => l(enabled));
}

export function toggleDataSaver() {
  setDataSaverEnabled(!enabled);
}

export function subscribeDataSaver(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
