import React, { useState, useRef, useEffect, useCallback } from "react";
import { t } from "@/lib/useT";
import {
  X, ChevronRight, Camera, Save, Loader, Users, Shield, ShieldCheck,
  Search, UserMinus, UserX, VolumeX, Globe, Lock, EyeOff, Link,
  MessageSquare, Image as ImageIcon, Video, LinkIcon, CheckSquare,
  AlertTriangle, Check, ArrowLeft, Edit3, Plus, Trash2, MoreVertical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ACCENT = "#5B3FCF";
const PINK   = "#E94B8A";
const GRAD   = `linear-gradient(135deg, ${ACCENT} 0%, ${PINK} 100%)`;
const COLORS  = ["#5B3FCF","#E94B8A","#10B981","#F59E0B","#3B82F6","#EC4899","#14B8A6","#F97316","#6366F1","#EF4444"];

const CATEGORIES = [
  "Negócios","Tecnologia","Jogos","Música","Educação","Criadores",
  "Desporto","Arte","Culinária","Viagens","Moda","Saúde","Cinema",
  "Fotografia","Religião","Política","Animais","Finanças",
];

type SettingsSection =
  | "main" | "info" | "membros" | "membro-detail"
  | "visibilidade" | "permissoes" | "foto" | "regras";

interface Member {
  id: string;
  user_id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  role: "owner" | "admin" | "moderator" | "member";
  joined_at: string;
}

interface Community {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  emoji: string;
  photo?: string;
  memberCount: number;
  communityType: "open" | "private" | "hybrid";
  visibility: "public" | "hidden" | "link";
  isJoined: boolean;
  isAdmin: boolean;
  allowSearch: boolean;
  createdAt: string;
  joinedAt: string | null;
}

interface CommunitySettingsModalProps {
  community: Community;
  onClose: () => void;
  onUpdate: (updated: Community) => void;
  initialSection?: SettingsSection;
}

/* ── Avatar helper ── */
function MemberAvatar({ member, size = 40 }: { member: Member; size?: number }) {
  const colors = ["#5B3FCF","#E94B8A","#1FAFA6","#6BA547","#F26B3A"];
  const bg = colors[(member.username?.charCodeAt(0) ?? 0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {member.avatar_url
        ? <img src={member.avatar_url} alt={member.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ color: "white", fontWeight: 700, fontSize: size * 0.38 }}>
            {(member.full_name || member.username)?.[0]?.toUpperCase() ?? "?"}
          </span>}
    </div>
  );
}

function RoleBadge({ role }: { role: Member["role"] }) {
  const cfg = {
    owner:     { label: "Dono",       bg: "#FFF3CD", color: "#856404", border: "#FFEAA7" },
    admin:     { label: "Admin",      bg: "#D1ECF1", color: "#0C5460", border: "#BEE5EB" },
    moderator: { label: "Moderador",  bg: "#D4EDDA", color: "#155724", border: "#C3E6CB" },
    member:    { label: "Membro",     bg: "#E2E8F0", color: "#475569", border: "#CBD5E0" },
  }[role];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────── */
export function CommunitySettingsModal({ community, onClose, onUpdate, initialSection = "main" }: CommunitySettingsModalProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [myUserId, setMyUserId] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setMyUserId(session.user.id);
    });
  }, []);

  function goBack() {
    if (section === "membro-detail") { setSection("membros"); return; }
    setSection("main");
  }

  const titles: Record<SettingsSection, string> = {
    main:           t("studio.settings"),
    info:           "Informações",
    membros:        "Membros",
    "membro-detail":"Gerir membro",
    visibilidade:   t("studio.visibility"),
    permissoes:     "Permissões",
    foto:           "Foto da comunidade",
    regras:         "Regras",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end lg:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div className="w-full lg:max-w-sm lg:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-card, #fff)", maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}>
          {section !== "main" && (
            <button onClick={goBack} className="p-1.5 rounded-full hover:bg-neutral-100 transition">
              <ArrowLeft className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
            </button>
          )}
          <h2 className="flex-1 text-[15px] font-extrabold" style={{ color: "var(--text-primary)" }}>
            {titles[section]}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 transition">
            <X className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {section === "main"           && <SectionMain     community={community} onUpdate={onUpdate} onNavigate={setSection} />}
          {section === "info"           && <SectionInfo     community={community} onUpdate={onUpdate} />}
          {section === "membros"        && <SectionMembros  community={community} myUserId={myUserId} onSelectMember={(m) => { setSelectedMember(m); setSection("membro-detail"); }} />}
          {section === "membro-detail"  && selectedMember && <SectionMembroDetail member={selectedMember} community={community} myUserId={myUserId} onBack={() => setSection("membros")} onUpdate={(m) => setSelectedMember(m)} />}
          {section === "visibilidade"   && <SectionVisibilidade community={community} onUpdate={onUpdate} />}
          {section === "permissoes"     && <SectionPermissoes   community={community} onUpdate={onUpdate} />}
          {section === "foto"           && <SectionFoto         community={community} onUpdate={onUpdate} />}
          {section === "regras"         && <SectionRegras       community={community} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Main menu ─── */
function SectionMain({ community, onUpdate, onNavigate }: {
  community: Community; onUpdate: (c: Community) => void; onNavigate: (s: SettingsSection) => void;
}) {
  const menuItems = [
    { section: "foto"         as SettingsSection, icon: Camera,       label: "Foto da comunidade",     desc: "Alterar foto e capa" },
    { section: "info"         as SettingsSection, icon: Edit3,        label: "Informações básicas",    desc: "Nome, descrição, categoria" },
    { section: "membros"      as SettingsSection, icon: Users,        label: "Gestão de membros",      desc: `${community.memberCount} membros` },
    { section: "visibilidade" as SettingsSection, icon: Globe,        label: "Visibilidade e pesquisa",desc: community.allowSearch ? "Pública" : "Oculta" },
    { section: "permissoes"   as SettingsSection, icon: Shield,       label: "Permissões de conteúdo", desc: "Quem pode publicar e comentar" },
    { section: "regras"       as SettingsSection, icon: CheckSquare,  label: "Regras da comunidade",   desc: "Define as regras para os membros" },
  ];

  return (
    <div className="p-4 space-y-2 pb-8">
      {/* Community preview */}
      <div className="rounded-2xl p-4 mb-4 flex items-center gap-3 border"
        style={{ background: "var(--s3)", borderColor: "var(--border-subtle)" }}>
        <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: community.photo ? "transparent" : community.color }}>
          {community.photo
            ? <img src={community.photo} alt="" className="w-full h-full object-cover" />
            : <span style={{ fontSize: 26 }}>{community.emoji}</span>}
        </div>
        <div className="min-w-0">
          <p className="font-extrabold text-[15px] truncate" style={{ color: "var(--text-primary)" }}>{community.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{community.category} · {community.memberCount} membros</p>
        </div>
      </div>

      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.section} onClick={() => onNavigate(item.section)}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all hover:border-[#5B3FCF]/30 active:scale-[0.99]"
            style={{ background: "var(--s3)", borderColor: "var(--border-subtle)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: ACCENT + "15" }}>
              <Icon className="h-4 w-4" style={{ color: ACCENT }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
          </button>
        );
      })}
    </div>
  );
}

