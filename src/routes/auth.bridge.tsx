import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SnapperLogo } from "@/components/SnapperLogo";
import { Loader } from "lucide-react";

// Rota-ponte: o Studio (hooda-creator-hub) abre este URL com os tokens de
// sessão já existentes (mesmo projeto Supabase dos dois). Aqui estabelecemos
// essa sessão no Snapper e seguimos direto para a home — nunca mostra o
// ecrã de login.
export const Route = createFileRoute("/auth/bridge")({
  ssr: false,
  component: AuthBridge,
});

function AuthBridge() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (!access_token || !refresh_token) {
        setFailed(true);
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });

      // Limpa os tokens do URL imediatamente, nunca devem ficar visíveis
      // no histórico do browser nem em logs de partilha de ecrã.
      window.history.replaceState({}, "", "/auth/bridge");

      if (error) {
        setFailed(true);
        return;
      }

      navigate({ to: "/", replace: true });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-5">
        <SnapperLogo size="md" animate />
        {failed ? (
          <>
            <p className="text-sm text-neutral-400 text-center max-w-xs">
              Não foi possível entrar automaticamente. Tenta abrir o Snapper outra vez a partir do Studio.
            </p>
            <button
              onClick={() => navigate({ to: "/", replace: true })}
              className="text-sm font-medium underline underline-offset-4"
              style={{ color: "#2F6FED" }}
            >
              Ir para a página inicial
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader className="h-4 w-4 animate-spin" />
            A entrar no Snapper…
          </div>
        )}
      </div>
    </div>
  );
}
