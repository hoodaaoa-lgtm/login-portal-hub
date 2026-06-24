/**
 * chatMedia.ts — Anexos cifrados do chat de comunidades (imagem, áudio, vídeo, ficheiro)
 *
 * Usa um bucket privado dedicado ("chat-media"), com duas camadas de proteção:
 *
 *   1. O bucket é privado — sem leitura pública (anon). Acesso só via
 *      signed URL, gerada por quem já está autenticado e é membro da
 *      comunidade (RLS — ver migração 20260621090000_chat_media_storage_fix.sql).
 *   2. O ficheiro em si é cifrado com a GroupKey AES-GCM da comunidade ANTES
 *      do upload (ver encryptFile/decryptFile em e2ee.ts) — mesmo que uma
 *      signed URL vaze ou expire mal, o conteúdo continua ilegível sem a
 *      GroupKey, que nunca sai dos dispositivos dos membros.
 *
 * O que fica gravado na coluna `content` da mensagem nunca é uma URL
 * pública: é o PATH do objeto no bucket privado. A UI resolve esse path
 * para um Blob URL local (decifrado em runtime) antes de renderizar.
 */

import { supabase } from "@/integrations/supabase/client";
import { encryptFile, decryptFile } from "@/lib/e2ee";

const BUCKET = "chat-media";
const SIGNED_URL_TTL_SECONDS = 60 * 5; // 5 minutos — só o suficiente para o download imediato
const LOG = "[chatMedia]";

export type ChatMediaKind = "images" | "audio" | "video" | "files";

/** Limite de tamanho por tipo de anexo (bytes), antes de cifrar. */
const MAX_SIZE_BYTES: Record<ChatMediaKind, number> = {
  images: 15 * 1024 * 1024,  // 15MB
  audio: 25 * 1024 * 1024,   // 25MB
  video: 50 * 1024 * 1024,   // 50MB (alinhado com o limite do bucket)
  files: 30 * 1024 * 1024,   // 30MB
};

/** Tipos MIME aceites por categoria. */
const ALLOWED_MIME: Record<ChatMediaKind, string[]> = {
  images: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/m4a", "audio/x-m4a", "audio/mp4", "audio/ogg", "audio/webm"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"],
  // Documentos genéricos — sem whitelist fechada de MIME (PDF, DOCX, ZIP, etc.),
  // mas continuamos a recusar tipos vazios/octet-stream suspeitos só pelo tamanho.
  files: [],
};

const EXT_FALLBACK: Record<ChatMediaKind, string> = {
  images: "jpg",
  audio: "webm",
  video: "mp4",
  files: "bin",
};

export class ChatMediaError extends Error {
  code: "too_large" | "invalid_type" | "no_group_key" | "upload_failed" | "network_error" | "auth_error" | "unknown";
  constructor(message: string, code: ChatMediaError["code"]) {
    super(message);
    this.code = code;
    this.name = "ChatMediaError";
  }
}

function validateFile(file: File, kind: ChatMediaKind) {
  const maxSize = MAX_SIZE_BYTES[kind];
  if (file.size > maxSize) {
    throw new ChatMediaError(
      `Ficheiro demasiado grande (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limite: ${(maxSize / (1024 * 1024)).toFixed(0)}MB.`,
      "too_large"
    );
  }
  const allowed = ALLOWED_MIME[kind];
  if (allowed.length > 0 && file.type && !allowed.includes(file.type)) {
    throw new ChatMediaError(
      `Tipo de ficheiro não suportado: ${file.type || "desconhecido"}.`,
      "invalid_type"
    );
  }
}

/**
 * Cifra e faz upload de um anexo (imagem/áudio/vídeo/ficheiro) para o bucket
 * privado do chat. Devolve o PATH do objeto (não uma URL) para guardar na
 * mensagem, mais metadados úteis para a UI (nome original, tamanho).
 *
 * Lança ChatMediaError com um `code` específico em caso de falha, para que a
 * UI possa mostrar uma mensagem de erro clara (e não um genérico "falhou").
 *
 * Se a GroupKey ainda não estiver disponível, lança erro "no_group_key" — o
 * chamador NÃO deve cair para upload em claro: é melhor falhar visivelmente
 * (e o utilizador tentar de novo) do que um anexo ficar acessível sem cifra.
 */
