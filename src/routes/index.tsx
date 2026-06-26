import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HoodaLogo } from "@/components/HoodaLogo";
import { AuthLeftPanel } from "@/components/AuthLeftPanel";
import {
  Field, EyeIcon, EyeOffIcon, ArrowLeftIcon, SpinIcon, MailIcon, LockIcon, GoogleIcon,
} from "@/components/AuthField";

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "hooda — Entrar" },
      { name: "description", content: "Entre na hooda — leia, crie e conecte-se." },
    ],
  }),
  component: LoginPage,
}));


function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotErr, setForgotErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email ou senha incorretos." : error.message);
      return;
    }
    navigate({ to: "/home", replace: true });
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotErr(null);
    setForgotMsg(null);
    if (!forgotEmail) return setForgotErr("Introduz o teu email.");
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) return setForgotErr(error.message);
    setForgotMsg("Link enviado! Verifica a tua caixa de entrada.");
  }

  return (
    <main className="min-h-screen w-full flex bg-[var(--s2)]">

      {/* ── LEFT — brand illustration ── */}
      <AuthLeftPanel />

      {/* ── RIGHT — form ── */}
      <section
        className="flex-1 flex flex-col items-center justify-center min-h-screen px-6 py-12 lg:px-12"
        style={{
          background: "var(--s2)",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <HoodaLogo size="xl" animate={true} />
        </div>

        <div className="w-full max-w-[360px]">

          {!showForgot ? (
            /* ── LOGIN FORM ── */
            <>
              <div className="mb-8">
                <h2 className="text-[30px] font-extrabold tracking-tight text-[var(--text-primary)]">Entrar</h2>
                <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">
                  Bem-vindo de volta à <span className="font-bold text-[#5B3FCF]">hooda</span>.
                </p>
              </div>

              <form className="space-y-4" onSubmit={onSubmit}>
                <Field
                  id="email" label="Email" type="email"
                  value={email} onChange={setEmail}
                  placeholder="seunome@gmail.com" autoComplete="email"
                  icon={<MailIcon />}
                />

                <div className="space-y-1">
                  <Field
                    id="password" label="Senha" type="password"
                    value={password} onChange={setPassword}
                    placeholder="••••••••" autoComplete="current-password"
                    icon={<LockIcon />}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                      className="text-[13px] font-semibold text-[#5B3FCF] hover:text-[#4a2db5] transition-colors mt-1"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
                    <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* Entrar button — black like imagem 1 */}
                <button
                  type="submit" disabled={loading}
                  className="w-full h-[52px] rounded-xl bg-neutral-900 text-white font-bold text-[15px] tracking-wide transition-all duration-200 hover:bg-black hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                  style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.18)" }}
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <SpinIcon /> Entrando...
                    </span>
                  ) : "Entrar"}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-[var(--s3)]" />
                  <span className="text-xs font-medium text-[var(--text-muted)]">ou</span>
                  <div className="flex-1 h-px bg-[var(--s3)]" />
                </div>

                {/* Google button */}
                <button
                  type="button"
                  className="w-full h-[52px] rounded-xl border border-neutral-300 bg-[var(--s2)] text-neutral-800 font-semibold text-[15px] flex items-center justify-center gap-3 transition-all duration-200 hover:bg-[var(--s1)] hover:border-neutral-400 active:scale-[0.99]"
                >
                  <GoogleIcon />
                  Continuar com Google
                </button>

                {/* Sign up link */}
                <p className="text-center text-[14px] text-[var(--text-muted)] pt-1">
                  Ainda não tem uma conta?{" "}
                  <Link to="/signup" className="font-bold text-[#5B3FCF] hover:text-[#4a2db5] transition-colors">
                    Crie agora
                  </Link>
                </p>
              </form>

              {/* Terms */}
              <p className="mt-8 text-center text-[12px] text-[var(--text-muted)] leading-relaxed">
                Ao continuar, você concorda com os{" "}
                <span className="text-[#5B3FCF] font-medium cursor-pointer hover:underline">Termos</span>{" "}
                e a{" "}
                <span className="text-[#5B3FCF] font-medium cursor-pointer hover:underline">Política de Privacidade</span>{" "}
                da hooda.
              </p>
            </>
          ) : (
            /* ── FORGOT PASSWORD ── */
            <>
              <button
                onClick={() => { setShowForgot(false); setForgotMsg(null); setForgotErr(null); }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-8 group"
              >
                <span className="transition-transform group-hover:-translate-x-0.5"><ArrowLeftIcon /></span>
                Voltar ao login
              </button>

              <div className="mb-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: "#5B3FCF" }}>
                  <LockIcon />
                  <span className="sr-only">Cadeado</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white absolute" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h2 className="text-[28px] font-extrabold tracking-tight text-[var(--text-primary)]">Recuperar senha</h2>
                <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">
                  Sem problema. Enviamos um link para criares uma nova senha.
                </p>
              </div>

              <form className="space-y-4" onSubmit={onForgot}>
                <Field
                  id="forgot-email" label="Email da conta" type="email"
                  value={forgotEmail} onChange={setForgotEmail}
                  placeholder="seunome@gmail.com" autoComplete="email"
                  icon={<MailIcon />}
                />

                {forgotErr && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
                    <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <p className="text-sm text-red-700">{forgotErr}</p>
                  </div>
                )}

                {forgotMsg && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-green-50 border border-green-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <p className="text-sm text-green-700 font-medium">{forgotMsg}</p>
                  </div>
                )}

                <button
                  type="submit" disabled={forgotLoading || !!forgotMsg}
                  className="w-full h-[52px] rounded-xl bg-neutral-900 text-white font-bold text-[15px] tracking-wide transition-all hover:bg-black active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {forgotLoading ? (
                    <span className="inline-flex items-center justify-center gap-2"><SpinIcon /> Enviando...</span>
                  ) : forgotMsg ? "Email enviado ✓" : "Enviar link"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
