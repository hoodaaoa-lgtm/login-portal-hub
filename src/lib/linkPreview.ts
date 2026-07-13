// ── Link Preview inteligente — partilhado entre Mensagens e Publicações ──
// Detecta o primeiro URL num texto e prepara os dados para uma prévia rica:
// título, imagem, descrição e domínio — igual ao WhatsApp/Telegram/Twitter.
// Se for YouTube/vídeo direto/publicação Baya, os dados para embutir o
// player vêm daqui também. Esta lógica nasceu em mensagens.tsx e foi
// extraída para aqui para ser reutilizada também no feed de publicações.

import { supabase } from "@/integrations/supabase/client";

// Reconhece: link completo (http/https), link começado por "www.", e
// domínio "nu" com ou sem caminho (ex: "youtube.com/watch?v=...",
// "youtu.be/xxxx", ou simplesmente "instagram.com") — os formatos mais
// comuns quando se cola um link direto da barra de endereço do telemóvel,
// sem protocolo. A lista de TLDs evita apanhar "palavra.palavra" comum em
// texto normal como se fosse um domínio.
const COMMON_TLDS = "com|net|org|io|co|ao|pt|br|info|biz|app|dev|me|tv|gg|xyz|live|shop|online|site|club|store|blog|edu|gov|mil|us|uk|ca|de|fr|es|it|nl|ru|cn|jp|kr|au|za|ng|ke|mz|cv";
const URL_REGEX = new RegExp(
  `https?:\\/\\/[^\\s<>"']+|www\\.[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}[^\\s<>"']*|(?:[a-zA-Z0-9-]+\\.)+(?:${COMMON_TLDS})(?:\\/[^\\s<>"']*)?\\b`,
  "gi"
);

export function extractUrl(text: string): string | null {
  const m = text.match(URL_REGEX);
  if (!m) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/** Parse real da URL em vez de regex frágil — funciona com qualquer ordem
 * de parâmetros (ex: partilhas do telemóvel que trazem "?si=..." antes
 * de "v="), domínios m.youtube.com / youtube-nocookie.com, /live/, etc. */
export function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id.length === 11 ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v && v.length === 11 ? v : null;
      }
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Deteta um link para uma publicação/vídeo da própria Baya (ex: /post/<id>),
 * seja qual for o domínio (produção, preview, localhost) — basta o caminho
 * bater certo. Isto permite ir buscar os dados reais diretamente à base de
 * dados (mais rápido e fiável que uma API externa) e reproduzir o vídeo
 * mesmo dentro da prévia. */
export function getBayaPostId(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/post\/([0-9a-fA-F-]{36})\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export interface BayaPostPreview {
  id: string;
  content: string | null;
  photo_url: string | null;
  photos: string[] | null;
  video_url: string | null;
  author_name: string | null;
  author_username: string | null;
  author_color: string | null;
}

const bayaPostCache = new Map<string, BayaPostPreview | null>();

export async function fetchBayaPost(id: string): Promise<BayaPostPreview | null> {
  if (bayaPostCache.has(id)) return bayaPostCache.get(id)!;
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("id,content,photo_url,photos,video_url,author_name,author_username,author_color")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) throw error ?? new Error("not found");
    bayaPostCache.set(id, data as BayaPostPreview);
    return data as BayaPostPreview;
  } catch {
    bayaPostCache.set(id, null);
    return null;
  }
}

export function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

export interface OgData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  siteName?: string;
}

const ogCache = new Map<string, OgData | null>();

export async function fetchOgData(url: string): Promise<OgData | null> {
  if (ogCache.has(url)) return ogCache.get(url)!;
  try {
    // Usa microlink.io — API gratuita, sem key, suporta YouTube/Twitter/etc.
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false`);
    if (!res.ok) throw new Error("microlink fail");
    const json = await res.json();
    if (json.status !== "success") throw new Error("no data");
    const d = json.data;
    const data: OgData = {
      title: d.title ?? undefined,
      description: d.description ?? undefined,
      image: d.image?.url ?? d.logo?.url ?? undefined,
      url: d.url ?? url,
      siteName: d.publisher ?? new URL(url).hostname.replace("www.", ""),
    };
    ogCache.set(url, data);
    return data;
  } catch {
    // A API externa pode falhar por instabilidade/limite de pedidos — em
    // vez de não mostrar nada, mostra pelo menos um cartão simples com o
    // domínio, para o link nunca ficar "em branco".
    let fallback: OgData | null = null;
    try { fallback = { url, siteName: new URL(url).hostname.replace("www.", "") }; } catch {}
    ogCache.set(url, fallback);
    return fallback;
  }
}
