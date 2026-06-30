import React from "react";

export default function UsoPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="px-4 py-8 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            📋 Política de Uso (Termos de Serviço)
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Última atualização: 28 de Junho de 2026
          </p>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="prose dark:prose-invert max-w-none"
          style={{
            color: "var(--text-primary)",
            fontSize: "15px",
            lineHeight: "1.6",
          }}>

          <h2>1. Aceitação dos Termos</h2>
          <p>Ao usares Hooda, concordas com esta Política de Uso e a Política de Privacidade.</p>
          <p><strong>Se não concordas com algum ponto, não uses a plataforma.</strong></p>

          <h2>2. Quem Pode Usar?</h2>
          <h3>✅ Podes usar se:</h3>
          <ul>
            <li>Tens 13+ anos (ou 18+ no teu país)</li>
            <li>Concordas com estas políticas</li>
            <li>Usas dados verdadeiros</li>
            <li>Não estás a violar leis</li>
          </ul>

          <h3>❌ Não podes usar se:</h3>
          <ul>
            <li>Foste banido anteriormente</li>
            <li>Estás a usar dados falsos para enganar</li>
            <li>Tens menos de 13 anos</li>
            <li>Estás a violar direitos autorais</li>
          </ul>

          <h2>3. Conteúdo Proibido</h2>
          <h3>❌ Violência & Ódio:</h3>
          <ul>
            <li>Ameaças de morte</li>
            <li>Incitação à violência</li>
            <li>Discurso de ódio</li>
            <li>Assédio ou bullying</li>
            <li>Doxxing</li>
          </ul>

          <h3>❌ Exploração & Abuso:</h3>
          <ul>
            <li>Abuso infantil (qualquer forma)</li>
            <li>Tráfico humano</li>
            <li>Exploração sexual</li>
            <li>Abuso animal</li>
          </ul>

          <h3>❌ Ilegalidade:</h3>
          <ul>
            <li>Venda de drogas</li>
            <li>Armas ilegais</li>
            <li>Documentos falsos</li>
            <li>Esquemas (pirâmides, fraudes)</li>
            <li>Pirataria</li>
          </ul>

          <h3>❌ Desinformação:</h3>
          <ul>
            <li>Fake news intencional</li>
            <li>Conteúdo médico falso</li>
            <li>Teorias conspiracionais perigosas</li>
            <li>Informação eleitoral falsa</li>
          </ul>

          <h3>❌ Spam & Abuso:</h3>
          <ul>
            <li>Spam</li>
            <li>Contas bot</li>
            <li>Like farms</li>
            <li>Phishing</li>
          </ul>

          <h2>4. Os Teus Direitos</h2>
          <h3>📝 Tu és dono do teu conteúdo:</h3>
          <p>Posts, vídeos, livros, histórias são teus. Podes apagar a qualquer hora. Hooda só usa para mostrar na plataforma.</p>

          <h3>🚫 Direitos autorais:</h3>
          <p>Só podes publicar conteúdo que owns ou tens permissão para usar. Múltiplas violações = ban.</p>

          <h2>5. Comportamento Esperado</h2>
          <h3>✅ Faz:</h3>
          <ul>
            <li>Sê respeitoso com outros utilizadores</li>
            <li>Reporta conteúdo ilegal/prejudicial</li>
            <li>Protege a tua password</li>
            <li>Usa 2FA</li>
          </ul>

          <h3>❌ Não faças:</h3>
          <ul>
            <li>Publiques conteúdo ofensivo</li>
            <li>Assedies ou intimiddes</li>
            <li>Cries múltiplas contas para contornar banimento</li>
            <li>Tentes hacker a plataforma</li>
            <li>Vendas coisas ilegais</li>
          </ul>

          <h2>6. Consequências de Violação</h2>
          <h3>⚠️ Nível 1: Aviso</h3>
          <p>Primeira violação menor. Aviso privado e oportunidade para corrigir.</p>

          <h3>⏸️ Nível 2: Suspensão Temporária</h3>
          <p>Violação moderada ou 2ª infração. Conta congelada por 7-30 dias.</p>

          <h3>🚫 Nível 3: Ban Permanente</h3>
          <p>Violação grave ou múltiplas violações. Conta apagada e dados removidos em 30 dias.</p>

          <h2>7. Resolução de Disputas</h2>
          <p>Se teu conteúdo foi removido, tens 30 dias para apelar. Resposta em 48-72 horas.</p>

          <p><strong>Lei:</strong> Estas políticas são regidas por lei Portuguesa. Tribunal competente: Lisboa.</p>

          <h2>8. Contacto & Support</h2>
          <p>📧 <strong>Email:</strong> hooda.aoa@gmail.com</p>
          <p><strong>Resposta garantida em 48 horas.</strong></p>

        </div>
      </div>
    </div>
  );
}
