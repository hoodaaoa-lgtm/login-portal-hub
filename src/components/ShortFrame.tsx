/**
 * ShortFrame — vídeo vertical (9:16) dentro do post, ocupando a largura
 * normal do post (como um vídeo normal do X), sem moldura tipo "telemóvel".
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
      `}</style>
    </>
  );
}
