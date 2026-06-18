import { Link, useRouterState } from "@tanstack/react-router";
import { Truck, Search, TrendingUp, Settings } from "lucide-react";

const items = [
  { title: "Load Finder", url: "/", icon: Search },
  { title: "Top 10 Markets", url: "/markets", icon: TrendingUp },
  { title: "Cost Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Truck className="h-5 w-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-base font-semibold tracking-tight">LoadProfit</span>
          <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Net-margin routing</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
          Operations
        </div>
        {items.map((item) => {
          const active = pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              ].join(" ")}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-4">
        <div className="text-xs font-semibold text-sidebar-accent-foreground">Fleet status</div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-display text-2xl font-semibold text-primary">7</span>
          <span className="text-xs text-sidebar-foreground/60">trucks active</span>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-sidebar-border overflow-hidden">
          <div className="h-full w-[72%] bg-primary" />
        </div>
        <div className="mt-2 text-[11px] text-sidebar-foreground/60">72% utilization this week</div>
      </div>
    </aside>
  );
}
