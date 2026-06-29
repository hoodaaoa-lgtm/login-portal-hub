/**
 * e2ee.ts — Encriptação ponta-a-ponta para o chat de comunidades da hooda
 *
 * ARQUITECTURA:
 * ─────────────
 * Cada membro tem um par de chaves ECDH (P-256) persistido no localStorage.
 * A chave pública é guardada na coluna `e2ee_public_key` do perfil no Supabase.
 *
 * Para cada comunidade existe uma "chave de grupo" AES-GCM-256 (GroupKey).
 * Essa GroupKey é gerada pelo owner/primeiro membro e encriptada individualmente
 * com a chave pública ECDH de cada membro autorizado — cada membro guarda
 * a sua cópia cifrada em `community_key_shares` no Supabase.
 *
 * FLUXO DE ENVIO:
 *   1. Obter GroupKey (decifrar o key share guardado para este utilizador)
 *   2. Cifrar o texto da mensagem com AES-GCM + IV aleatório
 *   3. Guardar  "e2ee:<base64_iv>:<base64_ciphertext>"  na coluna `content`
 *
 * FLUXO DE RECEPÇÃO:
 *   1. Detectar prefixo "e2ee:"
 *   2. Obter GroupKey
 *   3. Decifrar e devolver o texto em claro
 *
 * GARANTIAS:
 *   • A chave privada NUNCA sai do dispositivo (fica apenas em localStorage)
 *   • O Supabase só vê ciphertext — nunca o texto em claro
 *   • Cada comunidade tem a sua GroupKey independente
 *   • Rotação de chave: basta gerar nova GroupKey e redistribuir
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Constantes ──────────────────────────────────────────────────────────────
const LS_PRIV = "hooda_e2ee_privkey";   // localStorage: chave privada (PKCS8 base64)
const LS_PUB  = "hooda_e2ee_pubkey";    // localStorage: chave pública (SPKI base64)
const E2EE_PREFIX = "e2ee:";
const db = supabase as any;

// ─── Utilitários de encoding ──────────────────────────────────────────────────
/**
 * Converte ArrayBuffer → base64 em blocos (chunks) de 8KB.
 * IMPORTANTE: nunca usar `String.fromCharCode(...bytes)` directamente — para
 * buffers grandes (ex: uma foto cifrada) isso estoura a pilha de chamadas do
 * JS ("Maximum call stack size exceeded") porque cada byte vira um argumento
 * separado da função. Processar em blocos evita esse limite.
 */
function buf2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x2000; // 8192
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
function b642buf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─── Par de chaves ECDH ───────────────────────────────────────────────────────

/** Gera ou recupera o par de chaves ECDH deste dispositivo. */
export async function getOrCreateKeyPair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  const existingPriv = localStorage.getItem(LS_PRIV);
  const existingPub  = localStorage.getItem(LS_PUB);

  if (existingPriv && existingPub) {
    try {
      const privKey = await crypto.subtle.importKey(
        "pkcs8", b642buf(existingPriv),
        { name: "ECDH", namedCurve: "P-256" },
        false, ["deriveKey"]
      );
      return { publicKeyB64: existingPub, privateKey: privKey };
    } catch {
      // Chave corrompida — regenerar
      localStorage.removeItem(LS_PRIV);
      localStorage.removeItem(LS_PUB);
    }
  }

  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, ["deriveKey"]
  );

  const [privBuf, pubBuf] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
    crypto.subtle.exportKey("spki",  pair.publicKey),
  ]);

  const privB64 = buf2b64(privBuf);
  const pubB64  = buf2b64(pubBuf);
  localStorage.setItem(LS_PRIV, privB64);
  localStorage.setItem(LS_PUB,  pubB64);
  return { publicKeyB64: pubB64, privateKey: pair.privateKey };
}

/** Publica a chave pública deste utilizador no Supabase (se ainda não estiver lá). */
export async function publishPublicKey(userId: string): Promise<void> {
  const { publicKeyB64 } = await getOrCreateKeyPair();
  const { data } = await db.from("profiles").select("e2ee_public_key").eq("id", userId).maybeSingle();
  if (data?.e2ee_public_key === publicKeyB64) return; // já está publicada
  await db.from("profiles").update({ e2ee_public_key: publicKeyB64 }).eq("id", userId);
}

