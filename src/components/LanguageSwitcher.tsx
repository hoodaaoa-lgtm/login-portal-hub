import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, getCurrentLang, type LangCode } from "@/lib/i18n";
import { Globe, Check } from "lucide-react";

const ACCENT = "#5B3FCF";

export function LanguageSwitcher({ onClose }: { onClose?: () => void }) {
  const { i18n } = useTranslation();
  const current = getCurrentLang();

  function pick(code: LangCode) {
    setLanguage(code);
    onClose?.();
  }

  return (
    <div className="space-y-1.5">
      {LANGUAGES.map((lang) => {
        const active = current === lang.code;
        return (
          <button
            key={lang.code}
            onClick={() => pick(lang.code)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] text-left"
            style={{
              background: active ? `${ACCENT}10` : "transparent",
              border: `1.5px solid ${active ? ACCENT : "transparent"}`,
            }}
          >
            <span className="text-2xl leading-none">{lang.flag}</span>
            <span className="flex-1 text-sm font-semibold" style={{ color: active ? ACCENT : "var(--text-primary)" }}>
              {lang.label}
            </span>
            {active && <Check className="w-4 h-4" style={{ color: ACCENT }} />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Painel de idioma para as configurações ── */
export function LanguagePanel({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const current = getCurrentLang();
  const currentLang = LANGUAGES.find((l) => l.code === current);

  return (
    <div className="fixed inset-0 z-[60] flex" onClick={(e) => e.target === e.currentTarget && onBack()}>
      <div className="absolute inset-0 bg-black/50" onClick={onBack} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xs bg-neutral-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-4 bg-white border-b border-neutral-100">
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-neutral-100 transition">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-neutral-500 rotate-180" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <span className="text-base font-extrabold" style={{ color: "var(--text-primary)" }}>
            {t("settings.language")}
          </span>
        </div>

        <div className="overflow-y-auto flex-1 py-4 px-3">
          <p className="px-2 pb-3 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
            {t("settings.language_desc")}
          </p>
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm px-2 py-2">
            <LanguageSwitcher onClose={onBack} />
          </div>
          <p className="text-center text-[11px] text-neutral-400 mt-4">
            {currentLang?.flag} {currentLang?.label}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Botão compacto para o header (opcional) ── */
export function LanguageButton() {
  const [open, setOpen] = useState(false);
  const current = getCurrentLang();
  const currentLang = LANGUAGES.find((l) => l.code === current);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition hover:opacity-80"
        style={{ background: "var(--s2)", color: "var(--text-secondary)" }}
      >
        <Globe className="w-4 h-4" />
        <span>{currentLang?.flag}</span>
        <span className="uppercase text-xs">{current}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-48 bg-white rounded-2xl shadow-2xl border border-neutral-100 p-2">
            <LanguageSwitcher onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
