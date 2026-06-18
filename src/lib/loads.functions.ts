import { createServerFn } from "@tanstack/react-start";
// @ts-expect-error - profitEngine is a plain .js module
import { scoreLoad } from "./profitEngine";

type Costs = {
  fuelPrice: number;
  mpg: number;
  driverPay: number;
  insurance: number;
  maintenance: number;
};

type LoadRow = {
  id: string;
  origin: string;
  origin_lat: number;
  origin_lng: number;
  dest: string;
  dest_lat: number;
  dest_lng: number;
  equipment: string;
  commodity: string;
  weight: number;
  miles: number;
  rate: number;
  pu_date: string;
  dest_exit_score: number;
};

type MarketRow = {
  city: string;
  outbound: number;
  inbound: number;
  lane_balance: number;
  avg_rpm: number;
  lat: number;
  lng: number;
  exit_score: number;
};

function getSupabase() {
  // Use the publishable-key client for read-only queries against tables
  // that have a public SELECT policy.
  // Imported lazily so this file stays client-import-safe.
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    ),
  );
}

// Distinct list of origin cities (with their lat/lng) for the dropdown.
export const listOriginCities = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("loads")
    .select("origin, origin_lat, origin_lng")
    .order("origin", { ascending: true })
    .limit(50000);
  if (error) throw new Error(error.message);

  const seen = new Map<string, { city: string; lat: number; lng: number }>();
  for (const row of (data ?? []) as Pick<LoadRow, "origin" | "origin_lat" | "origin_lng">[]) {
    if (!seen.has(row.origin)) {
      seen.set(row.origin, { city: row.origin, lat: row.origin_lat, lng: row.origin_lng });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.city.localeCompare(b.city));
});

// Fetch all loads, score each one, return the top 25 by net $/mi.
export const findBestLoads = createServerFn({ method: "POST" })
  .inputValidator((input: { currentLat: number; currentLng: number; costs: Costs; limit?: number }) => input)
  .handler(async ({ data }) => {
    const supabase = await getSupabase();

    // Pull in pages — supabase caps at 1000/req by default.
    const PAGE = 1000;
    const rows: LoadRow[] = [];
    let from = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from("loads")
        .select("*")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      rows.push(...(page as LoadRow[]));
      if (page.length < PAGE) break;
      from += PAGE;
      // Safety stop — we expect ~100k rows max.
      if (rows.length > 200000) break;
    }

    const scored = rows.map((load) => {
      const s = scoreLoad(load, data.currentLat, data.currentLng, data.costs);
      return { load, score: s };
    });

    scored.sort((a, b) => b.score.netPerMile - a.score.netPerMile);

    const limit = data.limit ?? 25;
    return {
      total: rows.length,
      results: scored.slice(0, limit),
    };
  });

// Markets list (top N by exit_score).
export const listTopMarkets = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const supabase = await getSupabase();
    const { data: rows, error } = await supabase
      .from("markets")
      .select("*")
      .order("exit_score", { ascending: false })
      .limit(data.limit ?? 10);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MarketRow[];
  });

// Full markets list for the bubble map.
export const listAllMarkets = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("markets")
    .select("city,lat,lng,exit_score,outbound,inbound,avg_rpm")
    .order("exit_score", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as MarketRow[];
});
