import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";
import { canPromptInstall, promptInstall, isIos, isRunningStandalone, onInstallable } from "@/lib/pwaInstall";

const ACCENT = "#2F6FED";

/**
 * Botão "Instalar app" para páginas onde ainda não há sessão (ex.: a
 * landing/login) — é o que faz o link do site funcionar como "link de
 * instalar" para quem ainda não tem conta. No Android dispara o prompt
 * nativo assim que o browser o disponibilizar; no iOS (que nunca oferece
 * esse prompt) mostra o caminho manual em vez de um botão morto.
 */
export function InstallPwaButton({ className = "" }: { className?: string }) {
  const [ready, setReady] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setReady(canPromptInstall());
    setInstalled(isRunningStandalone());
    return onInstallable(() => setReady(true));
  }, []);

  if (installed) return null;
  // Nem Android com prompt disponível, nem iOS — não há nada de útil a
  // oferecer ainda (ex.: desktop, ou critérios de instalabilidade do
  // Android ainda não cumpridos nesta visita) — não mostra botão morto.
  if (!ready && !isIos()) return null;

  async function handleClick() {
    if (isIos()) { setShowIosHelp(true); return; }
    await promptInstall();
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center justify-center gap-2 rounded-full px-4 py-2.5 font-bold text-[14px] text-white transition active:scale-95 ${className}`}
        style={{ background: ACCENT }}
      >
        <Download className="h-4 w-4" /> Instalar app
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-[999] flex items-end lg:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setShowIosHelp(false)}>
          <div className="w-full lg:max-w-sm lg:mx-4 lg:rounded-3xl rounded-t-3xl bg-white p-5"
            style={{ animation: "welcomePopIn 0.25s cubic-bezier(0.16,1,0.3,1)" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-extrabold text-[16px] text-black">Instalar no iPhone</p>
              <button onClick={() => setShowIosHelp(false)} className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                <X className="h-4 w-4 text-neutral-500" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Share className="h-4.5 w-4.5" style={{ color: ACCENT }} />
              </div>
              <p className="text-[13px] text-neutral-600 leading-snug">Toca no ícone de <b>Partilhar</b> na barra do Safari</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <PlusSquare className="h-4.5 w-4.5" style={{ color: ACCENT }} />
              </div>
              <p className="text-[13px] text-neutral-600 leading-snug">Escolhe <b>"Adicionar ao Ecrã Principal"</b></p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
