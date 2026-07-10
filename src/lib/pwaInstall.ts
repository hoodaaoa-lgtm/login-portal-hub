/**
 * Instalação da PWA — lógica partilhada.
 *
 * O evento `beforeinstallprompt` só existe no Android (Chrome/Edge/etc) e só
 * dispara depois da página carregar; por isso é capturado uma única vez, à
 * escala do módulo, para poder ser usado por qualquer componente que
 * apareça depois (WelcomeInstallPrompt no /home, InstallPwaButton na
 * landing, etc) — não há como "adiantar" isto num link, é o browser que
 * decide quando o evento existe.
 *
 * iOS (Safari) nunca dispara este evento — a Apple não o suporta. Lá só há
 * o caminho manual: Partilhar → Adicionar ao Ecrã Principal. `isIos()`
 * existe para os componentes mostrarem essas instruções em vez de um
 * botão que nunca vai funcionar.
 */

let deferredPrompt: any = null;
let listenerAttached = false;

function attachListener() {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent("hooda:pwa-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markInstalledOnServer();
  });
}
attachListener();

// iOS nunca dispara "appinstalled" — se a app já está a correr em modo
// standalone (utilizador já fez "Adicionar ao Ecrã Principal" antes), marca
// aqui, já que é o único momento em que temos essa confirmação.
if (typeof window !== "undefined" && isRunningStandalone()) {
  markInstalledOnServer();
}

/** Marca profiles.pwa_installed=true para o utilizador atual, para o admin
 * poder segmentar envios por "ainda não instalou". Falha em silêncio (não é
 * crítico para a instalação em si já ter acontecido). Import feito
 * dinamicamente para não obrigar este módulo, usado logo no arranque da
 * app, a carregar o cliente Supabase antes de ser preciso. */
async function markInstalledOnServer() {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await (supabase as any).from("profiles").update({ pwa_installed: true }).eq("id", session.user.id);
  } catch {
    // silencioso — o essencial (a instalação) já aconteceu
  }
}

/** true se o browser já ofereceu o prompt nativo de instalação (Android). */
export function canPromptInstall(): boolean {
  return !!deferredPrompt;
}

/** true se a app já está a correr instalada (standalone), em qualquer OS. */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true // Safari iOS
  );
}

/** true em iOS Safari — onde não existe beforeinstallprompt, só o caminho manual. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
}

/**
 * Dispara o prompt nativo de instalação (Android). Devolve o resultado da
 * escolha do utilizador, ou null se o browser ainda não ofereceu o prompt
 * (ex.: critérios de instalabilidade ainda não cumpridos, ou já instalado).
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  if (!deferredPrompt) return null;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice?.outcome ?? null;
}

/** Regista um callback para quando o prompt de instalação ficar disponível. */
export function onInstallable(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hooda:pwa-installable", cb);
  return () => window.removeEventListener("hooda:pwa-installable", cb);
}
