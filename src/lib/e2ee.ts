/**
 * e2ee.ts — Encriptação ponta-a-ponta para mensagens diretas (DM) da Hooda
 *
 * ARQUITECTURA:
 * ─────────────
 * Cada utilizador tem um par de chaves ECDH (P-256) persistido no localStorage.
 * A chave pública é guardada na coluna `e2ee_public_key` do perfil no Supabase.
 *
 * Para cada conversa (2 participantes) existe uma ChaveAES-GCM-256 partilhada,
 * cifrada individualmente para cada participante com a sua chave pública ECDH
 * e guardada em `conversation_key_shares`.
 *
 * FLUXO DE ENVIO:
 *   1. Obter/gerar a ChaveAES da conversa (getDMKey)
 *   2. Cifrar o texto com AES-GCM + IV aleatório
 *   3. Guardar  "e2ee:<base64_iv>:<base64_ciphertext>"  na coluna `content`
 *
 * FLUXO DE RECEPÇÃO:
 *   1. Detectar prefixo "e2ee:" (isEncrypted)
 *   2. Obter a ChaveAES da conversa
 *   3. Decifrar e devolver o texto em claro
 *
 * GARANTIAS:
 *   • A chave privada NUNCA sai do dispositivo (fica apenas em localStorage)
 *   • O Supabase só vê ciphertext — nunca o texto em claro
 *   • Se o outro participante ainda não tem chave pública publicada, cai-se
 *     em fallback e a mensagem vai em claro (ver canEncryptDM)
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

/** Marcador devolvido quando a mensagem ainda não pôde ser decifrada
 * (a chave está a chegar via realtime). Usado também pelo DM. */
export const E2EE_PENDING = "\u0000__e2ee_pending__";

/** Verdadeiro se o conteúdo é uma mensagem E2EE (prefixo "e2ee:"). */
export function isEncrypted(content: string): boolean {
  return content.startsWith(E2EE_PREFIX);
}
// ─── E2EE para mensagens directas (DMs) ──────────────────────────────────────
//
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