/** Importa a chave pública SPKI de outro utilizador. */
async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki", b642buf(b64),
    { name: "ECDH", namedCurve: "P-256" },
    false, []
  );
}

/** Deriva uma chave AES-GCM de 256-bit a partir de um segredo ECDH partilhado. */
async function deriveAES(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"]
  );
}

// ─── GroupKey (chave da comunidade) ──────────────────────────────────────────

/** Cache em memória: communityId → CryptoKey AES-GCM */
const groupKeyCache: Record<string, CryptoKey> = {};
/** Evita disparar vários pedidos de chave em paralelo para a mesma comunidade
 * (ex: várias mensagens a decifrar ao mesmo tempo no carregamento inicial). */
const pendingKeyRequests: Record<string, Promise<CryptoKey | null>> = {};

/**
 * Obtém (ou cria) a GroupKey AES-GCM-256 para uma comunidade.
 * Se o utilizador ainda não tem um key share:
 *   1. Pede a chave a outro membro já online (via broadcast realtime) — evita
 *      criar uma GroupKey divergente que tornaria as mensagens antigas ilegíveis.
 *   2. Só gera uma GroupKey nova se ninguém responder (provavelmente é o
 *      primeiro membro a usar o chat nesta comunidade).
 */
export async function getGroupKey(communityId: string, myUserId: string): Promise<CryptoKey | null> {
  if (groupKeyCache[communityId]) return groupKeyCache[communityId];

  const { privateKey } = await getOrCreateKeyPair();

  // 1. Tentar obter o meu key share já guardado
  const { data: share } = await db
    .from("community_key_shares")
    .select("encrypted_key, sender_public_key")
    .eq("community_id", communityId)
    .eq("recipient_id", myUserId)
    .maybeSingle();

  if (share?.encrypted_key && share?.sender_public_key) {
    try {
      const senderPub = await importPublicKey(share.sender_public_key);
      const wrapKey   = await deriveAES(privateKey, senderPub);
      const ivAndData = b642buf(share.encrypted_key);
      const iv        = ivAndData.slice(0, 12);
      const data      = ivAndData.slice(12);
      const rawKey    = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrapKey, data);
      const groupKey  = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      groupKeyCache[communityId] = groupKey;
      return groupKey;
    } catch (err) {
      console.error("[e2ee] Falha ao decifrar key share:", err);
    }
  }

  // 2. Sem share local — perguntar a alguém já online antes de inventar uma chave nova.
  //    Isto evita o cenário em que dois membros geram GroupKeys diferentes e ficam
  //    incapazes de se ler mutuamente. Deduplicado: se já há um pedido em curso para
  //    esta comunidade (ex: várias mensagens a decifrar ao mesmo tempo), reutiliza-o.
  if (!pendingKeyRequests[communityId]) {
    pendingKeyRequests[communityId] = requestGroupKeyFromPeers(communityId, myUserId)
      .finally(() => { delete pendingKeyRequests[communityId]; });
  }
  const fromPeer = await pendingKeyRequests[communityId];
  if (fromPeer) {
    groupKeyCache[communityId] = fromPeer;
    return fromPeer;
  }

  // 3. Ninguém respondeu — só nesse caso criamos uma GroupKey nova (1º membro a falar).
  //    Se já existirem mensagens cifradas nesta comunidade, NÃO criamos uma chave nova
  //    (ficaria divergente); ficamos a aguardar em vez de inventar conteúdo ilegível.
  const { count } = await db
    .from("community_messages")
    .select("id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("is_encrypted", true);
  if ((count ?? 0) > 0) {
    console.warn("[e2ee] Já existem mensagens cifradas mas nenhum par respondeu ao pedido de chave — a aguardar.");
    return null;
  }

  const rawGroupKey = crypto.getRandomValues(new Uint8Array(32));
  const groupKey = await crypto.subtle.importKey(
    "raw", rawGroupKey,
    { name: "AES-GCM", length: 256 },
    true, ["encrypt", "decrypt"]
  );

  await distributeGroupKey(communityId, myUserId, rawGroupKey);
  groupKeyCache[communityId] = groupKey;
  return groupKey;
}

