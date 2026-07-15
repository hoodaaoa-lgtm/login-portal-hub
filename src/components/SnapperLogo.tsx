import { useEffect, useState } from "react";
import { useCountry } from "@/contexts/CountryContext";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
};

const sizeMap = { sm: "text-3xl", md: "text-5xl", lg: "text-7xl", xl: "text-8xl sm:text-9xl" };
const suffixSizeMap = { sm: "text-[11px]", md: "text-[14px]", lg: "text-[18px]", xl: "text-[20px]" };

const letters = [
  { char: "S", color: "#2F6FED" },
  { char: "n", color: "#F59E0B" },
  { char: "a", color: "#1FAFA6" },
  { char: "p", color: "#6BA547" },
  { char: "p", color: "#EC4899" },
  { char: "e", color: "#FFC93C" },
  { char: "r", color: "#7F5AF0" },
];

export function SnapperLogo({ className = "", size = "lg", animate = true }: Props) {
  const [visible, setVisible] = useState(!animate);
  const { suffix, loading } = useCountry();

  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
  }, [animate]);

  return (
    <span
      aria-label={suffix ? `snapper ${suffix}` : "snapper"}
      className={`inline-flex items-end gap-1 font-extrabold tracking-tight leading-none ${sizeMap[size]} ${className}`}
      style={{ fontFamily: '"Nunito", "Quicksand", system-ui, sans-serif' }}
    >
      <span className="inline-flex">
        {letters.map((l, i) => (
          <span
            key={i}
            style={{
              color: l.color,
              display: "inline-block",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0) scale(1)" : "translateY(30px) scale(0.5)",
              transition: animate
                ? `opacity 0.45s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.1}s, transform 0.45s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.1}s`
                : "none",
              textShadow: `0 3px 14px ${l.color}44`,
            }}
          >
            {l.char}
          </span>
        ))}
      </span>

      {!loading && suffix && (
        <span
          className={`${suffixSizeMap[size]} font-black uppercase tracking-widest mb-[0.15em]`}
          style={{
            color: "#ffffff",
            background: "linear-gradient(135deg,#2F6FED,#7F5AF0)",
            borderRadius: "5px",
            padding: "1px 5px 1px 4px",
            lineHeight: 1,
            opacity: visible ? 1 : 0,
            transition: animate ? "opacity 0.4s ease 0.55s" : "none",
            letterSpacing: "0.08em",
          }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}
