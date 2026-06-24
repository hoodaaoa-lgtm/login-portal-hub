import { useRef, useState, useEffect, ImgHTMLAttributes } from "react";

  interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    thumbSrc?: string;
    skeletonClassName?: string;
    wrapperClassName?: string;
  }

  export function LazyImage({ src, thumbSrc, className = "", skeletonClassName = "", wrapperClassName = "", alt = "", style, ...rest }: LazyImageProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { rootMargin: "200px" });
      obs.observe(el);
      return () => obs.disconnect();
    }, []);

    return (
      <div ref={ref} className={wrapperClassName} style={wrapperClassName ? undefined : { position: "relative" }}>
        {!loaded && <div className={skeletonClassName || "absolute inset-0 animate-pulse"} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "inherit" }} />}
        {thumbSrc && !loaded && visible && (
          <img src={thumbSrc} alt="" aria-hidden className={className} style={{ filter: "blur(8px)", transform: "scale(1.05)", position: "absolute", inset: 0 }} />
        )}
        {visible && (
          <img src={src} alt={alt} className={className} loading="lazy" decoding="async"
            onLoad={() => setLoaded(true)}
            style={{ opacity: loaded ? 1 : 0, transition: "opacity 300ms var(--ease-out, cubic-bezier(0.22,1,0.36,1))", ...style }}
            {...rest}
          />
        )}
      </div>
    );
  }

  export function Img({ className = "", src, alt = "", style, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
    const [loaded, setLoaded] = useState(false);
    if (!src) return null;
    return (
      <img src={src} alt={alt} className={className} loading="lazy" decoding="async"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 250ms var(--ease-out, cubic-bezier(0.22,1,0.36,1))", ...style }}
        {...rest}
      />
    );
  }
  