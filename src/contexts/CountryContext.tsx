import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type CountryInfo = {
  code: string;
  suffix: string;
  flag: string;
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

const DEFAULT: CountryInfo = { code: "", suffix: "", flag: "", loading: false };

const CountryContext = createContext<CountryInfo>(DEFAULT);

export function CountryProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<CountryInfo>({ ...DEFAULT, loading: true });

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      // Check sessionStorage cache
      try {
        const raw = sessionStorage.getItem("hooda_country");
        if (raw) {
          const { code } = JSON.parse(raw);
          const mapped = COUNTRY_MAP[code] ?? { suffix: "", flag: "" };
          if (!cancelled) setInfo({ code, ...mapped, loading: false });
          return;
        }
      } catch {}

      // Fetch IP info with timeout
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        clearTimeout(timer);
        const d = await res.json();
        const code = (d?.country_code ?? "").toUpperCase();
        const mapped = COUNTRY_MAP[code] ?? { suffix: "", flag: "" };
        if (!cancelled) setInfo({ code, ...mapped, loading: false });
        try { sessionStorage.setItem("hooda_country", JSON.stringify({ code })); } catch {}
      } catch {
        // Silently fail — just show "hooda" without suffix
        if (!cancelled) setInfo(DEFAULT);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, []);

  return <CountryContext.Provider value={info}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  try {
    return useContext(CountryContext);
  } catch {
    return DEFAULT;
  }
}
