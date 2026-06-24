import { useState, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Eye, UserRound } from "lucide-react";
import { prefetchProfileByUsername } from "@/lib/queryClient";

/**
 * ProfileAvatarLink — navegação inteligente entre Stories e Perfis.
 *
 * Uso: envolve qualquer avatar/foto de perfil clicável.
 *   <ProfileAvatarLink userId={post.authorId} username={post.authorUsername}>
 *     <Avatar ... />
 *   </ProfileAvatarLink>
 *
 * Comportamento:
 *  - Ao clicar: verifica se o utilizador tem Story ativo (não expirado).
 *      - Se tiver: abre o StoryViewer global (mesmo usado na Home).
 *      - Se não tiver: navega para /u/{username}.
 *  - Long-press / clique direito (desktop): mostra menu rápido
 *    "Ver Story" / "Ver Perfil" quando há story disponível.
 *  - Não force qualquer estilo visual — children controla 100% do design.
 */

type ProfileAvatarLinkProps = {
  userId: string;
  username: string;
  children: React.ReactNode;
  className?: string;
  /** Desativa a verificação de story e vai sempre direto ao perfil. */
  disableStoryCheck?: boolean;
  /** Mostra sempre o menu "Ver Story / Ver Perfil" em vez de ir direto. */
  alwaysShowMenu?: boolean;
};

export function ProfileAvatarLink({
  userId,
  username,
  children,
  className,
  disableStoryCheck,
  alwaysShowMenu,
}: ProfileAvatarLinkProps) {
  const navigate = useNavigate();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const longPressTriggeredRef = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToProfile = useCallback(() => {
    if (!username) {
      console.warn("ProfileAvatarLink: tentativa de navegar sem username", { userId });
      return;
    }
    navigate({ to: "/u/$username", params: { username } });
  }, [navigate, username, userId]);

  const hasActiveStory = useCallback(async (): Promise<boolean> => {
    if (disableStoryCheck || !userId) return false;
    try {
      const now = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("id")
        .eq("user_id", userId)
        .gt("expires_at", now)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("ProfileAvatarLink: erro ao verificar story ativo", error);
        return false;
      }
      return !!data;
    } catch (err) {
      console.error("ProfileAvatarLink: exceção ao verificar story ativo", err);
      return false;
    }
  }, [userId, disableStoryCheck]);

  const openStory = useCallback(() => {
    // Evento global — o GlobalStoryViewer (montado em __root.tsx, ativo
    // em qualquer página) escuta isto e abre o visualizador para este
    // utilizador específico.
    window.dispatchEvent(new CustomEvent("hooda:open-story", { detail: { userId, username } }));
  }, [userId, username]);

  // Pré-carrega o perfil assim que o utilizador começa a interagir
  // (hover no desktop, toque no mobile) — em paralelo com a verificação
  // de story, para que ao navegar os dados já estejam prontos na cache.
  const prefetch = useCallback(() => {
    if (username) prefetchProfileByUsername(username);
  }, [username]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[ProfileAvatarLink] click", { userId, username, disableStoryCheck });

      // Se um long-press já tratou esta interação (abriu o menu), ignora
      // o click sintético que se segue ao touchend.
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (checking) return;

      if (alwaysShowMenu) {
        setMenuPos({ x: e.clientX, y: e.clientY });
        return;
      }

      setChecking(true);
      const active = await hasActiveStory();
      setChecking(false);
      console.log("[ProfileAvatarLink] hasActiveStory ->", active);

      if (active) openStory();
      else goToProfile();
    },
    [
      checking,
      alwaysShowMenu,
      hasActiveStory,
      openStory,
      goToProfile,
      userId,
      username,
      disableStoryCheck,
    ],
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = { x: e.clientX, y: e.clientY };
      const active = await hasActiveStory();
      if (active) setMenuPos(pos);
      else goToProfile();
    },
    [hasActiveStory, goToProfile],
  );

  // Long press (mobile) — abre o mesmo menu rápido do clique direito.
  // Não interfere com o clique normal: só dispara depois de 500ms
  // parado, e marca longPressTriggeredRef para o click sintético
  // seguinte (gerado pelo browser a partir do touchend) ser ignorado.
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      prefetch();
      const touch = e.touches[0];
      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = setTimeout(async () => {
        const active = await hasActiveStory();
        if (active) {
          longPressTriggeredRef.current = true;
          setMenuPos({ x: touch.clientX, y: touch.clientY });
        }
      }, 550);
    },
    [hasActiveStory, prefetch],
  );

  const cancelPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  return (
    <>
      <span
        className={className}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={prefetch}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelPressTimer}
        onTouchMove={cancelPressTimer}
        style={{ display: "inline-flex", cursor: "pointer" }}
      >
        {children}
      </span>

      {menuPos && (
        <QuickMenu
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
          onViewStory={() => {
            setMenuPos(null);
            openStory();
          }}
          onViewProfile={() => {
            setMenuPos(null);
            goToProfile();
          }}
        />
      )}
    </>
  );
}

function QuickMenu({
  x,
  y,
  onClose,
  onViewStory,
  onViewProfile,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onViewStory: () => void;
  onViewProfile: () => void;
}) {
  // Mantém o menu dentro do ecrã
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 400) - 180);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 110);

  return (
    <div className="fixed inset-0 z-[200]" onClick={onClose}>
      <div
        className="absolute bg-white rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden py-1 w-44"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onViewStory}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left hover:bg-neutral-50 transition"
          style={{ color: "var(--text-primary,#000)" }}
        >
          <Eye className="h-4 w-4" style={{ color: "#5B3FCF" }} />
          Ver Story
        </button>
        <button
          onClick={onViewProfile}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left hover:bg-neutral-50 transition"
          style={{ color: "var(--text-primary,#000)" }}
        >
          <UserRound className="h-4 w-4" style={{ color: "#5B3FCF" }} />
          Ver Perfil
        </button>
      </div>
    </div>
  );
}
