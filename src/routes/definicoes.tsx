import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ChevronRight, Sun, Moon, Bell, Lock, Shield, HelpCircle,
  Info, Globe, MessageSquare, User, LogOut, Activity, ArrowLeft,
} from "lucide-react";
import {
  NotificationsPanel, ActivityPanel, PrivacyPanel,
  SecurityPanel, MsgPrivacyPanel, AboutPanel, HelpPanel,
} from "@/routes/perfil";
import { LanguagePanel } from "@/components/LanguageSwitcher";
import { LANGUAGES, getCurrentLang } from "@/lib/i18n";

export const Route = createFileRoute("/definicoes")({
  head: () => ({ meta: [{ title: "Hooda — Definições" }] }),
  component: DefinicoesPage,
});

const ACCENT = "#5B3FCF";
const GRAD   = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

function DefinicoesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [profile, setProfile]           = useState<any>(null);
  const [email, setEmail]               = useState("");
  const [msgPermission, setMsgPermission] = useState("todos");
  const [darkMode, setDarkMode]         = useState(() => document.documentElement.classList.contains("dark"));
  const [panel, setPanel]               = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setEmail(session.user.email ?? "");
      const { data } = await supabase.from("profiles")
        .select("id,username,full_name,bio,avatar_url,msg_permission")
        .eq("id", session.user.id).maybeSingle();
      if (data) {
        setProfile(data);
        if ((data as any).msg_permission) setMsgPermission((data as any).msg_permission);
      }
    })();
  }, [navigate]);

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const name = profile?.full_name || profile?.username || email.split("@")[0] || "Utilizador";
  const avatarUrl = profile?.avatar_url;
  const currentLang = LANGUAGES.find(l => l.code === getCurrentLang());

  const SECTIONS = [
    {
      title: "Aparência",
      items: [
        {
          icon: darkMode ? <Moon className="w-5 h-5"/> : <Sun className="w-5 h-5"/>,
          color: "#F26B3A",
          label: darkMode ? "Modo escuro" : "Modo claro",
          desc: "Altera o tema da app",
          toggle: true,
          value: darkMode,
          onToggle: toggleDark,
        },
      ],
    },
    {
      title: "Conta",
      items: [
        { icon: <User className="w-5 h-5"/>, color: ACCENT, label: "Editar perfil", desc: "Nome, foto, bio e mais", action: () => navigate({ to: "/perfil" }) },
        { icon: <Bell className="w-5 h-5"/>, color: "#E94B8A", label: "Notificações", desc: "Gere os teus alertas", action: () => setPanel("notifications") },
        { icon: <Activity className="w-5 h-5"/>, color: "#1FAFA6", label: "Atividade", desc: "Histórico de ações", action: () => setPanel("activity") },
      ],
    },
    {
      title: "Privacidade & Segurança",
      items: [
        { icon: <Lock className="w-5 h-5"/>, color: "#6BA547", label: "Privacidade", desc: "Quem pode ver o teu perfil", action: () => setPanel("privacy") },
        { icon: <Shield className="w-5 h-5"/>, color: ACCENT, label: "Segurança", desc: "Palavra-passe e autenticação", action: () => setPanel("security") },
        { icon: <MessageSquare className="w-5 h-5"/>, color: "#1FAFA6", label: "Privacidade de Mensagens", desc: "Quem pode enviar-te mensagens?", action: () => setPanel("msgprivacy") },
      ],
    },
    {
      title: "Suporte",
      items: [
        { icon: <HelpCircle className="w-5 h-5"/>, color: "#1FAFA6", label: "Ajuda", desc: "Perguntas frequentes", action: () => setPanel("help") },
        { icon: <Info className="w-5 h-5"/>, color: "#E94B8A", label: "Sobre a Hooda", desc: "Versão e informações legais", action: () => setPanel("about") },
      ],
    },
    {
      title: "Idioma",
      items: [
        { icon: <Globe className="w-5 h-5"/>, color: "#F26B3A", label: "Idioma", desc: `${currentLang?.flag ?? "🇵🇹"} ${currentLang?.label ?? "Português"}`, action: () => setPanel("language") },
      ],
    },
  ];

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <div className="max-w-xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => navigate({ to: "/perfil" })}
              className="w-9 h-9 rounded-full flex items-center justify-center transition hover:opacity-70 lg:hidden"
              style={{ background: "var(--s2)" }}>
              <ArrowLeft className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            </button>
            <h1 className="text-xl font-extrabold" style={{ color: "var(--text-primary)" }}>
              Definições
            </h1>
          </div>

          {/* Card do utilizador */}
          <div className="rounded-3xl overflow-hidden mb-6 shadow-sm"
            style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
            <div className="h-16" style={{ background: GRAD }} />
            <div className="px-5 pb-5" style={{ marginTop: -32 }}>
              <div className="flex items-end gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-xl font-black shadow-lg"
                  style={{ background: ACCENT, border: "3px solid var(--s0)" }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : name[0]?.toUpperCase()}
                </div>
                <div className="pb-1">
                  <p className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{email}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Secções */}
          <div className="space-y-5">
            {SECTIONS.map(sec => (
              <div key={sec.title}>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2 px-1"
                  style={{ color: "var(--text-muted)" }}>
                  {sec.title}
                </p>
                <div className="rounded-2xl overflow-hidden shadow-sm"
                  style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                  {sec.items.map((item: any, i) => (
                    <div key={item.label}>
                      {i > 0 && <div style={{ height: 1, background: "var(--border-subtle)" }} />}
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--s2)] active:scale-[0.99]"
                        onClick={item.action ?? item.onToggle}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${item.color}18`, color: item.color }}>
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                        </div>
                        {item.toggle
                          ? <div className="w-11 h-6 rounded-full transition-all shrink-0 flex items-center px-0.5"
                              style={{ background: item.value ? ACCENT : "var(--s3)" }}>
                              <div className="w-5 h-5 rounded-full bg-white shadow transition-all"
                                style={{ transform: item.value ? "translateX(20px)" : "translateX(0)" }} />
                            </div>
                          : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Terminar sessão */}
            <button onClick={signOut}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition active:scale-[0.98]"
              style={{ background: "#fee2e2", color: "#dc2626" }}>
              <LogOut className="w-4 h-4" /> Terminar sessão
            </button>

            <p className="text-center text-[11px] pb-2" style={{ color: "var(--text-muted)" }}>
              © 2025 Hooda · v1.0.0
            </p>
          </div>
        </div>

        <BottomNav />
      </PageWrapper>

      {/* Sub-painéis */}
      {panel === "notifications" && <NotificationsPanel onBack={() => setPanel(null)} />}
      {panel === "activity"      && <ActivityPanel      onBack={() => setPanel(null)} />}
      {panel === "privacy"       && <PrivacyPanel       onBack={() => setPanel(null)} />}
      {panel === "security"      && <SecurityPanel      onBack={() => setPanel(null)} email={email} />}
      {panel === "help"          && <HelpPanel          onBack={() => setPanel(null)} />}
      {panel === "about"         && <AboutPanel         onBack={() => setPanel(null)} />}
      {panel === "language"      && <LanguagePanel      onBack={() => setPanel(null)} />}
      {panel === "msgprivacy"    && (
        <MsgPrivacyPanel
          onBack={() => setPanel(null)}
          msgPermission={msgPermission}
          onMsgPermissionChange={async (v) => {
            setMsgPermission(v);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
          }}
        />
      )}
    </>
  );
}
