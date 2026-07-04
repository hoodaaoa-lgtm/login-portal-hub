/**
 * ShortFrame — moldura estilo "anúncio" para vídeos verticais (shorts)
 * no feed: bezel preto arredondado + contorno fino + espaço à direita,
 * em vez do vídeo ocupar a largura toda do card.
 */
import type { ReactNode } from "react";

export function ShortFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full flex pl-3.5 pr-2 py-1.5">
      <div className="relative rounded-[26px] p-2.5" style={{ width: "62%", background: "#0b0b0d" }}>
        <div className="rounded-2xl overflow-hidden" style={{ outline: "1.5px solid rgba(120,120,255,0.5)", outlineOffset: "-1.5px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
