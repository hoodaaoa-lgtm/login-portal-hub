/**
 * mediaManager v2 — controlo global de media (vídeos + áudio) para a app hooda.
 *
 * Garante comportamento profissional idêntico ao Facebook/Instagram/TikTok:
 *   • Só um vídeo toca de cada vez em toda a app.
 *   • Ao abrir um modal: pausa TUDO imediatamente, bloqueia scroll da página,
 *     e só permite reprodução dentro do modal.
 *   • Ao fechar um modal: para e reseta o vídeo do modal, desbloqueia o scroll.
 *   • Stack de modais: suporta vários modais abertos ao mesmo tempo (fecha ao
 *     contrário da ordem de abertura).
 *   • Sem vazamentos de memória: todos os listeners são limpos ao desmontar.
 */

/* ─── Registo de vídeos ─────────────────────────────────────────── */

const registry = new Map<string, HTMLVideoElement>();
let activeVideoId: string | null = null;

/** Regista um <video> no manager. Devolve cleanup para usar no return do useEffect. */
export function registerVideo(id: string, el: HTMLVideoElement): () => void {
  registry.set(id, el);
  return () => {
    registry.delete(id);
    if (activeVideoId === id) activeVideoId = null;
  };
}

/**
 * Chamar no onPlay do <video>.
 * Pausa automaticamente todos os outros vídeos registados.
 */
export function notifyVideoPlaying(id: string) {
  registry.forEach((el, rid) => {
    if (rid !== id && !el.paused) {
      el.pause();
    }
    // Só um vídeo pode ter som ativo de cada vez em toda a app — ao tocar
    // este, todos os outros silenciam automaticamente (o "volumechange"
    // no HoodaPlayer sincroniza o ícone de som de cada um).
    if (rid !== id && !el.muted) {
      el.muted = true;
    }
  });
  activeVideoId = id;
}

/**
 * Pausa todos os vídeos, opcionalmente excluindo um (o do modal).
 */
export function pauseAllExcept(exceptId?: string) {
  registry.forEach((el, id) => {
    if (id !== exceptId && !el.paused) {
      el.pause();
    }
  });
  if (!exceptId) activeVideoId = null;
}

/** Alias retrocompatível */
export const pauseAllVideos = pauseAllExcept;

/**
 * Incrementa o contador de modais abertos.
 * Chamado internamente pelo PostCommentsModal ao montar.
 */
export function incrementModalDepth() {
  const wasOpen = modalDepth > 0;
  modalDepth++;
  if (!wasOpen) emitModalState(true);
}

/**
 * Decrementa o contador de modais abertos.
 * Chamado internamente pelo PostCommentsModal ao desmontar.
 */
export function decrementModalDepth() {
  modalDepth = Math.max(0, modalDepth - 1);
  if (modalDepth === 0) emitModalState(false);
}

/* ─── Eventos de modal (pub/sub simples) ───────────────────────── */

type ModalListener = (open: boolean) => void;
const modalListeners = new Set<ModalListener>();

/** Subscreve notificações de modal aberto/fechado. Devolve unsubscribe. */
export function onModalStateChange(fn: ModalListener): () => void {
  modalListeners.add(fn);
  return () => modalListeners.delete(fn);
}

function emitModalState(open: boolean) {
  modalListeners.forEach((fn) => fn(open));
}

/**
 * Para completamente um vídeo: pausa + reset para o início.
 * Usar ao fechar modal para não deixar áudio em background.
 */
export function stopAndResetVideo(id: string) {
  const el = registry.get(id);
  if (!el) return;
  if (!el.paused) el.pause();
  try { el.currentTime = 0; } catch {}
  if (activeVideoId === id) activeVideoId = null;
}

/* ─── Stack de modais + scroll lock ────────────────────────────── */

let modalDepth = 0;
const originalOverflow = { value: "" };

/**
 * Chamar quando qualquer modal abre.
 * Pausa todo o conteúdo de fundo e bloqueia o scroll da página.
 */
export function onModalOpen(exceptVideoId?: string) {
  // Pausa tudo imediatamente
  pauseAllExcept(exceptVideoId);

  modalDepth++;
  if (modalDepth === 1) {
    // Guarda o overflow original e bloqueia o scroll
    originalOverflow.value = document.body.style.overflow;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
  }
}

/**
 * Chamar quando qualquer modal fecha.
 * Para o vídeo do modal e restaura o scroll.
 */
export function onModalClose(modalVideoId?: string) {
  // Para e reseta o vídeo do modal
  if (modalVideoId) {
    stopAndResetVideo(modalVideoId);
  }

  modalDepth = Math.max(0, modalDepth - 1);

  if (modalDepth === 0) {
    // Restaura o scroll na posição exata onde estava
    const scrollY = parseInt(document.body.style.top || "0", 10) * -1;
    document.body.style.overflow = originalOverflow.value || "";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollY);
  }
}

/** Diz se há algum modal aberto neste momento. */
export function isModalOpen(): boolean {
  return modalDepth > 0;
}
