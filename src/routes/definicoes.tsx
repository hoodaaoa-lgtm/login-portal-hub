import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SideNav, PageWrapper } from "@/components/AppShell";
import {
  SettingsDrawer,
  NotificationsPanel,
  ActivityPanel,
  PrivacyPanel,
  SecurityPanel,
  MsgPrivacyPanel,
  AboutPanel,
  HelpPanel,
} from "@/routes/perfil";
import { LanguagePanel } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/definicoes")({
  head: () => ({ meta: [{ title: "Hooda — Definições" }] }),
  component: DefinicoesPage,
});

function DefinicoesPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [msgPermission, setMsgPermission] = useState("todos");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showMsgPrivacy, setShowMsgPrivacy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setEmail(session.user.email ?? "");
      const { data } = await supabase.from("profiles")
        .select("id,username,full_name,age,bio,avatar_url,msg_permission")
        .eq("id", session.user.id).maybeSingle();
      if (data) {
        setProfile(data);
        if ((data as any).msg_permission) setMsgPermission((data as any).msg_permission);
      }
    })();
  }, [navigate]);

  function closeToPerfil() { navigate({ to: "/perfil" }); }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <>
      <SideNav />
      <PageWrapper>
        <SettingsDrawer
          onClose={closeToPerfil}
          onEditProfile={() => navigate({ to: "/perfil" })}
          onSignOut={signOut}
          msgPermission={msgPermission}
          profile={profile}
          onMsgPermissionChange={async (v) => {
            setMsgPermission(v);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
          }}
          onOpenNotifications={() => setShowNotifications(true)}
          onOpenActivity={() => setShowActivity(true)}
          onOpenPrivacy={() => setShowPrivacy(true)}
          onOpenSecurity={() => setShowSecurity(true)}
          onOpenHelp={() => setShowHelp(true)}
          onOpenAbout={() => setShowAbout(true)}
          onOpenLanguage={() => setShowLanguage(true)}
          onOpenMsgPrivacy={() => setShowMsgPrivacy(true)}
        />
        {showNotifications && <NotificationsPanel onBack={() => setShowNotifications(false)} />}
        {showActivity && <ActivityPanel onBack={() => setShowActivity(false)} />}
        {showPrivacy && <PrivacyPanel onBack={() => setShowPrivacy(false)} />}
        {showSecurity && <SecurityPanel onBack={() => setShowSecurity(false)} email={email} />}
        {showHelp && <HelpPanel onBack={() => setShowHelp(false)} />}
        {showAbout && <AboutPanel onBack={() => setShowAbout(false)} />}
        {showLanguage && <LanguagePanel onBack={() => setShowLanguage(false)} />}
        {showMsgPrivacy && (
          <MsgPrivacyPanel
            onBack={() => setShowMsgPrivacy(false)}
            msgPermission={msgPermission}
            onMsgPermissionChange={async (v) => {
              setMsgPermission(v);
              const { data: { session } } = await supabase.auth.getSession();
              if (session) await supabase.from("profiles").update({ msg_permission: v } as any).eq("id", session.user.id);
            }}
          />
        )}
      </PageWrapper>
    </>
  );
}
