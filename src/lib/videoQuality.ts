/**
 * videoQuality — cérebro do sistema de qualidade adaptativa de vídeo.
 *
 * A Hooda usa Cloudflare Stream, que já gera automaticamente várias
 * resoluções (144p→1080p+) e serve um manifesto HLS (.m3u8). O hls.js no
 * HoodaPlayer já sabe subir/descer de qualidade sozinho em modo "auto"
 * (ABR nativo, monitoriza buffer/largura de banda). O papel deste módulo
 * é decidir, ANTES e DURANTE a reprodução, que nível inicial usar
 * consoante:
 *   - a preferência global do utilizador (video_preferences)
 *   - a rede atual (Network Information API, quando disponível)
 *   - o tipo de dispositivo
 *
 * Não reinventa o ABR — só define o ponto de partida e os limites que o
 * hls.js deve respeitar.
 */

export type QualityMode = "auto" | "data_saver" | "high_quality" | "manual";
export type ResolutionLabel = "144p" | "240p" | "360p" | "480p" | "720p" | "1080p" | "1440p" | "4k";

export interface VideoPreference {
  quality_mode: QualityMode;
  preferred_resolution: ResolutionLabel | null;
  data_saver_enabled: boolean;
}

export const RESOLUTION_HEIGHT: Record<ResolutionLabel, number> = {
  "144p": 144,
  "240p": 240,
  "360p": 360,
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "4k": 2160,
};

export function resolutionFromHeight(height: number): ResolutionLabel {
  if (height <= 144) return "144p";
  if (height <= 240) return "240p";
  if (height <= 360) return "360p";
  if (height <= 480) return "480p";
  if (height <= 720) return "720p";
  if (height <= 1080) return "1080p";
  if (height <= 1440) return "1440p";
  return "4k";
}

export function labelWithSuffix(label: ResolutionLabel): string {
  if (label === "1080p") return "1080p Full HD";
  if (label === "720p") return "720p HD";
  if (label === "4k") return "4K";
  return label;
}

/** Leitura best-effort da Network Information API (só existe em Chrome/Android). */
export interface NetworkSnapshot {
  effectiveType: "slow-2g" | "2g" | "3g" | "4g" | "unknown";
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
}

export function readNetworkSnapshot(): NetworkSnapshot {
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!conn) {
    return { effectiveType: "unknown", downlinkMbps: null, rttMs: null, saveData: false };
  }

  return {
    effectiveType: conn.effectiveType ?? "unknown",
    downlinkMbps: typeof conn.downlink === "number" ? conn.downlink : null,
    rttMs: typeof conn.rtt === "number" ? conn.rtt : null,
    saveData: !!conn.saveData,
  };
}

/**
 * Escolhe a altura-alvo (px) para o nível inicial do hls.js, dado a
 * preferência do utilizador + a rede atual. Isto é só o ARRANQUE — depois
 * disso, em modo "auto"/"high_quality", o hls.js assume o controlo via ABR.
 */
export function pickStartingHeight(pref: VideoPreference | null, screenHeight: number): number {
  const net = readNetworkSnapshot();

  // Modo manual: o utilizador escolheu uma resolução fixa — respeitar sempre.
  if (pref?.quality_mode === "manual" && pref.preferred_resolution) {
    return RESOLUTION_HEIGHT[pref.preferred_resolution];
  }

  // Economia de dados: nunca passar de 480p, e cai para 360p em rede fraca.
  if (pref?.quality_mode === "data_saver" || pref?.data_saver_enabled || net.saveData) {
    if (net.effectiveType === "slow-2g" || net.effectiveType === "2g") return 240;
    if (net.effectiveType === "3g") return 360;
    return 480;
  }

  // Qualidade superior: tenta sempre o máximo que o ecrã suporta.
  if (pref?.quality_mode === "high_quality") {
    return Math.max(screenHeight, 1080);
  }

  // Automático (default/recomendado): decide pela rede + tamanho de ecrã.
  if (net.effectiveType === "slow-2g" || net.effectiveType === "2g") return 240;
  if (net.effectiveType === "3g") return 360;

  if (net.downlinkMbps != null) {
    if (net.downlinkMbps < 1.5) return 360;
    if (net.downlinkMbps < 3) return 480;
    if (net.downlinkMbps < 6) return 720;
    if (net.downlinkMbps < 12) return Math.min(screenHeight, 1080);
    return Math.min(screenHeight, 2160);
  }

  // Sem dados de rede disponíveis (Safari/iOS, a maioria): assume boa
  // ligação mas limita ao tamanho real do ecrã para não desperdiçar dados.
  return Math.min(Math.max(screenHeight, 480), 1080);
}

/** Heurística leve de "hábitos" (ponto 8) — sem servidor/modelo de IA,
 * só um histórico local que ajusta o ponto de partida ao longo do tempo.
 * Guardado em localStorage, nunca substitui a preferência explícita do
 * utilizador quando ela existe. */
const HABITS_KEY = "hooda_video_habits_v1";

interface HabitsLog {
  samples: { hour: number; height: number }[];
}

export function recordQualityChoice(height: number) {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    const log: HabitsLog = raw ? JSON.parse(raw) : { samples: [] };
    log.samples.push({ hour: new Date().getHours(), height });
    if (log.samples.length > 50) log.samples.shift();
    localStorage.setItem(HABITS_KEY, JSON.stringify(log));
  } catch {
    /* localStorage indisponível — ignora silenciosamente */
  }
}

/** Só usado quando não há nenhuma preferência gravada nem sinal de rede
 * (fallback do fallback): média da qualidade usada nesta hora do dia. */
export function suggestFromHabits(): number | null {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    if (!raw) return null;
    const log: HabitsLog = JSON.parse(raw);
    const hour = new Date().getHours();
    const nearby = log.samples.filter((s) => Math.abs(s.hour - hour) <= 1);
    if (nearby.length < 3) return null;
    const avg = nearby.reduce((sum, s) => sum + s.height, 0) / nearby.length;
    return Math.round(avg);
  } catch {
    return null;
  }
}
