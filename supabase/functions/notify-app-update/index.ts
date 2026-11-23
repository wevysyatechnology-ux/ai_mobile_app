// Announces a new app version by push notification. Never blocks anyone: members just get a
// notification (and an entry in their in-app notification list) that links to the store.
//
// Who is notified, per platform: members with a push token on that platform whose last reported
// app_version is missing (older builds never reported one) or lower than latest_version.
// Members already on the latest version are skipped.
//
// Call (admin only: Super Admin JWT or the service role key), after raising latest_version in
// app_version_config and once the build is live in the store:
//   POST /functions/v1/notify-app-update   { "platform": "android" | "ios" | "both", "force": false }
// Each platform is announced once per latest_version; pass "force": true to send again.
// Deploy with: supabase functions deploy notify-app-update

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase environment variables');

const supabase = createClient(supabaseUrl, serviceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

type Platform = 'ios' | 'android';

function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function isAuthorised(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === serviceKey) return true;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`)
    .limit(1)
    .maybeSingle();
  return profile?.role === 'super_admin';
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function announce(platform: Platform, force: boolean) {
  const { data: config, error: configError } = await supabase
    .from('app_version_config')
    .select('platform, latest_version, store_url, message, notified_version')
    .eq('platform', platform)
    .maybeSingle();
  if (configError || !config) return { platform, skipped: 'no app_version_config row' };
  if (!force && config.notified_version === config.latest_version) {
    return { platform, skipped: `already announced ${config.latest_version} (pass force:true to resend)` };
  }

  const tokens = await fetchAll<{ user_id: string; expo_push_token: string }>((from, to) =>
    supabase.from('push_tokens').select('user_id, expo_push_token').eq('device_type', platform).range(from, to)
  );
  const versions = await fetchAll<{ id: string; app_version: string | null }>((from, to) =>
    supabase.from('users_profile').select('id, app_version').range(from, to)
  );
  const versionOf = new Map(versions.map((v) => [v.id, v.app_version]));

  // Only members who are behind (or whose build never reported a version).
  const targets = tokens.filter((t) => {
    const v = versionOf.get(t.user_id);
    return !v || compareVersions(v, config.latest_version) < 0;
  });

  const title = 'Update available';
  const body =
    config.message ||
    `A new version of WeVysya (v${config.latest_version}) is available. Update now for the latest features and fixes.`;
  const data = { type: 'app_update', storeUrl: config.store_url, version: config.latest_version };

  // Show it in the in-app notification list too (once per member).
  const userIds = Array.from(new Set(targets.map((t) => t.user_id)));
  for (let i = 0; i < userIds.length; i += 500) {
    await supabase.from('notifications').insert(
      userIds.slice(i, i + 500).map((user_id) => ({
        user_id, type: 'app_update', title, body, data, read: false, delivery_status: 'sent',
      }))
    );
  }

  // Expo accepts up to 100 messages per request.
  let sent = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const batch = targets.slice(i, i + 100).map((t) => ({
      to: t.expo_push_token, sound: 'default', title, body, data, priority: 'high', channelId: 'default',
    }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
    else console.error('Expo push batch failed:', await res.text());
  }

  await supabase
    .from('app_version_config')
    .update({ notified_version: config.latest_version, notified_at: new Date().toISOString() })
    .eq('platform', platform);

  return { platform, version: config.latest_version, membersNotified: userIds.length, pushesSent: sent, tokensOnPlatform: tokens.length };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!(await isAuthorised(req))) return json({ error: 'Super Admin or service role only' }, 403);

  try {
    const { platform = 'both', force = false } = await req.json().catch(() => ({}));
    const platforms: Platform[] =
      platform === 'ios' ? ['ios'] : platform === 'android' ? ['android'] : ['ios', 'android'];
    const results = [];
    for (const p of platforms) results.push(await announce(p, !!force));
    return json({ results });
  } catch (error) {
    console.error('notify-app-update error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
