import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PlaceholderCard } from "@/components/page-shell";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Cost Settings — LoadProfit" },
      { name: "description", content: "Configure per-mile operating costs so profit recommendations match your actual fleet economics." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <PageShell
      eyebrow="Carrier profile"
      title="Cost Settings"
      description="Dial in your true cost-per-mile. Every recommendation across LoadProfit uses these numbers to compute net margin."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <CostCard label="Fuel cost / mile" hint="Diesel ÷ MPG" />
        <CostCard label="Driver pay / mile" hint="Loaded + empty" />
        <CostCard label="Maintenance / mile" hint="Tires, oil, repairs" />
        <CostCard label="Fixed overhead / mile" hint="Insurance, payments, admin" />
      </div>
      <div className="mt-6">
        <PlaceholderCard label="Cost breakdown form + per-truck profiles." />
      </div>
    </PageShell>
  );
}

function CostCard({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-display font-semibold text-muted-foreground/60">$—</span>
        <span className="text-xs text-muted-foreground">/mi</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