export async function uploadEncryptedChatFile(
  file: File,
  kind: ChatMediaKind,
  communityId: string,
  userId: string,
  onProgress?: (pct: number) => void
): Promise<{ path: string; contentType: string; name: string; size: number }> {
  console.debug(`${LOG} seleção de ficheiro`, { kind, name: file.name, size: file.size, type: file.type });

  if (!userId) {
    throw new ChatMediaError("Sessão inválida — inicia sessão novamente.", "auth_error");
  }

  validateFile(file, kind);

  console.debug(`${LOG} a cifrar ficheiro antes do upload…`, { kind, name: file.name });
  let encrypted: Blob | null;
  try {
    encrypted = await encryptFile(file, communityId, userId);
  } catch (err) {
    console.error(`${LOG} exceção ao cifrar ficheiro`, err);
    throw new ChatMediaError("Falha ao cifrar o ficheiro. Tenta novamente.", "unknown");
  }
  if (!encrypted) {
    console.error(`${LOG} sem GroupKey disponível — upload cifrado cancelado`, { kind });
    throw new ChatMediaError(
      "A chave de cifra da comunidade ainda está a sincronizar. Aguarda uns segundos e tenta novamente.",
      "no_group_key"
    );
  }

  const guessExt = EXT_FALLBACK[kind];
  const ext = (file.name.split(".").pop() || guessExt).toLowerCase().replace(/[^a-z0-9]/g, "") || guessExt;
  const path = `${userId}/${communityId}/chat-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}.enc`;

  console.debug(`${LOG} início do upload`, { path, bytesToUpload: encrypted.size });
  onProgress?.(10);

  // O SDK do Supabase Storage não expõe progresso real de bytes enviados,
  // então simulamos um avanço suave (10% → 90%) enquanto o upload está em
  // curso, calibrado pelo tamanho do ficheiro — fica fluido e nunca "parado",
  // tal como o indicador do WhatsApp, e salta para 100% só quando confirmado.
  let simulatedProgressTimer: ReturnType<typeof setInterval> | null = null;
  if (onProgress) {
    let pct = 10;
    // Ficheiros maiores avançam mais devagar até ao teto de 90%.
    const stepMs = Math.max(120, Math.min(600, Math.round(encrypted.size / 50000)));
    simulatedProgressTimer = setInterval(() => {
      pct = Math.min(90, pct + (90 - pct) * 0.18 + 1);
      onProgress(Math.round(pct));
    }, stepMs);
  }

  try {
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, encrypted, {
      upsert: false,
      // O bucket guarda ciphertext puro — não o content-type original do ficheiro.
      contentType: "application/octet-stream",
    });

    if (upErr) {
      console.error(`${LOG} falha no upload cifrado`, upErr);
      const msg = (upErr as { message?: string }).message || "";
      if (/bucket.*not.*found/i.test(msg)) {
        throw new ChatMediaError("Armazenamento de mídia indisponível (bucket não configurado). Contacta o suporte.", "upload_failed");
      }
      if (/row-level security|permission|policy/i.test(msg)) {
        throw new ChatMediaError("Sem permissão para enviar mídia nesta comunidade.", "auth_error");
      }
      if (/Failed to fetch|NetworkError|network/i.test(msg)) {
        throw new ChatMediaError("Falha de rede durante o upload. Verifica a tua ligação e tenta novamente.", "network_error");
      }
      throw new ChatMediaError(msg || "Falha desconhecida no upload.", "upload_failed");
    }
  } catch (err) {
    if (err instanceof ChatMediaError) throw err;
    console.error(`${LOG} exceção de rede durante o upload`, err);
    throw new ChatMediaError("Falha de rede durante o upload. Verifica a tua ligação e tenta novamente.", "network_error");
  } finally {
    if (simulatedProgressTimer) clearInterval(simulatedProgressTimer);
  }

  onProgress?.(100);
  console.debug(`${LOG} upload concluído`, { path });

  return {
    path,
    contentType: file.type || `${kind === "images" ? "image/jpeg" : kind === "audio" ? "audio/webm" : kind === "video" ? "video/mp4" : "application/octet-stream"}`,
    name: file.name,
    size: file.size,
  };
}

/**
 * Descarrega e decifra um anexo do chat a partir do seu PATH no bucket
 * privado, devolvendo um Blob URL local pronto para usar em <img>/<audio>/<video>.
 *
 * O caller é responsável por revogar o Blob URL (URL.revokeObjectURL) quando
 * deixar de ser necessário, para não acumular memória.
 */
export async function resolveEncryptedChatFile(
  path: string,
  contentType: string,
  communityId: string,
  userId: string,
  onProgress?: (pct: number) => void
): Promise<string | null> {
  try {
    console.debug(`${LOG} a resolver anexo`, { path });
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      console.warn(`${LOG} falha ao gerar signed URL`, signErr);
      return null;
    }

    const res = await fetch(signed.signedUrl);
    if (!res.ok) {
      console.warn(`${LOG} falha ao descarregar anexo`, { status: res.status });
      return null;
    }

    // Lê o corpo em chunks para reportar progresso real (% de bytes recebidos),
    // tal como o WhatsApp mostra durante o download de um anexo.
    const encryptedBlob = await readBlobWithProgress(res, onProgress);

    const decrypted = await decryptFile(encryptedBlob, communityId, userId, contentType);
    if (!decrypted) {
      console.warn(`${LOG} falha ao decifrar anexo (GroupKey indisponível ou corrompido)`, { path });
      return null;
    }

    console.debug(`${LOG} anexo resolvido com sucesso`, { path });
    return URL.createObjectURL(decrypted);
  } catch (err) {
    console.warn(`${LOG} falha ao resolver anexo cifrado`, err);
    return null;
  }
}

/** Lê um Response em chunks via ReadableStream, reportando progresso (0-100)
 *  com base no Content-Length quando disponível. Sem Content-Length (ex.:
 *  resposta comprimida sem tamanho declarado), reporta progresso indeterminado
 *  crescendo até 90% e fecha em 100% no fim — nunca fica "parado". */
async function readBlobWithProgress(res: Response, onProgress?: (pct: number) => void): Promise<Blob> {
  if (!onProgress || !res.body) {
    const blob = await res.blob();
    onProgress?.(100);
    return blob;
  }

  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  onProgress(0);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      if (total > 0) {
        onProgress(Math.min(99, Math.round((received / total) * 100)));
      } else {
        // Sem tamanho conhecido: avança devagar até 90% para nunca parecer parado.
        onProgress(Math.min(90, Math.round(received / 1024)));
      }
    }
  }
  onProgress(100);

  return new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") || undefined });
}

/** Verdadeiro se o valor guardado em msg.image/msg.audio é um path do bucket
 *  privado cifrado (novo formato) em vez de uma URL pública antiga (legado). */
export function isEncryptedChatMediaPath(value: string): boolean {
  return !value.startsWith("http://") && !value.startsWith("https://") && !value.startsWith("blob:");
}
