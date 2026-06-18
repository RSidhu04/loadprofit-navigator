
CREATE TABLE public.loads (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  dest TEXT NOT NULL,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lng DOUBLE PRECISION NOT NULL,
  equipment TEXT NOT NULL,
  commodity TEXT NOT NULL,
  weight INTEGER NOT NULL,
  miles INTEGER NOT NULL,
  rate NUMERIC NOT NULL,
  pu_date DATE NOT NULL,
  dest_exit_score DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loads_origin_idx ON public.loads(origin);
CREATE INDEX loads_dest_idx ON public.loads(dest);
CREATE INDEX loads_pu_date_idx ON public.loads(pu_date);
GRANT SELECT ON public.loads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loads TO authenticated;
GRANT ALL ON public.loads TO service_role;
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Loads readable by everyone" ON public.loads FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert loads" ON public.loads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update loads" ON public.loads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete loads" ON public.loads FOR DELETE TO authenticated USING (true);

CREATE TABLE public.markets (
  city TEXT PRIMARY KEY,
  outbound INTEGER NOT NULL,
  inbound INTEGER NOT NULL,
  lane_balance DOUBLE PRECISION NOT NULL,
  avg_rpm DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  exit_score DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.markets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.markets TO authenticated;
GRANT ALL ON public.markets TO service_role;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Markets readable by everyone" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert markets" ON public.markets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update markets" ON public.markets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete markets" ON public.markets FOR DELETE TO authenticated USING (true);
