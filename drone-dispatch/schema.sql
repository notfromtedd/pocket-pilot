-- ══════════════════════════════════════════════════
-- Pocket Pilot — Database Schema (Phase 2)
-- ══════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Customer Profiles ──
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Existing Pocket Pilot projects created before email auth need this migration.
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON customers(email) WHERE email IS NOT NULL;

-- ── Product Catalog ──
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'first_aid',
  price DECIMAL(10,2) DEFAULT 0,
  image_emoji TEXT DEFAULT '💊',
  in_stock BOOLEAN DEFAULT TRUE,
  priority_level TEXT DEFAULT 'STANDARD',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Orders ──
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  status TEXT DEFAULT 'PENDING',
  is_emergency BOOLEAN DEFAULT FALSE,
  total_price DECIMAL(10,2) DEFAULT 0,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  delivery_phone TEXT,
  notes TEXT,
  sms_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Order Line Items ──
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INT DEFAULT 1,
  price DECIMAL(10,2)
);

-- ── Flight Tickets (legacy + emergency) ──
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  payload_item TEXT NOT NULL,
  urgency_level TEXT DEFAULT 'STANDARD',
  incident_summary TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  status TEXT DEFAULT 'PENDING',
  sms_sent BOOLEAN DEFAULT FALSE,
  drone_id TEXT,
  order_id UUID REFERENCES orders(id)
);

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS drone_id TEXT;
CREATE INDEX IF NOT EXISTS tickets_drone_id_idx
  ON public.tickets(drone_id);

-- ── Drone Telemetry ──
CREATE TABLE IF NOT EXISTS drone_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID,
  order_id UUID REFERENCES orders(id),
  drone_id TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  alt DOUBLE PRECISION DEFAULT 0,
  battery INT DEFAULT 100,
  speed INT DEFAULT 0,
  heading INT DEFAULT 0,
  phase TEXT DEFAULT 'LAUNCH',
  active_waypoint_index INT DEFAULT 0,
  route_path JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.drone_telemetry ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
ALTER TABLE public.drone_telemetry ADD COLUMN IF NOT EXISTS drone_id TEXT;
ALTER TABLE public.drone_telemetry ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'LAUNCH';
ALTER TABLE public.drone_telemetry ADD COLUMN IF NOT EXISTS active_waypoint_index INT DEFAULT 0;
ALTER TABLE public.drone_telemetry ADD COLUMN IF NOT EXISTS route_path JSONB DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS drone_telemetry_ticket_unique
  ON public.drone_telemetry(ticket_id);
CREATE INDEX IF NOT EXISTS drone_telemetry_drone_id_idx
  ON public.drone_telemetry(drone_id);

-- Mission events are the audit trail and future command bus for Claude/control actions.
CREATE TABLE IF NOT EXISTS mission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id),
  order_id UUID REFERENCES orders(id),
  command TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin',
  payload JSONB DEFAULT '{}'::jsonb,
  accepted BOOLEAN DEFAULT TRUE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Data API access and RLS policies
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.orders TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tickets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.drone_telemetry TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.mission_events TO anon, authenticated;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drone_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_read_own_profile ON public.customers;
CREATE POLICY customers_read_own_profile
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_id);

DROP POLICY IF EXISTS customers_insert_own_profile ON public.customers;
CREATE POLICY customers_insert_own_profile
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = auth_id);

DROP POLICY IF EXISTS customers_update_own_profile ON public.customers;
CREATE POLICY customers_update_own_profile
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

DROP POLICY IF EXISTS products_public_access ON public.products;
CREATE POLICY products_public_access
  ON public.products
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS orders_public_access ON public.orders;
CREATE POLICY orders_public_access
  ON public.orders
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS order_items_public_access ON public.order_items;
CREATE POLICY order_items_public_access
  ON public.order_items
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS tickets_public_access ON public.tickets;
CREATE POLICY tickets_public_access
  ON public.tickets
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS drone_telemetry_public_access ON public.drone_telemetry;
CREATE POLICY drone_telemetry_public_access
  ON public.drone_telemetry
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS mission_events_public_access ON public.mission_events;
CREATE POLICY mission_events_public_access
  ON public.mission_events
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ── Seed starter products ──
WITH seed_products (name, description, category, price, image_emoji, priority_level) AS (
VALUES
  ('First Aid Kit', 'Comprehensive emergency first aid supplies', 'first_aid', 2500, '🩹', 'STANDARD'),
  ('Bandage Roll (Pack of 5)', 'Sterile cotton bandage rolls', 'first_aid', 350, '🩹', 'STANDARD'),
  ('Antiseptic Wipes (Box)', '50-count medical grade antiseptic wipes', 'first_aid', 800, '🧴', 'STANDARD'),
  ('Asthma Inhaler', 'Salbutamol emergency relief inhaler', 'medication', 1500, '💨', 'CRITICAL'),
  ('EpiPen Auto-Injector', 'Epinephrine auto-injector for anaphylaxis', 'medication', 8500, '💉', 'CRITICAL'),
  ('Paracetamol (Pack of 20)', 'Pain relief and fever reduction tablets', 'medication', 200, '💊', 'STANDARD'),
  ('Ibuprofen (Pack of 16)', 'Anti-inflammatory pain relief', 'medication', 300, '💊', 'STANDARD'),
  ('Blood Pressure Monitor', 'Digital automatic BP monitor', 'equipment', 4500, '🩺', 'HIGH'),
  ('Pulse Oximeter', 'Fingertip blood oxygen saturation reader', 'equipment', 3200, '❤️', 'HIGH'),
  ('Digital Thermometer', 'Infrared non-contact thermometer', 'equipment', 2800, '🌡️', 'STANDARD'),
  ('Surgical Gloves (Box of 100)', 'Latex-free nitrile examination gloves', 'first_aid', 1200, '🧤', 'STANDARD'),
  ('Saline Solution (500ml)', 'Sterile isotonic sodium chloride solution', 'medication', 600, '💧', 'HIGH'),
  ('Blood Bags (Type O-)', 'Universal donor blood bags for transfusion', 'emergency', 12000, '🩸', 'CRITICAL'),
  ('Trauma Kit', 'Advanced trauma response supplies', 'emergency', 15000, '🚑', 'CRITICAL'),
  ('Oxygen Cylinder (Portable)', 'Medical-grade portable oxygen supply', 'emergency', 8000, '🫁', 'CRITICAL')
)
INSERT INTO public.products (name, description, category, price, image_emoji, priority_level)
SELECT name, description, category, price, image_emoji, priority_level
FROM seed_products seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.products existing
  WHERE existing.name = seed.name
);

-- Realtime subscriptions. Supabase creates this publication; local Postgres may not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'tickets'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'drone_telemetry'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.drone_telemetry;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'mission_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_events;
    END IF;
  ELSE
    RAISE NOTICE 'supabase_realtime publication does not exist; skipping realtime registration.';
  END IF;
END $$;
