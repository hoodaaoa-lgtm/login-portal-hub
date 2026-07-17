import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { uploadFeedVideo } from "@/lib/cloudinaryFeedVideo";
import { optimizeAvatar, optimizePostPhoto } from "@/lib/imageOptimize";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { extractUrl } from "@/lib/linkPreview";
import { LinkPreview } from "@/components/LinkPreview";
import { VIDEO_STICKERS } from "@/lib/stickers";
import { StickerView } from "@/components/StickerView";
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
} from "lucide-react";

const P = "#2F6FED";

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
};

type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  media_url: string | null;
  created_at: string;
  sender?: { username?: string; full_name?: string; avatar_url?: string };
  likeCount?: number;
  likedByMe?: boolean;
};

const TIPO_INFO = {
  publica: { label: "Pública", Icon: Globe, color: "#2F6FED" },
  privada: { label: "Privada", Icon: Lock, color: "#6BA547" },
  anuncios: { label: "Anúncios", Icon: Megaphone, color: "#FFC93C" },
} as const;

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

/* ── Menu de opções (três pontinhos) ── */
function OpcoesMenu({
  isAdmin,
  onVerMembros,
  onVerBanidos,
  onDefinicoes,
  onClose,
}: {
  isAdmin: boolean;
  onVerMembros: () => void;
  onVerBanidos: () => void;
  onDefinicoes: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        className="absolute right-4 top-14 w-56 rounded-xl overflow-hidden shadow-lg"
        style={{ background: "var(--s1)", border: "1px solid var(--border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onVerMembros();
            onClose();
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
                onDefinicoes();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-left border-t"
              style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}
            >
              <UserCog className="w-4 h-4" /> Definições da sala
            </button>
            <button
              onClick={() => {
                onVerBanidos();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-bold text-left border-t"
              style={{ color: "var(--text-primary)", borderColor: "var(--border-subtle)" }}
            >
              <Ghost className="w-4 h-4" /> Membros banidos
            </button>
          </>
        )}
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
  onLike,
}: {
  m: Msg;
  isMe: boolean;
  isAnuncio: boolean;
  onLike: () => void;
}) {
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
    <div className={`flex ${isMe ? "justify-end" : "justify-start"} items-end gap-1.5 px-1 mb-3`}>
      {!isMe && (
        <Av src={m.sender?.avatar_url} name={m.sender?.full_name || m.sender?.username} size={26} />
      )}
      <div
        className={`max-w-[82%] sm:max-w-[75%] min-w-0 flex flex-col ${isMe ? "items-end" : "items-start"}`}
      >
        {!isMe && (
          <span
            className="text-[11px] font-bold mb-0.5 px-1"
            style={{ color: "var(--text-muted)" }}
          >
            {m.sender?.full_name || m.sender?.username || "Utilizador"}
          </span>
        )}
        <div
          className="rounded-2xl overflow-hidden shadow-sm"
          style={{
            background: bubbleBg,
            color: bubbleText,
            borderRadius: br,
            boxShadow: bubbleShadow,
          }}
        >
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
        {isAnuncio && (
          <button
            onClick={onLike}
            className="flex items-center gap-1 mt-1 px-1 text-xs font-bold"
            style={{ color: m.likedByMe ? "#e0245e" : "var(--text-muted)" }}
          >
            <Heart className="w-3.5 h-3.5" fill={m.likedByMe ? "#e0245e" : "none"} />
            {fmtN(m.likeCount ?? 0)}
          </button>
        )}
      </div>
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
  const [showMembros, setShowMembros] = useState(false);
  const [showOpcoes, setShowOpcoes] = useState(false);
  const [showBanidos, setShowBanidos] = useState(false);
  const [showDefinicoes, setShowDefinicoes] = useState(false);
  const [banidos, setBanidos] = useState<
    { user_id: string; username?: string; full_name?: string; avatar_url?: string }[]
  >([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{
    file: File;
    type: "image" | "video";
    preview: string;
  } | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
        .select("id,username,full_name,avatar_url")
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
      })),
    );

    const { data: msgRows } = await supabase
      .from("messages")
      .select("id,conversation_id,sender_id,content,message_type,media_url,created_at")
      .eq("conversation_id", s.conversation_id)
      .eq("deleted_for_all", false)
      .order("created_at", { ascending: true })
      .limit(200);
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
    if (s.tipo === "anuncios" && msgIds.length) {
      const { data: rx } = await supabase
        .from("message_reactions" as any)
        .select("message_id,user_id")
        .in("message_id", msgIds);
      ((rx as any[]) ?? []).forEach((r) => {
        if (!likeMap[r.message_id]) likeMap[r.message_id] = { count: 0, me: false };
        likeMap[r.message_id].count += 1;
        if (r.user_id === uid) likeMap[r.message_id].me = true;
      });
    }
    setMsgs(
      ((msgRows as any[]) ?? []).map((m) => ({
        ...m,
        sender: senderMap[m.sender_id],
        likeCount: likeMap[m.id]?.count ?? 0,
        likedByMe: likeMap[m.id]?.me ?? false,
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
      .channel(`sala-${sala.id}`)
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
                  username: p.username ?? undefined,
                  full_name: p.full_name ?? undefined,
                  avatar_url: p.avatar_url ?? undefined,
                }
              : undefined;
          }
          setMsgs((prev) => [...prev, { ...row, sender, likeCount: 0, likedByMe: false }]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sala?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // Realtime: reflete ao vivo mudanças de permissões, cargos e definições da sala
  useEffect(() => {
    if (!sala) return;
    const channel = supabase
      .channel(`sala-admin-${sala.id}`)
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
      } as any);
      if (error) throw error;
      setText("");
      setPendingMedia(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const handleSendSticker = async (url: string) => {
    if (!sala || !uid || sending) return;
    setShowStickers(false);
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
      <div className="flex flex-col h-full" style={{ background: "#f0ece8" }}>
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
            <div
              className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 font-bold text-white"
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
                style={{ color: "var(--text-muted)" }}
              >
                <Users className="w-3 h-3" /> {fmtN(sala.membros_count)} membro
                {sala.membros_count === 1 ? "" : "s"}
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
              onClick={() => setShowOpcoes(true)}
              className="p-2 rounded-full transition active:scale-90"
              style={{ background: "transparent", color: "var(--text-secondary)" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--s2)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
          {sala.descricao && (
            <p className="text-xs px-1 pt-1.5" style={{ color: "var(--text-muted)" }}>
              {sala.descricao}
            </p>
          )}
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                Ainda não há publicações nesta sala.
              </p>
            </div>
          ) : (
            msgs.map((m) => (
              <MsgBubble
                key={m.id}
                m={m}
                isMe={m.sender_id === uid}
                isAnuncio={sala.tipo === "anuncios"}
                onLike={() => handleLike(m)}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

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
              {showStickers && (
                <div
                  className="flex gap-2 mb-2 p-2 rounded-2xl overflow-x-auto"
                  style={{ background: "var(--s2)" }}
                >
                  {VIDEO_STICKERS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSendSticker(s.url)}
                      className="rounded-xl overflow-hidden active:scale-90 transition-all shrink-0"
                      style={{ width: 60, height: 60 }}
                    >
                      <StickerView url={s.url} size={60} />
                    </button>
                  ))}
                </div>
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
                    onClick={() => setShowStickers((v) => !v)}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition active:scale-90"
                    style={{ color: showStickers ? "#2F6FED" : "#aaa" }}
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
      {showOpcoes && (
        <OpcoesMenu
          isAdmin={isAdmin}
          onVerMembros={() => setShowMembros(true)}
          onVerBanidos={() => {
            carregarBanidos();
            setShowBanidos(true);
          }}
          onDefinicoes={() => setShowDefinicoes(true)}
          onClose={() => setShowOpcoes(false)}
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
