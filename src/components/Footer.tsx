import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Rocket, Twitter, Instagram, MessageSquare } from "lucide-react";

const P = "#5B3FCF";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}>
      <div className="max-w-5xl mx-auto px-5 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Logo */}
          <div className="col-span-2 md:col-span-1">
            <p className="font-extrabold text-lg mb-3" style={{ color: P }}>Hooda</p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Rede social moderna para criadores e comunidades.
            </p>
          </div>

          {/* Produto */}
          <div>
            <p className="font-bold text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Produto</p>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/home" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>Home</Link></li>
              <li><Link to="/explorar" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>Explorar</Link></li>
              <li><a href="/hoodatv" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>HoodaTV</a></li>
              <li><Link to="/mensagens" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>Mensagens</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="font-bold text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Legal</p>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/privacidade" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>Privacidade</Link></li>
              <li><Link to="/uso" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>Termos de Uso</Link></li>
              <li><a href="mailto:hooda.aoa@gmail.com" className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>Contacto</a></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <p className="font-bold text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Contacto</p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="mailto:hooda.aoa@gmail.com" className="flex items-center gap-2 transition hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                  <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  <span className="truncate">hooda.aoa@gmail.com</span>
                </a>
              </li>
              <li className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                Portugal
              </li>
              <li className="flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                <Rocket className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                Versão 1.0
              </li>
            </ul>
          </div>
        </div>

        {/* Divisor */}
        <div className="pt-6 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
            <p>© {currentYear} Hooda. Todos os direitos reservados.</p>
            <div className="flex items-center gap-4">
              <a href="https://twitter.com/hooda_app" target="_blank" rel="noopener noreferrer"
                className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }} aria-label="Twitter">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://instagram.com/hooda_app" target="_blank" rel="noopener noreferrer"
                className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }} aria-label="Instagram">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="https://discord.gg/hooda" target="_blank" rel="noopener noreferrer"
                className="transition hover:opacity-70" style={{ color: "var(--text-secondary)" }} aria-label="Discord">
                <MessageSquare className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
