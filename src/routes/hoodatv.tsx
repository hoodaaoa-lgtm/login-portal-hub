import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { BottomNav, SideNav, PageWrapper } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Search, Play, Star, Users, UserPlus, X, Sparkles,
  Clapperboard, CheckCircle2, Video, Share2, Bookmark,
  Flag, ThumbsDown, MoreVertical, ChevronRight, TrendingUp,
} from "lucide-react";

/* ══ INTRO ══ */
const INTRO_KEY = "hoodatv_intro_seen";
const INTRO_DURATION = 3000;
let _introSeenThisSession = (() => { try { return !!sessionStorage.getItem(INTRO_KEY); } catch { return false; } })();
const HOODA_LETTERS = [
  { char: "H", color: "#5B3FCF" }, { char: "o", color: "#F26B3A" },
  { char: "o", color: "#1FAFA6" }, { char: "d", color: "#6BA547" },
  { char: "a", color: "#E94B8A" },
];
const DOT_COLORS = ["#5B3FCF","#F26B3A","#1FAFA6","#6BA547","#E94B8A"];

function HoodaTVIntro({ onDone }: { onDone: () => void }) {
  const [letterIn, setLetterIn] = useState<boolean[]>(Array(5).fill(false));
  const [tvIn, setTvIn] = useState(false);
  const [dotsIn, setDotsIn] = useState<boolean[]>(Array(5).fill(false));
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t: ReturnType<typeof setTimeout>[] = [];
    HOODA_LETTERS.forEach((_, i) => t.push(setTimeout(() =>
      setLetterIn(p => { const n=[...p]; n[i]=true; return n; }), 200 + i*130)));
    t.push(setTimeout(() => setTvIn(true), 200+5*130+80));
    DOT_COLORS.forEach((_, i) => t.push(setTimeout(() =>
      setDotsIn(p => { const n=[...p]; n[i]=true; return n; }), 200+5*130+400+i*80)));
    t.push(setTimeout(() => setExiting(true), INTRO_DURATION-600));
    t.push(setTimeout(() => onDone(), INTRO_DURATION));
    return () => { t.forEach(clearTimeout); document.body.style.overflow = prev; };
  }, [onDone]);
  return createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"var(--s1)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      opacity:exiting?0:1, transition:exiting?"opacity 0.6s ease-in":"none", pointerEvents:exiting?"none":"all" }}>
      <div style={{ display:"flex", alignItems:"center" }}>
        {HOODA_LETTERS.map((l,i) => (
          <span key={i} style={{ display:"inline-block", fontFamily:'"Nunito","Quicksand",system-ui,sans-serif',
            fontWeight:900, fontSize:"clamp(3.2rem,11vw,6rem)", lineHeight:1, color:l.color,
            opacity:letterIn[i]?1:0, transform:letterIn[i]?"translateY(0)":"translateY(-40px)",
            transition:letterIn[i]?`opacity .45s ease,transform .5s cubic-bezier(.34,1.56,.64,1)`:"none" }}>{l.char}</span>
        ))}
        <span style={{ display:"inline-block", fontFamily:'"Nunito","Quicksand",system-ui,sans-serif',
          fontWeight:900, fontSize:"clamp(1.1rem,3.5vw,1.8rem)", letterSpacing:"0.18em", color:"#fff",
          background:"linear-gradient(135deg,#5B3FCF,#E94B8A)", padding:"5px 12px 7px", borderRadius:"8px",
          marginLeft:"10px", alignSelf:"center", opacity:tvIn?1:0, transform:tvIn?"scale(1)":"scale(0)",
          transition:tvIn?"opacity .4s ease,transform .5s cubic-bezier(.34,1.56,.64,1)":"none" }}>TV</span>
      </div>
      <div style={{ display:"flex", gap:"8px", marginTop:"16px" }}>
        {DOT_COLORS.map((color,i) => (
          <span key={i} style={{ width:"8px", height:"8px", borderRadius:"50%", background:color,
            display:"inline-block", opacity:dotsIn[i]?1:0, transform:dotsIn[i]?"scale(1)":"scale(0)",
            transition:dotsIn[i]?"opacity .3s ease,transform .4s cubic-bezier(.34,1.56,.64,1)":"none" }} />
        ))}
      </div>
    </div>, document.body
  );
}

