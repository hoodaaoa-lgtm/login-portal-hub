// ── Stickers em vídeo — partilhados entre Mensagens e Salas ──
// Substituem os antigos "stickers" (que na verdade eram só emoji grandes).
// São vídeos curtos, servidos como ficheiros estáticos em /public/stickers.

export interface VideoSticker {
  id: string;
  url: string;
  label: string;
}

export const VIDEO_STICKERS: VideoSticker[] = [
  { id: "gritar",     url: "/stickers/gritar.mp4",     label: "Gritar" },
  { id: "abencoando", url: "/stickers/abencoando.mp4",  label: "Abençoando" },
  { id: "emoticons",  url: "/stickers/emoticons.mp4",   label: "Emoticons" },
];

/** Um sticker antigo era guardado como texto de emoji; um novo é sempre um
 * caminho para um vídeo. Isto distingue os dois para não partir o histórico. */
export function isVideoSticker(text: string | null | undefined): boolean {
  return !!text && /\.(mp4|webm)(\?.*)?$/i.test(text);
}
