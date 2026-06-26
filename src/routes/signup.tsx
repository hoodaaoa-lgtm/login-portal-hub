import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HoodaLogo } from "@/components/HoodaLogo";
import { AuthLeftPanel } from "@/components/AuthLeftPanel";
import {
  Field, SpinIcon, MailIcon, LockIcon, UserIcon, AtIcon, CalendarIcon, PersonAddIcon, GoogleIcon,
} from "@/components/AuthField";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "hooda — Criar conta" },
      { name: "description", content: "Crie a sua conta hooda." },
    ],
  }),
  component: SignupPage,
});

// Gera sugestões de username a partir do nome
function suggestUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, ".") // espaços e especiais → ponto
    .replace(/\.+/g, ".") // pontos duplos → um
    .replace(/^\.|\.$/, "") // remove ponto no início/fim
    .slice(0, 20);
}

function SignupPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const usernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Quando nome muda, sugerir username
  useEffect(() => {
    if (name && !username) {
      setUsername(suggestUsername(name));
    }
  }, [name]);

  // Verificar disponibilidade do username em tempo real
  useEffect(() => {
    if (!username) { setUsernameStatus("idle"); return; }

    if (!/^[a-z0-9_.]{3,20}$/i.test(username) || username.includes("@") || username.includes(".com") || username.includes(".net") || username.includes(".org")) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    if (usernameTimeout.current) clearTimeout(usernameTimeout.current);
    usernameTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "ok");
    }, 500);
  }, [username]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !email || !username || !password) return setError("Preenche todos os campos obrigatórios.");
    if (usernameStatus === "taken") return setError("Este username já está ocupado.");
    if (usernameStatus === "invalid") return setError("Username inválido.");
    if (usernameStatus === "checking") return setError("Aguarda a verificação do username.");
    if (password.length < 6) return setError("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    if (!agreed) return setError("É preciso aceitar os Termos e a Política de Privacidade.");

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/home`,
        data: {
          full_name: name,
          username: username.toLowerCase(),
          ...(birthDate ? { birth_date: birthDate } : {}),
        },
      },
    });
    setLoading(false);
    if (error) {
      // Traduzir erros comuns do Supabase
      const msg = error.message;
      if (msg.includes("User already registered")) setError("Este email já tem uma conta. Tenta iniciar sessão.");
      else if (msg.includes("Password should be")) setError("A senha deve ter pelo menos 6 caracteres.");
      else if (msg.includes("Unable to validate email")) setError("Email inválido. Verifica o formato.");
      else if (msg.includes("username")) setError("Este nome de utilizador já está ocupado. Escolhe outro.");
      else setError(msg);
      return;
    }
    setDone(true);
  }

  const usernameRightIcon = () => {
    if (usernameStatus === "checking") return (
      <svg className="animate-spin h-4 w-4 text-neutral-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    );
    if (usernameStatus === "ok") return (
      <svg className="h-4 w-4 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
    if (usernameStatus === "taken" || usernameStatus === "invalid") return (
      <svg className="h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
    return null;
  };

  const usernameHint = usernameStatus === "ok" ? <span className="text-green-600">@{username.toLowerCase()} está disponível ✓</span>
    : usernameStatus === "taken" ? <span className="text-red-500">Este username já está ocupado.</span>
    : usernameStatus === "invalid" ? <span className="text-red-500">Username inválido — não uses emails, @, ou domínios (.com, .net…).</span>
    : <span className="text-neutral-400">Será o teu @</span>;

  return (
    <main className="min-h-screen w-full flex bg-white">

      {/* ── LEFT — brand illustration (shared with login) ── */}
      <AuthLeftPanel />

      {/* ── RIGHT ── */}
      <section
        className="flex-1 flex flex-col items-center justify-center min-h-screen px-6 py-12 lg:px-12"
        style={{
          background: "#ffffff",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <HoodaLogo size="xl" animate={true} />
        </div>

        {/* ── ECRÃ DE CONFIRMAÇÃO ── */}
        {done ? (
          <div className="w-full max-w-[440px] text-center">
            {/* Ícone animado */}
            <div className="flex items-center justify-center mb-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#5B3FCF18,#E94B8A18)" }}>
                  <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="16" rx="3" fill="#5B3FCF" opacity="0.12"/>
                    <rect x="2" y="4" width="20" height="16" rx="3" stroke="#5B3FCF" strokeWidth="1.8"/>
                    <path d="M2 8l10 6 10-6" stroke="#5B3FCF" strokeWidth="1.8" strokeLinecap="round"/>
                    {/* Check badge */}
                    <circle cx="18" cy="18" r="5" fill="#6BA547"/>
                    <path d="M15.5 18l1.5 1.5 2.5-2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {/* Pulse ring */}
                <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                  style={{ background: "#5B3FCF", animationDuration: "2s" }} />
              </div>
            </div>

            <h2 className="text-[28px] font-extrabold tracking-tight text-neutral-900 mb-3">
              Verifica o teu email
            </h2>
            <p className="text-[15px] text-neutral-500 mb-2 leading-relaxed">
              Enviámos um link de confirmação para
            </p>
            <p className="text-[16px] font-bold mb-6" style={{ color: "#5B3FCF" }}>
              {email}
            </p>
            <p className="text-[14px] text-neutral-400 leading-relaxed mb-8">
              Abre o teu email e clica no link para ativar a tua conta hooda. Verifica também a pasta de <span className="font-semibold">spam</span> caso não encontres.
            </p>

            {/* Acções */}
            <div className="space-y-3">
              <a
                href={`mailto:${email}`}
                className="w-full h-[52px] rounded-xl text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
                style={{ background: "#5B3FCF", boxShadow: "0 4px 14px rgba(91,63,207,0.3)" }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 8l10 6 10-6"/>
                </svg>
                Abrir email
              </a>
              <Link to="/"
                className="w-full h-[52px] rounded-xl border font-semibold text-[15px] flex items-center justify-center gap-2 transition-all hover:bg-neutral-50"
                style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
                Voltar ao login
              </Link>
            </div>

            <p className="mt-6 text-[12px] text-neutral-400">
              Não recebeste o email?{" "}
              <button
                onClick={async () => {
                  await supabase.auth.resend({ type: "signup", email });
                  alert("Email reenviado! Verifica a tua caixa de entrada.");
                }}
                className="font-semibold hover:underline"
                style={{ color: "#5B3FCF" }}
              >
                Reenviar
              </button>
            </p>
          </div>
        ) : (
          <div className="w-full max-w-[440px]">
          <div className="mb-8">
            <h2 className="text-[30px] font-extrabold tracking-tight text-neutral-900">Criar conta</h2>
            <p className="mt-1.5 text-[15px] text-neutral-500">
              Junte-se à <span className="font-bold text-[#5B3FCF]">hooda</span> e faça parte da comunidade.
            </p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <Field
              id="name" label="Nome completo" type="text"
              value={name} onChange={setName}
              placeholder="Seu nome completo" autoComplete="name"
              icon={<UserIcon />}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Field
                  id="username" label="Nome de utilizador" type="text"
                  value={username}
                  onChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, "").replace(/@/g, ""))}
                  placeholder="Escolha um utilizador" autoComplete="username"
                  icon={<AtIcon />}
                  rightIcon={usernameRightIcon()}
                />
                <p className="text-[11px]">{usernameHint}</p>
              </div>

              <Field
                id="email" label="E-mail" type="email"
                value={email} onChange={setEmail}
                placeholder="seuemail@exemplo.com" autoComplete="email"
                icon={<MailIcon />}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                id="password" label="Senha" type="password"
                value={password} onChange={setPassword}
                placeholder="Crie uma senha" autoComplete="new-password"
                icon={<LockIcon />}
              />
              <Field
                id="confirm" label="Confirmar senha" type="password"
                value={confirm} onChange={setConfirm}
                placeholder="Confirme sua senha" autoComplete="new-password"
                icon={<LockIcon />}
              />
            </div>
            {confirm && password !== confirm && (
              <p className="-mt-2 text-[11px] text-red-500">As senhas não coincidem.</p>
            )}

            <Field
              id="birth-date" label="Data de nascimento" type="date"
              value={birthDate} onChange={setBirthDate}
              placeholder="DD/MM/AAAA" autoComplete="bday"
              icon={<CalendarIcon />}
              optional
            />

            <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox" checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-[#5B3FCF] focus:ring-[#5B3FCF] focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[13px] text-neutral-500 leading-relaxed">
                Ao continuar, você concorda com os{" "}
                <span className="text-[#5B3FCF] font-medium hover:underline">Termos</span>{" "}
                e a{" "}
                <span className="text-[#5B3FCF] font-medium hover:underline">Política de Privacidade</span>{" "}
                da hooda.
              </span>
            </label>

            {error && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
                <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Criar conta button — purple like imagem 1 */}
            <button
              type="submit"
              disabled={loading || usernameStatus === "taken" || usernameStatus === "checking"}
              className="w-full h-[52px] rounded-xl text-white font-bold text-[15px] tracking-wide flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              style={{ background: "#5B3FCF", boxShadow: "0 4px 14px rgba(91,63,207,0.35)" }}
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <SpinIcon /> Criando conta...
                </span>
              ) : (
                <>
                  <PersonAddIcon /> Criar conta
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-neutral-200" />
              <span className="text-xs font-medium text-neutral-400">ou</span>
              <div className="flex-1 h-px bg-neutral-200" />
            </div>

            {/* Google button */}
            <button
              type="button"
              className="w-full h-[52px] rounded-xl border border-neutral-300 bg-white text-neutral-800 font-semibold text-[15px] flex items-center justify-center gap-3 transition-all duration-200 hover:bg-neutral-50 hover:border-neutral-400 active:scale-[0.99]"
            >
              <GoogleIcon />
              Continuar com Google
            </button>

            {/* Login link */}
            <p className="text-center text-[14px] text-neutral-500 pt-1">
              Já tem uma conta?{" "}
              <Link to="/" className="font-bold text-[#5B3FCF] hover:text-[#4a2db5] transition-colors">
                Entrar
              </Link>
            </p>
          </form>
          </div>
        )}
      </section>
    </main>
  );
}
