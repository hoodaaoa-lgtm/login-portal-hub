/**
 * Otimização de imagens — poupança de dados
 *
 * Todas as imagens do Hooda (avatares, capas, fotos de posts) são
 * hospedadas no Cloudinary. Por defeito, quando se guarda `secure_url`
 * no upload, essa URL aponta para a imagem ORIGINAL — se o utilizador
 * enviou uma foto de 12MP, é isso que é descarregado mesmo que ela
 * apareça como um avatar de 32px no ecrã.
 *
 * O Cloudinary permite pedir uma versão redimensionada/comprimida só
 * mudando a URL (inserindo parâmetros depois de "/upload/"), sem
 * precisar de re-processar nem guardar nada novo. Isto pode cortar
 * 60-90% do peso de imagem sem perda de qualidade percetível, porque
 * nunca vale a pena entregar mais pixels do que os que o ecrã mostra.
 *
 * Uso:
 *   <img src={optimizeImage(post.avatar_url, { width: 64 })} />
 *   <img src={optimizeImage(post.photo, { width: 800 })} />
 */

const CLOUDINARY_HOST = "res.cloudinary.com";
const UPLOAD_SEGMENT = "/image/upload/";

export interface OptimizeImageOptions {
  /** Largura alvo em px (CSS px — o helper já multiplica por dpr internamente
   *  se `dpr` for passado). Se omitida, só aplica compressão/formato automáticos. */
  width?: number;
  height?: number;
  /** "fill" corta para preencher width x height (bom p/ avatares/thumbs quadrados).
   *  "limit" mantém proporção sem cortar (bom p/ fotos de posts). */
  crop?: "fill" | "limit";
  /** Densidade de pixels do ecrã, para não ficar granulado em retina.
   *  Por defeito 2 (cobre a maioria dos telemóveis modernos sem exagerar). */
  dpr?: number;
}

/**
 * Devolve a URL otimizada de uma imagem Cloudinary. Se a URL não for do
 * Cloudinary (ou for null/undefined), devolve tal e qual — nunca parte
 * imagens de outras origens.
 */
export function optimizeImage(
  url: string | null | undefined,
  opts: OptimizeImageOptions = {},
): string {
  if (!url) return url ?? "";
  if (!url.includes(CLOUDINARY_HOST) || !url.includes(UPLOAD_SEGMENT)) return url;

  const { width, height, crop = width && height ? "fill" : "limit", dpr = 2 } = opts;

  const parts = ["q_auto", "f_auto", `dpr_${dpr}`];
  if (width) parts.push(`w_${width}`);
  if (height) parts.push(`h_${height}`);
  if (width || height) parts.push(`c_${crop}`);

  const transform = parts.join(",");
  return url.replace(UPLOAD_SEGMENT, `${UPLOAD_SEGMENT}${transform}/`);
}

/** Atalho para avatares (sempre quadrados, cortados a preencher). */
export function optimizeAvatar(url: string | null | undefined, size = 64): string {
  return optimizeImage(url, { width: size, height: size, crop: "fill" });
}

/** Atalho para fotos de posts/carrossel (mantém proporção, sem cortar). */
export function optimizePostPhoto(url: string | null | undefined, width = 900): string {
  return optimizeImage(url, { width, crop: "limit" });
}

/** Atalho para o fundo desfocado por trás de fotos "contain" — pode ser
 *  minúsculo porque vai levar blur(30px) a seguir, ninguém repara na resolução. */
export function optimizeBlurredBackground(url: string | null | undefined): string {
  return optimizeImage(url, { width: 60, crop: "limit" });
}

/** Atalho para thumbnails pequenos (capa de música, clipes, etc). */
export function optimizeThumbnail(url: string | null | undefined, size = 200): string {
  return optimizeImage(url, { width: size, height: size, crop: "fill" });
}
