import { createServerFn } from "@tanstack/react-start";

type LoadRow = {
  id: string;
  origin: string; origin_lat: number; origin_lng: number;
  dest: string; dest_lat: number; dest_lng: number;
  equipment: string; commodity: string;
  weight: number; miles: number; rate: number;
  pu_date: string; dest_exit_score: number;
};

type MarketRow = {
  city: string; outbound: number; inbound: number;
  lane_balance: number; avg_rpm: number;
  lat: number; lng: number; exit_score: number;
};

export const importLoadProfitData = createServerFn({ method: "POST" })
  .inputValidator((input: { loads?: LoadRow[]; markets?: MarketRow[] }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let loadsInserted = 0;
    let marketsInserted = 0;

    if (data.markets?.length) {
      const { error } = await supabaseAdmin
        .from("markets")
        .upsert(data.markets, { onConflict: "city" });
      if (error) throw new Error(`Markets: ${error.message}`);
      marketsInserted = data.markets.length;
    }

    if (data.loads?.length) {
      const BATCH = 1000;
      for (let i = 0; i < data.loads.length; i += BATCH) {
        const chunk = data.loads.slice(i, i + BATCH);
        const { error } = await supabaseAdmin
          .from("loads")
          .upsert(chunk, { onConflict: "id" });
        if (error) throw new Error(`Loads batch ${i}: ${error.message}`);
        loadsInserted += chunk.length;
      }
    }

    return { loadsInserted, marketsInserted };
  });
