import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, DollarSign, Loader2, MapPin, Search, ShieldAlert, Sparkles, TrendingUp, Truck, Workflow } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { useCosts } from "@/contexts/costs-context";
import { findBestLoads, findCandidates, listOriginCities } from "@/lib/loads.functions";
// @ts-expect-error - agents.js is a plain JS module
import { costAgent, marketAgent, riskAgent, finalAgent } from "@/lib/agents";



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Load Finder — LoadProfit" },
      { name: "description", content: "Find the most profitable load by net margin, accounting for deadhead miles in both directions." },
    ],
  }),
  component: LoadFinder,
});

type ScoreBreakdown = {
  deadheadIn: number;
  loadedMiles: number;
  deadheadOut: number;
  totalMiles: number;
  fuelCost: number;
  variableCost: number;
  netProfit: number;
  netPerMile: number;
  grossPerMile: number;
  deadheadPct: number;
};

type ScoredLoad = {
  load: {
    id: string;
    origin: string; dest: string;
    equipment: string; commodity: string;
    miles: number; rate: number; dest_exit_score: number;
    pu_date: string;
  };
  score: ScoreBreakdown;
};

function LoadFinder() {
  const { costs } = useCosts();
  const [currentCity, setCurrentCity] = useState<string>("");

  const citiesFn = useServerFn(listOriginCities);
  const findFn = useServerFn(findBestLoads);
  const candidatesFn = useServerFn(findCandidates);

  const [aiState, setAiState] = useState<{
    loading: boolean;
    error?: string;
    result?: { final: string; reports: { cost: string; market: string; risk: string } };
  }>({ loading: false });

  const citiesQuery = useQuery({
    queryKey: ["origin-cities"],
    queryFn: () => citiesFn(),
    staleTime: 5 * 60_000,
  });

  // Default-select Atlanta if available, otherwise first city.
  useEffect(() => {
    if (!currentCity && citiesQuery.data && citiesQuery.data.length > 0) {
      const atl = citiesQuery.data.find((c) => c.city.startsWith("Atlanta"));
      setCurrentCity((atl ?? citiesQuery.data[0]).city);
    }
  }, [citiesQuery.data, currentCity]);

  const selected = useMemo(
    () => citiesQuery.data?.find((c) => c.city === currentCity),
    [citiesQuery.data, currentCity],
  );

  const loadsQuery = useQuery({
    queryKey: ["best-loads", selected?.city, costs],
    enabled: !!selected,
    queryFn: () =>
      findFn({
        data: {
          currentLat: selected!.lat,
          currentLng: selected!.lng,
          costs,
          limit: 25,
        },
      }),
  });

  const results = loadsQuery.data?.results ?? [];
  const totalScanned = loadsQuery.data?.total ?? 0;
  const top = results[0];
  const avgDeadhead = results.length
    ? results.reduce((sum, r) => sum + r.score.deadheadIn + r.score.deadheadOut, 0) / results.length
    : 0;

  async function runAgents() {
    if (!selected) return;
    setAiState({ loading: true });
    try {
      const { results: candidates } = await candidatesFn({
        data: { currentLat: selected.lat, currentLng: selected.lng, costs, radiusMiles: 300, limit: 15 },
      });
      if (!candidates.length) {
        setAiState({ loading: false, error: "No loads found within 300 miles." });
        return;
      }
      const result = await orchestrator(candidates, selected.city);
      setAiState({ loading: false, result });
    } catch (err) {
      setAiState({ loading: false, error: (err as Error).message });
    }
  }


  return (
    <PageShell
      eyebrow="Recommendation engine"
      title="Load Finder"
      description="Ranks available loads by net profit per mile — after deadhead in and deadhead out — so you know which load actually pays."
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Current location</span>
            <div className="flex items-center gap-2 h-11 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <select
                value={currentCity}
                onChange={(e) => setCurrentCity(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                disabled={citiesQuery.isLoading}
              >
                {citiesQuery.isLoading && <option>Loading cities…</option>}
                {citiesQuery.data?.map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            onClick={() => loadsQuery.refetch()}
            disabled={!selected || loadsQuery.isFetching}
          >
            <Search className="h-4 w-4" />
            {loadsQuery.isFetching ? "Scoring…" : "Find loads"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="Loads scanned" value={totalScanned ? totalScanned.toLocaleString() : "—"} hint="From current board" />
        <Stat label="Avg deadhead (top 25)" value={results.length ? `${Math.round(avgDeadhead)} mi` : "—"} hint="In + out, per load" />
        <Stat label="Best net $/mi" value={top ? fmtMoney(top.score.netPerMile) : "—"} hint="After every empty mile" />
      </div>

      {top && <TopPickCard pick={top} />}

      <AiPanel
        state={aiState}
        canRun={!!selected && !aiState.loading}
        onRun={runAgents}
      />


      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Ranked recommendations
          </h2>
          <div className="text-xs text-muted-foreground">Sorted by net $/mi</div>
        </div>

        {loadsQuery.isLoading && <SkeletonTable />}
        {loadsQuery.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
            {(loadsQuery.error as Error).message}
          </div>
        )}
        {!loadsQuery.isLoading && results.length > 0 && <LoadsTable rows={results} />}
      </div>
    </PageShell>
  );
}

function TopPickCard({ pick }: { pick: ScoredLoad }) {
  const { load, score } = pick;
  const badge = exitBadge(load.dest_exit_score);
  const reason = (() => {
    const market = load.dest;
    if (load.dest_exit_score > 0.6)
      return `strong outbound demand in ${market}, easy reload`;
    if (load.dest_exit_score >= 0.4)
      return `moderate reload market in ${market}, expect some repositioning`;
    return `soft market in ${market} — budget for a longer empty leg out`;
  })();

  return (
    <div className="mt-6 rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
        <TrendingUp className="h-3.5 w-3.5" /> Top pick
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {load.origin} → {load.dest}
        </h3>
        <span className="text-xs text-muted-foreground">
          {load.equipment} · {load.commodity} · {load.miles.toLocaleString()} mi · PU {load.pu_date}
        </span>
      </div>
      <p className="mt-3 text-sm text-foreground/90 leading-relaxed">
        Nets <span className="font-semibold text-foreground">{fmtMoney(score.netProfit, 0)}</span> at{" "}
        <span className="font-semibold text-foreground">{fmtMoney(score.netPerMile)}/mi</span> and drops you in{" "}
        <span className="font-semibold">{load.dest}</span> — {reason}.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MiniStat label="Gross rate" value={fmtMoney(load.rate, 0)} />
        <MiniStat label="Deadhead in" value={`${Math.round(score.deadheadIn)} mi`} />
        <MiniStat label="Est. deadhead out" value={`${Math.round(score.deadheadOut)} mi`} />
        <MiniStat label="Dest market" value={`${badge.label} · ${load.dest_exit_score.toFixed(2)}`} tone={badge.tone} />
      </div>
    </div>
  );
}

function LoadsTable({ rows }: { rows: ScoredLoad[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-3 text-left">#</th>
            <th className="px-3 py-3 text-left">Origin → Dest</th>
            <th className="px-3 py-3 text-left">Equip</th>
            <th className="px-3 py-3 text-right">Gross</th>
            <th className="px-3 py-3 text-right">DH-in</th>
            <th className="px-3 py-3 text-right">Loaded</th>
            <th className="px-3 py-3 text-right">DH-out</th>
            <th className="px-3 py-3 text-right">Total cost</th>
            <th className="px-3 py-3 text-right">Net profit</th>
            <th className="px-3 py-3 text-right">Net $/mi</th>
            <th className="px-3 py-3 text-left">Dest market</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const { load, score } = row;
            const badge = exitBadge(load.dest_exit_score);
            const totalCost = score.fuelCost + score.variableCost;
            const netPos = score.netProfit > 0;
            return (
              <tr key={load.id} className="border-t border-border/60 hover:bg-muted/20">
                <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{load.origin} → {load.dest}</div>
                  <div className="text-xs text-muted-foreground">{load.commodity} · PU {load.pu_date}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-0.5 text-xs">
                    <Truck className="h-3 w-3" />{load.equipment}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(load.rate, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{Math.round(score.deadheadIn)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{load.miles.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{Math.round(score.deadheadOut)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtMoney(totalCost, 0)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${netPos ? "text-emerald-500" : "text-destructive"}`}>
                  {fmtMoney(score.netProfit, 0)}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${netPos ? "text-emerald-500" : "text-destructive"}`}>
                  {fmtMoney(score.netPerMile)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={badge.tone}>{badge.label} {load.dest_exit_score.toFixed(2)}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
      Scoring loads against your current cost profile…
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "green" | "yellow" | "red" }) {
  const color =
    tone === "green" ? "text-emerald-500" :
    tone === "yellow" ? "text-amber-500" :
    tone === "red" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "green" | "yellow" | "red"; children: React.ReactNode }) {
  const cls =
    tone === "green" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    tone === "yellow" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
    "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {children}
    </span>
  );
}

function exitBadge(score: number): { label: string; tone: "green" | "yellow" | "red" } {
  if (score > 0.6) return { label: "Hot", tone: "green" };
  if (score >= 0.4) return { label: "Mixed", tone: "yellow" };
  return { label: "Soft", tone: "red" };
}

function fmtMoney(n: number, digits = 2) {
  if (!isFinite(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

type AiState = {
  loading: boolean;
  error?: string;
  result?: { final: string; reports: { cost: string; market: string; risk: string } };
};

function AiPanel({ state, canRun, onRun }: { state: AiState; canRun: boolean; onRun: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-card to-card p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-500">
            <Sparkles className="h-3.5 w-3.5" /> AI dispatch room
          </div>
          <h3 className="mt-1 font-display text-lg font-semibold tracking-tight">
            Multi-agent recommendation
          </h3>
          <p className="text-sm text-muted-foreground">
            Cost · Market · Risk specialists review the top 15 candidates within 300 mi, then the
            Orchestrator picks the single best load.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-amber-500 text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          onClick={onRun}
          disabled={!canRun}
        >
          <Sparkles className="h-4 w-4" />
          {state.loading ? "Agents thinking…" : "Find Best Load"}
        </button>
      </div>

      {state.error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {state.result && (
        <div className="mt-5 grid gap-4">
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">
              Orchestrator decision
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
              {state.result.final}
            </pre>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <AgentReport title="Cost Analyst" body={state.result.reports.cost} />
            <AgentReport title="Market Analyst" body={state.result.reports.market} />
            <AgentReport title="Risk Officer" body={state.result.reports.risk} />
          </div>
        </div>
      )}
    </div>
  );
}

function AgentReport({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
        {title}
      </div>
      <pre className="whitespace-pre-wrap font-sans text-xs text-foreground/80 leading-relaxed max-h-64 overflow-auto">
        {body}
      </pre>
    </div>
  );
}
