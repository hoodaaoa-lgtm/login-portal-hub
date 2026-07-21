import { useEffect, useState } from "react";
import { useCountry } from "@/contexts/CountryContext";
import snapperIcon from "@/assets/site/snapper-icon-only.png";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
};

const iconHeightMap = { sm: 28, md: 44, lg: 68, xl: 104 };
const suffixSizeMap = { sm: "text-[11px]", md: "text-[14px]", lg: "text-[18px]", xl: "text-[20px]" };

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
      className={`inline-flex items-end gap-1 leading-none ${className}`}
    >
      <img
        src={snapperIcon}
        alt=""
        style={{
          height: iconHeightMap[size],
          width: "auto",
          display: "block",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.85)",
          transition: animate
            ? "opacity 0.45s cubic-bezier(0.34,1.56,0.64,1), transform 0.45s cubic-bezier(0.34,1.56,0.64,1)"
            : "none",
        }}
      />

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
