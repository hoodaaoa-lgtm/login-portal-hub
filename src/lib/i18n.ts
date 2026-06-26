import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";

export const LANGUAGES = [
  { code: "pt", label: "Português", flag: "🇵🇹", dir: "ltr" },
  { code: "en", label: "English",   flag: "🇬🇧", dir: "ltr" },
  { code: "fr", label: "Français",  flag: "🇫🇷", dir: "ltr" },
  { code: "es", label: "Español",   flag: "🇪🇸", dir: "ltr" },
  { code: "ar", label: "العربية",   flag: "🇸🇦", dir: "rtl" },
] as const;

export type LangCode = typeof LANGUAGES[number]["code"];

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "pt",
    supportedLngs: LANGUAGES.map((l) => l.code),
    defaultNS: "common",
    ns: ["common"],
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "hooda_lang",
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export function setLanguage(code: LangCode) {
  i18n.changeLanguage(code);
  localStorage.setItem("hooda_lang", code);
  // RTL support
  const lang = LANGUAGES.find((l) => l.code === code);
  document.documentElement.dir = lang?.dir ?? "ltr";
  document.documentElement.lang = code;
}

export function getCurrentLang(): LangCode {
  return (i18n.language?.slice(0, 2) as LangCode) ?? "pt";
}

export default i18n;
