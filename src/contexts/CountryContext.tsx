import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type CountryInfo = {
  code: string;   // "AO", "BR", "PT", ...
  suffix: string; // "AOA", "BR", "PT", "" ...
  flag: string;   // "🇦🇴", "🇧🇷", ...
  loading: boolean;
};

const COUNTRY_MAP: Record<string, { suffix: string; flag: string }> = {
  AO: { suffix: "AOA", flag: "🇦🇴" },
  BR: { suffix: "BR",  flag: "🇧🇷" },
  PT: { suffix: "PT",  flag: "🇵🇹" },
  MZ: { suffix: "MZ",  flag: "🇲🇿" },
  CV: { suffix: "CV",  flag: "🇨🇻" },
  GW: { suffix: "GW",  flag: "🇬🇼" },
  ST: { suffix: "ST",  flag: "🇸🇹" },
  TL: { suffix: "TL",  flag: "🇹🇱" },
  US: { suffix: "US",  flag: "🇺🇸" },
  GB: { suffix: "UK",  flag: "🇬🇧" },
};

const CountryContext = createContext<CountryInfo>({
  code: "", suffix: "", flag: "", loading: true,
});

const CACHE_KEY = "hooda_country";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

export function CountryProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<CountryInfo>({ code: "", suffix: "", flag: "", loading: true });

  useEffect(() => {
    // Check cache first
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { code, ts } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) {
          const mapped = COUNTRY_MAP[code] ?? { suffix: "", flag: "" };
          setInfo({ code, ...mapped, loading: false });
          return;
        }
      }
    } catch {}

    // Detect via free IP API (no key needed)
    fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) })
      .then(r => r.json())
      .then(d => {
        const code = (d.country_code ?? "").toUpperCase();
        const mapped = COUNTRY_MAP[code] ?? { suffix: "", flag: "" };
        setInfo({ code, ...mapped, loading: false });
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ code, ts: Date.now() })); } catch {}
      })
      .catch(() => {
        setInfo({ code: "", suffix: "", flag: "", loading: false });
      });
  }, []);

  return <CountryContext.Provider value={info}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  return useContext(CountryContext);
}
