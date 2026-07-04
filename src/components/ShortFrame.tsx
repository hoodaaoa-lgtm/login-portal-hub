/**
 * ShortFrame — moldura estilo "anúncio" para vídeos verticais (shorts).
 *
 * No MOBILE (< 640px): o short vai de ponta a ponta do card, sem bezel
 * nem espaço à direita — igual ao comportamento nativo do X no telemóvel
 * (o vídeo só faz "letterbox" com barras pretas se não preencher 9:16).
 *
 * A partir de sm (>= 640px): aplica o bezel preto arredondado + espaço
 * à direita, estilo anúncio.
 */
import type { ReactNode } from "react";

export function ShortFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="hooda-short-frame-outer">
        <div className="hooda-short-frame-box">
          <div className="hooda-short-frame-inner">
            {children}
          </div>
        </div>
      </div>
      <style>{`
        .hooda-short-frame-outer {
          width: 100%;
          display: flex;
        }
        .hooda-short-frame-box {
          position: relative;
          width: 100%;
          aspect-ratio: 9 / 16;
          max-height: 78vh;
          background: transparent;
          border-radius: 0;
          padding: 0;
        }
        .hooda-short-frame-inner {
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: 0;
        }
        @media (min-width: 640px) {
          .hooda-short-frame-outer {
            padding-left: 14px;
            padding-right: 8px;
            padding-top: 6px;
            padding-bottom: 10px;
          }
          .hooda-short-frame-box {
            width: auto;
            height: min(68vh, 560px);
            aspect-ratio: 9 / 17.2;
            max-height: none;
            background: #0b0b0d;
            border-radius: 26px;
            padding: 10px;
          }
          .hooda-short-frame-inner {
            border-radius: 16px;
            outline: 1.5px solid rgba(120,120,255,0.5);
            outline-offset: -1.5px;
          }
        }
      `}</style>
    </>
  );
}