/**
 * Canal de troca de chaves PARTILHADO por toda a sessão, para uma dada
 * comunidade — usado tanto para ouvir pedidos de outros membros como para
 * pedir a chave nós próprios.
 *
 * BUG CORRIGIDO (causa do "a sincronizar" permanente): antes havia DOIS
 * canais com nomes diferentes — quem pedia a chave usava
 * "e2ee-req-<id>-<uid>" e quem respondia usava "e2ee-keyreq-<id>". Broadcast
 * do Supabase só chega a quem está inscrito no MESMO nome de canal, por isso
 * o pedido nunca chegava a ninguém (e mesmo que chegasse, a resposta nunca
 * voltava, pelo mesmo motivo ao contrário). Resultado: ficava sempre "a
 * sincronizar" para sempre, mesmo com outro membro online e com a chave.
 * Agora ambos os lados usam sempre o mesmo canal único por comunidade.
 */
const keyChannels: Record<string, ReturnType<typeof supabase.channel>> = {};
const keyChannelReady: Record<string, Promise<void>> = {};
const keyResponseListeners: Record<string, Set<(payload: { toUserId: string; encryptedKey: string; senderPublicKey: string }) => void>> = {};

function ensureKeyChannel(communityId: string, myUserId: string): { channel: ReturnType<typeof supabase.channel>; ready: Promise<void> } {
  const existing = keyChannels[communityId];
  if (existing) return { channel: existing, ready: keyChannelReady[communityId] };

  const channel = supabase.channel(`e2ee-keyreq-${communityId}`);

  // Responder a pedidos de outros membros — só se eu já tiver a GroupKey em cache.
  channel.on("broadcast", { event: "key-request" }, async (msg) => {
    const payload = msg.payload as { fromUserId: string; fromPublicKey: string };
    if (payload.fromUserId === myUserId) return;
    const groupKey = groupKeyCache[communityId];
    if (!groupKey) return; // eu próprio ainda não tenho a chave — não posso ajudar

    try {
      const { publicKeyB64, privateKey } = await getOrCreateKeyPair();
      const rawGroupKey = await crypto.subtle.exportKey("raw", groupKey);
      const requesterPub = await importPublicKey(payload.fromPublicKey);
      const wrapKey = await deriveAES(privateKey, requesterPub);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, rawGroupKey);

      const combined = new Uint8Array(12 + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), 12);

      channel.send({
        type: "broadcast",
        event: "key-response",
        payload: {
          toUserId: payload.fromUserId,
          encryptedKey: buf2b64(combined.buffer),
          senderPublicKey: publicKeyB64,
        },
      });

      // Também persiste o share na BD para a próxima vez que o membro entrar.
      await db.from("community_key_shares").upsert([{
        community_id: communityId,
        recipient_id: payload.fromUserId,
        sender_id: myUserId,
        sender_public_key: publicKeyB64,
        encrypted_key: buf2b64(combined.buffer),
      }], { onConflict: "community_id,recipient_id" });
    } catch (err) {
      console.warn("[e2ee] Falha ao responder a pedido de chave:", err);
    }
  });

  // Receber respostas a pedidos meus — entregues a quem estiver à espera
  // (ver requestGroupKeyFromPeers). Pode haver vários pedidos em curso.
  channel.on("broadcast", { event: "key-response" }, (msg) => {
    const payload = msg.payload as { toUserId: string; encryptedKey: string; senderPublicKey: string };
    const listeners = keyResponseListeners[communityId];
    if (!listeners) return;
    for (const fn of [...listeners]) fn(payload);
  });

  const ready = new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  keyChannels[communityId] = channel;
  keyChannelReady[communityId] = ready;
  return { channel, ready };
}

/**
 * Pede a GroupKey a membros já online da comunidade via canal realtime (broadcast).
 * Quem já tem a chave responde cifrando-a especificamente para o meu publicKey.
 * Espera no máximo ~2.5s antes de desistir (a UI cai para "a sincronizar…").
 */
