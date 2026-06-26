import { t } from "@/lib/useT";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Check, X, Loader2, Camera, Upload, ArrowRight, ArrowLeft,
  Tv2, Copy, ExternalLink, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/studio/onboarding")({
  head: () => ({ meta: [{ title: "Criar canal — Hooda Studio" }] }),
  component: OnboardingPage,
});

const PURPLE = "#5B3FCF";
const GRAD   = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

const CATEGORIES = [
  "Música","Jogos","Educação","Notícias","Desporto",
  "Tecnologia","Estilo de vida","Entretenimento","Outro",
];

/* ── Stepper dots ── */
function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="transition-all duration-300 rounded-full"
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            background: i <= current ? PURPLE : "var(--s3)",
          }} />
      ))}
    </div>
  );
}

/* ── Image picker ── */
function ImagePicker({ value, onChange, aspect, label, icon }: {
  value: string | null; onChange: (file: File, preview: string) => void;
  aspect: string; label: string; icon: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button type="button" onClick={() => ref.current?.click()}
      className="relative overflow-hidden flex items-center justify-center border-2 border-dashed transition-all hover:opacity-80 active:scale-95 group"
      style={{
        aspectRatio: aspect, width: "100%",
        borderColor: value ? "transparent" : "var(--border-default)",
        borderRadius: aspect === "1/1" ? "50%" : 16,
        background: value ? "transparent" : "var(--s2)",
      }}>
      {value
        ? <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover"
            style={{ borderRadius: aspect === "1/1" ? "50%" : 16 }} />
        : <div className="flex flex-col items-center gap-1.5 pointer-events-none"
            style={{ color: "var(--text-muted)" }}>
            {icon}
            <span className="text-xs font-medium">{label}</span>
          </div>}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        style={{ background: "rgba(0,0,0,0.35)", borderRadius: aspect === "1/1" ? "50%" : 16 }}>
        <Camera className="h-5 w-5 text-white" />
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          e.target.value = "";
          onChange(f, URL.createObjectURL(f));
        }} />
    </button>
  );
}

