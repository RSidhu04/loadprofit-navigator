import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, PlaceholderCard } from "@/components/page-shell";
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
      <div className="mt-8">
        <DataImportCard />
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
      const loads = Array.isArray(json.loads) ? json.loads : [];
      const markets = Array.isArray(json.markets) ? json.markets : [];
      setStatus(`Uploading ${loads.length.toLocaleString()} loads and ${markets.length} markets…`);
      const result = await importFn({ data: { loads, markets } });
      setStatus(`✓ Imported ${result.loadsInserted.toLocaleString()} loads, ${result.marketsInserted} markets.`);
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
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFile}
          disabled={busy}
        />
        {busy ? "Importing…" : "Choose JSON file"}
      </label>
      {status && <div className="mt-3 text-sm text-muted-foreground">{status}</div>}
    </div>
  );
}
