import { useEffect, useState } from "react";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
};

const sizeMap = {
  sm: "text-3xl",
  md: "text-5xl",
  lg: "text-7xl",
  xl: "text-8xl sm:text-9xl",
};

const letters = [
  { char: "h", color: "#5B3FCF" },
  { char: "o", color: "#F26B3A" },
  { char: "o", color: "#1FAFA6" },
  { char: "d", color: "#6BA547" },
  { char: "a", color: "#E94B8A" },
];

export function HoodaLogo({ className = "", size = "lg", animate = true }: Props) {
  const [visible, setVisible] = useState(!animate);

  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
  }, [animate]);

  return (
    <span
      aria-label="hooda"
      className={`inline-flex font-extrabold tracking-tight leading-none lowercase ${sizeMap[size]} ${className}`}
      style={{ fontFamily: '"Nunito", "Quicksand", system-ui, sans-serif' }}
    >
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
  );
}
