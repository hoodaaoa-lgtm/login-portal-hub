import React from "react";

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      {/* Header */}
      <div className="px-4 py-8 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            🔒 Política de Privacidade
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

          <h2>1. Introdução</h2>
          <p>A Hooda ("nós", "a gente", "a plataforma") respeita a tua privacidade. Esta política explica como recolhemos, usamos, guardamos e protegemos os teus dados pessoais.</p>
          <p><strong>Se não concordas, não uses a plataforma.</strong></p>

          <h2>2. Que Dados Recolhemos?</h2>
          <h3>2.1 Dados que TÚ nos dás:</h3>
          <ul>
            <li>✅ Nome completo</li>
            <li>✅ Email</li>
            <li>✅ Foto de perfil</li>
            <li>✅ Bio / Descrição</li>
            <li>✅ Localização (opcional)</li>
            <li>✅ Redes sociais (opcional)</li>
            <li>✅ Conteúdo que publicas (posts, vídeos, histórias, livros)</li>
          </ul>

          <h3>2.2 Dados que recolhemos automaticamente:</h3>
          <ul>
            <li>📍 Localização (se permitires)</li>
            <li>🕐 Hora dos acessos</li>
            <li>📱 Tipo de dispositivo</li>
            <li>🌐 IP address</li>
            <li>🔍 Pesquisas que fazes</li>
            <li>❤️ Conteúdo que gostas / guardas</li>
            <li>💬 Mensagens (encriptadas)</li>
          </ul>

          <h2>3. Como Usamos os Teus Dados?</h2>
          <p>Os teus dados são usados para:</p>
          <ul>
            <li>✅ Criar e manter a tua conta</li>
            <li>✅ Enviar mensagens</li>
            <li>✅ Mostrar um feed personalizado</li>
            <li>⚠️ Melhorar a plataforma (podes recusar)</li>
            <li>⚠️ Enviar notificações (podes recusar)</li>
            <li>⚠️ Publicidade direcionada (podes recusar)</li>
          </ul>

          <h2>4. Quem Pode Ver os Teus Dados?</h2>
          <h3>🔓 Dados públicos (todos veem):</h3>
          <ul>
            <li>Nome, Username, Foto de perfil, Bio</li>
            <li>Posts, Vídeos, Histórias</li>
            <li>Seguidores e Seguindo</li>
          </ul>

          <h3>🔒 Dados privados (só tu vês):</h3>
          <ul>
            <li>Email</li>
            <li>Número de telefone</li>
            <li>Histórico de downloads</li>
            <li>Livros guardados</li>
            <li>Mensagens privadas</li>
          </ul>

          <h2>5. Segurança</h2>
          <p>🛡️ <strong>Como protegemos:</strong></p>
          <ul>
            <li>✅ Encriptação end-to-end nas mensagens</li>
            <li>✅ Passwords com hash (nunca armazenadas em texto)</li>
            <li>✅ HTTPS em tudo</li>
            <li>✅ 2FA (autenticação de 2 fatores)</li>
            <li>✅ Backups automáticos</li>
            <li>✅ Firewalls e DDoS protection</li>
          </ul>

          <p>❌ <strong>O que NÃO fazemos:</strong></p>
          <ul>
            <li>❌ Não vendemos dados</li>
            <li>❌ Não rastreamos em outras websites</li>
            <li>❌ Não damos acesso a APIs de terceiros</li>
          </ul>

          <h2>6. Os Teus Direitos (GDPR)</h2>
          <p>Tens direito a:</p>
          <ol>
            <li><strong>Acesso</strong> — pedir cópia de todos os teus dados</li>
            <li><strong>Correção</strong> — editar dados incorretos</li>
            <li><strong>Apagar</strong> — "direito ao esquecimento"</li>
            <li><strong>Portar</strong> — receber teus dados num formato aberto</li>
            <li><strong>Recusar</strong> — não concordar com certos usos</li>
          </ol>

          <h2>7. Contacto</h2>
          <p>📧 <strong>Email:</strong> hooda.aoa@gmail.com</p>
          <p>Resposta garantida em 48 horas.</p>

        </div>
      </div>
    </div>
  );
}
