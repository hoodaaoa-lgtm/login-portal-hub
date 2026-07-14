import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Share2, Search, Film, Bell, Heart, Users } from "lucide-react";
import { toast } from "sonner";

/**
 * Cartão de dica rotativa — preenche o espaço que ficava vazio no fim da
 * sidebar direita (computador) e, no telemóvel/tablet (onde essa sidebar
 * fica escondida), é intercalado no próprio feed. Mostra sempre uma dica
 * diferente ao carregar — ajuda a crescer a Baya, destaca funcionalidades,
 * ou só uma curiosidade simpática — nunca fica um espaço morto.
 */

const ACCENT = "#5B3FCF";

type Tip = {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  text: string;
  cta?: { label: string; action: (ctx: { navigate: ReturnType<typeof useNavigate> }) => void };
};

function buildTips(): Tip[] {
  return [
    {
      icon: Share2,
      text: "Ajuda a Baya a crescer — convida um amigo para se juntar.",
      cta: {
        label: "Convidar",
        action: () => {
          const url = typeof window !== "undefined" ? window.location.origin : "https://hooda.ao";
          const shareData = { title: "Baya", text: "Vem para a Baya, a rede social angolana!", url };
          if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
            navigator.share(shareData).catch(() => {});
          } else if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => toast.success("Link copiado! Já podes partilhar."));
          }
        },
      },
    },
    {
      icon: Search,
      text: "A pesquisa do Explorar agora entende o que procuras, não só a palavra exata.",
      cta: { label: "Experimentar", action: ({ navigate }) => navigate({ to: "/explorar" }) },
    },
    {
      icon: Film,
      text: "No Baya Studio podes agendar publicações para saírem na hora certa.",
      cta: { label: "Abrir Studio", action: ({ navigate }) => navigate({ to: "/studio" }) },
    },
    {
      icon: Heart,
      text: "Gostar, comentar e guardar publicações ajuda o teu feed a mostrar mais do que gostas.",
    },
    {
      icon: Users,
      text: "Descobre pessoas com interesses parecidos na aba Pessoas do Explorar.",
      cta: { label: "Ver pessoas", action: ({ navigate }) => navigate({ to: "/explorar", search: { tab: "people" } }) },
    },
    {
      icon: Bell,
      text: "Ativa as notificações para nunca perderes uma resposta ou uma mensagem nova.",
    },
    {
      icon: Sparkles,
      text: "Publicações com boas hashtags aparecem mais em Tendência — usa 2 ou 3 relevantes.",
    },
  ];
}

export function BayaTipCard({ variant = "sidebar" }: { variant?: "sidebar" | "feed" }) {
  const navigate = useNavigate();
  // Escolhe uma dica ao acaso a cada montagem — o cartão muda sempre que
  // reabres o feed, dando a sensação de "coisas novas" em vez de estático.
  const tip = useMemo(() => {
    const tips = buildTips();
    return tips[Math.floor(Math.random() * tips.length)];
  }, []);
  const Icon = tip.icon;

  return (
    <div
      className={variant === "feed" ? "mx-4 rounded-2xl overflow-hidden" : "rounded-2xl overflow-hidden"}
      style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center" style={{ background: `${ACCENT}18` }}>
          <Icon className="h-4 w-4" style={{ color: ACCENT }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{tip.text}</p>
          {tip.cta && (
            <button
              onClick={() => tip.cta!.action({ navigate })}
              className="mt-2 text-xs font-bold px-3 py-1.5 rounded-full transition active:scale-95"
              style={{ background: `${ACCENT}18`, color: ACCENT }}
            >
              {tip.cta.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