async function requestGroupKeyFromPeers(communityId: string, myUserId: string): Promise<CryptoKey | null> {
  const { publicKeyB64, privateKey } = await getOrCreateKeyPair();
  await publishPublicKey(myUserId);

  const { channel, ready } = ensureKeyChannel(communityId, myUserId);
  await ready;

  return new Promise((resolve) => {
    let settled = false;

    function finish(result: CryptoKey | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      keyResponseListeners[communityId]?.delete(onResponse);
      resolve(result);
    }

    const onResponse = async (payload: { toUserId: string; encryptedKey: string; senderPublicKey: string }) => {
      if (payload.toUserId !== myUserId) return;
      try {
        const senderPub = await importPublicKey(payload.senderPublicKey);
        const wrapKey   = await deriveAES(privateKey, senderPub);
        const ivAndData = b642buf(payload.encryptedKey);
        const iv        = ivAndData.slice(0, 12);
        const data      = ivAndData.slice(12);
        const rawKey    = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrapKey, data);
        const groupKey  = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

        // Persiste o share para a próxima vez (não precisamos de pedir de novo).
        await db.from("community_key_shares").upsert([{
          community_id: communityId,
          recipient_id: myUserId,
          sender_id: myUserId,           // nós somos o autor do upsert — passa na RLS
          sender_public_key: payload.senderPublicKey,
          encrypted_key: payload.encryptedKey, // já está em base64 tal como veio
        }], { onConflict: "community_id,recipient_id" });

        finish(groupKey);
      } catch (err) {
        console.warn("[e2ee] Falha ao processar resposta de chave:", err);
      }
    };

    if (!keyResponseListeners[communityId]) keyResponseListeners[communityId] = new Set();
    keyResponseListeners[communityId].add(onResponse);

    channel.send({
      type: "broadcast",
      event: "key-request",
      payload: { fromUserId: myUserId, fromPublicKey: publicKeyB64 },
    });

    const timer = setTimeout(() => finish(null), 2500);
  });
}

/**
 * Ouve pedidos de chave de outros membros (deve ser chamado uma vez por sessão de chat,
 * idealmente por quem já tem a GroupKey em cache). Quando alguém pede, responde cifrando
 * a GroupKey só para essa pessoa. Usa o mesmo canal partilhado de ensureKeyChannel.
 */
export function listenForKeyRequests(communityId: string, myUserId: string): () => void {
  ensureKeyChannel(communityId, myUserId);
  return () => {
    const channel = keyChannels[communityId];
    if (channel) supabase.removeChannel(channel);
    delete keyChannels[communityId];
    delete keyChannelReady[communityId];
    delete keyResponseListeners[communityId];
  };
}

/**
 * Distribui a GroupKey (já como bytes raw) a todos os membros da comunidade
 * que tenham uma chave pública publicada.
 */
export async function distributeGroupKey(communityId: string, myUserId: string, rawGroupKey: Uint8Array): Promise<void> {
  const { publicKeyB64, privateKey } = await getOrCreateKeyPair();

  // Obter todos os membros com chave pública
  const { data: members } = await db
    .from("community_members")
    .select("user_id, profiles(e2ee_public_key)")
    .eq("community_id", communityId);

  // Bug fix 3 & 4: garantir que o próprio utilizador está sempre na lista,
  // mesmo que o SELECT de membros falhe por RLS, ou que o UPDATE ao perfil
  // (publishPublicKey) ainda não tenha propagado quando este SELECT correu.
  // Sem isto, o criador da GroupKey fica sem o seu próprio share e não
  // consegue decifrar as suas mensagens na próxima sessão.
  const memberList: { user_id: string; profiles: { e2ee_public_key: string | null } | null }[] = members ?? [];
  const selfInList = memberList.some(m => m.user_id === myUserId);
  if (!selfInList) {
    memberList.push({ user_id: myUserId, profiles: { e2ee_public_key: publicKeyB64 } });
  } else {
    // Garantir que a chave pública do próprio está actualizada (evita race condition)
    for (const m of memberList) {
      if (m.user_id === myUserId && !m.profiles?.e2ee_public_key) {
        (m as any).profiles = { e2ee_public_key: publicKeyB64 };
      }
    }
  }

  const shares: any[] = [];

  for (const m of memberList) {
    const recipientPubB64 = (m.profiles as any)?.e2ee_public_key;
    if (!recipientPubB64) continue;

    try {
      const recipientPub = await importPublicKey(recipientPubB64);
      const wrapKey      = await deriveAES(privateKey, recipientPub);
      const iv           = crypto.getRandomValues(new Uint8Array(12));
      const encrypted    = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, wrapKey, rawGroupKey as BufferSource);

      // iv (12 bytes) || ciphertext concatenados
      const combined = new Uint8Array(12 + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), 12);

      shares.push({
        community_id: communityId,
        recipient_id: m.user_id,
        sender_id: myUserId,
        sender_public_key: publicKeyB64,
        encrypted_key: buf2b64(combined.buffer),
      });
    } catch (err) {
      console.warn("[e2ee] Falha ao cifrar share para", m.user_id, err);
    }
  }

  if (shares.length > 0) {
    // Upsert: se já existia um share para este membro, actualiza
    await db.from("community_key_shares").upsert(shares, {
      onConflict: "community_id,recipient_id",
    });
  }
}

