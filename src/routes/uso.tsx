import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, FileText, AlertTriangle, UserX, Scale, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/uso")({
  head: () => ({ meta: [{ title: "Baya" }] }),
  component: UsoPage,
});

const P = "#5B3FCF";

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

function UsoPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--s1)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 border-b flex items-center gap-3"
        style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
        <Link to="/home" className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]">
          <ChevronLeft className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
        </Link>
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Termos de Uso</span>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Termos de Uso</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Última atualização: 28 de junho de 2026</p>
        </div>

        <Section icon={FileText} title="Aceitação dos termos">
          <p>Ao criares uma conta na Baya, concordas com estes Termos de Uso e com a nossa Política de Privacidade. Se não concordas, não deves usar a plataforma.</p>
        </Section>

        <Section icon={UserX} title="Regras da comunidade">
          <p>Não é permitido publicar conteúdo que promova violência, discurso de ódio, assédio, nudez não consensual, ou que viole direitos de autor de terceiros. Contas que violem estas regras podem ser suspensas ou removidas sem aviso prévio.</p>
        </Section>

        <Section icon={AlertTriangle} title="Responsabilidade do utilizador">
          <p>És responsável pelo conteúdo que publicas e pela segurança da tua conta. A Baya não se responsabiliza por danos resultantes do uso indevido da plataforma por terceiros ou pela perda de acesso devido a partilha de credenciais.</p>
        </Section>

        <Section icon={Scale} title="Propriedade do conteúdo">
          <p>Mantens todos os direitos sobre o conteúdo que publicas. Ao publicares na Baya, concedes-nos uma licença não exclusiva para exibir e distribuir esse conteúdo dentro da plataforma.</p>
        </Section>

        <Section icon={FileText} title="Alterações aos termos">
          <p>Podemos actualizar estes termos periodicamente. Notificaremos sobre alterações significativas através da plataforma ou por email.</p>
        </Section>

        <Section icon={Mail} title="Contacto">
          <p>Para qualquer questão sobre estes termos, escreve para <a href="mailto:hooda.aoa@gmail.com" className="font-semibold" style={{ color: P }}>hooda.aoa@gmail.com</a>.</p>
        </Section>
      </div>
    </div>
  );
}
