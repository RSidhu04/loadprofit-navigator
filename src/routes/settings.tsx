import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { useCosts, type Costs } from "@/contexts/costs-context";
import { importLoadProfitData } from "@/lib/import-data.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Cost Settings — LoadProfit" },
      { name: "description", content: "Configure per-mile operating costs so profit recommendations match your actual fleet economics." },
    ],
  }),
  component: SettingsPage,
});

const FIELDS: Array<{
  key: keyof Costs;
  label: string;
  prefix?: string;
  suffix: string;
  hint: string;
  step: number;
}> = [
  { key: "fuelPrice", label: "Fuel price", prefix: "$", suffix: "/gal", hint: "Pump price you're paying for diesel", step: 0.01 },
  { key: "mpg", label: "Fuel economy", suffix: "mpg", hint: "Loaded average across your fleet", step: 0.1 },
  { key: "driverPay", label: "Driver pay", prefix: "$", suffix: "/mi", hint: "Loaded + empty per-mile pay", step: 0.01 },
  { key: "insurance", label: "Insurance", prefix: "$", suffix: "/mi", hint: "Cargo + liability allocated per mile", step: 0.01 },
  { key: "maintenance", label: "Maintenance", prefix: "$", suffix: "/mi", hint: "Tires, oil, repairs, reserves", step: 0.01 },
];

function SettingsPage() {
  const { costs, setCost, reset } = useCosts();

  // Derived: total variable cost per mile (fuel + driver + insurance + maint).
  const fuelPerMile = costs.fuelPrice / Math.max(costs.mpg, 0.0001);
  const totalPerMile = fuelPerMile + costs.driverPay + costs.insurance + costs.maintenance;

  return (
    <PageShell
      eyebrow="Carrier profile"
      title="Cost Settings"
      description="Dial in your true cost-per-mile. Every recommendation across LoadProfit uses these numbers to compute net margin."
      actions={
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-9 text-xs font-medium hover:bg-accent"
        >
          <RotateCcw className="h-3 w-3" /> Reset to defaults
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <CostInput
            key={f.key}
            label={f.label}
            prefix={f.prefix}
            suffix={f.suffix}
            hint={f.hint}
            step={f.step}
            value={costs[f.key]}
            onChange={(v) => setCost(f.key, v)}
          />
        ))}

        <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 md:col-span-2 lg:col-span-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">All-in</div>
          <div className="mt-1 text-xs text-muted-foreground">Variable cost per mile</div>
          <div className="mt-2 font-display text-3xl font-semibold tracking-tight">
            ${totalPerMile.toFixed(3)}<span className="text-base text-muted-foreground">/mi</span>
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <Row k="Fuel" v={`$${fuelPerMile.toFixed(3)}/mi`} />
            <Row k="Driver" v={`$${costs.driverPay.toFixed(2)}/mi`} />
            <Row k="Insurance" v={`$${costs.insurance.toFixed(2)}/mi`} />
            <Row k="Maintenance" v={`$${costs.maintenance.toFixed(2)}/mi`} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Load Finder re-ranks the moment you change a number.
          </div>
        </div>
      </div>

      <div className="mt-8">
        <DataImportCard />
      </div>
    </PageShell>
  );
}

function CostInput({
  label, prefix, suffix, hint, step, value, onChange,
}: {
  label: string; prefix?: string; suffix: string; hint: string; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="rounded-xl border border-border bg-card p-5 block">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        {prefix && <span className="font-display text-2xl font-semibold text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          step={step}
          min={0}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-28 bg-transparent font-display text-3xl font-semibold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-ring rounded"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span className="tabular-nums text-foreground/80">{v}</span>
    </div>
  );
}

function DataImportCard() {
  const importFn = useServerFn(importLoadProfitData);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Reading file…");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const loads: any[] = Array.isArray(json.loads) ? json.loads : [];
      const markets: any[] = Array.isArray(json.markets) ? json.markets : [];

      const LOAD_CHUNK = 250;
      const MARKET_CHUNK = 500;
      let loadsDone = 0;
      let marketsDone = 0;

      // Markets first (small)
      for (let i = 0; i < markets.length; i += MARKET_CHUNK) {
        const chunk = markets.slice(i, i + MARKET_CHUNK);
        setStatus(`Uploading markets ${i + chunk.length}/${markets.length}…`);
        const r = await importFn({ data: { markets: chunk } });
        marketsDone += r.marketsInserted;
      }

      // Loads in small chunks so each Worker request stays under CPU budget
      for (let i = 0; i < loads.length; i += LOAD_CHUNK) {
        const chunk = loads.slice(i, i + LOAD_CHUNK);
        setStatus(`Uploading loads ${i + chunk.length}/${loads.length}…`);
        const r = await importFn({ data: { loads: chunk } });
        loadsDone += r.loadsInserted;
      }

      setStatus(`✓ Imported ${loadsDone.toLocaleString()} loads, ${marketsDone} markets.`);
    } catch (err) {
      setStatus(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }


  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data import</div>
      <h3 className="mt-1 font-display text-lg font-semibold">Upload LoadProfit JSON</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a JSON file with <code className="font-mono text-xs">loads</code> and <code className="font-mono text-xs">markets</code> arrays. Existing rows with the same id/city are replaced.
      </p>
      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} disabled={busy} />
        {busy ? "Importing…" : "Choose JSON file"}
      </label>
      {status && <div className="mt-3 text-sm text-muted-foreground">{status}</div>}
    </div>
  );
}