// ─── Cifrar / Decifrar mensagens ─────────────────────────────────────────────

/** Erro atirado por encryptMessage quando a GroupKey ainda não está disponível.
 *  O chamador DEVE apanhar isto e adiar / cancelar o envio — NUNCA gravar em
 *  claro (a privacidade do chat depende disso). */
export class E2EENotReadyError extends Error {
  constructor(message = "GroupKey indisponível — envio cancelado para evitar mensagem em claro.") {
    super(message);
    this.name = "E2EENotReadyError";
  }
}

/**
 * Cifra texto com a GroupKey da comunidade.
 * Devolve uma string no formato "e2ee:<iv_b64>:<ciphertext_b64>".
 *
 * IMPORTANTE: se a GroupKey não estiver disponível, ATIRA E2EENotReadyError
 * em vez de devolver texto em claro. Isto garante que nenhuma mensagem é
 * alguma vez enviada/gravada sem cifra — mesmo perante falhas transitórias.
 */
export async function encryptMessage(plaintext: string, communityId: string, myUserId: string): Promise<string> {
  const groupKey = await getGroupKey(communityId, myUserId);
  if (!groupKey) {
    console.warn("[e2ee] encryptMessage abortado: GroupKey indisponível para", communityId);
    throw new E2EENotReadyError();
  }

  try {
    const enc  = new TextEncoder();
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, groupKey, enc.encode(plaintext));
    const out = `${E2EE_PREFIX}${buf2b64(iv.buffer)}:${buf2b64(data)}`;
    console.debug("[e2ee] encryptMessage ok", { community: communityId, bytes: plaintext.length });
    return out;
  } catch (err) {
    console.error("[e2ee] Falha ao cifrar:", err);
    throw new E2EENotReadyError("Falha na operação de cifra.");
  }
}

/** Marcador devolvido quando a mensagem ainda não pôde ser decifrada
 * (a chave está a chegar via realtime). A UI deve tratar isto como
 * "a sincronizar…" e nunca como erro permanente. */
export const E2EE_PENDING = "\u0000__e2ee_pending__";

/**
 * Decifra uma mensagem E2EE.
 * Se não começar com "e2ee:" devolve o texto tal como está (mensagem antiga / não cifrada).
 * Nunca devolve um erro visível ao utilizador: se a chave ainda não estiver disponível,
 * devolve E2EE_PENDING para a UI mostrar um estado transitório e tentar de novo.
 */
export async function decryptMessage(content: string, communityId: string, myUserId: string): Promise<string> {
  if (!content.startsWith(E2EE_PREFIX)) return content;

  try {
    const parts = content.slice(E2EE_PREFIX.length).split(":");
    if (parts.length < 2) return E2EE_PENDING;

    const iv         = new Uint8Array(b642buf(parts[0]));
    const ciphertext = b642buf(parts[1]);

    const groupKey = await getGroupKey(communityId, myUserId);
    if (!groupKey) return E2EE_PENDING;

    const dec      = new TextDecoder();
    const rawText  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, groupKey, ciphertext);
    return dec.decode(rawText);
  } catch (err) {
    console.warn("[e2ee] Falha ao decifrar (a aguardar sincronização de chave):", err);
    return E2EE_PENDING;
  }
}

/** Verdadeiro se o conteúdo é uma mensagem E2EE. */
export function isEncrypted(content: string): boolean {
  return content.startsWith(E2EE_PREFIX);
}

