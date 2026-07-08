import React, { useEffect, useState } from "react";
import { Download, Bell, X, Sparkles, Check } from "lucide-react";
import { enablePushNotifications, isPushSupported } from "@/lib/pushNotifications";

const ACCENT = "#5B3FCF";
const SEEN_KEY = "hooda_welcome_seen";
const INSTALLED_KEY = "hooda_app_installed_notice_shown";

let deferredPrompt: any = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

export function WelcomeInstallPrompt({ userId }: { userId: string | null }) {
  const [step, setStep] = useState<"hidden" | "welcome" | "installed">("hidden");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen) {
      const t = setTimeout(() => setStep("welcome"), 900);
      return () => clearTimeout(t);
    }
  }, [userId]);

  useEffect(() => {
    function onInstalled() {
      if (localStorage.getItem(INSTALLED_KEY)) return;
      localStorage.setItem(INSTALLED_KEY, "1");
      setStep("installed");
      setTimeout(() => setStep("hidden"), 5000);
    }
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
    if (userId && isPushSupported()) {
      setInstalling(true);
      await enablePushNotifications(userId);
      setInstalling(false);
    }
    dismiss();
  }

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "1");
    setStep("hidden");
  }

  if (step === "hidden") return null;

  return (
    <>
      <div className="fixed inset-0 z-[998] bg-black/40" style={{ backdropFilter: "blur(3px)" }} onClick={dismiss} />
      <div
        className="fixed z-[999] left-1/2 shadow-2xl rounded-3xl overflow-hidden"
        style={{
          bottom: "env(safe-area-inset-bottom, 16px)",
          transform: "translateX(-50%)",
          width: "min(380px, calc(100vw - 32px))",
          marginBottom: 16,
          background: "#fff",
          animation: "welcomePopIn 0.35s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <style>{`@keyframes welcomePopIn { from { transform: translateX(-50%) translateY(24px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }`}</style>

        {step === "welcome" && (
          <div className="p-5" style={{ background: `linear-gradient(160deg, ${ACCENT}10, transparent)` }}>
            <button onClick={dismiss} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center">
              <X className="h-3.5 w-3.5 text-neutral-500" />
            </button>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: ACCENT }}>
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <p className="font-extrabold text-[17px] text-black mb-1">Bem-vindo à Hooda! 🎉</p>
            <p className="text-[13px] text-neutral-500 leading-snug mb-4">
              Instala a app e ativa as notificações para nunca perderes uma mensagem, like ou acompanhante novo — mesmo com o telemóvel fechado.
            </p>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="w-full flex items-center justify-center gap-2 rounded-full py-3 font-bold text-[14px] text-white transition disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {installing ? "A ativar…" : (<><Download className="h-4 w-4" /> Instalar app e ativar notificações</>)}
            </button>
            <button onClick={dismiss} className="w-full text-center py-2.5 text-[13px] font-semibold text-neutral-400">
              Agora não
            </button>
          </div>
        )}

        {step === "installed" && (
          <div className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#1FAFA6" }}>
              <Check className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-[14px] text-black">App instalada!</p>
              <p className="text-[12px] text-neutral-500">Vais receber notificações a partir de agora.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
