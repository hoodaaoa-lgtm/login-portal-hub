import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Shield, Lock, Eye, Database, Users, Mail } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: PrivacidadePage,
});

const P = "#5B3FCF";

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
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

function PrivacidadePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--s1)" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 border-b flex items-center gap-3"
        style={{ background: "rgba(var(--s1-rgb,250,250,252),.94)", backdropFilter: "blur(20px)", borderColor: "var(--border-subtle)" }}>
        <Link to="/home" className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-[var(--s3)]">
          <ChevronLeft className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
        </Link>
        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Política de Privacidade</span>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-extrabold mb-2" style={{ color: "var(--text-primary)" }}>Política de Privacidade</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Última atualização: 28 de junho de 2026</p>
        </div>

        <Section icon={Shield} title="Introdução">
          <p>A Hooda respeita a tua privacidade. Esta política explica como recolhemos, usamos, guardamos e protegemos os teus dados pessoais. Ao usares a plataforma, concordas com estes termos.</p>
        </Section>

        <Section icon={Database} title="Que dados recolhemos">
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Dados que nos dás directamente:</p>
          <p>Nome completo, email, foto de perfil, biografia, localização (opcional), redes sociais (opcional) e o conteúdo que publicas — posts, vídeos e mensagens.</p>
          <p className="font-semibold mt-3" style={{ color: "var(--text-primary)" }}>Dados recolhidos automaticamente:</p>
          <p>Localização aproximada (se permitires), hora dos acessos, tipo de dispositivo, endereço IP, pesquisas realizadas e interações com conteúdo (gostos, guardados, mensagens encriptadas).</p>
        </Section>

        <Section icon={Eye} title="Como usamos os teus dados">
          <p>Os teus dados servem para criar e manter a tua conta, permitir o envio de mensagens, personalizar o teu feed, melhorar a plataforma, enviar notificações relevantes e — apenas com o teu consentimento — mostrar publicidade direcionada. Podes recusar usos opcionais a qualquer momento nas definições.</p>
        </Section>

        <Section icon={Users} title="Quem pode ver os teus dados">
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Dados públicos:</p>
          <p>Nome, username, foto de perfil, biografia, posts, vídeos, acompanhantes e quem acompanhas.</p>
          <p className="font-semibold mt-3" style={{ color: "var(--text-primary)" }}>Dados privados — só tu vês:</p>
          <p>Email, número de telefone, histórico de downloads, conteúdo guardado e mensagens privadas.</p>
        </Section>

        <Section icon={Lock} title="Segurança">
          <p>Protegemos os teus dados com encriptação ponta-a-ponta nas mensagens, palavras-passe com hash seguro, HTTPS em toda a plataforma, autenticação de dois factores e backups automáticos regulares.</p>
          <p className="mt-3">Não vendemos os teus dados, não te rastreamos noutros sites e não partilhamos acesso com APIs de terceiros sem o teu consentimento explícito.</p>
        </Section>

        <Section icon={Shield} title="Os teus direitos">
          <p>De acordo com o RGPD, tens direito a aceder a uma cópia de todos os teus dados, corrigir informação incorrecta, solicitar a eliminação da tua conta ("direito ao esquecimento"), exportar os teus dados num formato aberto e recusar usos específicos dos teus dados.</p>
        </Section>

        <Section icon={Mail} title="Contacto">
          <p>Para qualquer questão sobre privacidade, escreve para <a href="mailto:hooda.aoa@gmail.com" className="font-semibold" style={{ color: P }}>hooda.aoa@gmail.com</a>. Respondemos em até 48 horas.</p>
        </Section>
      </div>
    </div>
  );
}
