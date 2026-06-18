import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PlaceholderCard } from "@/components/page-shell";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Top 10 Markets — LoadProfit" },
      { name: "description", content: "The 10 highest-margin outbound markets right now, ranked by net profit after deadhead." },
    ],
  }),
  component: Markets,
});

function Markets() {
  return (
    <PageShell
      eyebrow="Market intelligence"
      title="Top 10 Markets"
      description="Where to send your next empty truck. Markets ranked by realized net margin, factoring outbound load density and return-leg deadhead exposure."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-6">
        <RankCard rank="—" name="Market name" />
        <RankCard rank="—" name="Market name" />
        <RankCard rank="—" name="Market name" />
      </div>
      <PlaceholderCard label="Full ranked market table — load-to-truck ratio, avg net $/mi, deadhead exposure." />
    </PageShell>
  );
}

function RankCard({ rank, name }: { rank: string; name: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-display text-xl font-semibold">
        {rank}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">Awaiting market data</div>
      </div>
    </div>
  );
}
