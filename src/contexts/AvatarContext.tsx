import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AvatarData {
  avatarUrl: string | null;
  avatarColor: string | null;
}

interface AvatarContextValue {
  avatarUrl: string | null;
  avatarColor: string | null;
  name: string;
  setAvatarUrl: (url: string | null) => void;
  setAvatarColor: (color: string | null) => void;
  getAvatarData: (userId: string) => Promise<AvatarData>;
  avatarCache: Record<string, AvatarData>;
}

const AvatarContext = createContext<AvatarContextValue>({
  avatarUrl: null,
  avatarColor: null,
  name: "",
  setAvatarUrl: () => {},
  setAvatarColor: () => {},
  getAvatarData: async () => ({ avatarUrl: null, avatarColor: null }),
  avatarCache: {},
});

export function AvatarProvider({ children }: { children: React.ReactNode }) {
  const [avatarUrl, setAvatarUrlState] = useState<string | null>(null);
  const [avatarColor, setAvatarColorState] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarCache, setAvatarCache] = useState<Record<string, AvatarData>>({});

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, avatar_color, full_name, username")
        .eq("id", session.user.id)
        .maybeSingle();

      if ((data as any)?.avatar_url) setAvatarUrlState((data as any).avatar_url);
      if ((data as any)?.avatar_color) setAvatarColorState((data as any).avatar_color);
      setName((data as any)?.full_name || (data as any)?.username || session.user.email?.split("@")[0] || "");
      
      // Cache do utilizador actual
      if (session.user.id) {
        setAvatarCache(prev => ({
          ...prev,
          [session.user.id]: {
            avatarUrl: (data as any)?.avatar_url || null,
            avatarColor: (data as any)?.avatar_color || null,
          }
        }));
      }
    }

    load();

    // Recarregar quando sessão muda (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => subscription.unsubscribe();
  }, []);

  function setAvatarUrl(url: string | null) {
    setAvatarUrlState(url);
  }

  function setAvatarColor(color: string | null) {
    setAvatarColorState(color);
  }

  async function getAvatarData(userId: string): Promise<AvatarData> {
    // Verificar cache primeiro
    if (avatarCache[userId]) {
      return avatarCache[userId];
    }

    try {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, avatar_color")
        .eq("id", userId)
        .maybeSingle();

      const avatarData: AvatarData = {
        avatarUrl: (data as any)?.avatar_url || null,
        avatarColor: (data as any)?.avatar_color || null,
      };

      // Guardar no cache
      setAvatarCache(prev => ({
        ...prev,
        [userId]: avatarData,
      }));

      return avatarData;
    } catch (error) {
      console.error("Erro ao carregar avatar:", error);
      return { avatarUrl: null, avatarColor: null };
    }
  }

  return (
    <AvatarContext.Provider value={{ avatarUrl, avatarColor, name, setAvatarUrl, setAvatarColor, getAvatarData, avatarCache }}>
      {children}
    </AvatarContext.Provider>
  );
}

export function useAvatar() {
  return useContext(AvatarContext);
}
