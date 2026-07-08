// Som de notificação gerado via Web Audio API — sem depender de ficheiro
// .mp3 externo (funciona offline, sem pedidos de rede, mais leve).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Toca um "ping" suave de duas notas — usado para notificações normais */
export function playNotificationSound() {
  try {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const notes: Array<{ freq: number; start: number; dur: number; gain: number }> = [
      { freq: 880, start: 0,    dur: 0.14, gain: 0.16 },
      { freq: 1318.5, start: 0.09, dur: 0.22, gain: 0.13 },
    ];

    notes.forEach(({ freq, start, dur, gain }) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(gain, now + start + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    });
  } catch {
    // Silenciosamente ignora — som nunca deve quebrar a app
  }
}

/** Som mais suave para mensagens (single "pop") */
export function playMessageSound() {
  try {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.09);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // no-op
  }
}
