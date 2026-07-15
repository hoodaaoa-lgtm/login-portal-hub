/**
 * PollCard — enquete real, de ponta a ponta.
 *
 * - Um voto por utilizador por publicação, guardado na tabela `poll_votes`
 *   (não é possível votar várias vezes).
 * - O utilizador PODE trocar de escolha enquanto a enquete estiver aberta.
 * - Antes de votar: opções aparecem como botões.
 * - Depois de votar (ou se a enquete já encerrou): opções viram barras de
 *   percentagem, com ✓ na escolha do utilizador, e o total de votos.
 * - Prazo opcional (`endsAt`): passado esse momento, a enquete fica só de
 *   leitura (mostra resultados, mas não deixa votar).
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ACCENT = "#9231EA";

export type PollOption = string | { text: string };

function optionText(o: PollOption): string {
  return typeof o === "string" ? o : (o?.text ?? "");
}

function timeLeftLabel(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Enquete encerrada";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `Termina em ${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 24) return `Termina em ${h}h`;
  return `Termina em ${Math.floor(h / 24)}d`;
}

interface PollCardProps {
  postId: string;
  question?: string | null;
  options: PollOption[];
  endsAt?: string | null;
  className?: string;
}

export function PollCard({ postId, question, options, endsAt, className = "" }: PollCardProps) {
  const [myId, setMyId] = useState<string | null>(null);
  const [counts, setCounts] = useState<number[]>(() => options.map(() => 0));
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);

  const expired = !!endsAt && new Date(endsAt).getTime() <= Date.now();
  const total = counts.reduce((a, b) => a + b, 0);
  const hasVoted = myVote !== null;

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? null;
    setMyId(uid);

    const { data: votes } = await (supabase as any)
      .from("poll_votes")
      .select("option_index,user_id")
      .eq("post_id", postId);

    const next = options.map(() => 0);
    let mine: number | null = null;
    (votes ?? []).forEach((v: any) => {
      if (typeof v.option_index === "number" && next[v.option_index] !== undefined) {
        next[v.option_index]++;
      }
      if (uid && v.user_id === uid) mine = v.option_index;
    });
    setCounts(next);
    setMyVote(mine);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function vote(index: number) {
    if (!myId) return;
    if (expired || voting || index === myVote) return;
    setVoting(true);
    const previous = myVote;
    // Otimista: já mostra o resultado, corrige se a BD falhar.
    setCounts((prev) => {
      const next = [...prev];
      if (previous !== null) next[previous] = Math.max(0, next[previous] - 1);
      next[index] = (next[index] ?? 0) + 1;
      return next;
    });
    setMyVote(index);

    const { error } = await (supabase as any).from("poll_votes").upsert(
      {
        post_id: postId,
        user_id: myId,
        option_index: index,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id,user_id" },
    );

    if (error) {
      // Reverte em caso de erro.
      setMyVote(previous);
      await load();
    }
    setVoting(false);
  }

  if (loading) {
    return (
      <div
        className={`rounded-2xl border p-4 space-y-2 ${className}`}
        style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}
      >
        <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: "var(--s2)" }} />
        <div className="h-9 w-full rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />
        <div className="h-9 w-full rounded-xl animate-pulse" style={{ background: "var(--s2)" }} />
      </div>
    );
  }

  const showResults = hasVoted || expired;

  return (
    <div
      className={`rounded-2xl border p-4 ${className}`}
      style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}
    >
      {question && (
        <p className="font-bold text-[15px] mb-3" style={{ color: "var(--text-primary)" }}>
          {question}
        </p>
      )}

      <div className="space-y-2">
        {options.map((opt, i) => {
          const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
          const isMine = myVote === i;

          if (!showResults) {
            return (
              <button
                key={i}
                onClick={() => vote(i)}
                disabled={voting || !myId}
                className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold border transition active:scale-[0.99] disabled:opacity-60"
                style={{ borderColor: ACCENT + "55", color: "var(--text-primary)" }}
              >
                {optionText(opt)}
              </button>
            );
          }

          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={voting || expired || !myId}
              className="relative w-full text-left rounded-xl overflow-hidden border disabled:cursor-default"
              style={{ borderColor: isMine ? ACCENT : "var(--border-subtle)" }}
            >
              <div
                className="absolute inset-y-0 left-0 transition-all duration-300"
                style={{ width: `${pct}%`, background: isMine ? ACCENT + "2A" : "var(--s2)" }}
              />
              <div className="relative flex items-center justify-between gap-2 px-4 py-2.5">
                <span
                  className="flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {isMine && <Check className="h-4 w-4 shrink-0" style={{ color: ACCENT }} />}
                  {optionText(opt)}
                </span>
                <span className="text-sm font-bold shrink-0" style={{ color: "var(--text-muted)" }}>
                  {pct}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="flex items-center justify-between mt-3 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <span>
          {total === 0 ? "Sem votos ainda" : `${total} ${total === 1 ? "voto" : "votos"}`}
        </span>
        {endsAt && <span>{timeLeftLabel(endsAt)}</span>}
      </div>
    </div>
  );
}
