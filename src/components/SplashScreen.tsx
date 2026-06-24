import { useEffect, useState } from "react";
import { HoodaLogo } from "@/components/HoodaLogo";

type Props = {
  /**
   * When true, the splash plays its fade-out transition instead of being
   * removed instantly. The parent should keep this component mounted for
   * EXIT_MS after setting this to true, then unmount it.
   */
  leaving?: boolean;
};

/** Must match the transition duration used for the leaving state below. */
export const SPLASH_EXIT_MS = 450;

/**
 * Full-screen branded splash, shown only while the very first session
 * check is in flight (app boot / hard refresh). Clean, minimal treatment —
 * white background, centered wordmark with a slow, deliberate fade/scale-in
 * and a matching fade-out on exit, no spinners or bouncing dots — matching
 * the understated splash pattern used by Instagram, Facebook and TikTok.
 */
export function SplashScreen({ leaving = false }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Next frame, so the transition actually animates instead of starting
    // in its end state.
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = visible && !leaving;

  return (
    <main
      className="fixed inset-0 z-50 flex min-h-screen w-full items-center justify-center bg-white"
      role="status"
      aria-live="polite"
      aria-label="A carregar a hooda"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${SPLASH_EXIT_MS}ms ease-in`,
      }}
    >
      <div
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "scale(1)" : "scale(0.9)",
          transition: "opacity 1.1s cubic-bezier(0.16,1,0.3,1), transform 1.1s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <HoodaLogo size="lg" animate={false} />
      </div>
    </main>
  );
}
