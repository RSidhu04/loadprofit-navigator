import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, DollarSign, Loader2, MapPin, Search, ShieldAlert, Sparkles, TrendingUp, Truck, Workflow } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

  type AgentKey = "cost" | "market" | "risk" | "final";
  type AgentStatus = "idle" | "running" | "done" | "error";
  type AgentState = { status: AgentStatus; output?: string };
  const initialAgents: Record<AgentKey, AgentState> = {
    cost: { status: "idle" },
    market: { status: "idle" },
    risk: { status: "idle" },
    final: { status: "idle" },
  };
  const [agents, setAgents] = useState<Record<AgentKey, AgentState>>(initialAgents);
  const [aiError, setAiError] = useState<string | undefined>();
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStarted, setAiStarted] = useState(false);


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
    setAiError(undefined);
    setAiStarted(true);
    setAiRunning(true);
    setAgents(initialAgents);
    try {
      const { results: candidates } = await candidatesFn({
        data: { currentLat: selected.lat, currentLng: selected.lng, costs, radiusMiles: 300, limit: 15 },
      });
      if (!candidates.length) {
        setAiError("No loads found within 300 miles.");
        setAiRunning(false);
        return;
      }

      // Kick all three specialists at once; each updates its own card the moment it returns.
      const markRunning = (k: AgentKey) =>
        setAgents((s) => ({ ...s, [k]: { status: "running" } }));
      const markDone = (k: AgentKey, output: string) =>
        setAgents((s) => ({ ...s, [k]: { status: "done", output } }));

      markRunning("cost"); markRunning("market"); markRunning("risk");

      const costP = costAgent(candidates).then((t: string) => { markDone("cost", t); return t; });
      const marketP = marketAgent(candidates).then((t: string) => { markDone("market", t); return t; });
      const riskP = riskAgent(candidates).then((t: string) => { markDone("risk", t); return t; });

      const [cost, market, risk] = await Promise.all([costP, marketP, riskP]);

      markRunning("final");
      const finalText = await finalAgent(candidates, selected.city, { cost, market, risk });
      markDone("final", finalText);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiRunning(false);
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
        agents={agents}
        started={aiStarted}
        error={aiError}
        canRun={!!selected && !aiRunning}
        running={aiRunning}
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

type AgentKey = "cost" | "market" | "risk" | "final";
type AgentStatus = "idle" | "running" | "done" | "error";
type AgentState = { status: AgentStatus; output?: string };

const AGENT_META: Record<AgentKey, { title: string; role: string; icon: typeof DollarSign }> = {
  cost: { title: "Cost Analyst", role: "Most financially efficient picks", icon: DollarSign },
  market: { title: "Market Analyst", role: "Reload risk & destination strength", icon: TrendingUp },
  risk: { title: "Risk Officer", role: "Compliance, hazmat, tight windows", icon: ShieldAlert },
  final: { title: "Orchestrator", role: "Final dispatch verdict", icon: Workflow },
};

function AiPanel({
  agents, started, error, canRun, running, onRun,
}: {
  agents: Record<AgentKey, AgentState>;
  started: boolean;
  error?: string;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-card to-card p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-500">
            <Sparkles className="h-3.5 w-3.5" /> Agent activity
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
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? "Agents thinking…" : "Find Best Load"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {started && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <AgentCard agentKey="cost" state={agents.cost} />
            <AgentCard agentKey="market" state={agents.market} />
            <AgentCard agentKey="risk" state={agents.risk} />
          </div>
          <AgentCard agentKey="final" state={agents.final} highlight />
        </div>
      )}
    </div>
  );
}

function AgentCard({
  agentKey, state, highlight,
}: {
  agentKey: AgentKey;
  state: AgentState;
  highlight?: boolean;
}) {
  const meta = AGENT_META[agentKey];
  const Icon = meta.icon;
  const border = highlight
    ? "border-amber-500/60 bg-gradient-to-br from-amber-500/10 via-card to-card shadow-lg shadow-amber-500/5"
    : state.status === "done"
      ? "border-emerald-500/30 bg-card"
      : state.status === "running"
        ? "border-primary/40 bg-primary/5"
        : "border-dashed border-border bg-card/40 opacity-70";

  return (
    <div className={`rounded-xl border ${border} p-4 transition-all`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${highlight ? "bg-amber-500/15 text-amber-500" : state.status === "done" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted/40 text-foreground"}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {highlight && (
                <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                  Final verdict
                </div>
              )}
              <div className={`font-display font-semibold tracking-tight ${highlight ? "text-base text-foreground" : "text-sm"}`}>
                {meta.title}
              </div>
              <div className="text-xs text-muted-foreground">{meta.role}</div>
            </div>
            <StatusPill status={state.status} />
          </div>
        </div>
      </div>

      {state.status === "running" && (
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working…
          </div>
        </div>
      )}

      {state.status === "done" && state.output && (
        <div className={`mt-4 rounded-lg border border-border/60 bg-background/40 p-3 ${highlight ? "" : "max-h-72 overflow-auto"}`}>
          <AgentMarkdown text={state.output} highlight={highlight} />
        </div>
      )}
    </div>
  );
}

function AgentMarkdown({ text, highlight }: { text: string; highlight?: boolean }) {
  const base = highlight ? "text-sm" : "text-xs";
  return (
    <div className={`${base} leading-relaxed text-foreground/85 space-y-2.5`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h4 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {children}
            </h4>
          ),
          h2: ({ children }) => (
            <h4 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5 className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">
              {children}
            </h5>
          ),
          h4: ({ children }) => (
            <h5 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {children}
            </h5>
          ),
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="text-foreground/90">{children}</em>,
          ul: ({ children }) => (
            <ul className="space-y-1 pl-4 marker:text-amber-500 list-disc">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1 pl-4 marker:text-amber-500 list-decimal">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-amber-500/50 pl-3 italic text-foreground/80">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border/60" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/40 px-2 py-1 align-top">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}


function StatusPill({ status }: { status: AgentStatus }) {
  if (status === "idle")
    return <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">Queued</span>;
  if (status === "running")
    return <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-primary"><Loader2 className="h-3 w-3 animate-spin" />Running</span>;
  if (status === "done")
    return <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-emerald-500"><CheckCircle2 className="h-3 w-3" />Done</span>;
  return <span className="rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-destructive">Error</span>;
}

