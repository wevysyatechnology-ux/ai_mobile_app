// Returns a fresh WebRTC iceServers array (STUN + Metered.ca TURN) for the
// calling member's own session. Deploy with the DEFAULT jwt verification
// (do NOT use --no-verify-jwt here) — unlike vapi-tools/search-members,
// which are called by Vapi's webhook infra and can't send a Supabase JWT at
// all, this function is called directly by the app using the member's own
// live session, so the normal JWT gateway check is the right (and simpler)
// auth gate. No shared secret header needed.
//
// The Metered.ca SECRET KEY stays server-side only — the app never sees it,
// only the short-lived iceServers array this function fetches on its behalf.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const meteredDomain = Deno.env.get('METERED_DOMAIN');
const meteredApiKey = Deno.env.get('METERED_API_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable');
}
if (!meteredDomain || !meteredApiKey) {
  throw new Error('Missing METERED_DOMAIN or METERED_API_KEY environment variable');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Always-available free STUN — no account needed. Included alongside
// Metered's TURN servers so direct peer-to-peer still works when it can
// (cheaper/faster than relaying through TURN), with TURN as the fallback
// for strict-NAT pairs.
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const meteredResponse = await fetch(
      `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredApiKey}`
    );

    if (!meteredResponse.ok) {
      const errText = await meteredResponse.text();
      console.error('Metered TURN credentials fetch failed:', meteredResponse.status, errText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch TURN credentials' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Metered's endpoint returns a ready-to-use iceServers array directly.
    const turnIceServers = await meteredResponse.json();

    return new Response(
      JSON.stringify({ iceServers: [...STUN_SERVERS, ...turnIceServers] }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('get-turn-credentials error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
