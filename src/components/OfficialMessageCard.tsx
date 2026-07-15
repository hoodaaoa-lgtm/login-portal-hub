import { useState, useEffect } from "react";
import { ChevronLeft, Share, PlusSquare, Trash2, Check, Download, X, Sparkles } from "lucide-react";
import {
  OFFICIAL_CATEGORY_META,
  markOfficialMessageClicked,
  archiveOfficialMessage,
  type UserOfficialMessage,
} from "@/lib/officialMessages";
import { canPromptInstall, promptInstall, isIos, isRunningStandalone, onInstallable } from "@/lib/pwaInstall";

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

/** Item da lista da caixa de entrada — parece um cartão, nunca uma conversa normal. */
export function OfficialMessageListItem({ item, active, onClick }: {
  item: UserOfficialMessage;
  active?: boolean;
  onClick: () => void;
}) {
  const meta = OFFICIAL_CATEGORY_META[item.message.category];
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition"
      style={{ background: active ? "#f5f5f7" : "transparent" }}
    >
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${meta.color}18` }}>
        <meta.Icon className="h-5 w-5" style={{ color: meta.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold truncate" style={{ color: meta.color }}>{meta.label}</p>
          <span className="text-[11px] text-neutral-400 shrink-0">{timeAgo(item.received_at)}</span>
        </div>
        <p className={`text-[13px] truncate ${item.is_read ? "text-neutral-400" : "text-neutral-900 font-semibold"}`}>
          {item.message.title}
        </p>
      </div>
      {!item.is_read && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#2F6FED" }} />}
    </button>
  );
}

/** Ajuda manual de instalação no iOS — mesmos passos do InstallPwaButton. */
function IosInstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-sm lg:mx-4 lg:rounded-3xl rounded-t-3xl bg-white p-5">
        <p className="font-extrabold text-[16px] text-black mb-4">Instalar no iPhone</p>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
            <Share className="h-4.5 w-4.5" style={{ color: "#2F6FED" }} />
          </div>
          <p className="text-[13px] text-neutral-600 leading-snug">Toca no ícone de <b>Partilhar</b> na barra do Safari</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
            <PlusSquare className="h-4.5 w-4.5" style={{ color: "#2F6FED" }} />
          </div>
          <p className="text-[13px] text-neutral-600 leading-snug">Escolhe <b>"Adicionar ao Ecrã Principal"</b></p>
        </div>
        <button onClick={onClose} className="w-full mt-5 py-2.5 rounded-2xl font-bold text-sm text-white" style={{ background: "#2F6FED" }}>
          Entendi
        </button>
      </div>
    </div>
  );
}

/** Modal com a marca da Snapper, mostrado ANTES do prompt nativo do browser.
 * O prompt nativo do Chrome/Edge (janela cinzenta "Instale o app") não pode
 * ser removido — é o browser que decide essa UI por segurança — mas assim o
 * utilizador vê primeiro o nosso ecrã, com a nossa mensagem, e só depois
 * aparece a confirmação do sistema. */
function SnapperInstallModal({ title, onConfirm, onClose, installing }: {
  title: string;
  onConfirm: () => void;
  onClose: () => void;
  installing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full lg:max-w-sm lg:mx-4 lg:rounded-3xl rounded-t-3xl bg-white p-5 relative">
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center">
          <X className="h-3.5 w-3.5 text-neutral-500" />
        </button>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "#2F6FED" }}>
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <p className="font-extrabold text-[17px] text-black mb-1">{title}</p>
        <p className="text-[13px] text-neutral-500 leading-snug mb-5">
          Instala a Snapper no teu ecrã inicial para nunca perderes uma mensagem ou like novo.
        </p>
        <button
          onClick={onConfirm}
          disabled={installing}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-[14px] text-white transition active:scale-95 disabled:opacity-60"
          style={{ background: "#2F6FED" }}
        >
          {installing ? "A instalar…" : (<><Download className="h-4 w-4" /> Instalar app</>)}
        </button>
        <button onClick={onClose} className="w-full text-center py-2.5 text-[13px] font-semibold text-neutral-400">
          Agora não
        </button>
      </div>
    </div>
  );
}

/** Vista de detalhe — cartão rico, sem composer, sem responder. Ocupa o
 * lugar do ChatPanel quando uma mensagem oficial está selecionada. */
export function OfficialMessageDetail({ item, onBack, onArchived }: {
  item: UserOfficialMessage;
  onBack: () => void;
  onArchived: () => void;
}) {
  const { message } = item;
  const meta = OFFICIAL_CATEGORY_META[message.category];
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installReady, setInstallReady] = useState(canPromptInstall());
  const [installed, setInstalled] = useState(isRunningStandalone());

  useEffect(() => onInstallable(() => setInstallReady(true)), []);

  function handleAction() {
    markOfficialMessageClicked(item.id);
    if (message.action_type === "install_pwa") {
      if (installed) return;
      if (isIos()) { setShowIosHelp(true); return; }
      // Mostra primeiro o nosso modal com a marca da Snapper — o prompt nativo
      // do browser só aparece depois de o utilizador confirmar aqui.
      setShowInstallModal(true);
      return;
    }
    if (message.action_type === "open_link" && message.action_value) {
      window.open(message.action_value, "_blank", "noopener,noreferrer");
      return;
    }
    if (message.action_type === "open_page" && message.action_value) {
      window.location.href = message.action_value;
    }
  }

  async function confirmInstall() {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    setShowInstallModal(false);
    if (outcome === "accepted") setInstalled(true);
  }

  async function handleArchive() {
    await archiveOfficialMessage(item.id);
    onArchived();
  }

  const showInstalledState = message.action_type === "install_pwa" && installed;
  const canShowButton = message.action_type !== "none" && message.button_text;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto" style={{ background: "#f7f7f9" }}>
      <div className="px-4 py-3 flex items-center gap-3 shrink-0 border-b bg-white" style={{ borderColor: "#ececf1" }}>
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center md:hidden" style={{ background: "#f5f5f7" }}>
          <ChevronLeft className="h-4.5 w-4.5 text-neutral-600" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${meta.color}18` }}>
          <meta.Icon className="h-4 w-4" style={{ color: meta.color }} />
        </div>
        <p className="font-bold text-sm" style={{ color: meta.color }}>{meta.label}</p>
        <div className="flex-1" />
        <button onClick={handleArchive} title="Arquivar" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#f5f5f7" }}>
          <Trash2 className="h-4 w-4 text-neutral-400" />
        </button>
      </div>

      <div className="flex-1 flex items-start justify-center p-4 md:p-8">
        <div className="w-full max-w-sm rounded-3xl overflow-hidden bg-white shadow-sm">
          {message.image_url && (
            <img src={message.image_url} alt="" className="w-full aspect-[16/10] object-cover" />
          )}
          <div className="p-5">
            <p className="text-[18px] font-extrabold text-neutral-900 leading-snug mb-2">{message.title}</p>
            <p className="text-[14px] text-neutral-500 leading-relaxed mb-5">{message.description}</p>

            {showInstalledState ? (
              <div className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm" style={{ background: "#f5f5f7", color: "#6BA547" }}>
                <Check className="h-4 w-4" /> Aplicação instalada
              </div>
            ) : canShowButton ? (
              <button onClick={handleAction}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white transition active:scale-95"
                style={{ background: "#2F6FED" }}>
                {message.button_text}
              </button>
            ) : null}

            <p className="text-[11px] text-neutral-300 mt-4 text-center">{timeAgo(message.created_at)}</p>
          </div>
        </div>
      </div>

      {showIosHelp && <IosInstallHelp onClose={() => setShowIosHelp(false)} />}
      {showInstallModal && (
        <SnapperInstallModal
          title={message.title}
          installing={installing}
          onConfirm={confirmInstall}
          onClose={() => setShowInstallModal(false)}
        />
      )}
    </div>
  );
}