/* ─── Info section ─── */
function SectionInfo({ community, onUpdate }: { community: Community; onUpdate: (c: Community) => void }) {
  const [name, setName] = useState(community.name);
  const [desc, setDesc] = useState(community.description);
  const [cat, setCat] = useState(community.category);
  const [color, setColor] = useState(community.color);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("communities").update({
      name: name.trim(), description: desc.trim(), category: cat, cover_color: color,
    }).eq("id", community.id);
    setSaving(false);
    if (error) { toast.error("Erro ao guardar. Tenta novamente."); return; }
    toast.success("Informações atualizadas!");
    onUpdate({ ...community, name: name.trim(), description: desc.trim(), category: cat, color });
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      <Field label="Nome da comunidade" maxLength={60}>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{ background: "var(--s3)", border: `1.5px solid ${name !== community.name ? ACCENT : "var(--border-default)"}`,
            color: "var(--text-primary)" }} />
        <p className="text-right text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{name.length}/60</p>
      </Field>

      <Field label={t("tv.description")}>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={300}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
          style={{ background: "var(--s3)", border: "1.5px solid var(--border-default)", color: "var(--text-primary)" }} />
      </Field>

      <Field label="Categoria">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={{ background: cat === c ? ACCENT : "var(--s3)", color: cat === c ? "#fff" : ACCENT,
                borderColor: cat === c ? ACCENT : "var(--border-default)" }}>
              {c}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Cor do tema">
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className="w-9 h-9 rounded-full border-4 transition-all active:scale-90"
              style={{ background: c, borderColor: color === c ? "#fff" : c,
                boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }} />
          ))}
        </div>
      </Field>

      <button onClick={save} disabled={saving}
        className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: GRAD }}>
        {saving ? <><Loader className="h-4 w-4 animate-spin" /> A guardar…</> : <><Save className="h-4 w-4" /> Guardar alterações</>}
      </button>
    </div>
  );
}

