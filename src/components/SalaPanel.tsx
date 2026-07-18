import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { uploadFeedVideo } from "@/lib/cloudinaryFeedVideo";
import { optimizeAvatar, optimizePostPhoto } from "@/lib/imageOptimize";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { extractUrl } from "@/lib/linkPreview";
import { LinkPreview } from "@/components/LinkPreview";
import { StickerView } from "@/components/StickerView";
import { ChatPicker } from "@/components/ChatPicker";
import {
  ArrowLeft,
  Users,
  Send,
  Image as ImageIcon,
  Video,
  X,
  Loader2,
  Lock,
  Globe,
  Megaphone,
  Heart,
  Shield,
  DoorOpen,
  MoreVertical,
  Crown,
  MessageSquareOff,
  MessageSquare,
  UserCog,
  UserMinus,
  Ban,
  Ghost,
  Smile,
  ChevronDown,
  Reply,
  Trash2,
  Settings,
  Flag,
  Copy,
  Check,
  AlignLeft,
  LogOut,
} from "lucide-react";

const P = "#2F6FED";
const REACTION_EMOJIS = ["❤️", "🔥", "😂", "👍", "😮", "😢"];

type Sala = {
  id: string;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  tipo: "publica" | "privada" | "anuncios";
  slug: string;
  criador_id: string;
  conversation_id: string;
  membros_count: number;
  created_at: string;
  quem_pode_escrever: "todos" | "selecionados";
};

type Membro = {
  user_id: string;
  papel: "admin" | "membro";
  pode_enviar: boolean;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  is_online?: boolean;
  last_seen?: string | null;
};

/** Limiar para considerar um utilizador "online agora" — mesma regra do
 * ChatPanel (mensagens.tsx): heartbeat a cada 30s, tolerância de 90s. Não
 * confiamos só na flag is_online porque não há forma fiável de a apagar
 * quando a pessoa fecha a aba/app. */
const ONLINE_THRESHOLD_MS = 90_000;
function isOnlineNow(isOnline: boolean | null | undefined, lastSeen: string | null | undefined) {
  if (!isOnline || !lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  media_url: string | null;
  created_at: string;
  reply_to?: string | null;
  sender?: { username?: string; full_name?: string; avatar_url?: string };
  likeCount?: number;
  likedByMe?: boolean;
  reactions?: Record<string, number>;
  myReaction?: string;
  deletedForMe?: boolean;
  deletedForAll?: boolean;
};

const TIPO_INFO = {
  publica: { label: "Pública", Icon: Globe, color: "#2F6FED" },
  privada: { label: "Privada", Icon: Lock, color: "#6BA547" },
  anuncios: { label: "Anúncios", Icon: Megaphone, color: "#FFC93C" },
} as const;

/* ── Barra de reações — mesma lógica/visual do ChatPanel ── */
function ReactionBar({
  reactions,
  myReaction,
  onReact,
}: {
  reactions?: Record<string, number>;
  myReaction?: string | null;
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = Object.values(reactions ?? {}).reduce((s, v) => s + v, 0);
  if (total === 0 && !open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] px-1.5 py-0.5 rounded-full"
        style={{ background: "var(--s3)", color: "var(--text-muted)" }}
      >
        +
      </button>
    );
  return (
    <div className="relative flex items-center gap-1 flex-wrap mt-0.5">
      {Object.entries(reactions ?? {})
        .filter(([, v]) => v > 0)
        .map(([emoji, count]) => (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[12px] transition active:scale-90"
            style={{
              background: myReaction === emoji ? `${P}20` : "var(--s3)",
              border: myReaction === emoji ? `1px solid ${P}50` : "1px solid var(--border-subtle)",
            }}
          >
            {emoji} <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{count}</span>
          </button>
        ))}
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[12px] opacity-0 group-hover:opacity-100 transition"
        style={{ background: "var(--s3)", color: "var(--text-muted)" }}
      >
        +
      </button>
      {open && (
        <div
          className="absolute bottom-7 left-0 flex items-center gap-1 px-2 py-1.5 rounded-2xl shadow-xl z-30"
          style={{ background: "var(--s0)", border: "1px solid var(--border-default)" }}
          onMouseLeave={() => setOpen(false)}
        >
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onReact(e);
                setOpen(false);
              }}
              className="text-xl hover:scale-125 active:scale-90 transition-transform w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--s2)]"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtN(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n ?? 0);
}

function Av({ src, name, size = 36 }: { src?: string | null; name?: string; size?: number }) {
  return (
    <div
      className="rounded-full overflow-hidden flex items-center justify-center shrink-0 font-bold text-white"
      style={{
        width: size,
        height: size,
        background: src ? "transparent" : P,
        fontSize: size / 2.6,
      }}
    >
      {src ? (
        <img src={optimizeAvatar(src, size * 2)} alt="" className="w-full h-full object-cover" />
      ) : (
        (name?.[0] ?? "?").toUpperCase()
      )}
    </div>
  );
}

/* ── Etiqueta de cargo ── */
function PapelBadge({ isOwner, papel }: { isOwner: boolean; papel: "admin" | "membro" }) {
  if (isOwner) {
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={{ color: "#FFC93C", background: "#FFC93C18" }}
      >
        <Crown className="w-3 h-3" /> Dono
      </span>
    );
  }
  if (papel === "admin") {
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={{ color: P, background: `${P}18` }}
      >
        <Shield className="w-3 h-3" /> Admin
      </span>
    );
  }
  return null;
}

