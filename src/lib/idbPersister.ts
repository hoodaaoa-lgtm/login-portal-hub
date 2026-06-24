/**
 * idbPersister.ts
 * ────────────────────────────────────────────────────────────────
 * Persiste o cache do React Query em IndexedDB em vez de localStorage.
 *
 * Vantagens sobre localStorage:
 *  • Capacidade: 50–500 MB (vs ~5 MB do localStorage)
 *  • Não bloqueia a thread principal (operações assíncronas)
 *  • Suporta dados binários, múltiplas tabelas, índices
 *
 * Padrão usado: stale-while-revalidate
 *  1. Ao abrir a app → dados do IDB aparecem instantaneamente
 *  2. Em segundo plano → React Query faz refetch
 *  3. UI atualiza silenciosamente SE houver alterações
 *
 * Compatible com: @tanstack/react-query-persist-client v5
 */

import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

/** Nome da base de dados e da object store */
const DB_NAME = "hooda-cache-v1";
const STORE = "query-cache";
const KEY = "client";

/** Abre (ou cria) a base de dados IndexedDB */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Lê um valor da store */
async function idbGet(db: IDBDatabase): Promise<PersistedClient | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as PersistedClient | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Escreve um valor na store */
async function idbSet(db: IDBDatabase, value: PersistedClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove o valor da store */
async function idbDel(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Cria um persister do React Query que usa IndexedDB.
 *
 * Uso no root.tsx:
 * ```tsx
 * const persister = createIdbPersister();
 * <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}>
 * ```
 */
export function createIdbPersister(): Persister {
  // Abre a ligação uma vez e reutiliza — evita overhead por operação
  let dbPromise: Promise<IDBDatabase> | null = null;

  function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDB().catch((err) => {
        // Se IDB falhar (ex.: modo privado no Firefox), anula e deixa sem persistência
        console.warn("[hooda:idb] IndexedDB indisponível, a usar sem persistência:", err);
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  return {
    persistClient: async (client: PersistedClient) => {
      try {
        const db = await getDB();
        await idbSet(db, client);
      } catch {
        // Silencioso — a app funciona mesmo sem persistência
      }
    },

    restoreClient: async (): Promise<PersistedClient | undefined> => {
      try {
        const db = await getDB();
        return await idbGet(db);
      } catch {
        return undefined;
      }
    },

    removeClient: async () => {
      try {
        const db = await getDB();
        await idbDel(db);
      } catch {
        // Silencioso
      }
    },
  };
}

/**
 * Instância singleton do persister para uso no browser.
 * No SSR (typeof window === "undefined") é null e o PersistQueryClientProvider
 * renderiza sem persistência — comportamento correto.
 */
export const idbPersister =
  typeof window !== "undefined" ? createIdbPersister() : null;
