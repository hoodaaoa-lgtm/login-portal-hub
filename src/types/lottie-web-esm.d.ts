declare module "lottie-web/build/player/esm/lottie_light.min.js" {
  const lottie: {
    loadAnimation: (params: {
      container: Element;
      renderer?: "svg" | "canvas" | "html";
      loop?: boolean;
      autoplay?: boolean;
      animationData?: unknown;
      path?: string;
    }) => { destroy: () => void; [key: string]: unknown };
    destroy: (name?: string) => void;
  };
  export default lottie;
}
