import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Accessibility, Eye, Keyboard, Volume2, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/acessibilidade")({
  head: () => ({ meta: [{ title: "Snapper" }] }),
  component: AcessibilidadePage,
});

const P = "#9231EA";

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${P}15` }}>
          <Icon className="w-4 h-4" style={{ color: P }} />
        </div>
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      </div>
      <div className="text-sm leading-relaxed space-y-2" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </section>
  );
}

function AcessibilidadePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--s1)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 border-b flex items-center gap-3"
        style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
        <Link to="/home" className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]">
          <ChevronLeft className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
        </Link>
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Acessibilidade</span>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Acessibilidade</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Última atualização: 9 de julho de 2026</p>
        </div>

        <Section icon={Accessibility} title="O nosso compromisso">
          <p>A Snapper quer ser usável por todas as pessoas, incluindo quem vive com deficiência visual, auditiva, motora ou cognitiva. Trabalhamos continuamente para melhorar a acessibilidade da plataforma.</p>
        </Section>

        <Section icon={Eye} title="Leitores de ecrã e contraste">
          <p>Procuramos manter texto alternativo em imagens, contraste de cor adequado e estrutura semântica compatível com leitores de ecrã comuns.</p>
        </Section>

        <Section icon={Keyboard} title="Navegação por teclado">
          <p>Estamos a melhorar progressivamente a navegação por teclado em toda a aplicação, incluindo foco visível e ordem lógica de tabulação.</p>
        </Section>

        <Section icon={Volume2} title="Conteúdo em vídeo e áudio">
          <p>Onde possível, disponibilizamos controlos claros de reprodução, volume e legendas para conteúdo em vídeo.</p>
        </Section>

        <Section icon={MessageCircle} title="Contacta-nos">
          <p>Se encontrares uma barreira de acessibilidade na Snapper, avisa-nos através do suporte dentro da app. O teu feedback ajuda-nos a priorizar melhorias.</p>
        </Section>
      </div>
    </div>
  );
}
