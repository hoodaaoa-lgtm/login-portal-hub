import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { X, MessageCircle, UserPlus, UserCheck, UserRound, Volume2, VolumeX } from "lucide-react";

/**
 * GlobalStoryViewer — escuta o evento "hooda:open-story" disparado por
 * ProfileAvatarLink em qualquer página (Feed, Comentários, Pesquisa,
 * Comunidades, Seguidores/Seguindo, Mensagens) e mostra o story ativo
 * desse utilizador, com:
 *   - botão "Ver Perfil"
 *   - botão "Enviar Mensagem"
 *   - botão "Seguir" / "Seguindo"
 *
 * Fica montado uma única vez em __root.tsx para funcionar em toda a app.
 * Não duplica/substitui o StoryViewer já existente em home.tsx (esse
 * continua a tratar a criação/edição/visualização normal de stories na
 * Home); este componente cobre o caso de abrir o story de outra pessoa
 * a partir de qualquer ecrã.
 */

type StorySlide = {
  id: string;
  photoUrl?: string | null;
  bgGrad?: string | null;
  text?: string | null;
  createdAt: string;
};

type TargetUser = {
  userId: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  color?: string;
};

const ACCENT = ["#5B3FCF", "#F26B3A", "#1FAFA6", "#6BA547", "#E94B8A"];
const colorFor = (s: string) => ACCENT[(s?.charCodeAt(0) ?? 0) % ACCENT.length];
const DURATION = 6000;

