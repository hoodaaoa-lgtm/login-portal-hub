/**
 * chatCache.ts
 * ─────────────────────────────────────────────────────────────
 * Cache persistente de mensagens de chat em IndexedDB.
 * Estilo WhatsApp/Telegram:
 *  - Abre instantaneamente com as últimas mensagens guardadas
 *  - Atualiza silenciosamente em segundo plano
 *  - Capacidade: 50–500MB (vs ~5MB do localStorage)
 *  - Guarda até 200 mensagens por comunidade/conversa
 */

const DB_NAME = "hooda-chat-v1";
const DB_VERSION = 1;
const STORE = "messages";
const MAX_MESSAGES = 200;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

let _db: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase | null> {
  if (_db) return _db;
  try {
    _db = await openDB();
    return _db;
  } catch {
    return null;
  }
}

/** Carrega mensagens de uma conversa do IDB */
export async function loadChatMessages<T>(key: string): Promise<T[]> {
  try {
    const db = await getDB();
    if (!db) return [];
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Guarda mensagens de uma conversa no IDB */
export async function saveChatMessages<T>(key: string, messages: T[]): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    // Guarda só as últimas MAX_MESSAGES (mais recentes)
    const toSave = messages.slice(-MAX_MESSAGES);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(toSave, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/** Apaga mensagens de uma conversa do IDB */
export async function clearChatMessages(key: string): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}