/* ── Main ── */
function OnboardingPage() {
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const [step, setStep] = useState(0); // 0=nome/handle, 1=imagens, 2=detalhes, 3=sucesso

  /* fields */
  const [name,        setName]        = useState("");
  const [handle,      setHandle]      = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState("");
  const [avatarFile,  setAvatarFile]  = useState<File | null>(null);
  const [avatarPrev,  setAvatarPrev]  = useState<string | null>(null);
  const [bannerFile,  setBannerFile]  = useState<File | null>(null);
  const [bannerPrev,  setBannerPrev]  = useState<string | null>(null);
  const [channelUrl,  setChannelUrl]  = useState("");
  const [copied,      setCopied]      = useState(false);

  /* handle check */
  const [hStatus, setHStatus] = useState<"idle"|"checking"|"available"|"taken"|"invalid">("idle");
  useEffect(() => {
    if (!handle) { setHStatus("idle"); return; }
    if (!/^[a-z0-9_]{3,30}$/.test(handle)) { setHStatus("invalid"); return; }
    setHStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).from("channels").select("id").eq("handle", handle).maybeSingle();
      setHStatus(data ? "taken" : "available");
    }, 450);
    return () => clearTimeout(t);
  }, [handle]);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  /* upload helper */
  async function uploadImg(file: File, path: string) {
    const ext  = file.name.split(".").pop() ?? "jpg";
    const full = `${path}.${ext}`;
    const { error } = await supabase.storage.from("channel-assets").upload(full, file, { upsert: true });
    if (error) { console.error("uploadImg:", error); return null; }
    const { data } = supabase.storage.from("channel-assets").getPublicUrl(full);
    return data.publicUrl;
  }

  async function submit() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const { data: ud } = await supabase.auth.getUser();
      const uid = ud.user!.id;

      let avatar_url: string | null = null;
      let banner_url: string | null = null;
      if (avatarFile) avatar_url = await uploadImg(avatarFile, `${uid}/avatar`);
      if (bannerFile) banner_url = await uploadImg(bannerFile, `${uid}/banner`);

      const { error: err } = await (supabase as any).from("channels").insert({
        owner_id: uid, name: name.trim(), handle,
        description: description.trim() || null,
        category: category || null,
        avatar_url, banner_url,
      } as any);
      if (err) throw err;

      await qc.invalidateQueries({ queryKey: ["my-channel"] });
      setChannelUrl(`${window.location.host}/@${handle}`);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar canal");
    } finally {
      setSaving(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(`https://${channelUrl}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ── STEP 0 — Nome & Handle ── */
  const step0 = (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
          style={{ background: GRAD }}>
          <Tv2 className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Cria o teu canal
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Escolhe um nome e URL únicos para o teu canal.
        </p>
      </div>

      {/* Nome */}
      <div>
        <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
          Nome do canal <span style={{ color: "#E94B8A" }}>*</span>
        </label>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
          placeholder="Ex: Tech Angola" autoFocus
          className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition"
          style={{
            background: "var(--s2)", border: "1.5px solid var(--border-default)",
            color: "var(--text-primary)",
          }}
          onFocus={e => e.currentTarget.style.borderColor = PURPLE}
          onBlur={e => e.currentTarget.style.borderColor = "var(--border-default)"}
        />
      </div>

      {/* Handle */}
      <div>
        <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
          URL do canal <span style={{ color: "#E94B8A" }}>*</span>
        </label>
        <div className="flex items-center rounded-2xl overflow-hidden transition"
          style={{ background: "var(--s2)", border: "1.5px solid var(--border-default)" }}>
          <span className="pl-4 pr-2 text-sm shrink-0 py-3" style={{ color: "var(--text-muted)" }}>
            {window.location.host}/@
          </span>
          <input value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="techangola" maxLength={30}
            className="flex-1 bg-transparent py-3 text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <div className="pr-4 pl-2">
            {hStatus === "checking"   && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-muted)" }} />}
            {hStatus === "available"  && <Check   className="h-4 w-4" style={{ color: "#6BA547" }} />}
            {(hStatus === "taken" || hStatus === "invalid") && <X className="h-4 w-4" style={{ color: "#E94B8A" }} />}
          </div>
        </div>
        {hStatus === "taken"     && <p className="text-xs mt-1.5" style={{ color: "#E94B8A" }}>Esta URL já está em uso.</p>}
        {hStatus === "invalid"   && <p className="text-xs mt-1.5" style={{ color: "#E94B8A" }}>Usa 3–30 letras minúsculas, números ou _</p>}
        {hStatus === "available" && <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#6BA547" }}><Check className="h-3 w-3" /> Disponível!</p>}
      </div>

      <button onClick={() => setStep(1)}
        disabled={hStatus !== "available" || !name.trim()}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40"
        style={{ background: GRAD, boxShadow: "0 4px 16px #5B3FCF33" }}>
        Continuar <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );

  /* ── STEP 1 — Imagens ── */
  const step1 = (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Personaliza o canal</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Adiciona uma foto e uma capa ao teu canal.</p>
      </div>

      {/* Banner */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Imagem de capa
        </label>
        <div style={{ aspectRatio: "16/5" }}>
          <ImagePicker value={bannerPrev} aspect="16/5" label="Adicionar capa"
            icon={<Upload className="h-5 w-5" />}
            onChange={(f, p) => { setBannerFile(f); setBannerPrev(p); }} />
        </div>
      </div>

      {/* Avatar — sobreposto */}
      <div className="flex items-center gap-4">
        <div style={{ width: 80, height: 80, flexShrink: 0 }}>
          <ImagePicker value={avatarPrev} aspect="1/1" label="Foto"
            icon={<Camera className="h-5 w-5" />}
            onChange={(f, p) => { setAvatarFile(f); setAvatarPrev(p); }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</p>
          <p className="text-xs" style={{ color: PURPLE }}>@{handle}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Toca na foto para alterar</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => setStep(0)}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition"
          style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <button onClick={() => setStep(2)}
          className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition active:scale-95"
          style={{ background: GRAD }}>
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <button onClick={() => setStep(2)}
        className="w-full text-center text-xs transition"
        style={{ color: "var(--text-muted)" }}>
        Saltar por agora
      </button>
    </div>
  );

  /* ── STEP 2 — Detalhes ── */
  const step2 = (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Sobre o canal</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Mais detalhes ajudam as pessoas a encontrar-te.</p>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>Descrição</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          rows={3} maxLength={500} placeholder="Sobre o que é o teu canal?"
          className="w-full px-4 py-3 rounded-2xl text-sm outline-none resize-none transition"
          style={{ background: "var(--s2)", border: "1.5px solid var(--border-default)", color: "var(--text-primary)" }}
          onFocus={e => e.currentTarget.style.borderColor = PURPLE}
          onBlur={e => e.currentTarget.style.borderColor = "var(--border-default)"}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>Categoria</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(cat => cat === c ? "" : c)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95"
              style={{
                background: category === c ? PURPLE : "var(--s2)",
                color: category === c ? "#fff" : "var(--text-secondary)",
                border: `1.5px solid ${category === c ? PURPLE : "var(--border-default)"}`,
              }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-2xl text-sm" style={{ background: "#fee2e2", color: "#DC2626" }}>
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setStep(1)}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <button onClick={submit} disabled={saving}
          className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-60"
          style={{ background: GRAD, boxShadow: "0 4px 16px #5B3FCF33" }}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> A criar…</> : <>Criar canal <Sparkles className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  );

  /* ── STEP 3 — Sucesso ── */
  const step3 = (
    <div className="text-center space-y-6">
      {/* Confetti circle */}
      <div className="relative flex items-center justify-center">
        <div className="h-24 w-24 rounded-full flex items-center justify-center mx-auto"
          style={{ background: GRAD, boxShadow: "0 8px 32px #5B3FCF44" }}>
          {avatarPrev
            ? <img src={avatarPrev} className="h-full w-full rounded-full object-cover" alt="" />
            : <Tv2 className="h-10 w-10 text-white" />}
        </div>
        <div className="absolute -top-1 -right-1 h-8 w-8 rounded-full flex items-center justify-center"
          style={{ background: "#6BA547", boxShadow: "0 2px 8px #6BA54766" }}>
          <Check className="h-4 w-4 text-white" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Canal criado! 🎉</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          O teu canal <span style={{ color: PURPLE, fontWeight: 600 }}>{name}</span> está pronto.
        </p>
      </div>

      {/* URL card */}
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: PURPLE + "10", border: `1.5px solid ${PURPLE}33` }}>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>O teu link</p>
          <p className="text-sm font-bold truncate" style={{ color: PURPLE }}>{channelUrl}</p>
        </div>
        <button onClick={copy}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-90"
          style={{ background: copied ? "#6BA547" : PURPLE, color: "#fff" }}>
          {copied ? <><Check className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
        </button>
      </div>

      <div className="space-y-3">
        <button onClick={() => navigate({ to: "/studio/upload" as any })}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition active:scale-95"
          style={{ background: GRAD, boxShadow: "0 4px 16px #5B3FCF33" }}>
          <Upload className="h-4 w-4" /> Enviar primeiro vídeo
        </button>
        <button onClick={() => navigate({ to: "/studio" as any })}
          className="w-full py-3 rounded-2xl text-sm font-semibold transition"
          style={{ background: "var(--s2)", color: "var(--text-secondary)" }}>
          Ir para o painel
        </button>
      </div>
    </div>
  );

  const steps = [step0, step1, step2, step3];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "var(--s1)" }}>
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center"
            style={{ background: GRAD }}>
            <Tv2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Hooda <span style={{ color: PURPLE }}>Studio</span>
          </span>
        </div>

        {step < 3 && <Steps current={step} total={3} />}

        {/* Card */}
        <div className="rounded-3xl p-7"
          style={{ background: "var(--s0)", boxShadow: "var(--shadow-modal)", border: "1px solid var(--border-subtle)" }}>
          {steps[step]}
        </div>
      </div>
    </div>
  );
}
