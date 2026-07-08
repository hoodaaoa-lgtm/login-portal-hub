import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader } from "lucide-react";

/**
 * "Criar canal" deixou de existir como passo separado — o conceito de
 * canal foi eliminado, qualquer conta já pode publicar usando o próprio
 * perfil (ver supabase/migrations/20260708140000_remove_channels_use_profiles.sql).
 * Mantemos esta rota só para não quebrar links antigos que ainda apontam
 * para "/studio/onboarding"; ela redireciona direto para o Studio.
 */
export const Route = createFileRoute("/studio/onboarding")({
  head: () => ({ meta: [{ title: "Hooda" }] }),
  component: OnboardingRedirect,
});

function OnboardingRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/studio", replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} />
    </div>
  );
}
