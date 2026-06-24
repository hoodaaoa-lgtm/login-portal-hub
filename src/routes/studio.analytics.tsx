import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  myChannelQuery, channelStatsQuery,
  dailyViewsQuery, viewsByCountryQuery, topVideosQuery,
} from "@/lib/channel-queries";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Eye, Users, Clock, TrendingUp, Activity,
  PlayCircle, Map, Globe, BarChart2,
} from "lucide-react";

export const Route = createFileRoute("/studio/analytics")({
  head: () => ({ meta: [{ title: "Análises — Hooda Studio" }] }),
  component: AnalyticsPage,
});

const PURPLE = "#5B3FCF";
const GRAD   = "linear-gradient(135deg,#5B3FCF,#E94B8A)";

function card(children: React.ReactNode, className = "") {
  return (
    <div className={`rounded-2xl p-5 ${className}`}
      style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
      {children}
    </div>
  );
}

/* ── Tooltip personalizado ─────────────────────────────── */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 shadow-lg text-xs"
      style={{ background: "var(--s0)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
      <p className="font-bold mb-0.5">{label ? format(new Date(label), "d MMMM", { locale: pt }) : ""}</p>
      <p>{payload[0]?.value?.toLocaleString("pt-PT")} vistas</p>
    </div>
  );
}