export function GlobalStoryViewer() {
  const navigate = useNavigate();
  const [target, setTarget] = useState<TargetUser | null>(null);
  const [slides, setSlides] = useState<StorySlide[]>([]);
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [myId, setMyId] = useState("");
  const [openingChat, setOpeningChat] = useState(false);
  const [muted, setMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const close = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTarget(null);
    setSlides([]);
    setIdx(0);
    setProgress(0);
  }, []);

  // Escuta o evento global disparado por ProfileAvatarLink
  useEffect(() => {
    async function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { userId: string; username: string };
      if (!detail?.userId) return;
      setLoading(true);
      setIdx(0);
      setProgress(0);

      const { data: { session } } = await supabase.auth.getSession();
      if (session) setMyId(session.user.id);

      const [profileRes, storiesRes] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ["storyAuthorProfile", detail.userId],
          queryFn: async () => {
            const { data, error } = await supabase.from("profiles")
              .select("id,username,full_name,avatar_url").eq("id", detail.userId).maybeSingle();
            if (error) throw error;
            return data;
          },
          staleTime: 5 * 60_000,
          gcTime: 30 * 60_000,
        }).then((data) => ({ data, error: null as any })).catch((error) => ({ data: null, error })),
        queryClient.fetchQuery({
          queryKey: ["userActiveStories", detail.userId],
          queryFn: async () => {
            const { data, error } = await (supabase as any).from("stories")
              .select("id,photo_url,bg_grad,text,story_data,created_at,expires_at")
              .eq("user_id", detail.userId)
              .gt("expires_at", new Date().toISOString())
              .order("created_at", { ascending: true });
            if (error) throw error;
            return data;
          },
          staleTime: 15_000,
          gcTime: 10 * 60_000,
        }).then((data) => ({ data, error: null as any })).catch((error) => ({ data: null, error })),
      ]);

      const prof = profileRes.data as any;
      const username = prof?.username || detail.username;

      if (profileRes.error) console.error("GlobalStoryViewer: erro ao carregar perfil", profileRes.error);
      if (storiesRes.error) console.error("GlobalStoryViewer: erro ao carregar stories", storiesRes.error);

      if (session) {
        const { data: followRow } = await supabase.from("follows")
          .select("follower_id").eq("follower_id", session.user.id).eq("target_username", username).maybeSingle();
        setFollowing(!!followRow);
      }

      setTarget({
        userId: detail.userId,
        username,
        fullName: prof?.full_name,
        avatarUrl: prof?.avatar_url,
        color: colorFor(username),
      });

      const rows = storiesRes?.data ?? [];
      setSlides(rows.map((r: any) => {
        const sd = r.story_data && typeof r.story_data === "object" ? r.story_data : {};
        return {
          id: r.id,
          photoUrl: r.photo_url ?? sd.photo ?? null,
          bgGrad: r.bg_grad ?? sd.bg ?? null,
          text: r.text ?? sd.storyText ?? null,
          createdAt: r.created_at,
        };
      }));
      setLoading(false);
    }

    window.addEventListener("hooda:open-story", handler);
    return () => window.removeEventListener("hooda:open-story", handler);
  }, []);

  // Progress bar / avanço automático
  useEffect(() => {
    if (!target || slides.length === 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      const p = Math.min(((Date.now() - t0) / DURATION) * 100, 100);
      setProgress(p);
      if (p >= 100) {
        if (idx < slides.length - 1) setIdx(i => i + 1);
        else close();
      }
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [target, slides.length, idx, close]);

  async function toggleFollow() {
    if (!target || !myId) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", myId).eq("target_username", target.username);
      setFollowing(false);
    } else {
      await supabase.from("follows").insert({ follower_id: myId, target_username: target.username } as any);
      setFollowing(true);
    }
  }

  async function openChat() {
    if (!target || !myId || openingChat) return;
    setOpeningChat(true);
    try {
      const db = supabase as any;
      const { data: myConvs } = await db.from("conversation_participants").select("conversation_id").eq("user_id", myId);
      let existingConvId: string | null = null;
      if (myConvs && myConvs.length > 0) {
        const myConvIds = myConvs.map((c: any) => c.conversation_id);
        const { data: shared } = await db.from("conversation_participants")
          .select("conversation_id").eq("user_id", target.userId).in("conversation_id", myConvIds).maybeSingle();
        if (shared) existingConvId = shared.conversation_id;
      }
      if (!existingConvId) {
        const { data: conv, error: convErr } = await db.from("conversations").insert({}).select("id").single();
        if (!convErr && conv?.id) {
          await db.from("conversation_participants").insert([
            { conversation_id: conv.id, user_id: myId },
            { conversation_id: conv.id, user_id: target.userId },
          ]);
          existingConvId = conv.id;
        }
      }
      close();
      navigate({ to: "/mensagens" });
    } finally {
      setOpeningChat(false);
    }
  }

  function viewProfile() {
    if (!target) return;
    const username = target.username;
    close();
    navigate({ to: "/u/$username", params: { username } });
  }

  // Sem story ativo (corrida entre verificação e abertura, ou erro ao
  // carregar) — vai direto ao perfil. Feito em useEffect, nunca durante
  // o render, para não causar navegação instável/ignorada pelo router.
  useEffect(() => {
    if (!loading && target && slides.length === 0) {
      const username = target.username;
      close();
      navigate({ to: "/u/$username", params: { username } });
    }
  }, [loading, target, slides.length, close, navigate]);

  if (loading) {
    return (
      <div className="hooda-fade-in fixed inset-0 z-[300] flex items-center justify-center bg-black/80">
        <div className="h-10 w-10 rounded-full border-2 animate-spin" style={{ borderColor: "#fff", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!target || slides.length === 0) return null;

  const slide = slides[Math.min(idx, slides.length - 1)];
  const name = target.fullName || target.username;

  return (
    <div className="hooda-scale-in fixed inset-0 z-[300] bg-black flex items-center justify-center select-none">
      <div className="relative w-full h-full max-w-md mx-auto overflow-hidden"
        style={{ background: slide.bgGrad || "#111" }}>
        {slide.photoUrl && (
          <img src={slide.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Tap zones para navegar entre slides */}
        <div className="absolute inset-0 flex z-10">
          <div className="w-1/3 h-full" onClick={() => idx > 0 ? setIdx(i => i - 1) : null} />
          <div className="w-1/3 h-full" />
          <div className="w-1/3 h-full" onClick={() => idx < slides.length - 1 ? setIdx(i => i + 1) : close()} />
        </div>

        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
          {slides.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div className="h-full bg-white transition-none"
                style={{ width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-7 left-3 right-3 flex items-center gap-2.5 z-20">
          <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: target.color }}>
            {target.avatarUrl
              ? <img src={target.avatarUrl} alt={name} className="w-full h-full object-cover" />
              : (name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate drop-shadow">{name}</p>
            <p className="text-white/70 text-[11px] truncate">@{target.username}</p>
          </div>
          <button onClick={close} className="p-1.5 rounded-full hover:bg-white/10 transition z-30">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Texto do story */}
        {slide.text && !slide.photoUrl && (
          <div className="absolute inset-0 flex items-center justify-center px-8 z-10">
            <p className="text-white text-xl font-bold text-center leading-snug drop-shadow-lg">{slide.text}</p>
          </div>
        )}
        {slide.text && slide.photoUrl && (
          <div className="absolute bottom-24 left-4 right-4 z-20">
            <p className="text-white text-sm font-medium leading-snug drop-shadow-lg bg-black/30 rounded-xl px-3 py-2">{slide.text}</p>
          </div>
        )}

        {/* Botões de ação: Ver Perfil / Enviar Mensagem / Seguir */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-10 z-20"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
          <div className="flex items-center gap-2">
            <button onClick={viewProfile}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-full bg-white/15 backdrop-blur text-white text-xs font-bold hover:bg-white/25 transition active:scale-95">
              <UserRound className="h-4 w-4" /> Ver Perfil
            </button>
            <button onClick={openChat} disabled={openingChat}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-full bg-white/15 backdrop-blur text-white text-xs font-bold hover:bg-white/25 transition active:scale-95 disabled:opacity-50">
              <MessageCircle className="h-4 w-4" /> {openingChat ? "..." : "Mensagem"}
            </button>
            <button onClick={toggleFollow}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-full text-xs font-bold transition active:scale-95"
              style={following
                ? { background: "rgba(255,255,255,0.15)", color: "white", backdropFilter: "blur(8px)" }
                : { background: "#5B3FCF", color: "white" }}>
              {following ? <><UserCheck className="h-4 w-4" /> Seguindo</> : <><UserPlus className="h-4 w-4" /> Seguir</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
