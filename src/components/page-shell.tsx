import type { ReactNode } from "react";

interface PageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ eyebrow, title, description, actions, children }: PageShellProps) {
  return (
    <div className="flex-1 min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="px-8 py-6 flex items-start justify-between gap-6">
          <div>
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-2">
                {eyebrow}
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description && (
              <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
      <main className="px-8 py-8">{children}</main>
    </div>
  );
}

export function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Placeholder
      </div>
      <div className="mt-2 text-sm text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Awaiting data and logic in the next prompt.
      </div>
    </div>
  );
}
