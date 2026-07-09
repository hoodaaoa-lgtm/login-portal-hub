import { HoodaLogo } from "@/components/HoodaLogo";
import womanPhonePhoto from "@/assets/auth/woman-phone.webp";
import manBeaniePhoto from "@/assets/auth/man-beanie.webp";
import womanCurlyPhoto from "@/assets/auth/woman-curly.webp";

/* ─── Shared left-side brand illustration panel (login + signup) ─── */
export function AuthLeftPanel() {
  return (
    <div className="hidden lg:flex flex-col w-[52%] min-h-screen relative overflow-hidden bg-white">

      {/* ── Decorative outline circles (scattered, brand colors) ── */}
      {/* top-right area */}
      <div style={{ position:"absolute", top:48, right:80, width:54, height:54, borderRadius:"50%", border:"2px solid #FFC93C", opacity:0.8 }} />
      <div style={{ position:"absolute", top:120, right:200, width:34, height:34, borderRadius:"50%", border:"2px solid #5B3FCF", opacity:0.5 }} />
      {/* top-center */}
      <div style={{ position:"absolute", top:30, left:"45%", width:44, height:44, borderRadius:"50%", border:"2px solid #5B3FCF", opacity:0.35 }} />
      <div style={{ position:"absolute", top:100, left:"55%", width:26, height:26, borderRadius:"50%", border:"2px solid #6BA547", opacity:0.5 }} />
      {/* left side */}
      <div style={{ position:"absolute", top:220, left:18, width:60, height:60, borderRadius:"50%", border:"2.5px solid #5B3FCF", opacity:0.18 }} />
      <div style={{ position:"absolute", top:340, left:48, width:30, height:30, borderRadius:"50%", border:"2px solid #E94B8A", opacity:0.4 }} />
      {/* bottom area */}
      <div style={{ position:"absolute", bottom:180, left:60, width:38, height:38, borderRadius:"50%", border:"2px solid #FFC93C", opacity:0.7 }} />
      <div style={{ position:"absolute", bottom:100, left:160, width:22, height:22, borderRadius:"50%", border:"2px solid #6BA547", opacity:0.55 }} />
      <div style={{ position:"absolute", bottom:80, right:100, width:42, height:42, borderRadius:"50%", border:"2px solid #E94B8A", opacity:0.3 }} />
      <div style={{ position:"absolute", bottom:40, left:"30%", width:28, height:28, borderRadius:"50%", border:"2px solid #5B3FCF", opacity:0.3 }} />
      {/* right-center */}
      <div style={{ position:"absolute", top:"50%", right:30, width:50, height:50, borderRadius:"50%", border:"2px solid #E94B8A", opacity:0.25 }} />

      {/* ── Large soft blurred bg circles (colour hints) ── */}
      <div style={{ position:"absolute", top:-60, left:-60, width:320, height:320, borderRadius:"50%", background:"rgba(91,63,207,0.05)" }} />
      <div style={{ position:"absolute", bottom:-80, right:-60, width:360, height:360, borderRadius:"50%", background:"rgba(233,75,138,0.05)" }} />

      {/* ── Content area ── */}
      <div className="relative z-10 flex flex-col justify-between h-full px-12 py-12">

        {/* Logo top-left */}
        <div>
          <HoodaLogo size="sm" animate={false} />
        </div>

        {/* Headline + subtext */}
        <div className="mt-auto mb-8">
          <h1 className="font-extrabold tracking-tight leading-[1.1]" style={{ fontSize: "clamp(36px, 4vw, 52px)", color: "#0d0d14" }}>
            Conecta.<br />
            Partilha.<br />
            <span style={{ color: "#E94B8A" }}>Descobre.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed max-w-[320px]" style={{ color: "#6b6b7a" }}>
            A tua rede social para explorar o que importa, partilhar momentos e criar conexões reais.
          </p>
        </div>

        {/* Social illustration */}
        <div className="relative" style={{ height: 320, marginBottom: 32 }}>

          {/* Main person — large circle bottom-left */}
          <div style={{
            position:"absolute", bottom:0, left:0,
            width:200, height:200, borderRadius:"50%",
            overflow:"hidden",
          }}>
            <img
              src={womanPhonePhoto}
              alt=""
              loading="lazy"
              decoding="async"
              width={200}
              height={200}
              style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
            />
          </div>

          {/* Person 2 — top-center circle */}
          <div style={{
            position:"absolute", top:0, left:"38%",
            width:120, height:120, borderRadius:"50%",
            overflow:"hidden",
          }}>
            <img
              src={manBeaniePhoto}
              alt=""
              loading="lazy"
              decoding="async"
              width={120}
              height={120}
              style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
            />
          </div>

          {/* Person 3 — bottom-center circle */}
          <div style={{
            position:"absolute", bottom:20, left:"42%",
            width:110, height:110, borderRadius:"50%",
            overflow:"hidden",
          }}>
            <img
              src={womanCurlyPhoto}
              alt=""
              loading="lazy"
              decoding="async"
              width={110}
              height={110}
              style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
            />
          </div>

          {/* Dashed connection lines (SVG overlay) */}
          <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}
            viewBox="0 0 400 320" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 100 180 Q 180 120 210 60" stroke="#5B3FCF" strokeWidth="1.5" strokeDasharray="6,5" fill="none" opacity="0.35"/>
            <path d="M 100 180 Q 200 200 220 230" stroke="#5B3FCF" strokeWidth="1.5" strokeDasharray="6,5" fill="none" opacity="0.35"/>
            <path d="M 210 60 Q 280 140 220 230" stroke="#5B3FCF" strokeWidth="1.5" strokeDasharray="6,5" fill="none" opacity="0.25"/>
          </svg>

          {/* Feature icon bubbles */}
          {/* Chat bubble — pink */}
          <div style={{
            position:"absolute", top:80, left:"22%",
            width:44, height:44, borderRadius:"50%",
            background:"#E94B8A",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 12px rgba(233,75,138,0.4)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          {/* Community — purple */}
          <div style={{
            position:"absolute", top:"50%", left:"55%",
            width:44, height:44, borderRadius:"50%",
            background:"#5B3FCF",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 12px rgba(91,63,207,0.4)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          {/* Heart — yellow */}
          <div style={{
            position:"absolute", bottom:60, left:"8%",
            width:40, height:40, borderRadius:"50%",
            background:"#FFC93C",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 12px rgba(255,201,60,0.4)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          {/* Share — teal */}
          <div style={{
            position:"absolute", bottom:50, left:"28%",
            width:40, height:40, borderRadius:"50%",
            background:"#1FAFA6",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 12px rgba(31,175,166,0.4)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </div>
          {/* Emoji — green */}
          <div style={{
            position:"absolute", bottom:30, left:"58%",
            width:36, height:36, borderRadius:"50%",
            background:"#6BA547",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 12px rgba(107,165,71,0.4)",
            fontSize:18,
          }}>
            😊
          </div>
        </div>

        {/* Bottom copyright */}
        <p className="text-[11px] text-neutral-400">© 2026 Hooda · Todos os direitos reservados</p>
      </div>
    </div>
  );
}
