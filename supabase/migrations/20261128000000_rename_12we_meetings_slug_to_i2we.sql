-- Rename channel slug from '12we-meetings' to 'i2we-meetings' to standardize on i2We branding.
-- Safe/idempotent: only runs if the channels table and slug column exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channels'
      AND column_name = 'slug'
  ) THEN
    UPDATE public.channels
       SET slug = 'i2we-meetings'
     WHERE slug = '12we-meetings';
  END IF;
END$$;
