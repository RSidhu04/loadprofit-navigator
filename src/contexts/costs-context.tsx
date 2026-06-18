import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Costs = {
  fuelPrice: number; // $/gal
  mpg: number;       // miles per gallon
  driverPay: number; // $/mi
  insurance: number; // $/mi
  maintenance: number; // $/mi
};

export const DEFAULT_COSTS: Costs = {
  fuelPrice: 4.0,
  mpg: 6.5,
  driverPay: 0.6,
  insurance: 0.15,
  maintenance: 0.18,
};

const STORAGE_KEY = "loadprofit.costs.v1";

type CostsContextValue = {
  costs: Costs;
  setCost: <K extends keyof Costs>(key: K, value: Costs[K]) => void;
  reset: () => void;
};

const CostsContext = createContext<CostsContextValue | null>(null);

export function CostsProvider({ children }: { children: ReactNode }) {
  const [costs, setCosts] = useState<Costs>(DEFAULT_COSTS);

  // Hydrate from localStorage (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Costs>;
        setCosts({ ...DEFAULT_COSTS, ...parsed });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(costs));
    } catch {
      /* ignore */
    }
  }, [costs]);

  const value: CostsContextValue = {
    costs,
    setCost: (key, value) => setCosts((c) => ({ ...c, [key]: value })),
    reset: () => setCosts(DEFAULT_COSTS),
  };

  return <CostsContext.Provider value={value}>{children}</CostsContext.Provider>;
}

export function useCosts() {
  const ctx = useContext(CostsContext);
  if (!ctx) throw new Error("useCosts must be used within CostsProvider");
  return ctx;
}
