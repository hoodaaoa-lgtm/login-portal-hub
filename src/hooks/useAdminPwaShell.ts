import { useEffect } from "react";

/**
 * Ativa a identidade PWA do "Snapper Admin" enquanto o utilizador está na
 * rota de administração, e repõe a identidade do PWA principal (Snapper)
 * ao sair.
 *
 * Porquê troca dinâmica em vez de dois <link rel="manifest"> estáticos:
 * um documento só deve ter um manifest ativo de cada vez — ter os dois
 * declarados no <head> ao mesmo tempo é ambíguo (o browser só respeita
 * um). Trocar o href do link consoante a rota evita esse conflito e
 * garante que "Adicionar ao ecrã principal" no /hdequipa9x2 instala
 * sempre o PWA Admin (ícone, nome e start_url próprios), nunca o Snapper
 * normal — e vice-versa em qualquer outra página.
 *
 * O Service Worker do Admin (public/sw-admin.js) é registado aqui com
 * scope "/hdequipa9x2/", pelo que nunca intercepta pedidos fora dessa
 * rota — o Service Worker principal (public/sw.js, scope "/") continua
 * a servir o resto do site sem qualquer alteração.
 */
export function useAdminPwaShell(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const head = document.head;

    // ── 1) Manifest: troca para o do Admin ──
    let manifestLink = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifestHref = manifestLink?.getAttribute("href") ?? "/manifest.webmanifest";
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      head.appendChild(manifestLink);
    }
    manifestLink.setAttribute("href", "/hdequipa9x2-manifest.webmanifest");

    // ── 2) Ícones apple-touch-icon (iOS não lê manifest.json para "Adicionar ao ecrã principal") ──
    const appleIconLinks = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]'));
    const previousAppleIcons = appleIconLinks.map((el) => ({ el, href: el.getAttribute("href") }));
    appleIconLinks.forEach((el) => {
      const size = el.getAttribute("sizes"); // "152x152" | "180x180" | null
      const px = size ? size.split("x")[0] : "180";
      const adminSrc = ["152", "180"].includes(px) ? `/icons/admin/icon-${px}.png` : "/icons/admin/icon-180.png";
      el.setAttribute("href", adminSrc);
    });

    // ── 3) Meta theme-color / apple-mobile-web-app-title ──
    const themeMeta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = themeMeta?.getAttribute("content") ?? "#5B3FCF";
    themeMeta?.setAttribute("content", "#1a162e");

    const appleTitleMeta = head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const previousAppleTitle = appleTitleMeta?.getAttribute("content") ?? "Snapper";
    appleTitleMeta?.setAttribute("content", "Snapper Admin");

    const appNameMeta = head.querySelector<HTMLMetaElement>('meta[name="application-name"]');
    const previousAppName = appNameMeta?.getAttribute("content") ?? "Snapper";
    appNameMeta?.setAttribute("content", "Snapper Admin");

    // ── 4) Service Worker do Admin — scope isolado, não mexe no principal ──
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-admin.js", { scope: "/hdequipa9x2/" }).catch(() => {});
    }

    return () => {
      manifestLink?.setAttribute("href", previousManifestHref);
      previousAppleIcons.forEach(({ el, href }) => { if (href) el.setAttribute("href", href); });
      if (themeMeta) themeMeta.setAttribute("content", previousTheme);
      if (appleTitleMeta) appleTitleMeta.setAttribute("content", previousAppleTitle);
      if (appNameMeta) appNameMeta.setAttribute("content", previousAppName);
    };
  }, [enabled]);
}
