-- Standardize channel data on i2We branding and new wording.
-- Safe/idempotent: only runs if the channels table and relevant columns exist.
-- Updates:
--   1. channel slug '12we-meetings' → 'i2we-meetings'
--   2. channel named 'i2We Meetings' / '12we Meetings' → consistent 'i2We Meetings'
--   3. Links channel description → 'Share business links and opportunities'

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channels'
      AND column_name = 'slug'
  ) THEN
    -- 1. Rename the slug
    UPDATE public.channels
       SET slug = 'i2we-meetings'
     WHERE slug = '12we-meetings';

    -- 2. Normalize the display name of the i2We channel
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channels'
        AND column_name = 'name'
    ) THEN
      UPDATE public.channels
         SET name = 'i2We Meetings'
       WHERE slug = 'i2we-meetings'
         AND name IN ('12we Meetings', 'I2WE Meetings', 'I2We Meetings');
    END IF;

    -- 3. Update the Links channel description
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channels'
        AND column_name = 'description'
    ) THEN
      UPDATE public.channels
         SET description = 'Share business links and opportunities'
       WHERE slug = 'links';
    END IF;
  END IF;
END$$;
