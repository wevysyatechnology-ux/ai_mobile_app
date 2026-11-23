-- App update notifications + knowing which app version each member is on.
-- Nothing here blocks the app: members are only *notified* (push + in-app card) when a newer
-- version is available.
--
-- app_version_config: one row per platform, so iOS and Android are released and announced
-- independently. The app reads it on launch (before login, so anon must be able to SELECT).
-- Only service-role / SQL editor / migrations can write (no write policy).
CREATE TABLE IF NOT EXISTS public.app_version_config (
  platform         text PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  latest_version   text NOT NULL DEFAULT '1.0.0',
  store_url        text NOT NULL,
  message          text,
  -- last version a push was broadcast for, so a release is only announced once
  notified_version text,
  notified_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_version_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_version_config_read" ON public.app_version_config;
CREATE POLICY "app_version_config_read" ON public.app_version_config
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.app_version_config FROM anon, authenticated;
GRANT SELECT ON public.app_version_config TO anon, authenticated;

-- Raise latest_version after a release reaches the store, then call the
-- notify-app-update edge function to push the announcement, e.g.
--   update public.app_version_config set latest_version = '2.5.0', updated_at = now() where platform = 'android';
INSERT INTO public.app_version_config (platform, latest_version, store_url)
VALUES
  ('android', '2.4.0', 'https://play.google.com/store/apps/details?id=com.wevysya.app'),
  ('ios',     '2.4.0', 'https://apps.apple.com/app/id6760703106')
ON CONFLICT (platform) DO NOTHING;

-- Which app version each member last opened, so support can see who is on what and the
-- announcement only goes to members who are behind. Members already have an "update own
-- profile" policy on users_profile; these columns hold nothing sensitive.
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS app_version         text,
  ADD COLUMN IF NOT EXISTS app_build           text,
  ADD COLUMN IF NOT EXISTS app_platform        text,
  ADD COLUMN IF NOT EXISTS app_version_seen_at timestamptz;
