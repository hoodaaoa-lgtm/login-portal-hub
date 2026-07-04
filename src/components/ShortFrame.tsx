/**
 * ShortFrame — moldura estilo "anúncio" para vídeos verticais (shorts).
 *
 * Em todos os tamanhos de ecrã (incluindo mobile) o short aparece como um
 * cartão vertical mais estreito e com altura limitada, centrado no post —
 * igual ao comportamento do X/Twitter — em vez de ocupar o ecrã de ponta
 * a ponta e "comer" muito espaço ao fazer scroll.
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
          justify-content: center;
          padding: 8px 8px 10px;
        }
        .hooda-short-frame-box {
          position: relative;
          width: min(100%, 380px);
          height: auto;
          aspect-ratio: 9 / 16;
          background: #0b0b0d;
          border-radius: 18px;
          padding: 0;
        }
        .hooda-short-frame-inner {
          width: 100%;
          height: 100%;
          overflow: hidden;
          border-radius: 18px;
        }
        @media (min-width: 640px) {
          .hooda-short-frame-outer {
            padding-left: 14px;
            padding-right: 14px;
            padding-top: 6px;
            padding-bottom: 10px;
          }
          .hooda-short-frame-box {
            height: min(68vh, 560px);
            aspect-ratio: 9 / 17.2;
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