/* ── Bandeira ─────────────────────────────────────────── */
function flag(code: string) {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

const NAMES: Record<string, string> = {
  AO:"Angola", PT:"Portugal", BR:"Brasil", US:"EUA", GB:"Reino Unido",
  FR:"França", DE:"Alemanha", ES:"Espanha", MZ:"Moçambique", CV:"Cabo Verde",
  GW:"Guiné-Bissau", ST:"S. Tomé e Príncipe", TL:"Timor-Leste",
};

function fmtDur(s: number) {
  if (s >= 3600) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

export default function AnalyticsPage() {
  const { data: channel } = useQuery(myChannelQuery());
  const { data: stats, isLoading } = useQuery(channelStatsQuery(channel?.id));
  const { data: daily }   = useQuery(dailyViewsQuery(channel?.id));
  const { data: countries } = useQuery(viewsByCountryQuery(channel?.id));
  const { data: topVids } = useQuery(topVideosQuery(channel?.id));

  const maxCountry = countries?.[0]?.views ?? 1;

  /* Agrega por semana (últimas 4 semanas) */
  const weeklyData = (() => {
    if (!daily) return [];
    const weeks: { week: string; views: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const start = w * 7;
      const slice = daily.slice(Math.max(0, daily.length - (start + 7)), daily.length - start);
      const total = slice.reduce((s, d) => s + d.views, 0);
      const label = slice[0]?.day ? format(new Date(slice[0].day), "d MMM", { locale: pt }) : `S${4 - w}`;
      weeks.push({ week: label, views: total });
    }
    return weeks.reverse();
  })();

  const METRIC_CARDS = [
    { label: "Visualizações totais",  value: stats?.views ?? 0,          icon: Eye,       accent: PURPLE },
    { label: "Seguidores",            value: stats?.subs ?? 0,           icon: Users,     accent: "#E94B8A" },
    { label: "Vistas — 24h",          value: stats?.views_24h ?? 0,      icon: Activity,  accent: "#10b981" },
    { label: "Vistas — 7 dias",       value: stats?.views_7d ?? 0,       icon: BarChart2, accent: "#1FAFA6" },
    { label: "Vistas — 28 dias",      value: stats?.views_28d ?? 0,      icon: TrendingUp,accent: "#8B5CF6" },
    { label: "Retenção média",        value: `${stats?.avg_watch_pct ?? 0}%`, icon: Clock, accent: "#F97316" },
    { label: "Tempo total de vídeo",  value: fmtDur(stats?.total_duration_seconds ?? 0), icon: PlayCircle, accent: "#FFC93C" },
    { label: "+Seguidores (28 dias)", value: stats?.subs_gained_28d ?? 0, icon: Users,    accent: "#EC4899" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-7">

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Análises</h1>
        {channel && (
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Dados do canal <span style={{ color: PURPLE, fontWeight: 600 }}>{channel.name}</span>
          </p>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {METRIC_CARDS.slice(0, 4).map(m => (
          <div key={m.label} className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{m.label}</span>
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: m.accent + "18" }}>
                <m.icon className="h-3.5 w-3.5" style={{ color: m.accent }} />
              </div>
            </div>
            {isLoading
              ? <div className="h-7 w-20 rounded-lg animate-pulse" style={{ background: "var(--s2)" }} />
              : <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {typeof m.value === "number" ? m.value.toLocaleString("pt-PT") : m.value}
                </div>}
            <div className="absolute -right-3 -bottom-3 h-16 w-16 rounded-full opacity-[0.06]" style={{ background: m.accent }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-7">
        {METRIC_CARDS.slice(4).map(m => (
          <div key={m.label} className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: "var(--s0)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{m.label}</span>
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: m.accent + "18" }}>
                <m.icon className="h-3.5 w-3.5" style={{ color: m.accent }} />
              </div>
            </div>
            {isLoading
              ? <div className="h-7 w-20 rounded-lg animate-pulse" style={{ background: "var(--s2)" }} />
              : <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {typeof m.value === "number" ? m.value.toLocaleString("pt-PT") : m.value}
                </div>}
            <div className="absolute -right-3 -bottom-3 h-16 w-16 rounded-full opacity-[0.06]" style={{ background: m.accent }} />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-7">

        {/* Área — 28 dias */}
        {card(
          <>
            <h2 className="text-base font-bold mb-5" style={{ color: "var(--text-primary)" }}>
              Visualizações por dia — últimos 28 dias
            </h2>
            {!daily ? (
              <div className="h-56 rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PURPLE} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="day" tickFormatter={d => format(new Date(d), "d/M")}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }} interval={6} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="views" stroke={PURPLE} strokeWidth={2}
                    fill="url(#ag1)" dot={false} activeDot={{ r: 4, fill: PURPLE }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </>,
          "lg:col-span-2"
        )}

        {/* Barras semanais */}
        {card(
          <>
            <h2 className="text-base font-bold mb-5" style={{ color: "var(--text-primary)" }}>
              Por semana (4 semanas)
            </h2>
            {!daily ? (
              <div className="h-56 rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--s0)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
                    itemStyle={{ color: PURPLE }}
                  />
                  <Bar dataKey="views" fill={PURPLE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        )}
      </div>

      {/* País + Top vídeos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Mapa de países */}
        {card(
          <>
            <div className="flex items-center gap-2 mb-5">
              <Map className="h-4 w-4" style={{ color: PURPLE }} />
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Espectadores por país</h2>
            </div>
            {!countries || countries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-12 w-12 mb-4" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Sem dados ainda</p>
                <p className="text-xs max-w-xs" style={{ color: "var(--text-muted)" }}>
                  Os países dos espectadores aparecerão aqui quando o teu canal começar a receber vistas.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {countries.map((r, i) => {
                  const pct = Math.round((r.views / maxCountry) * 100);
                  return (
                    <div key={r.country}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{flag(r.country)}</span>
                          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            {NAMES[r.country] ?? r.country}
                          </span>
                          {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ background: PURPLE }}>Top</span>}
                        </div>
                        <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                          {r.views.toLocaleString("pt-PT")}
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: GRAD }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Top vídeos */}
        {card(
          <>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="h-4 w-4" style={{ color: PURPLE }} />
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Top 5 vídeos</h2>
            </div>
            {!topVids || topVids.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PlayCircle className="h-12 w-12 mb-4" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Sem vídeos públicos ainda</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Publica o teu primeiro vídeo para ver as análises aqui.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {topVids.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-3">
                    <div className="text-lg font-black w-6 text-center shrink-0"
                      style={{ color: i === 0 ? "#FFC93C" : i === 1 ? "#94A3B8" : i === 2 ? "#CD7C2F" : "var(--text-muted)" }}>
                      {i + 1}
                    </div>
                    <div className="h-10 w-[70px] rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: "var(--s2)" }}>
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} className="h-full w-full object-cover" alt="" />
                        : <PlayCircle className="h-5 w-5" style={{ color: "var(--text-muted)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{v.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                          <Eye className="h-3 w-3" /> {(v.views_count ?? 0).toLocaleString("pt-PT")}
                        </span>
                        {v.duration_seconds && (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {fmtDur(v.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* mini bar */}
                    <div className="w-16 hidden sm:block">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                        <div className="h-full rounded-full" style={{
                          width: `${topVids[0].views_count ? Math.round((v.views_count / topVids[0].views_count) * 100) : 0}%`,
                          background: GRAD,
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Tempo médio assistido — placeholder */}
      <div className="mt-6">
        {card(
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex items-center justify-center h-20 w-20 rounded-full shrink-0"
              style={{ background: GRAD }}>
              <Clock className="h-8 w-8 text-white" />
            </div>
            <div className="text-center sm:text-left">
              <h3 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>Tempo médio assistido</h3>
              <p className="text-3xl font-black mb-1" style={{ color: PURPLE }}>
                {stats?.avg_watch_pct ?? 0}%
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Em média os espectadores assistem a <strong>{stats?.avg_watch_pct ?? 0}%</strong> de cada vídeo.
                {(stats?.avg_watch_pct ?? 0) >= 50
                  ? " Excelente retenção! 🎉"
                  : " Tenta vídeos mais curtos para aumentar a retenção."}
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="h-4 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${stats?.avg_watch_pct ?? 0}%`, background: GRAD }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