// ─── Cifrar / Decifrar anexos binários (imagem, áudio, vídeo, qualquer ficheiro) ──
//
// Mesma GroupKey AES-GCM-256 usada para texto. O ficheiro é cifrado ANTES do
// upload — o que sobe ao Storage é ciphertext puro, ilegível mesmo por quem
// tem acesso direto ao bucket (incluindo via signed URL exposta), porque sem
// a GroupKey o conteúdo é apenas ruído binário.
//
// Formato do blob cifrado gravado no Storage: IV (12 bytes) || ciphertext.
// O content-type original é preservado fora do ficheiro (na própria mensagem),
// já que o ciphertext em si não tem um tipo MIME útil.

/**
 * Cifra um ficheiro (File/Blob) com a GroupKey da comunidade.
 * Devolve um Blob pronto a subir para o Storage, ou null se não houver
 * GroupKey disponível (nesse caso o chamador NÃO deve fazer upload — ver
 * uploadEncryptedChatFile em chatMedia.ts, que falha em vez de subir em claro).
 */
export async function encryptFile(file: Blob, communityId: string, myUserId: string): Promise<Blob | null> {
  const groupKey = await getGroupKey(communityId, myUserId);
  if (!groupKey) return null;

  const raw = await file.arrayBuffer();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, groupKey, raw);

  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);

  return new Blob([combined], { type: "application/octet-stream" });
}

/**
 * Decifra um Blob cifrado (descarregado do bucket privado chat-media) de volta
 * ao Blob original, com o content-type original reaplicado para que o browser
 * consiga renderizar (<img>, <audio>, etc.) a partir do Blob URL resultante.
 */
export async function decryptFile(
  encryptedBlob: Blob,
  communityId: string,
  myUserId: string,
  originalContentType: string
): Promise<Blob | null> {
  const groupKey = await getGroupKey(communityId, myUserId);
  if (!groupKey) return null;

  const buf = new Uint8Array(await encryptedBlob.arrayBuffer());
  if (buf.length < 12) return null;

  const iv         = buf.slice(0, 12);
  const ciphertext = buf.slice(12);

  try {
    const rawData = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, groupKey, ciphertext);
    return new Blob([rawData], { type: originalContentType || "application/octet-stream" });
  } catch (err) {
    console.warn("[e2ee] Falha ao decifrar anexo (a aguardar sincronização de chave):", err);
    return null;
  }
}

// ─── E2EE para mensagens directas (DMs) ──────────────────────────────────────
//
// Mesma arquitectura das comunidades, adaptada para 2 participantes:
//   • Cada conversa tem a sua própria ChaveAES (AES-GCM-256) partilhada.
//   • Quem inicia a 1ª cifra gera a ChaveAES, cifra-a com a chave pública
//     ECDH de cada participante (incluindo a própria) e guarda os 2 shares
//     em `conversation_key_shares`.
//   • Cada utilizador decifra a sua cópia com a chave privada ECDH local.
//   • As mensagens vão em `messages.content` no formato
//     "e2ee:<iv_b64>:<ciphertext_b64>", igual ao das comunidades.
//
// Se o outro participante ainda não publicou chave pública ECDH, encryptDM
// devolve `null` — o chamador deve cair em fallback (enviar em claro) para
// não bloquear o utilizador.
// ─────────────────────────────────────────────────────────────────────────────

const dmKeyCache: Record<string, CryptoKey> = {};
const dmKeyPending: Record<string, Promise<CryptoKey | null>> = {};

/**
 * Devolve a ChaveAES partilhada de uma DM, criando-a se ainda não existir.
 * null  = não foi possível (outro participante sem chave pública ECDH).
 */
