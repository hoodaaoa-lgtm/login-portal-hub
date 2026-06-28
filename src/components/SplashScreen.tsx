import { useEffect, useRef } from "react";

export const SPLASH_EXIT_MS = 600;

type Props = { leaving?: boolean };

const COLORS  = ['#5B3FCF','#F26B3A','#1FAFA6','#6BA547','#E94B8A'];
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

    function ease(t: number) { return t < .5 ? 2*t*t : -1+(4-2*t)*t; }
    function spring(t: number) { return 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 5); }

    /* Desenha o H arredondado roxo usando paths */
    function drawH(cx: number, cy: number, size: number, alpha: number, scale: number) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      const w  = size * 0.68;   // largura total do H
      const h  = size * 0.72;   // altura total
      const sw = size * 0.18;   // espessura do traço
      const r  = sw * 0.55;     // raio de arredondamento

      ctx.fillStyle = '#7B4FFF';

      // perna esquerda
      roundRect(ctx, -w/2, -h/2, sw, h, r);
      // perna direita
      roundRect(ctx, w/2 - sw, -h/2, sw, h, r);
      // travessão central
      roundRect(ctx, -w/2 + sw, -sw*0.5, w - sw*2, sw, r * 0.5);

      ctx.restore();
    }

    function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
      c.fill();
    }

    function draw(ts: number) {
      if (!t0) t0 = ts;
      const t    = (ts - t0) / 1000;
      const loop = t % 5;
      const W    = canvas!.width  / devicePixelRatio;
      const H    = canvas!.height / devicePixelRatio;
      const cx   = W / 2;
      const cy   = H / 2;

      ctx.clearRect(0, 0, W, H);

      const ICON_SZ   = Math.min(W, H) * 0.22;   // tamanho do H
      const FONT_SZ   = Math.min(52, W * 0.10);   // tamanho do "Hooda"
      const GAP       = ICON_SZ * 0.55;           // espaço entre H e texto

      // fases — mantém duração original 5s
      const phase1 = Math.min(1, loop / 0.6);                                   // H aparece
      const phase2 = Math.max(0, Math.min(1, (loop - 0.7) / 0.8));              // H solta glow
      const phase3 = Math.max(0, Math.min(1, (loop - 1.0) / 0.9));              // letras surgem
      const pulse  = 0.92 + Math.sin(loop * 1.8) * 0.04;                        // pulso suave

      // ── Glow roxo atrás do H ──
      if (phase2 > 0) {
        const glowR = ICON_SZ * 0.9 * (1 + phase2 * 0.3);
        const grd = ctx.createRadialGradient(cx, cy - GAP * 0.15, 0, cx, cy - GAP * 0.15, glowR);
        grd.addColorStop(0, `rgba(91,63,207,${0.18 * phase2})`);
        grd.addColorStop(1, 'rgba(91,63,207,0)');
        ctx.beginPath();
        ctx.arc(cx, cy - GAP * 0.15, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // ── H roxo arredondado ──
      const hScale = spring(phase1) * pulse;
      drawH(cx, cy - GAP * 0.55, ICON_SZ, phase1, hScale);

      // ── "Hooda" com cada letra na sua cor ──
      if (phase3 > 0) {
        ctx.font = `900 ${FONT_SZ}px system-ui,sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        // calcular largura total
        let tw = 0;
        LETTERS.forEach(ch => { tw += ctx.measureText(ch).width + 2; });
        let x = cx - tw / 2;
        const ty = cy + GAP * 0.55;

        LETTERS.forEach((ch, i) => {
          ctx.font = `900 ${FONT_SZ}px system-ui,sans-serif`;
          const cw = ctx.measureText(ch).width + 2;
          const p  = Math.max(0, Math.min(1, (phase3 - i * 0.08) / 0.55));
          const sc = spring(p);
          const ay = (1 - ease(p)) * 18;

          ctx.save();
          ctx.translate(x + cw / 2, ty + ay);
          ctx.scale(sc, sc);
          ctx.globalAlpha = ease(p);
          ctx.fillStyle   = COLORS[i];
          ctx.textAlign   = 'center';
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