export const Route = createFileRoute("/hoodatv")({
  head: () => ({ meta: [{ title: "HoodaTV — Hooda" }] }),
  component: HoodaTVPage,
});

/* ── Tokens ── */
const P      = "#5B3FCF";
const PINK   = "#E94B8A";
const ORANGE = "#F26B3A";
const TEAL   = "#1FAFA6";
const GREEN  = "#6BA547";
const GRAD   = `linear-gradient(135deg,${P},${PINK})`;
const AVATAR_COLORS = [P, ORANGE, TEAL, GREEN, PINK];

/* ── Queries ── */
function useMe() {
  return useQuery({ queryKey:["htv-me"], queryFn: async () => (await supabase.auth.getUser()).data.user??null, staleTime:60_000 });
}
function useChannels() {
  return useQuery({ queryKey:["htv-channels"], queryFn: async () => {
    const { data } = await (supabase as any).from("channels").select("id,name,handle,avatar_url,description,category").order("created_at",{ascending:false}).limit(20);
    return data??[];
  }, staleTime:60_000 });
}
function useVideos(sort:"views"|"recent") {
  return useQuery({ queryKey:["htv-videos",sort], queryFn: async () => {
    const { data } = await (supabase as any).from("videos")
      .select("id,title,thumbnail_url,duration_seconds,views_count,likes_count,created_at,published_at,channel_id,cf_embed_url,cf_stream_uid,cf_stream_url,channels(name,handle,avatar_url)")
      .eq("status","published").eq("visibility","public")
      .order(sort==="views"?"views_count":"created_at",{ascending:false}).limit(18);
    return (data??[]).map((v:any) => ({...v, channel:v.channels}));
  }, staleTime:120_000 });
}
function useFollowing(userId:string|null) {
  return useQuery({ queryKey:["htv-following",userId], queryFn: async () => {
    if(!userId) return [] as string[];
    const { data } = await (supabase as any).from("follows").select("following_id").eq("follower_id",userId).limit(50);
    return (data??[]).map((f:any) => f.following_id as string);
  }, enabled:!!userId, staleTime:30_000 });
}

/* ── Helpers ── */
const fmtDur = (s:number|null) => {
  if(!s) return "";
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h>0?`${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${m}:${String(sec).padStart(2,"0")}`;
};
const fmtV = (n:number) => n>=1_000_000?`${(n/1_000_000).toFixed(1)}M`:n>=1_000?`${(n/1_000).toFixed(0)}K`:String(n);
const timeAgo = (d:string) => {
  const diff=Date.now()-new Date(d).getTime(),m=Math.floor(diff/60_000);
  if(m<60) return `${m}m`; const h=Math.floor(m/60); if(h<24) return `${h}h`;
  const days=Math.floor(h/24); if(days<30) return `${days}d`;
  return `${Math.floor(days/30)} meses`;
};
const avatarColor = (name:string) => AVATAR_COLORS[(name?.charCodeAt(0)??0)%AVATAR_COLORS.length];
const cleanTitle = (t:string|null) => (t??"").replace(/\b\d{10,}\b/g,"").replace(/@\S+/g,"").replace(/\s{2,}/g," ").trim();

