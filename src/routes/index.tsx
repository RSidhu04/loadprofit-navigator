import { createFileRoute } from "@tanstack/react-router";
import { Search, MapPin, ArrowRight } from "lucide-react";
import { PageShell, PlaceholderCard } from "@/components/page-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Load Finder — LoadProfit" },
      { name: "description", content: "Find the most profitable load by net margin, accounting for deadhead miles in both directions." },
    ],
  }),
  component: LoadFinder,
});

function LoadFinder() {
  return (
    <PageShell
      eyebrow="Recommendation engine"
      title="Load Finder"
      description="Ranks available loads by net profit per mile — after deadhead in and deadhead out — so you know which load actually pays."
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
          <Field icon={<MapPin className="h-4 w-4" />} label="Current location" placeholder="City, ST" />
          <Field icon={<MapPin className="h-4 w-4" />} label="Preferred destination (optional)" placeholder="Anywhere" />
          <button className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Search className="h-4 w-4" /> Find loads
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="Loads scanned" value="—" hint="Last 24h" />
        <Stat label="Avg deadhead" value="—" hint="Inbound + outbound" />
        <Stat label="Best net $/mi" value="—" hint="After empty miles" />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Ranked recommendations
          </h2>
          <button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Sort: Net $/mi <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <PlaceholderCard label="Ranked load list — net profit per mile, deadhead in/out, total margin." />
      </div>
    </PageShell>
  );
}

function Field({ icon, label, placeholder }: { icon: React.ReactNode; label: string; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 h-11 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        <span className="text-muted-foreground">{icon}</span>
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          placeholder={placeholder}
        />
      </div>
    </label>
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