/* ─── Members section ─── */
function SectionMembros({ community, myUserId, onSelectMember }: {
  community: Community; myUserId: string; onSelectMember: (m: Member) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE;
    const { data, error } = await (supabase as any)
      .from("community_members")
      .select("id,user_id,role,joined_at")
      .eq("community_id", community.id)
      .range(from, from + PAGE - 1)
      .order("joined_at", { ascending: true });

    if (error) { toast.error("Erro ao carregar membros"); setLoading(false); return; }
    const memberRows = data || [];
    const ids = [...new Set(memberRows.map((r: any) => r.user_id).filter(Boolean))] as string[];
    let profilesById: Record<string, any> = {};
    if (ids.length) {
      const { data: profs, error: profErr } = await supabase
        .from("profiles").select("id,username,full_name,avatar_url").in("id", ids);
      if (profErr) console.error("SectionMembros: erro ao carregar perfis", profErr);
      (profs ?? []).forEach((p: any) => { profilesById[p.id] = p; });
    }
    const mapped: Member[] = memberRows.map((m: any) => {
      const p = profilesById[m.user_id];
      return {
        id: m.id, user_id: m.user_id, role: m.role ?? "member",
        joined_at: m.joined_at,
        username:  p?.username  ?? "utilizador",
        full_name: p?.full_name ?? undefined,
        avatar_url:p?.avatar_url ?? undefined,
      };
    });
    setMembers(prev => page === 0 ? mapped : [...prev, ...mapped]);
    setLoading(false);
  }, [community.id, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = members.filter(m =>
    !query ||
    m.username.toLowerCase().includes(query.toLowerCase()) ||
    (m.full_name ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const roleOrder: Record<Member["role"], number> = { owner: 0, admin: 1, moderator: 2, member: 3 };
  const sorted = [...filtered].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: "var(--s3)", border: "1.5px solid var(--border-default)" }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar membros…"
            className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text-primary)" }} />
          {query && <button onClick={() => setQuery("")}><X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} /></button>}
        </div>
        <p className="text-[11px] mt-2 font-semibold" style={{ color: "var(--text-muted)" }}>
          {community.memberCount.toLocaleString("pt-PT")} membros no total
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-8">
        {loading && page === 0 ? (
          <div className="flex justify-center py-10">
            <Loader className="h-5 w-5 animate-spin" style={{ color: ACCENT }} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum membro encontrado</p>
          </div>
        ) : (
          <>
            {sorted.map(m => (
              <button key={m.id} onClick={() => community.isAdmin && m.role !== "owner" && onSelectMember(m)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all hover:bg-white/5 active:scale-[0.99]">
                <MemberAvatar member={m} size={42} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {m.full_name || m.username}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>@{m.username}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={m.role} />
                  {community.isAdmin && m.role !== "owner" && (
                    <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                  )}
                </div>
              </button>
            ))}
            {sorted.length >= PAGE && (
              <button onClick={() => setPage(p => p + 1)}
                className="w-full py-2.5 text-sm font-semibold text-center rounded-xl mt-2 transition-all hover:opacity-80"
                style={{ color: ACCENT, background: ACCENT + "10" }}>
                {loading ? "A carregar…" : "Ver mais membros"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Member detail (admin actions) ─── */
function SectionMembroDetail({ member, community, myUserId, onBack, onUpdate }: {
  member: Member; community: Community; myUserId: string;
  onBack: () => void; onUpdate: (m: Member) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function changeRole(newRole: Member["role"]) {
    setLoading("role");
    const { error } = await supabase.from("community_members")
      .update({ role: newRole }).eq("id", member.id);
    setLoading(null);
    if (error) { toast.error("Erro ao alterar função"); return; }
    toast.success(`Função alterada para ${newRole}`);
    onUpdate({ ...member, role: newRole });
  }

  async function removeMember() {
    if (!confirm(`Remover @${member.username} da comunidade?`)) return;
    setLoading("remove");
    const { error } = await supabase.from("community_members")
      .delete().eq("id", member.id);
    setLoading(null);
    if (error) { toast.error("Erro ao remover membro"); return; }
    toast.success(`@${member.username} foi removido`);
    onBack();
  }

  async function banMember() {
    if (!confirm(`Banir @${member.username}? Esta ação impede o membro de entrar novamente.`)) return;
    setLoading("ban");
    try {
      // 1. Remover da comunidade
      const { error: rmErr } = await supabase.from("community_members").delete().eq("id", member.id);
      if (rmErr) throw rmErr;
      // 2. Registar banimento
      const { error: banErr } = await (supabase as any).from("community_bans").upsert({
        community_id: community.id,
        user_id: member.user_id,
        banned_by: myUserId,
      }, { onConflict: "community_id,user_id" });
      if (banErr) throw banErr;
      toast.success(`@${member.username} foi banido da comunidade.`);
      onBack();
    } catch (err: any) {
      console.error("[hooda:banMember]", err);
      toast.error(`Erro ao banir: ${err?.message ?? "tenta novamente"}`);
    } finally {
      setLoading(null);
    }
  }

  async function muteMember() {
    setLoading("mute");
    try {
      const { error } = await (supabase as any).from("community_mutes").upsert({
        community_id: community.id,
        user_id: member.user_id,
        muted_by: myUserId,
        muted_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }, { onConflict: "community_id,user_id" });
      if (error) throw error;
      toast.success(`@${member.username} silenciado por 24h.`);
    } catch (err: any) {
      console.error("[hooda:muteMember]", err);
      toast.error(`Erro ao silenciar: ${err?.message ?? "tenta novamente"}`);
    } finally {
      setLoading(null);
    }
  }

  const actions: {
    key: string; icon: typeof Shield; label: string; desc: string;
    color?: string; danger?: boolean; onClick: () => void; hidden?: boolean;
  }[] = [
    {
      key: "mod",
      icon: Shield,
      label: member.role === "moderator" ? "Remover Moderador" : "Promover a Moderador",
      desc: "Pode remover publicações e silenciar membros",
      onClick: () => changeRole(member.role === "moderator" ? "member" : "moderator"),
      hidden: member.role === "admin",
    },
    {
      key: "admin",
      icon: ShieldCheck,
      label: member.role === "admin" ? "Remover Admin" : "Promover a Admin",
      desc: "Acesso total às definições da comunidade",
      onClick: () => changeRole(member.role === "admin" ? "moderator" : "admin"),
    },
    {
      key: "mute",
      icon: VolumeX,
      label: "Silenciar (24h)",
      desc: "Impede o membro de enviar mensagens temporariamente",
      onClick: muteMember,
    },
    {
      key: "remove",
      icon: UserMinus,
      label: "Remover da comunidade",
      desc: "O membro pode entrar novamente",
      danger: true,
      onClick: removeMember,
    },
    {
      key: "ban",
      icon: UserX,
      label: "Banir membro",
      desc: "Impede permanentemente o acesso à comunidade",
      danger: true,
      color: "#EF4444",
      onClick: banMember,
    },
  ];

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Member card */}
      <div className="rounded-2xl p-4 flex items-center gap-3 border"
        style={{ background: "var(--s3)", borderColor: "var(--border-subtle)" }}>
        <MemberAvatar member={member} size={52} />
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-[15px] truncate" style={{ color: "var(--text-primary)" }}>
            {member.full_name || member.username}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>@{member.username}</p>
          <div className="mt-1.5"><RoleBadge role={member.role} /></div>
        </div>
      </div>

      {/* Actions */}
      {actions.filter(a => !a.hidden).map(a => {
        const Icon = a.icon;
        const isLoading = loading === a.key;
        return (
          <button key={a.key} onClick={a.onClick} disabled={!!loading}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all active:scale-[0.99] disabled:opacity-50"
            style={{ background: "var(--s3)", borderColor: a.danger ? "#FCA5A5" : "var(--border-subtle)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: (a.danger ? "#FEE2E2" : ACCENT + "15") }}>
              {isLoading
                ? <Loader className="h-4 w-4 animate-spin" style={{ color: a.danger ? "#EF4444" : ACCENT }} />
                : <Icon className="h-4 w-4" style={{ color: a.danger ? "#EF4444" : ACCENT }} />}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: a.danger ? "#EF4444" : "var(--text-primary)" }}>{a.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{a.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Visibility section ─── */
function SectionVisibilidade({ community, onUpdate }: { community: Community; onUpdate: (c: Community) => void }) {
  const [privacy, setPrivacy] = useState<"open"|"private"|"hybrid">(community.communityType);
  const [visibility, setVisibility] = useState<"public"|"hidden"|"link">(community.visibility);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("communities").update({
      privacy: privacy === "private" ? "private" : "public",
      allow_search: visibility === "public",
    }).eq("id", community.id);
    setSaving(false);
    if (error) { toast.error("Erro ao guardar"); return; }
    toast.success("Visibilidade atualizada!");
    onUpdate({ ...community, communityType: privacy, visibility, allowSearch: visibility === "public" });
  }

  return (
    <div className="p-4 space-y-5 pb-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
          Tipo de comunidade
        </p>
        <div className="space-y-2">
          {([
            { key: "open",    icon: Globe,  label: "Pública aberta",  desc: "Qualquer pessoa pode entrar e publicar" },
            { key: "hybrid",  icon: Shield, label: "Híbrida",         desc: "Entrada livre, publicações moderadas" },
            { key: "private", icon: Lock,   label: "Privada",         desc: "Entrada por convite/aprovação" },
          ] as const).map(opt => {
            const Icon = opt.icon;
            const sel = privacy === opt.key;
            return (
              <button key={opt.key} onClick={() => setPrivacy(opt.key)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all"
                style={{ borderColor: sel ? ACCENT : "var(--border-default)", background: sel ? ACCENT + "08" : "var(--s3)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: sel ? ACCENT : "var(--s2)" }}>
                  <Icon className="h-4 w-4" style={{ color: sel ? "#fff" : "var(--text-muted)" }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{opt.desc}</p>
                </div>
                {sel && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: ACCENT }}>
                  <Check className="h-3 w-3 text-white" /></div>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
          Pesquisa
        </p>
        <div className="space-y-2">
          {([
            { key: "public", icon: Globe,  label: "Aparecer na pesquisa",  desc: "Qualquer pessoa pode encontrar esta comunidade" },
            { key: "link",   icon: LinkIcon,label: "Apenas por link",      desc: "Não aparece na pesquisa — só com link direto" },
            { key: "hidden", icon: EyeOff, label: "Oculta",               desc: "Invisível para quem não é membro" },
          ] as const).map(opt => {
            const Icon = opt.icon;
            const sel = visibility === opt.key;
            return (
              <button key={opt.key} onClick={() => setVisibility(opt.key)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all"
                style={{ borderColor: sel ? PINK : "var(--border-default)", background: sel ? PINK + "08" : "var(--s3)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: sel ? PINK : "var(--s2)" }}>
                  <Icon className="h-4 w-4" style={{ color: sel ? "#fff" : "var(--text-muted)" }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{opt.desc}</p>
                </div>
                {sel && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: PINK }}>
                  <Check className="h-3 w-3 text-white" /></div>}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: GRAD }}>
        {saving ? <><Loader className="h-4 w-4 animate-spin" /> A guardar…</> : <><Save className="h-4 w-4" /> Guardar</>}
      </button>
    </div>
  );
}

/* ─── Permissions section ─── */
interface Permissions {
  who_can_post:    "all" | "moderators" | "admins";
  who_can_comment: "all" | "members"    | "moderators";
  can_send_images: boolean;
  can_send_videos: boolean;
  can_share_links: boolean;
  posts_need_approval: boolean;
}

function SectionPermissoes({ community, onUpdate }: { community: Community; onUpdate: (c: Community) => void }) {
  const [perms, setPerms] = useState<Permissions>({
    who_can_post:    "all",
    who_can_comment: "all",
    can_send_images: true,
    can_send_videos: true,
    can_share_links: true,
    posts_need_approval: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("community_settings")
        .select("*").eq("community_id", community.id).maybeSingle();
      if (data) setPerms({
        who_can_post:    data.who_can_post    ?? "all",
        who_can_comment: data.who_can_comment ?? "all",
        can_send_images: data.can_send_images ?? true,
        can_send_videos: data.can_send_videos ?? true,
        can_share_links: data.can_share_links ?? true,
        posts_need_approval: data.posts_need_approval ?? false,
      });
      setLoading(false);
    })();
  }, [community.id]);

  async function save() {
    setSaving(true);
    const payload = { community_id: community.id, ...perms };
    const { error } = await (supabase as any).from("community_settings")
      .upsert(payload, { onConflict: "community_id" });
    setSaving(false);
    if (error) { toast.error("Erro ao guardar permissões"); return; }
    toast.success("Permissões atualizadas!");
  }

  if (loading) return <div className="flex justify-center py-10"><Loader className="h-5 w-5 animate-spin" style={{ color: ACCENT }} /></div>;

  function Toggle({ label, desc, icon: Icon, value, onChange }: {
    label: string; desc?: string; icon: typeof MessageSquare; value: boolean; onChange: (v: boolean) => void;
  }) {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-xl border"
        style={{ background: "var(--s3)", borderColor: "var(--border-subtle)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: value ? ACCENT + "15" : "var(--s2)" }}>
          <Icon className="h-4 w-4" style={{ color: value ? ACCENT : "var(--text-muted)" }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
          {desc && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>}
        </div>
        <button onClick={() => onChange(!value)}
          className="w-11 h-6 rounded-full relative transition-all shrink-0"
          style={{ background: value ? ACCENT : "var(--s2)", border: `2px solid ${value ? ACCENT : "var(--border-default)"}` }}>
          <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
            style={{ left: value ? "calc(100% - 20px)" : "2px" }} />
        </button>
      </div>
    );
  }

  function Select({ label, value, options, onChange }: {
    label: string; value: string; options: { key: string; label: string }[]; onChange: (v: string) => void;
  }) {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</label>
        <div className="flex gap-2 flex-wrap">
          {options.map(opt => (
            <button key={opt.key} onClick={() => onChange(opt.key)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all"
              style={{ background: value === opt.key ? ACCENT : "var(--s3)", color: value === opt.key ? "#fff" : ACCENT,
                borderColor: value === opt.key ? ACCENT : "var(--border-default)" }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-8">
      <Select label="Quem pode publicar"
        value={perms.who_can_post}
        options={[{ key:"all",label:"Todos" },{ key:"moderators",label:"Moderadores+" },{ key:"admins",label:"Só Admins" }]}
        onChange={v => setPerms(p => ({ ...p, who_can_post: v as any }))} />

      <Select label="Quem pode comentar"
        value={perms.who_can_comment}
        options={[{ key:"all",label:"Todos" },{ key:"members",label:"Membros" },{ key:"moderators",label:"Moderadores+" }]}
        onChange={v => setPerms(p => ({ ...p, who_can_comment: v as any }))} />

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Conteúdo permitido</p>
        <Toggle label="Imagens" icon={ImageIcon} value={perms.can_send_images} onChange={v => setPerms(p => ({ ...p, can_send_images: v }))} />
        <Toggle label={t("tv.videos")} icon={Video} value={perms.can_send_videos} onChange={v => setPerms(p => ({ ...p, can_send_videos: v }))} />
        <Toggle label="Links" icon={LinkIcon} value={perms.can_share_links} onChange={v => setPerms(p => ({ ...p, can_share_links: v }))} />
        <Toggle label="Aprovação de publicações" desc="Publicações precisam de aprovação antes de aparecerem"
          icon={CheckSquare} value={perms.posts_need_approval} onChange={v => setPerms(p => ({ ...p, posts_need_approval: v }))} />
      </div>

      <button onClick={save} disabled={saving}
        className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: GRAD }}>
        {saving ? <><Loader className="h-4 w-4 animate-spin" /> A guardar…</> : <><Save className="h-4 w-4" /> Guardar permissões</>}
      </button>
    </div>
  );
}

/* ─── Photo section ─── */
function SectionFoto({ community, onUpdate }: { community: Community; onUpdate: (c: Community) => void }) {
  const [preview, setPreview] = useState<string | undefined>(community.photo);
  const [uploading, setUploading] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sessão expirada"); setUploading(false); return; }
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `community-photos/${community.id}/photo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("posts-media").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("posts-media").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("communities").update({ photo_url: publicUrl }).eq("id", community.id);
      if (dbErr) throw dbErr;
      setPreview(publicUrl);
      toast.success("Foto atualizada!");
      onUpdate({ ...community, photo: publicUrl });
    } catch (err) {
      toast.error("Erro ao fazer upload da foto");
      console.error("[hooda:SectionFoto]", err);
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!confirm("Remover a foto da comunidade?")) return;
    const { error } = await supabase.from("communities").update({ photo_url: null }).eq("id", community.id);
    if (error) { toast.error("Erro ao remover foto"); return; }
    setPreview(undefined);
    toast.success("Foto removida");
    onUpdate({ ...community, photo: undefined });
  }

  return (
    <div className="p-4 pb-8 space-y-4">
      {/* Preview */}
      <div className="flex flex-col items-center gap-3">
        <button onClick={() => preview && setShowViewer(true)}
          className="relative w-28 h-28 rounded-3xl overflow-hidden flex items-center justify-center shadow-lg"
          style={{ background: community.color }}>
          {preview
            ? <img src={preview} alt="" className="w-full h-full object-cover" />
            : <span style={{ fontSize: 44 }}>{community.emoji}</span>}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
              <Loader className="h-7 w-7 text-white animate-spin" />
            </div>
          )}
        </button>
        {preview && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Toca na foto para ver em tamanho real</p>}
      </div>

      {/* Actions */}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      <button onClick={() => inputRef.current?.click()} disabled={uploading}
        className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: GRAD }}>
        <Camera className="h-4 w-4" />
        {preview ? "Alterar foto" : "Adicionar foto"}
      </button>

      {preview && (
        <button onClick={removePhoto}
          className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all active:scale-[0.98]"
          style={{ color: "#EF4444", borderColor: "#FCA5A5", background: "#FEF2F2" }}>
          <Trash2 className="h-4 w-4" /> Remover foto
        </button>
      )}

      <div className="rounded-xl p-3 border text-sm" style={{ background: "var(--s3)", borderColor: "var(--border-subtle)" }}>
        <p className="font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Dicas</p>
        <ul className="space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <li>• Usa uma imagem quadrada para melhor resultado</li>
          <li>• Tamanho recomendado: 400×400px ou superior</li>
          <li>• Formatos suportados: JPG, PNG, GIF, WebP</li>
        </ul>
      </div>

      {/* Full viewer */}
      {showViewer && preview && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={() => setShowViewer(false)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10">
            <X className="h-5 w-5 text-white" />
          </button>
          <img src={preview} alt="" className="max-w-full max-h-full rounded-2xl shadow-2xl" style={{ maxWidth: "90vw", maxHeight: "80vh" }} />
        </div>
      )}
    </div>
  );
}

/* ─── Rules section ─── */
function SectionRegras({ community }: { community: Community }) {
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("community_rules")
        .select("rule_text").eq("community_id", community.id).order("order_index");
      setRules((data || []).map((r: any) => r.rule_text));
      setLoading(false);
    })();
  }, [community.id]);

  async function save() {
    setSaving(true);
    const { error: delErr } = await (supabase as any).from("community_rules").delete().eq("community_id", community.id);
    if (delErr) { toast.error("Erro ao guardar regras"); setSaving(false); return; }
    if (rules.filter(r => r.trim()).length > 0) {
      const inserts = rules.filter(r => r.trim()).map((rule_text, i) => ({
        community_id: community.id, rule_text, order_index: i,
      }));
      const { error: insErr } = await (supabase as any).from("community_rules").insert(inserts);
      if (insErr) { toast.error("Erro ao guardar regras"); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("Regras guardadas!");
  }

  if (loading) return <div className="flex justify-center py-10"><Loader className="h-5 w-5 animate-spin" style={{ color: ACCENT }} /></div>;

  return (
    <div className="p-4 space-y-3 pb-8">
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Define regras claras para os membros. Estas aparecem na aba t("profile.about") da comunidade.
      </p>

      {rules.map((rule, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-2"
            style={{ background: ACCENT + "20", color: ACCENT }}>{i + 1}</span>
          <textarea value={rule} onChange={e => { const r = [...rules]; r[i] = e.target.value; setRules(r); }}
            rows={2} placeholder={`Regra ${i + 1}…`}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none"
            style={{ background: "var(--s3)", border: "1.5px solid var(--border-default)", color: "var(--text-primary)" }} />
          <button onClick={() => setRules(r => r.filter((_, j) => j !== i))}
            className="mt-2 p-1.5 rounded-lg hover:bg-red-50 transition">
            <X className="h-4 w-4 text-red-400" />
          </button>
        </div>
      ))}

      <button onClick={() => setRules(r => [...r, ""])}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all"
        style={{ borderColor: ACCENT + "50", color: ACCENT }}>
        <Plus className="h-4 w-4" /> Adicionar regra
      </button>

      <button onClick={save} disabled={saving}
        className="w-full h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: GRAD }}>
        {saving ? <><Loader className="h-4 w-4 animate-spin" /> A guardar…</> : <><Save className="h-4 w-4" /> Guardar regras</>}
      </button>
    </div>
  );
}

/* ── Field wrapper ── */
function Field({ label, children, maxLength }: { label: string; children: React.ReactNode; maxLength?: number }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}
