import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type RawTrack = {
  id: string; title: string; artist?: string; category: string;
  url: string; stream_url: string; cover_url: string;
  cover_stream_url?: string; duration?: number;
};

const MUSIC_API = "https://soundcloud-stories.lovable.app/api/public/music";

export const fetchMusic = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      category: z.string().optional(),
      limit: z.number().optional(),
    })
  )
  .handler(async ({ data }) => {
    const params = new URLSearchParams();
    params.set("limit", String(data?.limit ?? 50));
    if (data?.category) params.set("category", data.category);

    const url = `${MUSIC_API}?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      console.error("[fetchMusic] falha de rede ao chamar", url, err);
      throw new Error(
        `Não foi possível ligar à biblioteca musical (${err instanceof Error ? err.message : "erro de rede"}).`
      );
    }

    const text = await res.text();

    if (!res.ok) {
      console.error("[fetchMusic] API respondeu com erro", res.status, res.statusText, text.slice(0, 300));
      throw new Error(`Biblioteca musical respondeu com erro ${res.status} (${res.statusText}).`);
    }

    let json: RawTrack[] | { tracks?: RawTrack[]; library?: RawTrack[]; songs?: RawTrack[]; data?: RawTrack[] };
    try {
      json = JSON.parse(text);
    } catch {
      console.error("[fetchMusic] resposta não é JSON válido:", text.slice(0, 300));
      throw new Error("Biblioteca musical devolveu uma resposta inválida (não é JSON).");
    }

    const tracks = Array.isArray(json)
      ? json
      : json.tracks ?? json.library ?? json.songs ?? json.data ?? [];

    if (!Array.isArray(tracks)) {
      console.error("[fetchMusic] formato inesperado:", json);
      throw new Error("Formato de dados inesperado vindo da biblioteca musical.");
    }

    return { library: tracks };
  });