export async function getDMKey(
  conversationId: string,
  myUserId: string,
  otherUserId: string,
): Promise<CryptoKey | null> {
  if (dmKeyCache[conversationId]) return dmKeyCache[conversationId];
  const inflight = dmKeyPending[conversationId];
  if (inflight) return inflight;

  dmKeyPending[conversationId] = (async () => {
    const { privateKey, publicKeyB64 } = await getOrCreateKeyPair();
    await publishPublicKey(myUserId);

    // 1) Share guardado para mim?
    const { data: myShare } = await db
      .from("conversation_key_shares")
      .select("encrypted_key, sender_public_key")
      .eq("conversation_id", conversationId)
      .eq("user_id", myUserId)
      .maybeSingle();

    if (myShare?.encrypted_key && myShare?.sender_public_key) {
      try {
        const senderPub = await importPublicKey(myShare.sender_public_key);
        const wrap      = await deriveAES(privateKey, senderPub);
        const ivAndData = b642buf(myShare.encrypted_key);
        const iv        = ivAndData.slice(0, 12);
        const data      = ivAndData.slice(12);
        const rawKey    = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrap, data);
        const key       = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        dmKeyCache[conversationId] = key;
        return key;
      } catch (err) {
        console.warn("[e2ee][dm] Share guardado ilegível, vou gerar nova chave:", err);
      }
    }

    // 2) Chave pública do outro
    const { data: otherProf } = await db
      .from("profiles")
      .select("e2ee_public_key")
      .eq("id", otherUserId)
      .maybeSingle();
    const otherPubB64 = (otherProf as any)?.e2ee_public_key;
    if (!otherPubB64) {
      console.warn("[e2ee][dm] Outro participante sem chave pública ECDH — sem cifra.");
      return null;
    }

    // 3) Gerar nova ChaveAES e cifrar para os 2 participantes
    const rawNew = crypto.getRandomValues(new Uint8Array(32));
    const newKey = await crypto.subtle.importKey("raw", rawNew, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

    async function wrapFor(recipientPubB64: string): Promise<string> {
      const recipientPub = await importPublicKey(recipientPubB64);
      const wrap         = await deriveAES(privateKey, recipientPub);
      const iv           = crypto.getRandomValues(new Uint8Array(12));
      const enc          = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap, rawNew as BufferSource);
      const combined     = new Uint8Array(12 + enc.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(enc), 12);
      return buf2b64(combined.buffer);
    }

    try {
      const [forMe, forOther] = await Promise.all([
        wrapFor(publicKeyB64),
        wrapFor(otherPubB64),
      ]);
      await db.from("conversation_key_shares").upsert(
        [
          { conversation_id: conversationId, user_id: myUserId,    sender_public_key: publicKeyB64, encrypted_key: forMe },
          { conversation_id: conversationId, user_id: otherUserId, sender_public_key: publicKeyB64, encrypted_key: forOther },
        ],
        { onConflict: "conversation_id,user_id" },
      );
    } catch (err) {
      console.error("[e2ee][dm] Falha a distribuir nova chave:", err);
      return null;
    }

    dmKeyCache[conversationId] = newKey;
    return newKey;
  })();

  try {
    return await dmKeyPending[conversationId];
  } finally {
    delete dmKeyPending[conversationId];
  }
}

/** Cifra texto de DM. Devolve null se não foi possível (sem chave pública do outro). */
export async function encryptDM(
  plaintext: string,
  conversationId: string,
  myUserId: string,
  otherUserId: string,
): Promise<string | null> {
  if (!plaintext) return plaintext;
  const key = await getDMKey(conversationId, myUserId, otherUserId);
  if (!key) return null;
  try {
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${E2EE_PREFIX}${buf2b64(iv.buffer)}:${buf2b64(data)}`;
  } catch (err) {
    console.error("[e2ee][dm] Falha a cifrar:", err);
    return null;
  }
}

/** Decifra texto de DM. Devolve E2EE_PENDING se a chave ainda não chegou. */
export async function decryptDM(
  content: string,
  conversationId: string,
  myUserId: string,
  otherUserId: string,
): Promise<string> {
  if (!content || !content.startsWith(E2EE_PREFIX)) return content;
  try {
    const parts = content.slice(E2EE_PREFIX.length).split(":");
    if (parts.length < 2) return E2EE_PENDING;
    const iv         = new Uint8Array(b642buf(parts[0]));
    const ciphertext = b642buf(parts[1]);
    const key = await getDMKey(conversationId, myUserId, otherUserId);
    if (!key) return E2EE_PENDING;
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(raw);
  } catch (err) {
    console.warn("[e2ee][dm] Falha a decifrar:", err);
    return E2EE_PENDING;
  }
}

/** Verifica se a DM pode ser cifrada (outro tem chave pública ECDH publicada). */
export async function canEncryptDM(otherUserId: string): Promise<boolean> {
  const { data } = await db
    .from("profiles")
    .select("e2ee_public_key")
    .eq("id", otherUserId)
    .maybeSingle();
  return !!(data as any)?.e2ee_public_key;
}

