import { useEffect, useRef } from "react";

export const SPLASH_EXIT_MS = 600;

type Props = { leaving?: boolean };

const COLORS = ['#5B3FCF','#F26B3A','#1FAFA6','#6BA547','#E94B8A'];
const LETTERS = ['H','o','o','d','a'];

export function SplashScreen({ leaving = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t0: number | null = null;

    function resize() {
      canvas!.width  = window.innerWidth  * devicePixelRatio;
      canvas!.height = window.innerHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function ease(t: number) {
      return t < .5 ? 2*t*t : -1+(4-2*t)*t;
    }
    function spring(t: number) {
      return 1 - Math.cos(t * Math.PI * 2.2) * Math.exp(-t * 4);
    }
    function logoWidth(sz: number) {
      ctx.font = `900 ${sz}px system-ui,sans-serif`;
      return LETTERS.reduce((a, c) => a + ctx.measureText(c).width + 3, 0);
    }

    function draw(ts: number) {
      if (!t0) t0 = ts;
      const t  = (ts - t0) / 1000;
      const loop = t % 5;
      const W  = canvas!.width  / devicePixelRatio;
      const H  = canvas!.height / devicePixelRatio;
      const cx = W / 2;
      const cy = H / 2;

      ctx.clearRect(0, 0, W, H);

      const FONT_SZ = Math.min(64, W * 0.13);
      ctx.font = `900 ${FONT_SZ}px system-ui,sans-serif`;
      ctx.textBaseline = 'middle';

      const tw = logoWidth(FONT_SZ) + 4;

      // fase 1 — bolhas aparecem (0–1.5s)
      const phase1 = Math.min(1, loop / 1.5);
      // fase 2 — fundem nas letras (1.8–3.0s)
      const phase2 = Math.max(0, Math.min(1, (loop - 1.8) / 1.2));
      // fase 3 — glow suave (3.2s+)
      const phase3 = Math.max(0, Math.min(1, (loop - 3.2) / 0.6));

      // ── Bolhas de plasma ──
      if (phase2 < 1) {
        COLORS.forEach((col, i) => {
          const angle = i * (Math.PI * 2 / 5) + loop * 1.2;
          const radius = Math.min(W, H) * 0.22 * (1 - phase2);
          const bx = cx + Math.cos(angle) * radius;
          const by = cy + Math.sin(angle) * radius;
          const size = (FONT_SZ * 0.42) + Math.sin(loop * 2 + i) * (FONT_SZ * 0.07);
          ctx.beginPath();
          ctx.arc(bx, by, size * (1 - phase2 * 0.6), 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.globalAlpha = phase1 * (1 - phase2 * 0.85);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }

      // ── Letras emergem das bolhas ──
      if (phase2 > 0) {
        let x = cx - tw / 2;
        LETTERS.forEach((ch, i) => {
          ctx.font = `900 ${FONT_SZ}px system-ui,sans-serif`;
          const cw = ctx.measureText(ch).width + 3;
          const p  = Math.max(0, Math.min(1, (phase2 - i * 0.06) / 0.55));
          const sc = 0.4 + spring(p) * 0.6;
          const glowA = phase3 * 0.7;

          ctx.save();
          ctx.translate(x + cw / 2, cy);
          ctx.scale(sc, sc);
          ctx.globalAlpha = ease(p);
          ctx.fillStyle = COLORS[i];
          ctx.textAlign = 'center';
          ctx.fillText(ch, 0, 0);
          ctx.restore();
          x += cw;
        });
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <main
      role="status"
      aria-label="A carregar a Hooda"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#ffffff',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${SPLASH_EXIT_MS}ms ease-in`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </main>
  );
}
