// ── Stickers — partilhados entre Mensagens e Salas ──
// Dois formatos suportados:
//  - "video": ficheiro .mp4 curto (pasta /public/stickers)
//  - "lottie": animação vetorial .json (pasta /public/stickers/lottie),
//    leve e nítida em qualquer tamanho de ecrã.

export interface VideoSticker {
  id: string;
  kind: "video" | "lottie";
  url: string;
  label: string;
}

export const VIDEO_STICKERS: VideoSticker[] = [
  { id: "gritar",           kind: "video",  url: "/stickers/gritar.mp4",                    label: "Gritar" },
  { id: "abencoando",       kind: "video",  url: "/stickers/abencoando.mp4",                label: "Abençoando" },
  { id: "emoticons",        kind: "video",  url: "/stickers/emoticons.mp4",                 label: "Emoticons" },
  { id: "gold-medal",       kind: "lottie", url: "/stickers/lottie/gold-medal.json",        label: "Medalha de ouro" },
  { id: "eyes",             kind: "lottie", url: "/stickers/lottie/eyes.json",              label: "Olhos" },
  { id: "bell",             kind: "lottie", url: "/stickers/lottie/bell.json",              label: "Sino" },
  { id: "clap",             kind: "lottie", url: "/stickers/lottie/clap.json",              label: "Palmas" },
  { id: "question",         kind: "lottie", url: "/stickers/lottie/question.json",          label: "Interrogação" },
  { id: "confetti-ball",    kind: "lottie", url: "/stickers/lottie/confetti-ball.json",     label: "Confetes" },
  { id: "gem-stone",        kind: "lottie", url: "/stickers/lottie/gem-stone.json",         label: "Gema" },
  { id: "coin-stack",       kind: "lottie", url: "/stickers/lottie/coin-stack.json",        label: "Moedas" },
  { id: "wrapped-gift",     kind: "lottie", url: "/stickers/lottie/wrapped-gift.json",      label: "Prenda" },
  { id: "trophy",           kind: "lottie", url: "/stickers/lottie/trophy.json",            label: "Troféu" },
  { id: "successfully-done",kind: "lottie", url: "/stickers/lottie/successfully-done.json", label: "Concluído" },
  { id: "fire",             kind: "lottie", url: "/stickers/lottie/fire.json",              label: "Fogo" },
  { id: "flushed",          kind: "lottie", url: "/stickers/lottie/flushed.json",           label: "Envergonhado" },
  { id: "fire-heart",       kind: "lottie", url: "/stickers/lottie/fire-heart.json",        label: "Coração em fogo" },
  { id: "graduation-cap",   kind: "lottie", url: "/stickers/lottie/graduation-cap.json",    label: "Formatura" },
  { id: "broken-heart",     kind: "lottie", url: "/stickers/lottie/broken-heart.json",      label: "Coração partido" },
  { id: "down-arrow",       kind: "lottie", url: "/stickers/lottie/down-arrow.json",        label: "Seta para baixo" },
];

/** Um sticker antigo era guardado como texto de emoji; um novo é sempre um
 * caminho para um ficheiro (vídeo .mp4/.webm ou animação .json). Isto
 * distingue os dois para não partir o histórico de mensagens já enviadas. */
export function isVideoSticker(text: string | null | undefined): boolean {
  return !!text && /\.(mp4|webm|json)(\?.*)?$/i.test(text);
}

export function isLottieSticker(url: string | null | undefined): boolean {
  return !!url && /\.json(\?.*)?$/i.test(url);
}
