-- Migration: 035_create_reload_schema_function.sql
-- Create function to reload PostgREST schema cache programmatically

CREATE OR REPLACE FUNCTION reload_schema_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;