/* ── Membros drawer (com ações de administração) ── */
function MembrosPanel({
  membros,
  criadorId,
  meuId,
  souAdmin,
  onClose,
  onPromover,
  onDespromover,
  onTogglePodeEnviar,
  onBanir,
}: {
  membros: Membro[];
  criadorId: string;
  meuId: string;
  souAdmin: boolean;
  onClose: () => void;
  onPromover: (userId: string) => void;
  onDespromover: (userId: string) => void;
  onTogglePodeEnviar: (userId: string, atual: boolean) => void;
  onBanir: (userId: string, nome: string) => void;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm h-full overflow-y-auto p-4"
        style={{ background: "var(--s0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
            Membros · {membros.length}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ background: "var(--s2)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="space-y-1">
          {membros.map((m) => {
            const isOwner = m.user_id === criadorId;
            const isMe = m.user_id === meuId;
            const podeGerir = souAdmin && !isOwner && !isMe;
            return (
              <div key={m.user_id} className="rounded-xl">
                <div className="flex items-center gap-3 p-2">
                  <Av src={m.avatar_url} name={m.full_name || m.username} />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-bold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {m.full_name || m.username || "Utilizador"}
                    </p>
                    {m.username && (
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        @{m.username}
                      </p>
                    )}
                  </div>
                  {!m.pode_enviar && (
                    <span title="Sem permissão para enviar mensagens">
                      <MessageSquareOff
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </span>
                  )}
                  <PapelBadge isOwner={isOwner} papel={m.papel} />
                  {podeGerir && (
                    <button
                      onClick={() => setOpenFor(openFor === m.user_id ? null : m.user_id)}
                      className="p-1 rounded-full shrink-0"
                      style={{ background: "var(--s2)" }}
                    >
                      <MoreVertical
                        className="w-3.5 h-3.5"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>
                  )}
                </div>
                {podeGerir && openFor === m.user_id && (
                  <div
                    className="ml-11 mb-2 mr-2 rounded-xl overflow-hidden"
                    style={{ background: "var(--s2)" }}
                  >
                    {m.papel === "admin" ? (
                      <button
                        onClick={() => {
                          onDespromover(m.user_id);
                          setOpenFor(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-left"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Remover como administrador
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onPromover(m.user_id);
                          setOpenFor(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-left"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <UserCog className="w-3.5 h-3.5" /> Tornar administrador
                      </button>
                    )}
                    <button
                      onClick={() => {
                        onTogglePodeEnviar(m.user_id, m.pode_enviar);
                        setOpenFor(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-left border-t"
                      style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}
                    >
                      {m.pode_enviar ? (
                        <>
                          <MessageSquareOff className="w-3.5 h-3.5" /> Impedir de enviar mensagens
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-3.5 h-3.5" /> Permitir enviar mensagens
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onBanir(m.user_id, m.full_name || m.username || "este membro");
                        setOpenFor(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-left border-t"
                      style={{ color: "#e0245e", borderColor: "var(--border-subtle)" }}
                    >
                      <Ban className="w-3.5 h-3.5" /> Banir da sala
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Definições da sala (admin) ── */
function DefinicoesPanel({
  quemPodeEscrever,
  onDefinirModo,
  onVerMembros,
  onClose,
}: {
  quemPodeEscrever: "todos" | "selecionados";
  onDefinirModo: (modo: "todos" | "selecionados") => void;
  onVerMembros: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm h-full overflow-y-auto p-4"
        style={{ background: "var(--s0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
            Definições da sala
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ background: "var(--s2)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--text-muted)" }}>
          Quem pode escrever
        </p>
        <div className="rounded-xl overflow-hidden mb-1" style={{ background: "var(--s1)" }}>
          <button
            onClick={() => onDefinirModo("todos")}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left"
          >
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Todos os membros
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Qualquer membro pode enviar mensagens
              </p>
            </div>
            <span
              className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
              style={{
                border: `2px solid ${quemPodeEscrever === "todos" ? P : "var(--border-subtle)"}`,
              }}
            >
              {quemPodeEscrever === "todos" && (
                <span className="w-2 h-2 rounded-full" style={{ background: P }} />
              )}
            </span>
          </button>
          <div style={{ borderTop: "1px solid var(--border-subtle)" }} />
          <button
            onClick={() => onDefinirModo("selecionados")}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left"
          >
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Apenas quem eu escolher
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Só os membros que autorizares podem escrever
              </p>
            </div>
            <span
              className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
              style={{
                border: `2px solid ${quemPodeEscrever === "selecionados" ? P : "var(--border-subtle)"}`,
              }}
            >
              {quemPodeEscrever === "selecionados" && (
                <span className="w-2 h-2 rounded-full" style={{ background: P }} />
              )}
            </span>
          </button>
        </div>
        {quemPodeEscrever === "selecionados" && (
          <p className="text-xs px-1 mb-4" style={{ color: "var(--text-muted)" }}>
            Vai a "Ver membros" e usa o menu ⋮ em cada membro para permitir ou bloquear o envio de
            mensagens.
          </p>
        )}

        <button
          onClick={onVerMembros}
          className="w-full flex items-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-left mt-2"
          style={{ background: "var(--s1)", color: "var(--text-primary)" }}
        >
          <Users className="w-4 h-4" /> Gerir membros
        </button>
      </div>
    </div>
  );
}

/* ── Info da sala (aberto pela engrenagem no cabeçalho) ──
   Estilo "info de canal" — avatar grande, tipo, ações rápidas,
   link/subdomínio da sala e a descrição. */
function SalaInfoModal({
  sala,
  isMember,
  isAdmin,
  joining,
  onJoin,
  onSair,
  saindo,
  onVerMembros,
  onVerBanidos,
  onDefinicoes,
  onDenunciar,
  onClose,
}: {
  sala: Sala;
  isMember: boolean;
  isAdmin: boolean;
  joining: boolean;
  onJoin: () => void;
  onSair: () => void;
  saindo: boolean;
  onVerMembros: () => void;
  onVerBanidos: () => void;
  onDefinicoes: () => void;
  onDenunciar: () => void;
  onClose: () => void;
}) {
  const [showMais, setShowMais] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const info = TIPO_INFO[sala.tipo];
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/salas/${sala.slug}`
      : `/salas/${sala.slug}`;

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm h-full overflow-y-auto"
        style={{ background: "var(--s0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo */}
        <div className="flex items-center px-3 py-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ background: "var(--s2)" }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "var(--text-primary)" }} />
          </button>
        </div>

        {/* Avatar + nome + tipo */}
        <div className="flex flex-col items-center px-4 pb-5">
          <div
            className="h-24 w-24 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-3xl shrink-0"
            style={{ background: sala.foto_url ? "transparent" : P }}
          >
            {sala.foto_url ? (
              <img
                src={optimizeAvatar(sala.foto_url, 200)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              sala.nome[0]?.toUpperCase()
            )}
          </div>
          <p
            className="text-lg font-extrabold mt-3 text-center"
            style={{ color: "var(--text-primary)" }}
          >
            {sala.nome}
          </p>
          <p
            className="text-sm mt-0.5 flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
          >
            <info.Icon className="w-3.5 h-3.5" style={{ color: info.color }} />
            {sala.tipo === "anuncios" ? "canal de anúncios" : `sala ${info.label.toLowerCase()}`}
          </p>
        </div>

        {/* Ações rápidas */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-5">
          {isMember ? (
            <button
              onClick={onSair}
              disabled={saindo}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl disabled:opacity-60"
              style={{ background: "var(--s2)" }}
            >
              {saindo ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#e0245e" }} />
              ) : (
                <LogOut className="w-4 h-4" style={{ color: "#e0245e" }} />
              )}
              <span className="text-[11px] font-bold" style={{ color: "#e0245e" }}>
                Sair
              </span>
            </button>
          ) : (
            <button
              onClick={onJoin}
              disabled={joining}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl disabled:opacity-60"
              style={{ background: "var(--s2)" }}
            >
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: P }} />
              ) : (
                <DoorOpen className="w-4 h-4" style={{ color: P }} />
              )}
              <span className="text-[11px] font-bold" style={{ color: P }}>
                Entrar
              </span>
            </button>
          )}
          <button
            onClick={onDenunciar}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl"
            style={{ background: "var(--s2)" }}
          >
            <Flag className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
              Denunciar
            </span>
          </button>
          <button
            onClick={() => setShowMais((v) => !v)}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl"
            style={{ background: "var(--s2)" }}
          >
            <MoreVertical className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
            <span className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
              Mais
            </span>
          </button>
        </div>

        {showMais && (
          <div
            className="mx-4 mb-5 rounded-2xl overflow-hidden"
            style={{ background: "var(--s1)" }}
          >
            <button
              onClick={() => {
                setShowMais(false);
                onVerMembros();
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-left"
              style={{ color: "var(--text-primary)" }}
            >
              <Users className="w-4 h-4" /> Ver membros
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    setShowMais(false);
                    onDefinicoes();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-left border-t"
                  style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}
                >
                  <UserCog className="w-4 h-4" /> Definições da sala
                </button>
                <button
                  onClick={() => {
                    setShowMais(false);
                    onVerBanidos();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-left border-t"
                  style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}
                >
                  <Ghost className="w-4 h-4" /> Membros banidos
                </button>
              </>
            )}
          </div>
        )}

        {/* Link / subdomínio da sala */}
        <div className="px-4 pb-2">
          <p
            className="text-[11px] font-bold uppercase mb-1.5 px-1"
            style={{ color: "var(--text-muted)" }}
          >
            Link da sala
          </p>
          <div
            className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl"
            style={{ background: "var(--s1)" }}
          >
            <a
              href={link}
              className="text-sm truncate underline underline-offset-2"
              style={{ color: P }}
            >
              {link}
            </a>
            <button
              onClick={copiarLink}
              className="p-1.5 rounded-full shrink-0"
              style={{ background: "var(--s2)" }}
              title="Copiar link"
            >
              {copiado ? (
                <Check className="w-4 h-4" style={{ color: "#31D158" }} />
              ) : (
                <Copy className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              )}
            </button>
          </div>
        </div>

        {/* Descrição */}
        <div className="px-4 py-4">
          <p
            className="text-[11px] font-bold uppercase mb-1.5 px-1"
            style={{ color: "var(--text-muted)" }}
          >
            Descrição
          </p>
          <div
            className="px-4 py-3 rounded-2xl flex items-start gap-2"
            style={{ background: "var(--s1)" }}
          >
            <AlignLeft className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {sala.descricao || "Esta sala ainda não tem descrição."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Denunciar sala — mesma estrutura/UX do modal de denunciar perfil ── */
function DenunciarSalaModal({
  salaId,
  salaNome,
  reporterId,
  onClose,
}: {
  salaId: string;
  salaNome: string;
  reporterId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const reasons = [
    "Spam ou conteúdo enganoso",
    "Assédio ou bullying",
    "Conteúdo inapropriado",
    "Sala falsa ou impostura",
    "Venda de produtos ilegais",
    "Outro motivo",
  ];

  async function send() {
    if (!reason || sending) return;
    setSending(true);
    try {
      await (supabase as any).from("reports").insert({
        reporter_id: reporterId,
        reported_sala_id: salaId,
        reason,
        kind: "sala",
      });
    } catch (_) {
      // silencioso — a denúncia é best-effort, não bloqueia o utilizador
    }
    setDone(true);
    setTimeout(() => onClose(), 1600);
    setSending(false);
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full sm:max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "var(--s0)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4" style={{ color: "#e0245e" }} />
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              Denunciar {salaNome}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--s2)]"
          >
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="p-5 space-y-2.5">
          {done ? (
            <div className="py-8 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                Denúncia enviada
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Obrigado pelo teu feedback.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                Porque queres denunciar esta sala?
              </p>
              {reasons.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className="w-full text-left px-4 py-2.5 rounded-2xl text-sm border transition"
                  style={{
                    borderColor: reason === r ? "#e0245e" : "var(--border-subtle)",
                    background: reason === r ? "#e0245e10" : "var(--s1)",
                    color: "var(--text-primary)",
                    fontWeight: reason === r ? 600 : 400,
                  }}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={send}
                disabled={!reason || sending}
                className="w-full h-11 rounded-2xl font-bold text-sm text-white mt-2 transition disabled:opacity-40"
                style={{ background: "#e0245e" }}
              >
                {sending ? "A enviar..." : "Enviar denúncia"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Painel de banidos (desbanir) ── */
function BanidosPanel({
  banidos,
  onDesbanir,
  onClose,
}: {
  banidos: { user_id: string; username?: string; full_name?: string; avatar_url?: string }[];
  onDesbanir: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm h-full overflow-y-auto p-4"
        style={{ background: "var(--s0)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>
            Banidos · {banidos.length}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ background: "var(--s2)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        {banidos.length === 0 ? (
          <p className="text-sm font-bold text-center py-8" style={{ color: "var(--text-muted)" }}>
            Ninguém banido nesta sala.
          </p>
        ) : (
          <div className="space-y-2">
            {banidos.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-xl">
                <Av src={m.avatar_url} name={m.full_name || m.username} />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-bold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {m.full_name || m.username || "Utilizador"}
                  </p>
                  {m.username && (
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      @{m.username}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onDesbanir(m.user_id)}
                  className="shrink-0 px-3 h-8 rounded-full text-xs font-bold"
                  style={{ background: "var(--s2)", color: "var(--text-primary)" }}
                >
                  Desbanir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Bolha de mensagem — MESMO visual das mensagens 1-para-1 (ChatPanel):
// bolha azul #2F6FED com canto reto do lado próprio à direita/baixo para
// mensagens minhas, cinza (var(--s1)) com canto reto à esquerda para as
// dos outros, sombra suave, padding px-3 py-2, hora no canto.
function MsgBubble({
  m,
  isMe,
  isAnuncio,
  replied,
  onLike,
  onReply,
  onReact,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  m: Msg;
  isMe: boolean;
  isAnuncio: boolean;
  replied: Msg | null;
  onLike: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  const isMobile = useIsMobile();
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState<"me" | "all" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionFired = useRef(false);
  const [isPressing, setIsPressing] = useState(false);

  useEffect(() => {
    if (!showMenu) return;
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("click", fn);
    return () => document.removeEventListener("click", fn);
  }, [showMenu]);
  useEffect(
    () => () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    },
    [],
  );

  const LONG_PRESS_MS = 420;
  function handleTouchStart() {
    if (!isMobile) return;
    actionFired.current = false;
    setIsPressing(true);
    longPressTimer.current = setTimeout(() => {
      actionFired.current = true;
      setShowMenu(true);
      setIsPressing(false);
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  }
  function handleTouchMove() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsPressing(false);
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsPressing(false);
    if (actionFired.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function closeMenu() {
    setShowMenu(false);
  }

  // Ações partilhadas entre o dropdown do desktop (hover) e o bottom sheet
  // do mobile (long-press) — mesmo padrão do ChatPanel.
  const menuActions = (
    <>
      <div
        className="flex items-center justify-center gap-2.5 px-3 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onReact(emoji);
              closeMenu();
            }}
            className="text-2xl transition active:scale-90 hover:scale-125 px-0.5"
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          onReply();
          closeMenu();
        }}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-sm transition active:opacity-70"
        onMouseOver={(e) => (e.currentTarget.style.background = "var(--s2)")}
        onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Reply className="h-4 w-4" style={{ color: P }} />
        <span style={{ color: "var(--text-primary)" }}>Responder</span>
      </button>
      <button
        onClick={() => {
          setConfirmDel("me");
          closeMenu();
        }}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-sm transition border-t active:opacity-70"
        style={{ borderColor: "var(--border-subtle)" }}
        onMouseOver={(e) => (e.currentTarget.style.background = "var(--s2)")}
        onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Trash2 className="h-4 w-4" style={{ color: "#F97316" }} />
        <span style={{ color: "var(--text-primary)" }}>Eliminar para mim</span>
      </button>
      {isMe && (
        <button
          onClick={() => {
            setConfirmDel("all");
            closeMenu();
          }}
          className="w-full flex items-center gap-2.5 px-4 py-3.5 text-sm transition border-t active:opacity-70"
          style={{ borderColor: "var(--border-subtle)" }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#fee2e2")}
          onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Trash2 className="h-4 w-4" style={{ color: "#EF4444" }} />
          <span style={{ color: "#EF4444" }}>Eliminar para todos</span>
        </button>
      )}
    </>
  );

  // Placeholder: mensagem eliminada para todos.
  if (m.deletedForAll) {
    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} px-1 mb-3`}>
        <div
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs italic"
          style={{ background: isMe ? `${P}22` : "var(--s2)", color: "var(--text-muted)" }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Esta mensagem foi eliminada</span>
        </div>
      </div>
    );
  }

  const isSticker = m.message_type === "sticker";
  const bubbleBg = isSticker ? "transparent" : isMe ? P : "var(--s1)";
  const bubbleText = isMe ? "white" : "var(--text-primary)";
  const br = isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px";
  const bubbleShadow = isSticker
    ? undefined
    : isMe
      ? "0 1px 3px rgba(0,0,0,0.08)"
      : "0 1px 3px rgba(0,0,0,0.05)";

  return (
    <div
      className={`flex ${isMe ? "justify-end" : "justify-start"} group items-end gap-1.5 px-1 mb-3`}
    >
      {!isMe && (
        <Av src={m.sender?.avatar_url} name={m.sender?.full_name || m.sender?.username} size={26} />
      )}
      <div
        className={`max-w-[82%] sm:max-w-[75%] min-w-0 relative flex flex-col ${isMe ? "items-end" : "items-start"}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {!isMe && (
          <span
            className="text-[11px] font-bold mb-0.5 px-1"
            style={{ color: "var(--text-muted)" }}
          >
            {m.sender?.full_name || m.sender?.username || "Utilizador"}
          </span>
        )}

        {/* Ações — desktop: flutuam ao passar o rato. Mobile: pressionar e segurar. */}
        {!isMobile && (
          <div
            className={`absolute ${isMe ? "right-full mr-1" : "left-full ml-1"} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5 z-10`}
          >
            <button
              onClick={onReply}
              className="shrink-0 rounded-full flex items-center justify-center shadow-sm w-7 h-7"
              style={{ background: "rgba(0,0,0,0.12)", color: "var(--text-secondary)" }}
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="shrink-0 rounded-full flex items-center justify-center shadow-sm w-7 h-7"
                style={{ background: "rgba(0,0,0,0.12)", color: "var(--text-secondary)" }}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
              {showMenu && (
                <div
                  className={`absolute ${isMe ? "right-0" : "left-0"} bottom-full mb-1 rounded-2xl shadow-2xl z-30 overflow-hidden min-w-[190px] max-w-[85vw] border`}
                  style={{ background: "var(--s0)", borderColor: "var(--border-default)" }}
                >
                  {menuActions}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile: bottom sheet fixo, aberto por long-press na bolha. */}
        {showMenu &&
          isMobile &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-end"
              style={{ background: "rgba(0,0,0,0.5)" }}
              onClick={closeMenu}
            >
              <div
                className="w-full rounded-t-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
                style={{ background: "var(--s0)", maxHeight: "80vh", overflowY: "auto" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-center pt-2.5 pb-1">
                  <div
                    className="w-10 h-1 rounded-full"
                    style={{ background: "var(--border-default)" }}
                  />
                </div>
                {menuActions}
                <div style={{ height: "env(safe-area-inset-bottom, 12px)" }} />
              </div>
            </div>,
            document.body,
          )}

        <div
          className="rounded-2xl overflow-hidden shadow-sm"
          style={{
            background: bubbleBg,
            color: bubbleText,
            borderRadius: br,
            boxShadow: bubbleShadow,
            transform: isPressing ? "scale(0.97)" : undefined,
            transition: "transform 0.15s",
          }}
        >
          {/* Faixa de resposta */}
          {replied && (
            <div className="px-3 pt-2 pb-0">
              <div
                className="px-2 py-1 rounded-lg text-xs"
                style={{
                  background: isMe ? "rgba(255,255,255,0.2)" : "var(--s3)",
                  borderLeft: `3px solid ${isMe ? "white" : P}`,
                }}
              >
                <p
                  className="font-bold mb-0.5"
                  style={{ color: isMe ? "rgba(255,255,255,0.9)" : P }}
                >
                  {replied.sender?.full_name || replied.sender?.username || "Utilizador"}
                </p>
                <p
                  className="truncate"
                  style={{ color: isMe ? "rgba(255,255,255,0.75)" : "var(--text-secondary)" }}
                >
                  {replied.message_type === "image"
                    ? "📷 Imagem"
                    : replied.message_type === "video"
                      ? "🎥 Vídeo"
                      : replied.message_type === "sticker"
                        ? "Sticker"
                        : replied.content}
                </p>
              </div>
            </div>
          )}
          {m.message_type === "image" && m.media_url && (
            <img
              src={optimizePostPhoto(m.media_url, 500)}
              alt=""
              className="max-w-full max-h-80 object-cover"
            />
          )}
          {m.message_type === "video" && m.media_url && (
            <video src={m.media_url} controls className="max-w-full max-h-80" />
          )}
          {m.message_type === "sticker" && m.media_url && (
            <StickerView url={m.media_url} size={120} className="rounded-xl" />
          )}
          {(m.content || m.message_type === "text") && (
            <div className="px-3 py-2">
              {m.content && (
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {m.content}
                </p>
              )}
              {m.content && extractUrl(m.content) && (
                <LinkPreview
                  url={extractUrl(m.content)!}
                  isMe={isMe}
                  variant="message"
                  compact={m.message_type === "image" || m.message_type === "video"}
                />
              )}
              <div className="flex items-center justify-end mt-1">
                <p className="text-[10px]" style={{ opacity: 0.65 }}>
                  {fmtTime(m.created_at)}
                </p>
              </div>
            </div>
          )}
        </div>

        {isAnuncio ? (
          <button
            onClick={onLike}
            className="flex items-center gap-1 mt-1 px-1 text-xs font-bold"
            style={{ color: m.likedByMe ? "#e0245e" : "var(--text-muted)" }}
          >
            <Heart className="w-3.5 h-3.5" fill={m.likedByMe ? "#e0245e" : "none"} />
            {fmtN(m.likeCount ?? 0)}
          </button>
        ) : (
          <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
            <ReactionBar reactions={m.reactions} myReaction={m.myReaction} onReact={onReact} />
          </div>
        )}
      </div>

      {/* Confirmar eliminação */}
      {confirmDel &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setConfirmDel(null)}
          >
            <div
              className="rounded-2xl p-5 mx-6 max-w-xs w-full shadow-2xl"
              style={{ background: "var(--s0)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-bold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                {confirmDel === "all" ? "Eliminar para todos?" : "Eliminar para mim?"}
              </p>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                {confirmDel === "all"
                  ? "A mensagem será removida para todos os membros da sala."
                  : "A mensagem desaparece só para ti."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDel(null)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--s2)", color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (confirmDel === "all") onDeleteForEveryone();
                    else onDeleteForMe();
                    setConfirmDel(null);
                  }}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                  style={{ background: confirmDel === "all" ? "#EF4444" : "#F97316" }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ── SalaPanel ──
   Painel de conversa de uma Sala, no mesmo padrão do ChatPanel (flex flex-col h-full,
   header shrink-0, mensagens flex-1 overflow-y-auto, composer shrink-0 no fundo).
   Usado tanto na rota /salas/$slug (link direto) como dentro de /mensagens
   (troca de sala por estado, sem navegar de página). */
export function SalaPanel({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";

  const [sala, setSala] = useState<Sala | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [membros, setMembros] = useState<Membro[]>([]);
  // Presença agregada da sala: true se QUALQUER membro (além de mim) estiver
  // online no site agora — não precisa de ter a sala aberta, só estar
  // online em qualquer parte do Baya (mesma lógica do "online agora" do
  // ChatPanel, aplicada a todo o grupo em vez de um único contacto).
  const [salaOnline, setSalaOnline] = useState(false);
  const [showMembros, setShowMembros] = useState(false);
  const [showBanidos, setShowBanidos] = useState(false);
  const [showDefinicoes, setShowDefinicoes] = useState(false);
  const [showSalaInfo, setShowSalaInfo] = useState(false);
  const [showDenunciarSala, setShowDenunciarSala] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [banidos, setBanidos] = useState<
    { user_id: string; username?: string; full_name?: string; avatar_url?: string }[]
  >([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  // "Eliminar para mim" — guardado por sala neste dispositivo, para a
  // mensagem não voltar a aparecer depois de sair e voltar (mesma lógica
  // do ChatPanel).
  const [localOverrides, setLocalOverrides] = useState<Record<string, { deletedForMe?: boolean }>>(
    () => {
      try {
        if (typeof window === "undefined") return {};
        const raw = localStorage.getItem(`baya_sala_hidden_${slug}`);
        if (!raw) return {};
        const ids: string[] = JSON.parse(raw);
        const initial: Record<string, { deletedForMe?: boolean }> = {};
        ids.forEach((id) => {
          initial[id] = { deletedForMe: true };
        });
        return initial;
      } catch {
        return {};
      }
    },
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{
    file: File;
    type: "image" | "video";
    preview: string;
  } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif" | "sticker">("emoji");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [gifSearch, setGifSearch] = useState("");
  const [gifs, setGifs] = useState<{ id: string; url: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const atBottom = useRef(true);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Instância única por montagem: evita colisão de nome de canal quando o
  // mesmo SalaPanel é montado em paralelo (layout desktop + mobile ficam
  // ambos no DOM, só um está escondido via CSS).
  const instanceIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const load = async () => {
    setLoading(true);
    const { data: salaData } = await supabase
      .from("salas" as any)
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    const s = salaData as unknown as Sala | null;
    setSala(s);
    if (!s) {
      setLoading(false);
      return;
    }

    if (uid) {
      const { data: memb } = await supabase
        .from("sala_membros" as any)
        .select("papel")
        .eq("sala_id", s.id)
        .eq("user_id", uid)
        .maybeSingle();
      setIsMember(!!memb);
      setIsAdmin((memb as any)?.papel === "admin" || s.criador_id === uid);
    }

    const { data: membrosRows } = await supabase
      .from("sala_membros" as any)
      .select("user_id,papel,pode_enviar")
      .eq("sala_id", s.id);
    const userIds = ((membrosRows as any[]) ?? []).map((r) => r.user_id);
    const profileMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url,is_online,last_seen")
        .in("id", userIds);
      ((profs as any[]) ?? []).forEach((p) => {
        profileMap[p.id] = p;
      });
    }
    setMembros(
      ((membrosRows as any[]) ?? []).map((r) => ({
        user_id: r.user_id,
        papel: r.papel,
        pode_enviar: r.pode_enviar !== false,
        username: profileMap[r.user_id]?.username,
        full_name: profileMap[r.user_id]?.full_name,
        avatar_url: profileMap[r.user_id]?.avatar_url,
        is_online: profileMap[r.user_id]?.is_online,
        last_seen: profileMap[r.user_id]?.last_seen,
      })),
    );

    const { data: msgRowsDesc } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,content,message_type,media_url,created_at,reply_to")
      .eq("conversation_id", s.conversation_id)
      .eq("deleted_for_all", false)
      .order("created_at", { ascending: false })
      .limit(200);
    // A query vem por ordem decrescente (mais recentes primeiro) para
    // garantir que os últimos 200 são os que aparecem — depois inverte-se
    // para ordem cronológica normal (mais antiga em cima, mais recente em
    // baixo) para mostrar no ecrã.
    const msgRows = ((msgRowsDesc as any[]) ?? []).slice().reverse();
    const senderIds = Array.from(new Set(((msgRows as any[]) ?? []).map((m) => m.sender_id)));
    const senderMap: Record<string, any> = profileMap;
    const missing = senderIds.filter((id) => !senderMap[id]);
    if (missing.length) {
      const { data: profs2 } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url")
        .in("id", missing);
      ((profs2 as any[]) ?? []).forEach((p) => {
        senderMap[p.id] = p;
      });
    }
    const msgIds = ((msgRows as any[]) ?? []).map((m) => m.id);
    const likeMap: Record<string, { count: number; me: boolean }> = {};
    // Reações — para todas as mensagens (não só anúncios), igual ao
    // ChatPanel. Nas salas de anúncios continuamos a tratar qualquer
    // reação como "❤️ curtir" (comportamento já existente); nas outras
    // salas mostramos a barra completa de reações por emoji.
    const reactionsMap: Record<string, Record<string, number>> = {};
    const myReactionMap: Record<string, string> = {};
    if (msgIds.length) {
      const { data: rx } = await supabase
        .from("message_reactions" as any)
        .select("message_id,user_id,emoji")
        .in("message_id", msgIds);
      ((rx as any[]) ?? []).forEach((r) => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = {};
        reactionsMap[r.message_id][r.emoji] = (reactionsMap[r.message_id][r.emoji] ?? 0) + 1;
        if (r.user_id === uid) myReactionMap[r.message_id] = r.emoji;
        if (s.tipo === "anuncios") {
          if (!likeMap[r.message_id]) likeMap[r.message_id] = { count: 0, me: false };
          likeMap[r.message_id].count += 1;
          if (r.user_id === uid) likeMap[r.message_id].me = true;
        }
      });
    }
    setMsgs(
      ((msgRows as any[]) ?? []).map((m) => ({
        ...m,
        sender: senderMap[m.sender_id],
        likeCount: likeMap[m.id]?.count ?? 0,
        likedByMe: likeMap[m.id]?.me ?? false,
        reactions: reactionsMap[m.id] ?? {},
        myReaction: myReactionMap[m.id],
        deletedForMe: localOverrides[m.id]?.deletedForMe ?? false,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [slug, uid]);

  useEffect(() => {
    if (!sala) return;
    const channel = supabase
      .channel(`sala-${sala.id}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${sala.conversation_id}`,
        },
        async (payload) => {
          const row: any = payload.new;
          let sender: Membro | undefined = membros.find((m) => m.user_id === row.sender_id);
          if (!sender) {
            const { data: p } = await supabase
              .from("profiles")
              .select("id,username,full_name,avatar_url")
              .eq("id", row.sender_id)
              .maybeSingle();
            sender = p
              ? {
                  user_id: p.id,
                  papel: "membro" as const,
                  pode_enviar: true,
                  username: p.username ?? undefined,
                  full_name: p.full_name ?? undefined,
                  avatar_url: p.avatar_url ?? undefined,
                }
              : undefined;
          }
          setMsgs((prev) => [
            ...prev,
            { ...row, sender, likeCount: 0, likedByMe: false, reactions: {}, deletedForMe: false },
          ]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${sala.conversation_id}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (row.deleted_for_all) {
            setMsgs((prev) =>
              prev.map((x) => (x.id === row.id ? { ...x, deletedForAll: true } : x)),
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala?.id]);

  // Scroll auto ao fundo — mesma lógica do ChatPanel: só desce sozinho se a
  // pessoa já estava perto do fundo, e faz isso "instant" (não "smooth")
  // para não dar a sensação de as mensagens aparecerem lá em cima primeiro.
  useEffect(() => {
    if (atBottom.current) bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [msgs.length]);

  function handleMsgsScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottom.current = isAtBottom;
    setShowScrollBtn(!isAtBottom);
  }

  // ── Presença agregada da sala ──
  // A sala fica "online" se QUALQUER membro (que não eu) estiver online no
  // site agora, em qualquer parte do Baya — não é preciso ter esta sala
  // aberta. Consulta ao entrar e depois a cada 20s, igual ao polling do
  // contacto no ChatPanel (get_contact_presence).
  const otherMemberIds = membros.map((m) => m.user_id).filter((id) => id !== uid);
  const otherMemberIdsKey = otherMemberIds.join(",");
  useEffect(() => {
    if (!otherMemberIdsKey) {
      setSalaOnline(false);
      return;
    }
    let mounted = true;
    async function loadSalaPresence() {
      const { data } = await supabase
        .from("profiles")
        .select("id,is_online,last_seen")
        .in("id", otherMemberIdsKey.split(","));
      if (!mounted) return;
      const anyOnline = ((data as any[]) ?? []).some((p) => isOnlineNow(p.is_online, p.last_seen));
      setSalaOnline(anyOnline);
    }
    loadSalaPresence();
    const id = setInterval(loadSalaPresence, 20000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [otherMemberIdsKey]);

  // Pesquisa de GIFs (Tenor) — mesmo comportamento do ChatPanel.
  useEffect(() => {
    if (!gifSearch || pickerTab !== "gif") return;
    const tenorKey = import.meta.env.VITE_TENOR_API_KEY as string | undefined;
    if (!tenorKey) {
      setGifs([]);
      return;
    }
    const t = setTimeout(async () => {
      setGifLoading(true);
      try {
        const r = await fetch(
          `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifSearch)}&key=${tenorKey}&limit=20&media_filter=gif`,
        );
        const j = await r.json();
        setGifs(
          (j.results ?? []).map((x: any) => ({ id: x.id, url: x.media_formats?.gif?.url ?? "" })),
        );
      } catch {
        setGifs([]);
      }
      setGifLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [gifSearch, pickerTab]);

  // Realtime: reflete ao vivo mudanças de permissões, cargos e definições da sala
  useEffect(() => {
    if (!sala) return;
    const channel = supabase
      .channel(`sala-admin-${sala.id}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "salas", filter: `id=eq.${sala.id}` },
        (payload) => {
          const row: any = payload.new;
          setSala((s) => (s ? { ...s, quem_pode_escrever: row.quem_pode_escrever } : s));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sala_membros", filter: `sala_id=eq.${sala.id}` },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow: any = payload.old;
            setMembros((prev) => prev.filter((m) => m.user_id !== oldRow.user_id));
            if (oldRow.user_id === uid) {
              setIsMember(false);
              setIsAdmin(false);
              toast.error("Foste removido desta sala.");
            }
            return;
          }
          const row: any = payload.new;
          setMembros((prev) => {
            const exists = prev.some((m) => m.user_id === row.user_id);
            if (exists)
              return prev.map((m) =>
                m.user_id === row.user_id
                  ? { ...m, papel: row.papel, pode_enviar: row.pode_enviar !== false }
                  : m,
              );
            return prev;
          });
          if (row.user_id === uid) setIsAdmin(row.papel === "admin" || sala.criador_id === uid);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala?.id, uid]);

  const handleJoin = async () => {
    if (!uid || !sala) {
      toast.error("Inicia sessão para entrar na sala.");
      return;
    }
    setJoining(true);
    try {
      const { error } = await supabase.rpc("sala_entrar" as any, { p_sala_id: sala.id });
      if (error) throw error;
      setIsMember(true);
      setSala((s) => (s ? { ...s, membros_count: s.membros_count + 1 } : s));
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível entrar na sala.");
    } finally {
      setJoining(false);
    }
  };

  const handleSair = async () => {
    if (!uid || !sala) return;
    setSaindo(true);
    try {
      const { error } = await supabase.rpc("sala_sair" as any, { p_sala_id: sala.id });
      if (error) throw error;
      setIsMember(false);
      setIsAdmin(false);
      setShowSalaInfo(false);
      setSala((s) => (s ? { ...s, membros_count: Math.max(0, s.membros_count - 1) } : s));
      toast.success("Saíste da sala.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível sair da sala.");
    } finally {
      setSaindo(false);
    }
  };

  const meuMembro = membros.find((m) => m.user_id === uid);
  const canPost =
    isMember &&
    sala &&
    (isAdmin ||
      (sala.tipo !== "anuncios" &&
        (sala.quem_pode_escrever === "todos" || meuMembro?.pode_enviar !== false)));

  const carregarBanidos = async () => {
    if (!sala) return;
    const { data } = await supabase
      .from("sala_banidos" as any)
      .select("user_id")
      .eq("sala_id", sala.id);
    const ids = ((data as any[]) ?? []).map((r) => r.user_id);
    if (!ids.length) {
      setBanidos([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url")
      .in("id", ids);
    setBanidos(
      ((profs as any[]) ?? []).map((p) => ({
        user_id: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
      })),
    );
  };

  const handlePromover = async (userId: string) => {
    if (!sala) return;
    const { error } = await supabase.rpc("sala_definir_papel" as any, {
      p_sala_id: sala.id,
      p_user_id: userId,
      p_papel: "admin",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembros((prev) => prev.map((m) => (m.user_id === userId ? { ...m, papel: "admin" } : m)));
    toast.success("Membro promovido a administrador.");
  };

  const handleDespromover = async (userId: string) => {
    if (!sala) return;
    const { error } = await supabase.rpc("sala_definir_papel" as any, {
      p_sala_id: sala.id,
      p_user_id: userId,
      p_papel: "membro",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembros((prev) => prev.map((m) => (m.user_id === userId ? { ...m, papel: "membro" } : m)));
    toast.success("Administrador removido.");
  };

  const handleTogglePodeEnviar = async (userId: string, atual: boolean) => {
    if (!sala) return;
    const { error } = await supabase.rpc("sala_definir_permissao_envio" as any, {
      p_sala_id: sala.id,
      p_user_id: userId,
      p_pode_enviar: !atual,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembros((prev) =>
      prev.map((m) => (m.user_id === userId ? { ...m, pode_enviar: !atual } : m)),
    );
    toast.success(!atual ? "Envio de mensagens permitido." : "Envio de mensagens bloqueado.");
  };

  const handleBanir = async (userId: string, nome: string) => {
    if (!sala) return;
    if (!window.confirm(`Banir ${nome} desta sala? A pessoa não poderá voltar a entrar.`)) return;
    const { error } = await supabase.rpc("sala_banir" as any, {
      p_sala_id: sala.id,
      p_user_id: userId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembros((prev) => prev.filter((m) => m.user_id !== userId));
    setSala((s) => (s ? { ...s, membros_count: Math.max(0, s.membros_count - 1) } : s));
    toast.success(`${nome} foi banido da sala.`);
  };

  const handleDesbanir = async (userId: string) => {
    if (!sala) return;
    const { error } = await supabase.rpc("sala_desbanir" as any, {
      p_sala_id: sala.id,
      p_user_id: userId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setBanidos((prev) => prev.filter((b) => b.user_id !== userId));
    toast.success("Membro desbanido.");
  };

  const handleDefinirModo = async (modo: "todos" | "selecionados") => {
    if (!sala) return;
    const { error } = await supabase.rpc("sala_definir_quem_pode_escrever" as any, {
      p_sala_id: sala.id,
      p_modo: modo,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSala((s) => (s ? { ...s, quem_pode_escrever: modo } : s));
    toast.success(
      modo === "todos"
        ? "Agora todos os membros podem escrever."
        : "Agora apenas membros selecionados podem escrever.",
    );
  };

  const handleSend = async () => {
    if (!sala || !uid || sending) return;
    if (!text.trim() && !pendingMedia) return;
    setSending(true);
    try {
      let message_type = "text";
      let media_url: string | null = null;
      if (pendingMedia) {
        if (pendingMedia.type === "image") {
          const up = await uploadImageToCloudinary(pendingMedia.file, `hooda/salas/${sala.id}`);
          media_url = up.url;
          message_type = "image";
        } else {
          const up = await uploadFeedVideo(
            pendingMedia.file,
            { title: sala.nome, creatorId: uid, userId: uid },
            () => {},
          );
          media_url = up.playbackUrl;
          message_type = "video";
        }
      }
      const { error } = await supabase.from("messages").insert({
        conversation_id: sala.conversation_id,
        sender_id: uid,
        content: text.trim() || null,
        message_type,
        media_url,
        status: "sent",
        reply_to: replyTo?.id ?? null,
      } as any);
      if (error) throw error;
      setText("");
      setPendingMedia(null);
      setReplyTo(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const handleSendSticker = async (url: string) => {
    if (!sala || !uid || sending) return;
    setShowEmoji(false);
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: sala.conversation_id,
        sender_id: uid,
        content: null,
        message_type: "sticker",
        media_url: url,
        status: "sent",
      } as any);
      if (error) throw error;
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const handleSendGif = async (url: string) => {
    if (!sala || !uid || sending) return;
    setShowEmoji(false);
    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: sala.conversation_id,
        sender_id: uid,
        content: null,
        message_type: "image",
        media_url: url,
        status: "sent",
      } as any);
      if (error) throw error;
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const handleLike = async (m: Msg) => {
    if (!uid) return;
    try {
      if (m.likedByMe) {
        await supabase
          .from("message_reactions" as any)
          .delete()
          .eq("message_id", m.id)
          .eq("user_id", uid);
        setMsgs((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? { ...x, likedByMe: false, likeCount: Math.max(0, (x.likeCount ?? 1) - 1) }
              : x,
          ),
        );
      } else {
        await supabase
          .from("message_reactions" as any)
          .insert({ message_id: m.id, user_id: uid, emoji: "❤️" });
        setMsgs((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, likedByMe: true, likeCount: (x.likeCount ?? 0) + 1 } : x,
          ),
        );
      }
    } catch {
      /* best-effort */
    }
  };

  // ── Reagir (emoji livre, uma reação por pessoa por mensagem) — mesma
  // lógica do ChatPanel: clicar no mesmo emoji remove, clicar noutro troca. ──
  const handleReact = async (msgId: string, emoji: string) => {
    if (!uid) return;
    const current = msgs.find((x) => x.id === msgId);
    try {
      if (current?.myReaction === emoji) {
        await supabase
          .from("message_reactions" as any)
          .delete()
          .eq("message_id", msgId)
          .eq("user_id", uid);
        setMsgs((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            const r = { ...(m.reactions ?? {}) };
            if (r[emoji]) r[emoji] = Math.max(0, r[emoji] - 1);
            return { ...m, reactions: r, myReaction: undefined };
          }),
        );
      } else if (current?.myReaction) {
        await supabase
          .from("message_reactions" as any)
          .update({ emoji })
          .eq("message_id", msgId)
          .eq("user_id", uid);
        setMsgs((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            const r = { ...(m.reactions ?? {}) };
            if (m.myReaction && r[m.myReaction]) r[m.myReaction] = Math.max(0, r[m.myReaction] - 1);
            r[emoji] = (r[emoji] ?? 0) + 1;
            return { ...m, reactions: r, myReaction: emoji };
          }),
        );
      } else {
        await supabase
          .from("message_reactions" as any)
          .insert({ message_id: msgId, user_id: uid, emoji });
        setMsgs((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            const r = { ...(m.reactions ?? {}) };
            r[emoji] = (r[emoji] ?? 0) + 1;
            return { ...m, reactions: r, myReaction: emoji };
          }),
        );
      }
    } catch {
      toast.error("Erro ao reagir");
    }
  };

  // ── Eliminar para mim ──
  // Guardado no localStorage por sala para a mensagem continuar escondida
  // mesmo depois de sair e voltar à sala ou dar refresh.
  const HIDDEN_KEY = `baya_sala_hidden_${slug}`;
  function deleteForMe(id: string) {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, deletedForMe: true } : m)));
    setLocalOverrides((p) => ({ ...p, [id]: { deletedForMe: true } }));
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
      }
    } catch {}
    toast.success("Mensagem eliminada para ti");
  }

  // ── Eliminar para todos ── (só quem enviou)
  // Marca localmente primeiro (resposta instantânea) — só confirma depois
  // de o Supabase confirmar; se falhar, volta atrás e avisa.
  async function deleteForEveryone(id: string) {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, deletedForAll: true } : m)));
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_all: true } as any)
      .eq("id", id);
    if (error) {
      console.error("[deleteForEveryone] falhou:", error);
      setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, deletedForAll: false } : m)));
      toast.error("Não foi possível eliminar para todos. Tenta novamente.");
      return;
    }
    toast.success("Mensagem eliminada para todos");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: P }} />
      </div>
    );
  }

  if (!sala) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="font-bold" style={{ color: "var(--text-primary)" }}>
          Sala não encontrada.
        </p>
        <button
          onClick={onBack}
          className="px-4 h-9 rounded-full text-white text-sm font-bold"
          style={{ background: P }}
        >
          Voltar a Mensagens
        </button>
      </div>
    );
  }

  const info = TIPO_INFO[sala.tipo];

  return (
    <>
      <div className="flex flex-col h-full relative" style={{ background: "#f0ece8" }}>
        {/* Header — mesmo estilo do cabeçalho do Chat (ChatPanel) */}
        <div
          className="shrink-0 z-10 px-3 py-2.5"
          style={{
            background: "var(--s0,#fff)",
            borderBottom: "1px solid var(--border-subtle,#f0f0f0)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-full transition active:scale-90"
              style={{ background: "transparent" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--s2)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <ArrowLeft className="h-5 w-5" style={{ color: "var(--text-primary)" }} />
            </button>
            <div className="relative h-10 w-10 shrink-0">
              <div
                className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
                style={{ background: sala.foto_url ? "transparent" : P }}
              >
                {sala.foto_url ? (
                  <img
                    src={optimizeAvatar(sala.foto_url, 80)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  sala.nome[0]?.toUpperCase()
                )}
              </div>
              {salaOnline && (
                <span
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
                  style={{ background: "#31D158", border: "2px solid var(--s0,#fff)" }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowMembros(true)}>
              <p
                className="text-sm font-bold truncate leading-tight flex items-center gap-1"
                style={{ color: "var(--text-primary)" }}
              >
                <span className="truncate">{sala.nome}</span>
                <info.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: info.color }} />
              </p>
              <p
                className="text-[11px] flex items-center gap-1"
                style={{ color: salaOnline ? "#31D158" : "var(--text-muted)" }}
              >
                {salaOnline ? (
                  <>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: "#31D158" }}
                    />
                    online agora
                  </>
                ) : (
                  <>
                    <Users className="w-3 h-3" /> {fmtN(sala.membros_count)} membro
                    {sala.membros_count === 1 ? "" : "s"}
                  </>
                )}
              </p>
            </div>
            {!isMember && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="shrink-0 px-3.5 h-9 rounded-full text-xs font-bold text-white flex items-center gap-1 disabled:opacity-60"
                style={{ background: P }}
              >
                {joining ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DoorOpen className="w-3.5 h-3.5" />
                )}
                Entrar na Sala
              </button>
            )}
            <button
              onClick={() => setShowSalaInfo(true)}
              className="p-2 rounded-full transition active:scale-90"
              style={{ background: "transparent", color: "var(--text-secondary)" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--s2)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
          {sala.descricao && (
            <p className="text-xs px-1 pt-1.5" style={{ color: "var(--text-muted)" }}>
              {sala.descricao}
            </p>
          )}
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-4 relative" onScroll={handleMsgsScroll}>
          <div className="flex flex-col justify-end min-h-full">
            {msgs.filter((m) => !m.deletedForMe).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                  Ainda não há publicações nesta sala.
                </p>
              </div>
            ) : (
              msgs
                .filter((m) => !m.deletedForMe)
                .map((m) => (
                  <MsgBubble
                    key={m.id}
                    m={m}
                    isMe={m.sender_id === uid}
                    isAnuncio={sala.tipo === "anuncios"}
                    replied={m.reply_to ? (msgs.find((x) => x.id === m.reply_to) ?? null) : null}
                    onLike={() => handleLike(m)}
                    onReply={() => setReplyTo(m)}
                    onReact={(emoji) => handleReact(m.id, emoji)}
                    onDeleteForMe={() => deleteForMe(m.id)}
                    onDeleteForEveryone={() => deleteForEveryone(m.id)}
                  />
                ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>
        {showScrollBtn && (
          <button
            onClick={() => {
              atBottom.current = true;
              setShowScrollBtn(false);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            className="absolute right-4 rounded-full flex items-center justify-center shadow-lg transition active:scale-90"
            style={{
              bottom: 88,
              width: 36,
              height: 36,
              background: "var(--s0,#fff)",
              border: "1px solid var(--border-subtle,#e5e5e5)",
              color: "#2F6FED",
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        {/* Faixa de resposta — mesmo padrão do ChatPanel */}
        {replyTo && isMember && canPost && (
          <div
            className="flex items-center gap-2 px-3 py-2 shrink-0 border-t"
            style={{ borderColor: `${P}44`, background: "var(--s2)" }}
          >
            <div
              className="flex-1 px-3 py-1.5 rounded-xl border-l-4 min-w-0"
              style={{ borderColor: P, background: "var(--s3)" }}
            >
              <p className="text-[11px] font-bold" style={{ color: P }}>
                {replyTo.sender?.full_name || replyTo.sender?.username || "Utilizador"}
              </p>
              <p className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                {replyTo.message_type === "image"
                  ? "📷 Imagem"
                  : replyTo.message_type === "video"
                    ? "🎥 Vídeo"
                    : replyTo.message_type === "sticker"
                      ? "Sticker"
                      : replyTo.content}
              </p>
            </div>
            <button onClick={() => setReplyTo(null)}>
              <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
        )}

        {/* Composer — mesmo estilo (pílula arredondada) da barra de input do Chat */}
        {isMember && canPost && (
          <div
            className="flex items-end gap-2 px-3 py-2 shrink-0"
            style={{
              background: "var(--s0,#f0ece8)",
              paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex-1">
              {pendingMedia && (
                <div className="relative inline-block mb-2 ml-1">
                  {pendingMedia.type === "image" ? (
                    <img
                      src={pendingMedia.preview}
                      alt=""
                      className="h-20 rounded-lg object-cover"
                    />
                  ) : (
                    <video src={pendingMedia.preview} className="h-20 rounded-lg" />
                  )}
                  <button
                    onClick={() => setPendingMedia(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
                    style={{ background: "rgba(0,0,0,0.7)" }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {showEmoji && (
                <ChatPicker
                  tab={pickerTab}
                  setTab={setPickerTab}
                  emojiSearch={emojiSearch}
                  setEmojiSearch={setEmojiSearch}
                  gifSearch={gifSearch}
                  setGifSearch={setGifSearch}
                  gifs={gifs}
                  gifLoading={gifLoading}
                  onEmoji={(e) => setText((p) => p + e)}
                  onSticker={handleSendSticker}
                  onGif={handleSendGif}
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => imgInputRef.current?.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
                  style={{
                    background: "white",
                    color: "#2F6FED",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.12)",
                  }}
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => vidInputRef.current?.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90"
                  style={{
                    background: "white",
                    color: "#2F6FED",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.12)",
                  }}
                >
                  <Video className="h-4 w-4" />
                </button>
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      setPendingMedia({ file: f, type: "image", preview: URL.createObjectURL(f) });
                  }}
                />
                <input
                  ref={vidInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      setPendingMedia({ file: f, type: "video", preview: URL.createObjectURL(f) });
                  }}
                />
                <div
                  className="flex-1 flex items-center rounded-3xl px-4 py-2 gap-2 min-h-[44px] transition-shadow focus-within:shadow-[0_0_0_2px_rgba(47,111,237,0.25)]"
                  style={{ background: "var(--s2)", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}
                >
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder={
                      sala.tipo === "anuncios" ? "Publicar um anúncio..." : "Mensagem..."
                    }
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: "var(--text-primary,#111)" }}
                  />
                  <button
                    onClick={() => setShowEmoji((v) => !v)}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90"
                    style={{ color: showEmoji ? "#2F6FED" : "#aaa" }}
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  onClick={handleSend}
                  disabled={sending || (!text.trim() && !pendingMedia)}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50 transition active:scale-90"
                  style={{ background: "#2F6FED", boxShadow: "0 4px 14px rgba(47,111,237,0.4)" }}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" style={{ marginLeft: 2 }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {isMember && !canPost && (
          <div
            className="shrink-0 px-4 py-3 text-center text-xs font-bold"
            style={{ color: "var(--text-muted)" }}
          >
            {sala.tipo === "anuncios"
              ? "Só administradores podem publicar nesta sala de anúncios. Podes reagir com ❤️."
              : "O administrador restringiu o envio de mensagens para este membro."}
          </div>
        )}
        {!isMember && (
          <div
            className="shrink-0 px-4 py-3 border-t"
            style={{ background: "var(--s0)", borderColor: "var(--border-subtle)" }}
          >
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full h-11 rounded-full text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ color: P }}
            >
              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              ENTRAR NO CANAL
            </button>
          </div>
        )}
      </div>

      {showMembros && (
        <MembrosPanel
          membros={membros}
          criadorId={sala.criador_id}
          meuId={uid}
          souAdmin={isAdmin}
          onClose={() => setShowMembros(false)}
          onPromover={handlePromover}
          onDespromover={handleDespromover}
          onTogglePodeEnviar={handleTogglePodeEnviar}
          onBanir={handleBanir}
        />
      )}
      {showSalaInfo && (
        <SalaInfoModal
          sala={sala}
          isMember={isMember}
          isAdmin={isAdmin}
          joining={joining}
          onJoin={handleJoin}
          onSair={handleSair}
          saindo={saindo}
          onVerMembros={() => {
            setShowSalaInfo(false);
            setShowMembros(true);
          }}
          onVerBanidos={() => {
            setShowSalaInfo(false);
            carregarBanidos();
            setShowBanidos(true);
          }}
          onDefinicoes={() => {
            setShowSalaInfo(false);
            setShowDefinicoes(true);
          }}
          onDenunciar={() => {
            setShowSalaInfo(false);
            setShowDenunciarSala(true);
          }}
          onClose={() => setShowSalaInfo(false)}
        />
      )}
      {showDenunciarSala && (
        <DenunciarSalaModal
          salaId={sala.id}
          salaNome={sala.nome}
          reporterId={uid}
          onClose={() => setShowDenunciarSala(false)}
        />
      )}
      {showBanidos && (
        <BanidosPanel
          banidos={banidos}
          onDesbanir={handleDesbanir}
          onClose={() => setShowBanidos(false)}
        />
      )}
      {showDefinicoes && (
        <DefinicoesPanel
          quemPodeEscrever={sala.quem_pode_escrever}
          onDefinirModo={handleDefinirModo}
          onVerMembros={() => {
            setShowDefinicoes(false);
            setShowMembros(true);
          }}
          onClose={() => setShowDefinicoes(false)}
        />
      )}
    </>
  );
}
