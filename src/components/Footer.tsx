import React from "react";
import { Link } from "@tanstack/react-router";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Logo */}
          <div>
            <p className="font-extrabold text-lg mb-4">
              <span style={{ color: "#5B3FCF" }}>Hooda</span>
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Rede social moderna para criadores e comunidades.
            </p>
          </div>

          {/* Produto */}
          <div>
            <p className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>Produto</p>
            <ul className="space-y-2 text-xs">
              <li><Link to="/home" className="hover:underline" style={{ color: "var(--text-muted)" }}>Home</Link></li>
              <li><Link to="/explorar" className="hover:underline" style={{ color: "var(--text-muted)" }}>Explorar</Link></li>
              <li><Link to="/hoodatv" className="hover:underline" style={{ color: "var(--text-muted)" }}>HoodaTV</Link></li>
              <li><Link to="/mensagens" className="hover:underline" style={{ color: "var(--text-muted)" }}>Mensagens</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>Legal</p>
            <ul className="space-y-2 text-xs">
              <li><Link to="/privacidade" className="hover:underline" style={{ color: "var(--text-muted)" }}>Privacidade</Link></li>
              <li><Link to="/uso" className="hover:underline" style={{ color: "var(--text-muted)" }}>Termos de Uso</Link></li>
              <li><a href="mailto:hooda.aoa@gmail.com" className="hover:underline" style={{ color: "var(--text-muted)" }}>Contacto</a></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <p className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>Contacto</p>
            <ul className="space-y-2 text-xs">
              <li><a href="mailto:hooda.aoa@gmail.com" style={{ color: "var(--text-muted)" }}>📧 hooda.aoa@gmail.com</a></li>
              <li style={{ color: "var(--text-muted)" }}>📍 Portugal</li>
              <li style={{ color: "var(--text-muted)" }}>🚀 Versão: 1.0</li>
            </ul>
          </div>
        </div>

        {/* Divisor */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "2rem" }}>
          <div className="flex flex-col md:flex-row justify-between items-center text-xs" style={{ color: "var(--text-muted)" }}>
            <p>© {currentYear} Hooda. Todos os direitos reservados.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <a href="https://twitter.com/hooda_app" target="_blank" rel="noopener noreferrer" className="hover:underline">Twitter</a>
              <a href="https://instagram.com/hooda_app" target="_blank" rel="noopener noreferrer" className="hover:underline">Instagram</a>
              <a href="https://discord.gg/hooda" target="_blank" rel="noopener noreferrer" className="hover:underline">Discord</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
