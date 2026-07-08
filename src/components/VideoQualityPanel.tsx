import { Gauge, Wifi, Sparkles, MonitorPlay, Check } from "lucide-react";
import { SettingsSubPanel } from "@/routes/perfil";
import { useVideoPreferences } from "@/hooks/useVideoPreferences";
import type { QualityMode, ResolutionLabel } from "@/lib/videoQuality";

const ACCENT = "#5B3FCF";

const MANUAL_OPTIONS: ResolutionLabel[] = ["144p", "240p", "360p", "480p", "720p", "1080p"];

const MODE_OPTIONS: { mode: QualityMode; icon: React.ElementType; label: string; desc: string }[] = [
  { mode: "auto", icon: Sparkles, label: "Automático (recomendado)", desc: "Ajusta a qualidade à tua internet em tempo real" },
  { mode: "data_saver", icon: Wifi, label: "Economia de dados", desc: "Prioriza poupar dados móveis, nunca acima de 480p" },
  { mode: "high_quality", icon: Gauge, label: "Qualidade superior", desc: "Sempre a melhor qualidade que o teu ecrã suporta" },
  { mode: "manual", icon: MonitorPlay, label: "Resolução fixa", desc: "Escolhe uma resolução e usa sempre essa" },
];

export function VideoQualityPanel({ onBack }: { onBack: () => void }) {
  const { preference, setPreference } = useVideoPreferences();

  return (
    <SettingsSubPanel title="Vídeo e dados" onBack={onBack}>
      <p className="px-4 pb-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Esta preferência aplica-se a todos os vídeos da Hooda, em qualquer sessão.
      </p>

      {MODE_OPTIONS.map(({ mode, icon: Icon, label, desc }) => {
        const active = preference.quality_mode === mode;
        return (
          <button
            key={mode}
            onClick={() => setPreference(mode, mode === "manual" ? (preference.preferred_resolution ?? "480p") : null)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: (active ? ACCENT : "#888") + "18" }}
            >
              <Icon className="h-4.5 w-4.5" style={{ color: active ? ACCENT : "#888" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-black leading-tight">{label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
            </div>
            {active && <Check className="h-4.5 w-4.5 shrink-0" style={{ color: ACCENT }} />}
          </button>
        );
      })}

      {preference.quality_mode === "manual" && (
        <div className="px-4 pt-2 pb-4">
          <p className="text-[11px] font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
            RESOLUÇÃO FIXA
          </p>
          <div className="flex flex-wrap gap-2">
            {MANUAL_OPTIONS.map((res) => {
              const active = preference.preferred_resolution === res;
              return (
                <button
                  key={res}
                  onClick={() => setPreference("manual", res)}
                  className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition"
                  style={{
                    background: active ? ACCENT : "var(--s2, #f0f0f0)",
                    color: active ? "#fff" : "var(--text-primary)",
                  }}
                >
                  {res}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </SettingsSubPanel>
  );
}
