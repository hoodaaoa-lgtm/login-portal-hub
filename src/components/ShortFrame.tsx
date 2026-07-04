/**
 * ShortFrame — vídeo vertical (short) dentro do post.
 * Ocupa a largura total do post (igual a um vídeo normal do X), sem
 * caixa estreita nem moldura tipo telemóvel. O HoodaPlayer, por baixo,
 * já usa object-fit: contain, então o vídeo nunca é cortado.
 */
import type { ReactNode } from "react";

export function ShortFrame({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}
