-- Reusable trigger function to assign current database timestamp (timestamptz instant).
-- Attached to individual tables when those tables are created in Phase 1+.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$;

-- Lightweight operational connectivity check (no internal DB metadata exposed).
-- Confirms database RPC reachability only; migration state is verified separately.
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT pg_catalog.jsonb_build_object(
        'status', 'ok',
        'timestamp', pg_catalog.clock_timestamp()
    );
$$;

REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated;
