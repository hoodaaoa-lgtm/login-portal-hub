/**
 * MusicLibrary — biblioteca musical partilhada.
 * Usada no criador de História (home.tsx), para que futuros criadores de
 * conteúdo com música possam usar exatamente a mesma fonte de músicas em
 * vez de cada um ter a sua própria lógica.
 */
import React, { useEffect, useState } from "react";
import { Music, Play, Pause, X } from "lucide-react";
import { fetchMusic } from "@/lib/api/music.functions";
import { useScrollLock } from "@/hooks/useScrollLock";

export type Song = {
  id: string; title: string; artist?: string; category: string;
  url: string; stream_url: string; cover_url: string;
  cover_stream_url?: string; duration?: number;
};

export function MusicLibrary({ onSelect, onClose }: { onSelect: (s: Song) => void; onClose: () => void }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);
  useScrollLock();

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMusic({ data: { limit: 50 } })
      .then((r) => {
        const lib = (r.library ?? []) as Song[];
        setSongs(lib);
        if (lib.length === 0) setError("Biblioteca musical vazia.");
      })
      .catch((e) => {
        setSongs([]);
        setError(e instanceof Error ? e.message : "Não foi possível carregar a biblioteca musical.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function togglePreview(song: Song) {
    if (preview?.id === song.id) { preview.audio.pause(); setPreview(null); return; }
    preview?.audio.pause();
    const audio = new Audio(song.url);
    audio.play().catch(() => {});
    audio.onended = () => setPreview(null);
    setPreview({ id: song.id, audio });
  }

  const list = songs.filter((s) =>
    !query || s.title.toLowerCase().includes(query.toLowerCase()) || (s.artist ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="bg-[#18181b] w-full rounded-t-3xl flex flex-col" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <span className="text-white font-bold flex items-center gap-2">
            <Music className="h-4 w-4 text-[#2F6FED]" /> Biblioteca Musical
          </span>
          <button onClick={() => { preview?.audio.pause(); onClose(); }} className="p-1.5 rounded-full hover:bg-[var(--s2)]/10">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>
        <div className="px-4 py-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar…"
            className="w-full h-10 px-4 rounded-xl bg-[var(--s2)]/10 text-white text-sm placeholder:text-white/30 outline-none" />
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-[#2F6FED] border-t-transparent animate-spin" />
            </div>
          ) : error && songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
              <Music className="h-10 w-10 text-white/20" />
              <p className="text-white/70 text-sm">{error}</p>
              <button onClick={load}
                className="text-xs font-bold px-4 py-2 rounded-full text-white"
                style={{ background: "#2F6FED" }}>
                Tentar novamente
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-sm">Sem resultados para "{query}".</div>
          ) : list.map((song) => (
            <div key={song.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-11 w-11 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--s2)]/10">
                {song.cover_url
                  ? <img loading="lazy" decoding="async" src={song.cover_url} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  : <div className="h-full w-full flex items-center justify-center text-xl">🎵</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{song.title}</p>
                <p className="text-white/40 text-xs truncate">{song.artist ?? song.category}</p>
              </div>
              <button onClick={() => togglePreview(song)} className="p-2 rounded-full bg-[var(--s2)]/10">
                {preview?.id === song.id
                  ? <Pause className="h-3.5 w-3.5 text-white" />
                  : <Play className="h-3.5 w-3.5 text-white" />}
              </button>
              <button onClick={() => { preview?.audio.pause(); onSelect(song); }}
                className="text-xs font-bold px-3 py-1.5 rounded-full text-white"
                style={{ background: "#2F6FED" }}>
                Usar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
