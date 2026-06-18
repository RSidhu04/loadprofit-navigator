import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { ArrowDownRight, ArrowUpRight, Flame } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { listAllMarkets, listTopMarkets } from "@/lib/loads.functions";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Top 10 Markets — LoadProfit" },
      { name: "description", content: "Rank US freight markets by exit score — outbound demand vs inbound saturation." },
    ],
  }),
  component: MarketsPage,
});

const US_TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type Market = {
  city: string;
  outbound: number;
  inbound: number;
  lane_balance: number;
  avg_rpm: number;
  lat: number;
  lng: number;
  exit_score: number;
};

function MarketsPage() {
  const topFn = useServerFn(listTopMarkets);
  const allFn = useServerFn(listAllMarkets);

  const topQ = useQuery({
    queryKey: ["top-markets"],
    queryFn: () => topFn({ data: { limit: 10 } }),
    staleTime: 60_000,
  });
  const allQ = useQuery({
    queryKey: ["all-markets"],
    queryFn: () => allFn(),
    staleTime: 60_000,
  });

  return (
    <PageShell
      eyebrow="Market intelligence"
      title="Top 10 Markets"
      description="Ranked by exit score — how easily you can reload out without rotting at the truck stop. Outbound load count, inbound saturation, and average paid rate per mile."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          {topQ.isLoading && <div className="text-sm text-muted-foreground">Loading markets…</div>}
          {topQ.data?.map((m, i) => (
            <MarketCard key={m.city} rank={i + 1} market={m} />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">National view</div>
              <div className="font-display text-lg font-semibold">Market exit-score map</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BubbleSwatch size={6} /> Soft
              <BubbleSwatch size={10} /> Mixed
              <BubbleSwatch size={16} /> Hot
            </div>
          </div>
          <MarketsMap markets={allQ.data ?? []} />
        </div>
      </div>
    </PageShell>
  );
}

function MarketCard({ rank, market }: { rank: number; market: Market }) {
  const tone = market.exit_score > 0.6 ? "green" : market.exit_score >= 0.4 ? "yellow" : "red";
  const total = market.outbound + market.inbound;
  const outPct = total > 0 ? (market.outbound / total) * 100 : 50;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg font-display text-lg font-bold ${
            rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          }`}>
            {rank}
          </div>
          <div>
            <div className="font-display text-lg font-semibold leading-tight">{market.city}</div>
            <div className="text-xs text-muted-foreground">
              Lane balance {market.lane_balance.toFixed(2)} · ${market.avg_rpm.toFixed(2)}/mi avg
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Exit score</div>
          <div className={`font-display text-2xl font-semibold ${
            tone === "green" ? "text-emerald-500" : tone === "yellow" ? "text-amber-500" : "text-destructive"
          }`}>
            {market.exit_score.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3 text-emerald-500" /> Outbound {market.outbound.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            Inbound {market.inbound.toLocaleString()} <ArrowDownRight className="h-3 w-3 text-amber-500" />
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500" style={{ width: `${outPct}%` }} />
          <div className="bg-amber-500" style={{ width: `${100 - outPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function MarketsMap({ markets }: { markets: Market[] }) {
  return (
    <div className="w-full">
      <ComposableMap projection="geoAlbersUsa" width={800} height={500} style={{ width: "100%", height: "auto" }}>
        <Geographies geography={US_TOPO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="hsl(var(--muted) / 0.4)"
                stroke="hsl(var(--border))"
                strokeWidth={0.5}
                style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
              />
            ))
          }
        </Geographies>
        {markets.map((m) => {
          const r = 3 + m.exit_score * 14;
          const fill =
            m.exit_score > 0.6 ? "rgb(16 185 129)" :
            m.exit_score >= 0.4 ? "rgb(245 158 11)" :
            "rgb(239 68 68)";
          return (
            <Marker key={m.city} coordinates={[m.lng, m.lat]}>
              <circle r={r} fill={fill} fillOpacity={0.55} stroke={fill} strokeWidth={1} />
              <title>{`${m.city} — exit ${m.exit_score.toFixed(2)} · $${m.avg_rpm.toFixed(2)}/mi`}</title>
            </Marker>
          );
        })}
      </ComposableMap>
      <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <Flame className="h-3 w-3" /> Bubble size = exit score · color = market temperature
      </div>
    </div>
  );
}

function BubbleSwatch({ size }: { size: number }) {
  return (
    <span
      className="inline-block rounded-full bg-foreground/30"
      style={{ width: size, height: size }}
    />
  );
}