/* ── Video Menu ── */
function VideoMenu({ v }: { v:any }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if(!open) return;
    const h = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return () => document.removeEventListener("mousedown",h);
  },[open]);
  const items = [
    { icon:<Share2 className="w-4 h-4"/>, label:"Partilhar", action:() => {
      navigator.clipboard.writeText(`${window.location.origin}/hoodatv/watch/${v.id}`)
        .then(()=>toast.success("Link copiado!")).catch(()=>toast.error("Erro ao copiar"));
      setOpen(false);
    }},
    { icon:<Bookmark className="w-4 h-4"/>, label:"Guardar", action:async()=>{
      setOpen(false);
      const { data:{user} } = await supabase.auth.getUser();
      if(!user){toast.error("Inicia sessão primeiro");return;}
      const {error} = await (supabase as any).from("saved_videos").upsert({user_id:user.id,video_id:v.id},{onConflict:"user_id,video_id"});
      if(error) toast.error("Erro ao guardar"); else toast.success("Guardado!");
    }},
    { icon:<ThumbsDown className="w-4 h-4"/>, label:"Não tenho interesse", action:()=>{setOpen(false);toast("Ocultado");}},
    { icon:<Flag className="w-4 h-4"/>, label:"Denunciar", action:()=>{setOpen(false);toast("Denúncia enviada");}},
  ];
  return (
    <div ref={ref} className="relative" onClick={e=>e.stopPropagation()}>
      <button onClick={()=>setOpen(o=>!o)}
        className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
        style={{color:"var(--text-muted)"}}>
        <MoreVertical className="w-4 h-4"/>
      </button>
      {open && (
        <div className="absolute right-0 bottom-9 z-50 w-52 rounded-2xl overflow-hidden shadow-2xl py-1"
          style={{background:"var(--s0)",border:"1px solid var(--border-subtle)"}}>
          {items.map(item=>(
            <button key={item.label} onClick={item.action}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left transition hover:bg-[var(--s2)]"
              style={{color:"var(--text-primary)"}}>
              <span style={{color:"var(--text-muted)"}}>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Video Card — estilo YouTube limpo ── */
function VideoCard({ v }: { v:any }) {
  const navigate = useNavigate();
  const ch = v.channel;
  const bg = avatarColor(ch?.name??"");
  return (
    <div className="group cursor-pointer" onClick={() => navigate({to:"/hoodatv/watch/$id",params:{id:v.id}})}>
      {/* Thumbnail */}
      <div className="relative overflow-hidden rounded-xl" onContextMenu={e=>e.preventDefault()}
        style={{aspectRatio:"16/9", background:`linear-gradient(135deg,${bg}22,${bg}11)`}}>
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt={v.title} loading="lazy" onContextMenu={e=>e.preventDefault()}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"/>
          : <div className="w-full h-full flex items-center justify-center">
              <Play className="w-10 h-10" style={{color:bg,opacity:0.4}}/>
            </div>}
        {/* Overlay escuro hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300"/>
        {/* Duração */}
        {v.duration_seconds && (
          <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white px-1.5 py-0.5 rounded-md"
            style={{background:"rgba(0,0,0,0.88)"}}>
            {fmtDur(v.duration_seconds)}
          </span>
        )}
        {/* Play hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-2xl"
            style={{background:"rgba(255,255,255,0.92)"}}>
            <Play className="w-5 h-5 ml-0.5" style={{color:P}} fill={P}/>
          </div>
        </div>
      </div>
      {/* Meta */}
      <div className="flex gap-2.5 mt-3">
        <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold cursor-pointer mt-0.5"
          style={{background:bg}}
          onClick={e=>{e.stopPropagation();if(ch?.handle)navigate({to:"/hoodatv/canal/$handle",params:{handle:ch.handle}})}}>
          {ch?.avatar_url?<img src={ch.avatar_url} alt="" className="w-full h-full object-cover"/>:(ch?.name?.[0]??"?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 flex items-start gap-1">
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold leading-snug line-clamp-2 mb-0.5" style={{color:"var(--text-primary)"}}>
              {cleanTitle(v.title)}
            </p>
            <p className="text-[12px] font-medium hover:underline cursor-pointer" style={{color:P}}
              onClick={e=>{e.stopPropagation();if(ch?.handle)navigate({to:"/hoodatv/canal/$handle",params:{handle:ch.handle}})}}>
              {ch?.name??"Canal"}
            </p>
            <p className="text-[11px]" style={{color:"var(--text-muted)"}}>
              {fmtV(Number(v.views_count??0))} views · {timeAgo(v.published_at??v.created_at)}
            </p>
          </div>
          <div className="shrink-0 -mt-0.5"><VideoMenu v={v}/></div>
        </div>
      </div>
    </div>
  );
}

/* ── Netflix Card — card grande horizontal estilo Netflix ── */
function NetflixCard({ v, index }: { v:any; index:number }) {
  const navigate = useNavigate();
  const ch = v.channel;
  const bg = avatarColor(ch?.name??"");
  return (
    <div className="group relative shrink-0 cursor-pointer rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 hover:z-10 hover:shadow-2xl"
      style={{width:"clamp(160px,22vw,240px)", aspectRatio:"16/9", background:`linear-gradient(135deg,${bg}33,${bg}11)`}}
      onClick={()=>navigate({to:"/hoodatv/watch/$id",params:{id:v.id}})}>
      {v.thumbnail_url
        ? <img src={v.thumbnail_url} alt={v.title} loading="lazy"
            className="w-full h-full object-cover"/>
        : <div className="w-full h-full flex items-center justify-center">
            <Play className="w-8 h-8" style={{color:bg,opacity:0.5}}/>
          </div>}
      {/* Gradient info overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
      {/* Número */}
      <div className="absolute top-2 left-2 text-white font-black text-sm opacity-60"
        style={{textShadow:"0 2px 8px rgba(0,0,0,0.8)"}}>
        {String(index+1).padStart(2,"0")}
      </div>
      {/* Info no hover */}
      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
        <p className="text-white text-xs font-bold line-clamp-2 leading-tight">{cleanTitle(v.title)}</p>
        <p className="text-white/60 text-[10px] mt-0.5">{fmtV(Number(v.views_count??0))} views</p>
      </div>
      {/* Duração */}
      {v.duration_seconds && (
        <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md group-hover:opacity-0 transition-opacity"
          style={{background:"rgba(0,0,0,0.8)"}}>
          {fmtDur(v.duration_seconds)}
        </span>
      )}
    </div>
  );
}

/* ── Netflix Row ── */
function NetflixRow({ title, icon, videos }: { title:string; icon:React.ReactNode; videos:any[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <span style={{color:P}}>{icon}</span>
        <h2 className="text-base font-extrabold tracking-tight" style={{color:"var(--text-primary)"}}>{title}</h2>
        <ChevronRight className="w-4 h-4 ml-auto" style={{color:"var(--text-muted)"}}/>
      </div>
      <div ref={rowRef} className="flex gap-3 overflow-x-auto no-scrollbar pb-2"
        style={{scrollSnapType:"x mandatory"}}>
        {videos.map((v,i) => (
          <div key={v.id} style={{scrollSnapAlign:"start"}}>
            <NetflixCard v={v} index={i}/>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Hero Banner — vídeo em destaque estilo Netflix ── */
function HeroBanner({ v }: { v:any }) {
  const navigate = useNavigate();
  const ch = v.channel;
  const bg = avatarColor(ch?.name??"");
  return (
    <div className="relative w-full overflow-hidden cursor-pointer mb-8"
      style={{aspectRatio:"21/9", minHeight:180, maxHeight:380, borderRadius:16, background:`linear-gradient(135deg,${bg}44,${bg}11)`}}
      onClick={()=>navigate({to:"/hoodatv/watch/$id",params:{id:v.id}})}>
      {v.thumbnail_url && (
        <img src={v.thumbnail_url} alt={v.title}
          className="absolute inset-0 w-full h-full object-cover"/>
      )}
      {/* Gradiente sobre a imagem */}
      <div className="absolute inset-0" style={{background:"linear-gradient(to right,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.3) 50%,transparent 100%)"}}/>
      <div className="absolute inset-0" style={{background:"linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 50%)"}}/>
      {/* Conteúdo */}
      <div className="absolute bottom-0 left-0 p-5 sm:p-8 max-w-lg">
        {ch && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center text-white text-[9px] font-bold"
              style={{background:bg}}>
              {ch.avatar_url?<img src={ch.avatar_url} className="w-full h-full object-cover" alt=""/>:(ch.name?.[0]??"?").toUpperCase()}
            </div>
            <span className="text-white/80 text-xs font-semibold">{ch.name}</span>
          </div>
        )}
        <h1 className="text-white font-black text-xl sm:text-3xl leading-tight mb-2 line-clamp-2"
          style={{textShadow:"0 2px 12px rgba(0,0,0,0.6)"}}>
          {cleanTitle(v.title)}
        </h1>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition active:scale-95"
            style={{background:GRAD, boxShadow:`0 4px 16px ${P}55`}}
            onClick={e=>{e.stopPropagation();navigate({to:"/hoodatv/watch/$id",params:{id:v.id}})}}>
            <Play className="w-4 h-4" fill="white"/> Ver agora
          </button>
          <span className="text-white/60 text-xs">
            {fmtV(Number(v.views_count??0))} views · {timeAgo(v.published_at??v.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Channel Card ── */
function ChannelCard({ ch, isFollowing, onFollow }: { ch:any; isFollowing:boolean; onFollow:()=>void }) {
  const navigate = useNavigate();
  const bg = avatarColor(ch.name??"");
  return (
    <div className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{background:"var(--s0)",border:"1.5px solid var(--border-subtle)"}}
      onClick={()=>navigate({to:"/hoodatv/canal/$handle",params:{handle:ch.handle}})}>
      <div className="h-14 w-full relative overflow-hidden"
        style={{background:`linear-gradient(135deg,${bg}dd,${bg}66)`}}>
        <div className="absolute inset-0 opacity-20"
          style={{backgroundImage:`radial-gradient(circle at 20% 50%,rgba(255,255,255,0.3) 1px,transparent 1px)`,backgroundSize:"18px 18px"}}/>
      </div>
      <div className="flex flex-col items-center px-3 pb-4" style={{marginTop:"-26px"}}>
        <div className="relative mb-2">
          <div className="w-[52px] h-[52px] rounded-full overflow-hidden flex items-center justify-center text-white text-base font-extrabold shadow-lg"
            style={{background:bg,outline:"3px solid var(--s0)"}}>
            {ch.avatar_url?<img src={ch.avatar_url} alt="" className="w-full h-full object-cover"/>:(ch.name?.[0]??"?").toUpperCase()}
          </div>
          {isFollowing && (
            <div className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center"
              style={{width:18,height:18,background:GREEN,border:"2px solid var(--s0)"}}>
              <CheckCircle2 className="w-2.5 h-2.5 text-white"/>
            </div>
          )}
        </div>
        <p className="text-[13px] font-bold truncate w-full text-center mb-0.5" style={{color:"var(--text-primary)"}}>{ch.name}</p>
        <p className="text-[11px] mb-3" style={{color:P}}>@{ch.handle}</p>
        <button onClick={e=>{e.stopPropagation();onFollow();}}
          className="w-full h-7 rounded-full text-[12px] font-bold transition-all active:scale-95"
          style={isFollowing
            ?{background:"var(--s2)",color:"var(--text-secondary)",border:"1.5px solid var(--border-default)"}
            :{background:GRAD,color:"#fff",boxShadow:`0 3px 10px ${P}40`}}>
          {isFollowing?"A seguir ✓":"+  Seguir"}
        </button>
      </div>
    </div>
  );
}

/* ── Filters ── */
const FILTERS = [
  { key:"videos",   label:"Vídeos",   icon:<Video className="w-3.5 h-3.5"/>,     accent:P      },
  { key:"ti",       label:"Para Ti",  icon:<Sparkles className="w-3.5 h-3.5"/>,  accent:PINK   },
  { key:"canais",   label:"Canais",   icon:<Star className="w-3.5 h-3.5"/>,      accent:ORANGE },
  { key:"seguindo", label:"Seguindo", icon:<Users className="w-3.5 h-3.5"/>,     accent:TEAL   },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

/* ══ PAGE ══ */
function HoodaTVPage() {
  const pathname = useRouterState({select:s=>s.location.pathname});
  if(pathname !== "/hoodatv") return <Outlet/>;
  return <HoodaTVMain/>;
}

function HoodaTVMain() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("videos");
  const [showIntro, setShowIntro] = useState(()=>!_introSeenThisSession);
  const handleIntroDone = () => {
    _introSeenThisSession=true;
    try{sessionStorage.setItem(INTRO_KEY,"1");}catch{}
    setShowIntro(false);
  };
  const { data:me }                     = useMe();
  const { data:trending, isLoading:tL } = useVideos("views");
  const { data:recent,   isLoading:rL } = useVideos("recent");
  const { data:channels, isLoading:cL } = useChannels();
  const { data:followingIds=[] }         = useFollowing(me?.id??null);
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase.channel("hoodatv-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"videos"},()=>qc.invalidateQueries({queryKey:["htv-videos"]}))
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"channels"},()=>qc.invalidateQueries({queryKey:["htv-channels"]}))
      .on("postgres_changes",{event:"*",schema:"public",table:"follows"},()=>{if(me?.id)qc.invalidateQueries({queryKey:["htv-following",me.id]});})
      .subscribe();
    return ()=>{supabase.removeChannel(ch);};
  },[qc,me?.id]);

  function toggleFollow(chId:string) {
    qc.setQueryData(["htv-following",me?.id],(old:string[]=[])=>old.includes(chId)?old.filter(id=>id!==chId):[...old,chId]);
    if(me){
      if(followingIds.includes(chId)) (supabase as any).from("follows").delete().eq("follower_id",me.id).eq("following_id",chId);
      else (supabase as any).from("follows").insert({follower_id:me.id,following_id:chId});
    }
  }

  const searchVideos = search
    ?(trending??[]).filter((v:any)=>v.title?.toLowerCase().includes(search.toLowerCase())||v.channel?.name?.toLowerCase().includes(search.toLowerCase()))
    :[];
  const hero = trending?.[0];

  return (
    <>
      <SideNav/>
      <PageWrapper className="pb-20 lg:pb-0">
        {showIntro && <HoodaTVIntro onDone={handleIntroDone}/>}

        {/* HEADER */}
        <div className="sticky top-0 z-40"
          style={{background:"rgba(var(--s1-rgb,250,250,252),.95)",backdropFilter:"blur(24px)",borderBottom:"1px solid var(--border-subtle)"}}>
          <div className="flex items-center gap-3 px-4 py-3 max-w-6xl mx-auto">
            {/* Logo HoodaTV compacto */}
            <span className="font-black text-base tracking-tight shrink-0" style={{background:GRAD,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              HoodaTV
            </span>
            {/* Search */}
            <div className="flex items-center gap-2 rounded-full px-3.5 h-9 flex-1 max-w-sm transition-all"
              style={{background:"var(--s2)",border:`1.5px solid ${search?"var(--border-strong)":"var(--border-subtle)"}`}}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{color:"var(--text-muted)"}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Pesquisar…"
                className="flex-1 bg-transparent text-[13px] outline-none min-w-0"
                style={{color:"var(--text-primary)"}}/>
              {search && <button onClick={()=>setSearch("")}><X className="w-3.5 h-3.5" style={{color:"var(--text-muted)"}}/></button>}
            </div>
            {/* Filtros */}
            {!search && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {FILTERS.map(f=>{
                  const active=filter===f.key;
                  return (
                    <button key={f.key} onClick={()=>setFilter(f.key)}
                      className="shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-semibold transition-all active:scale-95"
                      style={active
                        ?{background:f.accent,color:"#fff",boxShadow:`0 2px 10px ${f.accent}50`}
                        :{background:"var(--s2)",color:"var(--text-secondary)",border:"1px solid var(--border-subtle)"}}>
                      {f.icon}{f.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">

          {/* SEARCH */}
          {search && (
            <section>
              <p className="text-xs font-semibold mb-5" style={{color:"var(--text-muted)"}}>
                {searchVideos.length>0?`${searchVideos.length} resultado${searchVideos.length!==1?"s":""} para "${search}"`:  `Sem resultados para "${search}"`}
              </p>
              {searchVideos.length>0
                ? <Grid>{searchVideos.map((v:any)=><VideoCard key={v.id} v={v}/>)}</Grid>
                : <Empty msg="Tenta outras palavras."/>}
            </section>
          )}

          {/* VÍDEOS */}
          {!search && filter==="videos" && (
            <>
              {/* Hero */}
              {hero && !tL && <HeroBanner v={hero}/>}

              {/* Row Netflix — Em Alta */}
              {!tL && trending && trending.length>1 && (
                <NetflixRow
                  title="Em Alta"
                  icon={<TrendingUp className="w-4 h-4"/>}
                  videos={trending.slice(1)}
                />
              )}

              {/* Grid YouTube — Recentes */}
              {!rL && recent && recent.length>0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-base font-extrabold" style={{color:"var(--text-primary)"}}>Recentes</h2>
                  </div>
                  <Grid>{recent.map((v:any)=><VideoCard key={v.id} v={v}/>)}</Grid>
                </div>
              )}

              {tL && <Grid>{Array.from({length:6}).map((_,i)=><VSkel key={i}/>)}</Grid>}
            </>
          )}

          {/* PARA TI */}
          {!search && filter==="ti" && (
            <section>
              {rL
                ?<Grid>{Array.from({length:9}).map((_,i)=><VSkel key={i}/>)}</Grid>
                :!recent?.length
                  ?<Empty msg="Ainda não há vídeos publicados."/>
                  :<Grid>{[...(recent??[])].sort(()=>Math.random()-.5).map((v:any)=><VideoCard key={v.id} v={v}/>)}</Grid>}
            </section>
          )}

          {/* CANAIS */}
          {!search && filter==="canais" && (
            <section>
              <p className="text-xs font-bold mb-4 uppercase tracking-wider" style={{color:"var(--text-muted)"}}>Criadores</p>
              {cL
                ?<ChannelSkel/>
                :!channels?.length
                  ?<Empty msg="Nenhum canal disponível." icon={<Clapperboard className="w-9 h-9"/>}/>
                  :<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {channels.map((ch:any)=>(
                      <ChannelCard key={ch.id} ch={ch}
                        isFollowing={followingIds.includes(ch.id)}
                        onFollow={()=>toggleFollow(ch.id)}/>
                    ))}
                  </div>}
            </section>
          )}

          {/* SEGUINDO */}
          {!search && filter==="seguindo" && (
            <section>
              {!me
                ?<Empty msg="Inicia sessão para ver os canais que segues."/>
                :followingIds.length===0
                  ?<div className="rounded-3xl p-12 text-center" style={{background:"var(--s2)",border:"1.5px solid var(--border-subtle)"}}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:`${P}12`}}>
                      <UserPlus className="w-8 h-8" style={{color:P}}/>
                    </div>
                    <p className="text-base font-bold mb-1" style={{color:"var(--text-primary)"}}>Ainda não segues nenhum canal</p>
                    <p className="text-sm mb-6" style={{color:"var(--text-muted)"}}>Descobre criadores no separador Canais.</p>
                    <button onClick={()=>setFilter("canais")}
                      className="px-6 py-2.5 rounded-full text-sm font-bold text-white"
                      style={{background:GRAD,boxShadow:`0 4px 14px ${P}44`}}>
                      Ver canais
                    </button>
                  </div>
                  :<Empty msg="Os canais que segues ainda não publicaram vídeos."/>}
            </section>
          )}
        </div>
        <BottomNav/>
      </PageWrapper>
    </>
  );
}

function Grid({children}:{children:React.ReactNode}){
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">{children}</div>;
}
function Empty({msg,icon}:{msg:string;icon?:React.ReactNode}){
  return (
    <div className="py-16 text-center rounded-3xl" style={{background:"var(--s2)",border:"1.5px solid var(--border-subtle)"}}>
      <div className="flex justify-center mb-3" style={{color:"var(--text-muted)"}}>{icon??<Play className="w-9 h-9"/>}</div>
      <p className="text-sm" style={{color:"var(--text-muted)"}}>{msg}</p>
    </div>
  );
}
function VSkel(){
  return (
    <div className="animate-pulse">
      <div className="rounded-xl" style={{aspectRatio:"16/9",background:"var(--s3)"}}/>
      <div className="flex gap-2.5 mt-3">
        <div className="w-8 h-8 rounded-full shrink-0" style={{background:"var(--s3)"}}/>
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3 rounded-full" style={{background:"var(--s3)",width:"85%"}}/>
          <div className="h-2.5 rounded-full" style={{background:"var(--s3)",width:"55%"}}/>
        </div>
      </div>
    </div>
  );
}
function ChannelSkel(){
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {Array.from({length:5}).map((_,i)=>(
        <div key={i} className="animate-pulse rounded-2xl overflow-hidden" style={{background:"var(--s2)"}}>
          <div className="h-14" style={{background:"var(--s3)"}}/>
          <div className="flex flex-col items-center px-3 pb-4" style={{marginTop:"-26px"}}>
            <div className="w-[52px] h-[52px] rounded-full mb-2" style={{background:"var(--s3)"}}/>
            <div className="h-3 rounded-full w-2/3 mb-3" style={{background:"var(--s3)"}}/>
            <div className="h-7 rounded-full w-full" style={{background:"var(--s3)"}}/>
          </div>
        </div>
      ))}
    </div>
  );
}
