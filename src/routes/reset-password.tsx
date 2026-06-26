import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { t } from "@/lib/useT";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HoodaLogo } from "@/components/HoodaLogo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "hooda — Nova senha" },
      { name: "description", content: "Define uma nova senha para a tua conta hooda." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase places a recovery token in the URL hash; the client picks it up automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(err.message);
    setDone(true);
    setTimeout(() => navigate({ to: "/home", replace: true }), 1200);
  }

  return (
    <main className="min-h-screen w-full bg-[#FFC93C] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-7 sm:p-9 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.15)]">
        <div className="flex justify-center mb-6"><HoodaLogo size="lg" animate={true} /></div>
        <h1 className="text-2xl font-extrabold text-black">Nova senha</h1>
        <p className="mt-1.5 text-sm text-neutral-500">Define a tua nova senha abaixo.</p>

        {!ready ? (
          <p className="mt-6 text-sm text-neutral-500">A validar o teu link…</p>
        ) : done ? (
          <p className="mt-6 text-sm text-green-700 font-medium">Senha atualizada! A redirecionar…</p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-1.5">Nova senha</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full h-12 rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-base text-black outline-none focus:border-black focus:bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-600 mb-1.5">Confirmar senha</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••"
                className="w-full h-12 rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-4 text-base text-black outline-none focus:border-black focus:bg-white" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-2xl bg-black text-white font-bold transition-all hover:bg-neutral-800 disabled:opacity-60">
              {loading ? t("settings.saving") : "Guardar senha"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
