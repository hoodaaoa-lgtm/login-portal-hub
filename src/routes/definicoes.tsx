import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signOutBaya } from "@/contexts/AuthContext";
import { BottomNav, SideNav, PageWrapper, PageHeader } from "@/components/AppShell";
import {
  ChevronRight, Bell, Lock, Shield, ShieldAlert, HelpCircle,
  Info, Globe, MessageSquare, Activity,
  Trash2, LogOut, AlertTriangle, Zap,
} from "lucide-react";
import { useDataSaverEnabled } from "@/hooks/useDataSaver";
import { setDataSaverEnabled } from "@/lib/dataSaver";
import {
  NotificationsPanel, ActivityPanel, PrivacyPanel,
  SecurityPanel, MsgPrivacyPanel, AboutPanel, HelpPanel,
} from "@/routes/perfil";
import { SensitiveContentPanel } from "@/components/SensitiveContentPanel";
import { LanguagePanel } from "@/components/LanguageSwitcher";
import { LANGUAGES, getCurrentLang } from "@/lib/i18n";

export const Route = createFileRoute("/definicoes")({
  head: () => ({ meta: [{ title: "Baya" }] }),
  component: DefinicoesPage,
});

const ACCENT = "#5B3FCF";
const GRAD   = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

function DefinicoesPage() {
  const navigate  = useNavigate();
  const search    = useSearch({ strict: false }) as any;
  const [profile, setProfile]             = useState<any>(null);
  const [email, setEmail]                 = useState("");
  const [msgPermission, setMsgPermission] = useState("todos");
  const [panel, setPanel]                 = useState<string | null>(search?.panel ?? null);
  const dataSaverOn = useDataSaverEnabled();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState("");
  const [deleting, setDeleting]               = useState(false);

  useEffect(() => {
    if (search?.panel) setPanel(search.panel);
  }, [search?.panel]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/" }); return; }
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

  const name      = profile?.full_name || profile?.username || email.split("@")[0] || "Utilizador";
  const avatarUrl = profile?.avatar_url;
  const currentLang = LANGUAGES.find(l => l.code === getCurrentLang());

  async function handleDeleteAccount() {
    if (deleteConfirm !== "ELIMINAR") return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      // Apagar dados do utilizador (posts, likes, mensagens, perfil)
      const db = supabase as any;
      await Promise.allSettled([
        db.from("posts").delete().eq("user_id", uid),
        db.from("likes").delete().eq("user_id", uid),
        db.from("messages").delete().eq("sender_id", uid),
        db.from("comments").delete().eq("user_id", uid),
        db.from("profiles").delete().eq("id", uid),
      ]);
      await supabase.auth.signOut();
      navigate({ to: "/" });
    } catch (err) {
      console.error("[hooda] erro ao eliminar conta:", err);
      setDeleting(false);
    }
  }

  const SECTIONS = [
    {
      title: "Conta",
      items: [
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
        { icon: <ShieldAlert className="w-5 h-5"/>, color: "#F26B3A", label: "Conteúdo Sensível", desc: "Como mostrar conteúdo sensível no feed", action: () => setPanel("sensitive-content") },
      ],
    },
    {
      title: "Idioma",
      items: [
        { icon: <Globe className="w-5 h-5"/>, color: "#F26B3A", label: "Idioma", desc: `${currentLang?.flag ?? "🇵🇹"} ${currentLang?.label ?? "Português"}`, action: () => setPanel("language") },
      ],
    },
  ];

  const DANGER_ITEMS = [
    {
      icon: <LogOut className="w-5 h-5"/>, color: "#F26B3A",
      label: "Terminar sessão", desc: "Sair da tua conta neste dispositivo",
      action: async () => { await signOutBaya(); navigate({ to: "/" }); },
    },
    {
      icon: <Trash2 className="w-5 h-5"/>, color: "#ef4444",
      label: "Eliminar conta", desc: "Apaga permanentemente a tua conta e todos os dados",
      action: () => setShowDeleteModal(true),
    },
  ];

  return (
    <>
      <SideNav />
      <PageWrapper className="pb-20 lg:pb-0">
        <PageHeader title="Definições de Conta" onBack={() => navigate({ to: "/perfil" })} />
        <div className="px-4 py-6 max-w-[680px] mx-auto">

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
                  <p className="font-extrabold text-lg leading-tight" style={{ color: "var(--text-primary)" }}>
                    {profile?.full_name || profile?.username || name}
                  </p>
                  {profile?.username && (
                    <p className="text-xs font-medium" style={{ color: ACCENT }}>@{profile.username}</p>
                  )}
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
                        onClick={item.action}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${item.color}18`, color: item.color }}>
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Baya Leve — modo de poupar dados. Fica fora do SECTIONS.map
                porque precisa de um switch em vez do chevron de navegação. */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2 px-1"
                style={{ color: "var(--text-muted)" }}>
                Dados
              </p>
              <div className="rounded-2xl overflow-hidden shadow-sm"
                style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)" }}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--s2)] active:scale-[0.99]"
                  onClick={() => setDataSaverEnabled(!dataSaverOn)}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${ACCENT}18`, color: ACCENT }}>
                    <Zap className="w-5 h-5" fill={dataSaverOn ? "currentColor" : "none"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Baya Leve</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Vídeos só carregam quando tocas — poupa dados</p>
                  </div>
                  <div
                    className="relative w-11 h-6 rounded-full shrink-0 transition-colors"
                    style={{ background: dataSaverOn ? ACCENT : "var(--border-subtle)" }}
                  >
                    <div
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: dataSaverOn ? "translateX(21px)" : "translateX(2px)" }}
                    />
                  </div>
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] pb-2" style={{ color: "var(--text-muted)" }}>
              © 2026 Baya · v1.0.0
            </p>

            {/* Zona Perigosa */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: "#ef4444" }}>
                Zona Perigosa
              </p>
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: "var(--s0)", border: "1px solid #fecaca" }}>
                {DANGER_ITEMS.map((item, i) => (
                  <div key={item.label}>
                    {i > 0 && <div style={{ height: 1, background: "#fecaca" }} />}
                    <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition hover:bg-red-50 active:scale-[0.99]"
                      onClick={item.action}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${item.color}18`, color: item.color }}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: item.color }}>{item.label}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: item.color, opacity: 0.5 }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <BottomNav />
      </PageWrapper>

      {/* Sub-painéis abertos directamente pelo menu ou clique */}
      {panel === "notifications" && <NotificationsPanel onBack={() => setPanel(null)} />}
      {panel === "activity"      && <ActivityPanel      onBack={() => setPanel(null)} />}
      {panel === "privacy"       && <PrivacyPanel       onBack={() => setPanel(null)} />}
      {panel === "security"      && <SecurityPanel      onBack={() => setPanel(null)} email={email} />}
      {panel === "help"          && <HelpPanel          onBack={() => setPanel(null)} />}
      {panel === "about"         && <AboutPanel         onBack={() => setPanel(null)} />}
      {panel === "language"      && <LanguagePanel      onBack={() => setPanel(null)} />}
      {panel === "sensitive-content" && <SensitiveContentPanel onBack={() => setPanel(null)} />}
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

      {/* Modal de confirmação de eliminação de conta */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl" style={{ background: "var(--s0)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#fef2f2" }}>
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="font-extrabold text-base" style={{ color: "var(--text-primary)" }}>Eliminar conta</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Esta ação é permanente e irreversível</p>
              </div>
            </div>

            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Todos os teus dados serão apagados permanentemente: publicações, mensagens e perfil.
              <strong className="text-red-500"> Não é possível recuperar a conta depois de eliminar.</strong>
            </p>

            <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
              Para confirmar, escreve <strong style={{ color: "#ef4444" }}>ELIMINAR</strong> abaixo:
            </p>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="ELIMINAR"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none mb-4"
              style={{ background: "var(--s2)", border: "1.5px solid #fecaca", color: "var(--text-primary)" }}
              disabled={deleting}
            />

            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition"
                style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
                Cancelar
              </button>
              <button onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "ELIMINAR" || deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40"
                style={{ background: "#ef4444" }}>
                {deleting ? "A eliminar…" : "Eliminar conta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
