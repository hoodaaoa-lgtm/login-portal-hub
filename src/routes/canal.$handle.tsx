import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader } from "lucide-react";

/**
 * "/canal/$handle" já não é uma página própria — o conceito de "canal"
 * separado do perfil foi eliminado (ver
 * supabase/migrations/20260708140000_remove_channels_use_profiles.sql).
 * Esta rota existe só para não quebrar links antigos: resolve o handle
 * para um perfil e redireciona para "/u/$username", que já cobre tudo que
 * esta página fazia (vídeos, seguir, seguidores, banner, bio).
 *
 * Limitação conhecida: o "handle" de um canal (Fase 1) podia ter sido
 * escolhido de forma independente do "username" do perfil do dono. Como a
 * tabela "channels" já foi apagada, não há como recuperar esse mapeamento
 * para links muito antigos cujo handle divergia do username — nesses casos
 * caímos no estado "não encontrado" abaixo.
 */
export const Route = createFileRoute("/canal/$handle")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: CanalRedirect,
});

function CanalRedirect() {
  const { handle } = useParams({ from: "/canal/$handle" });
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("username")
        .eq("username", handle)
        .maybeSingle();
      if (cancelled) return;
      if (data?.username) {
        navigate({ to: "/u/$username", params: { username: data.username }, replace: true });
      } else {
        setNotFound(true);
      }
    })();
    return () => { cancelled = true; };
  }, [handle, navigate]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Não encontrámos esse canal
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Este link é antigo e já não aponta para um perfil válido.
        </p>
        <a href="/explorar"
          className="px-6 py-2.5 rounded-2xl text-white font-bold text-sm"
          style={{ background: "linear-gradient(135deg,#5B3FCF,#E94B8A)" }}>
          Explorar
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} />
    </div>
  );
}
